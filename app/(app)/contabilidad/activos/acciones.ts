'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const txt = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const num = (f: FormData, k: string) => {
  const t = txt(f, k).replace(/,/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
const base = '/contabilidad/activos'
function volver(destino: string, clave: 'ok' | 'error', mensaje: string): never {
  redirect(`${destino}${destino.includes('?') ? '&' : '?'}${clave}=${encodeURIComponent(mensaje)}`)
}
function refrescar(id?: number | string) {
  revalidatePath(base, 'layout')
  if (id) revalidatePath(`${base}/${id}`)
}
const datos = (f: FormData) => ({
  descripcion: txt(f, 'descripcion'),
  marca: txt(f, 'marca'),
  modelo: txt(f, 'modelo'),
  serie: txt(f, 'serie'),
  tienda_id: txt(f, 'tienda_id'),
  responsable_id: txt(f, 'responsable_id'),
  centro_costo_id: txt(f, 'centro_costo_id'),
  fecha_inicio_depreciacion: /^\d{4}-\d{2}$/.test(txt(f, 'fecha_inicio_depreciacion'))
    ? `${txt(f, 'fecha_inicio_depreciacion')}-01`
    : txt(f, 'fecha_inicio_depreciacion'),
  vida_util_meses: txt(f, 'vida_util_meses'),
  valor_residual: txt(f, 'valor_residual'),
  notas: txt(f, 'notas'),
})

export async function registrarDesdeFactura(formData: FormData) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_af_crear_desde_factura', {
    p_linea_id: Number(txt(formData, 'linea_id')),
    p_tipo_id: Number(txt(formData, 'tipo_id')) || null,
    p_cantidad: Math.max(1, Math.floor(num(formData, 'cantidad') ?? 1)),
    p_datos: datos(formData),
  })
  if (error) volver(base, 'error', error.message)
  refrescar()
  const ids = (data ?? []) as number[]
  if (ids.length === 1) volver(`${base}/${ids[0]}`, 'ok', 'Activo registrado')
  volver(base, 'ok', `${ids.length} activos registrados`)
}

export async function registrarManual(formData: FormData) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_af_crear_manual', {
    p_tipo_id: Number(txt(formData, 'tipo_id')) || null,
    p_costo: num(formData, 'costo'),
    p_fecha_adquisicion: txt(formData, 'fecha_adquisicion') || null,
    p_depreciacion_inicial: num(formData, 'depreciacion_inicial') ?? 0,
    p_datos: datos(formData),
  })
  if (error) volver(base, 'error', error.message)
  refrescar()
  volver(`${base}/${data as number}`, 'ok', 'Activo registrado')
}

export async function depreciarMes(formData: FormData) {
  const [anio, mes] = txt(formData, 'mes').split('-').map(Number)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_af_depreciar_mes', { p_anio: anio, p_mes: mes })
  if (error) volver(base, 'error', error.message)
  refrescar()
  const r = data as { partida_id: number | null; activos: number; monto: number }
  volver(base, 'ok', r.partida_id
    ? `Depreciación de ${String(mes).padStart(2, '0')}/${anio}: ${r.activos} activos, Q${Number(r.monto).toFixed(2)}`
    : `La depreciación de ${String(mes).padStart(2, '0')}/${anio} ya estaba registrada o no hay activos por depreciar`)
}

export async function revertirDepreciacion(formData: FormData) {
  const [anio, mes] = txt(formData, 'mes').split('-').map(Number)
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_af_revertir_depreciacion', { p_anio: anio, p_mes: mes })
  if (error) volver(base, 'error', error.message)
  refrescar()
  volver(base, 'ok', `Depreciación de ${String(mes).padStart(2, '0')}/${anio} revertida: puedes recalcularla`)
}

export async function actualizarActivo(formData: FormData) {
  const id = txt(formData, 'id')
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_af_actualizar', { p_id: Number(id), p_datos: datos(formData) })
  if (error) volver(`${base}/${id}`, 'error', error.message)
  refrescar(id)
  volver(`${base}/${id}`, 'ok', 'Datos actualizados')
}

export async function darDeBaja(formData: FormData) {
  const id = txt(formData, 'id')
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_af_dar_baja', {
    p_id: Number(id),
    p_fecha: txt(formData, 'fecha'),
    p_tipo: txt(formData, 'tipo_baja'),
    p_motivo: txt(formData, 'motivo'),
    p_precio_venta: num(formData, 'precio_venta'),
    p_cuenta_cobro_id: Number(txt(formData, 'cuenta_cobro_id')) || null,
  })
  if (error) volver(`${base}/${id}`, 'error', error.message)
  refrescar(id)
  volver(`${base}/${id}`, 'ok', 'Activo dado de baja y contabilizado')
}

export async function guardarTipoActivo(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_af_guardar_tipo', {
    p_id: Number(txt(formData, 'id')) || null,
    p_prefijo: txt(formData, 'prefijo'),
    p_nombre: txt(formData, 'nombre'),
    p_vida_util_meses: Math.floor(num(formData, 'vida_util_meses') ?? 0),
    p_porcentaje: num(formData, 'porcentaje_anual'),
    p_cuenta_activo_id: Number(txt(formData, 'cuenta_activo_id')) || null,
    p_cuenta_depreciacion_id: Number(txt(formData, 'cuenta_depreciacion_id')) || null,
    p_cuenta_gasto_id: Number(txt(formData, 'cuenta_gasto_id')) || null,
    p_centro_costo_id: Number(txt(formData, 'centro_costo_id')) || null,
    p_activo: formData.get('activo') === 'on',
  })
  if (error) volver(`${base}/tipos`, 'error', error.message)
  refrescar()
  volver(`${base}/tipos`, 'ok', 'Tipo de activo guardado')
}
