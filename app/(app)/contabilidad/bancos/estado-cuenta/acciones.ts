'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { leerEstadoCuenta } from '@/lib/bancos/estado-cuenta'

const MAX_BYTES = 8 * 1024 * 1024
const txt = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const num = (f: FormData, k: string) => {
  const t = txt(f, k).replace(/,/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const ruta = (id: string | number) => `/contabilidad/bancos/estado-cuenta/${id}`
function volver(destino: string, clave: 'ok' | 'error', mensaje: string): never {
  redirect(`${destino}${destino.includes('?') ? '&' : '?'}${clave}=${encodeURIComponent(mensaje)}`)
}
function refrescar(id?: string | number) {
  revalidatePath('/contabilidad/bancos', 'layout')
  if (id) revalidatePath(ruta(id))
}

export async function importarEstadoCuenta(formData: FormData) {
  const base = '/contabilidad/bancos/estado-cuenta'
  const cuenta = Number(txt(formData, 'cuenta_id'))
  const archivo = formData.get('archivo')
  if (!cuenta) volver(base, 'error', 'Elige la cuenta bancaria')
  if (!(archivo instanceof File) || archivo.size === 0) volver(base, 'error', 'Adjunta el estado de cuenta en Excel (.xlsx) o CSV')
  if (archivo.size > MAX_BYTES) volver(base, 'error', 'El archivo supera 8 MB')
  if (!/\.(xlsx|csv|txt)$/i.test(archivo.name)) volver(base, 'error', 'Formato no admitido: usa .xlsx o .csv (si tu banco da .xls, guárdalo como .xlsx)')

  let lectura
  try {
    lectura = await leerEstadoCuenta(archivo.name, await archivo.arrayBuffer())
  } catch (e) {
    volver(base, 'error', e instanceof Error ? e.message : 'No se pudo leer el archivo')
  }
  if (lectura.lineas.length === 0) volver(base, 'error', 'El archivo no trae movimientos con fecha y monto')
  const fechas = lectura.lineas.map((l) => l.fecha).sort()
  const conSaldo = lectura.lineas.filter((l) => l.saldo != null)
  // Saldos: los del formulario; si no, se deducen de la columna Saldo del archivo.
  const saldoFinal = num(formData, 'saldo_final') ?? (conSaldo.length ? (conSaldo[conSaldo.length - 1].saldo as number) : null)
  const saldoInicial =
    num(formData, 'saldo_inicial') ?? (conSaldo.length ? Math.round(((conSaldo[0].saldo as number) - conSaldo[0].monto) * 100) / 100 : null)
  if (saldoFinal == null) volver(base, 'error', 'Indica el saldo final del estado de cuenta (el archivo no trae columna de saldo)')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_banco_importar_estado', {
    p_cuenta_id: cuenta,
    p_desde: txt(formData, 'desde') || fechas[0],
    p_hasta: txt(formData, 'hasta') || fechas[fechas.length - 1],
    p_saldo_inicial: saldoInicial,
    p_saldo_final: saldoFinal,
    p_archivo: archivo.name,
    p_lineas: lectura.lineas,
  })
  if (error) volver(base, 'error', error.message)
  const r = data as { id: number; lineas: number; cuadra: boolean; diferencia: number | null }
  // Cruce automático inmediato.
  const { data: cruce } = await supabase.rpc('fn_banco_cruzar_estado', { p_estado_id: r.id, p_dias: 3 })
  refrescar(r.id)
  const c = cruce as { cruzadas: number; pendientes: number } | null
  const avisos = [
    `${r.lineas} líneas importadas`,
    c ? `${c.cruzadas} cruzadas automáticamente, ${c.pendientes} por revisar` : null,
    r.cuadra ? null : `ojo: saldo inicial + movimientos no da el saldo final (diferencia ${r.diferencia})`,
    lectura.advertencias.length ? `${lectura.advertencias.length} fila(s) omitidas` : null,
  ].filter(Boolean)
  volver(ruta(r.id), 'ok', avisos.join(' · '))
}

export async function cruzarAutomatico(formData: FormData) {
  const id = txt(formData, 'estado_id')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_banco_cruzar_estado', { p_estado_id: Number(id), p_dias: num(formData, 'dias') ?? 3 })
  if (error) volver(ruta(id), 'error', error.message)
  refrescar(id)
  const c = data as { cruzadas: number; pendientes: number }
  volver(ruta(id), 'ok', `${c.cruzadas} línea(s) cruzadas · ${c.pendientes} pendientes`)
}

export async function cruzarLinea(formData: FormData) {
  const id = txt(formData, 'estado_id')
  const movimiento = Number(txt(formData, 'movimiento_id'))
  if (!movimiento) volver(ruta(id), 'error', 'Elige el movimiento del libro')
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_banco_cruzar_linea', { p_linea_id: Number(txt(formData, 'linea_id')), p_movimiento_id: movimiento })
  if (error) volver(ruta(id), 'error', error.message)
  refrescar(id)
  volver(ruta(id), 'ok', 'Línea cruzada')
}

export async function cambiarLinea(formData: FormData) {
  const id = txt(formData, 'estado_id')
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_banco_estado_linea', {
    p_linea_id: Number(txt(formData, 'linea_id')),
    p_accion: txt(formData, 'accion'),
    p_nota: txt(formData, 'nota') || null,
  })
  if (error) volver(ruta(id), 'error', error.message)
  refrescar(id)
  volver(ruta(id), 'ok', 'Línea actualizada')
}

export async function registrarDesdeLinea(formData: FormData) {
  const id = txt(formData, 'estado_id')
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_banco_crear_desde_linea', {
    p_linea_id: Number(txt(formData, 'linea_id')),
    p_cuenta_contrapartida_id: Number(txt(formData, 'cuenta_contrapartida_id')) || null,
    p_centro_costo_id: Number(txt(formData, 'centro_costo_id')) || null,
    p_descripcion: txt(formData, 'descripcion') || null,
  })
  if (error) volver(ruta(id), 'error', error.message)
  refrescar(id)
  volver(ruta(id), 'ok', 'Registrada en el libro de bancos (nota) y cruzada')
}

export async function cerrarEstado(formData: FormData) {
  const id = txt(formData, 'estado_id')
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_banco_cerrar_estado', { p_estado_id: Number(id), p_notas: txt(formData, 'notas') || null })
  if (error) volver(ruta(id), 'error', error.message)
  refrescar(id)
  revalidatePath('/contabilidad/periodos')
  volver(ruta(id), 'ok', 'Conciliación del mes cerrada')
}
