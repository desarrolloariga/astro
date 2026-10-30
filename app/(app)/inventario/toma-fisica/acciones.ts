'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const txt = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

function volver(destino: string, clave: 'ok' | 'error', mensaje: string): never {
  redirect(`${destino}${destino.includes('?') ? '&' : '?'}${clave}=${encodeURIComponent(mensaje)}`)
}

const ruta = (id: number | string) => `/inventario/toma-fisica/${id}`

export async function iniciarToma(formData: FormData) {
  const bodega = Number(txt(formData, 'bodega_id'))
  if (!bodega) volver('/inventario/toma-fisica', 'error', 'Elige la bodega')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_toma_iniciar', {
    p_bodega_id: bodega,
    p_ciega: txt(formData, 'hoja') !== 'existencias',
    p_categoria_id: Number(txt(formData, 'categoria_id')) || null,
    p_notas: txt(formData, 'notas') || null,
  })
  if (error) volver('/inventario/toma-fisica', 'error', error.message)
  revalidatePath('/inventario/toma-fisica')
  volver(ruta(data as number), 'ok', 'Toma física iniciada: ya pueden contar')
}

export type EstadoConteo = { ok?: string; error?: string; ultimo?: string }

/** Registro rápido (escáner o teclado): mantiene el foco en la pantalla sin recargarla. */
export async function registrarConteo(_previo: EstadoConteo, formData: FormData): Promise<EstadoConteo> {
  const id = Number(txt(formData, 'toma_id'))
  const codigo = txt(formData, 'codigo')
  const cantidadTxt = txt(formData, 'cantidad')
  const sumar = txt(formData, 'modo') !== 'fijar'
  if (!codigo) return { error: 'Escribe o escanea un código' }
  const cantidad = cantidadTxt === '' ? 1 : Number(cantidadTxt.replace(',', '.'))
  if (!Number.isFinite(cantidad) || cantidad < 0) return { error: 'Cantidad no válida' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_toma_registrar', {
    p_toma_id: id,
    p_codigo: codigo,
    p_cantidad: cantidad,
    p_sumar: sumar,
  })
  if (error) return { error: error.message }
  const r = data as { codigo: string; nombre: string; cantidad_contada: number; agregada: boolean }
  revalidatePath(ruta(id))
  return {
    ok: `${r.codigo} · ${r.nombre}: ${Number(r.cantidad_contada).toLocaleString('es-GT')} contada(s)${r.agregada ? ' (no estaba en la lista del sistema)' : ''}`,
    ultimo: r.codigo,
  }
}

async function accionSimple(formData: FormData, fn: string, args: Record<string, unknown>, mensaje: string) {
  const id = txt(formData, 'toma_id')
  const supabase = await createClient()
  const { error } = await supabase.rpc(fn, args)
  if (error) volver(ruta(id), 'error', error.message)
  revalidatePath(ruta(id))
  revalidatePath('/inventario/toma-fisica')
  volver(ruta(id), 'ok', mensaje)
}

export async function cerrarConteo(formData: FormData) {
  await accionSimple(formData, 'fn_toma_cerrar_conteo', { p_toma_id: Number(txt(formData, 'toma_id')) }, 'Conteo cerrado: revisa las diferencias')
}

export async function reabrirConteo(formData: FormData) {
  await accionSimple(formData, 'fn_toma_reabrir_conteo', { p_toma_id: Number(txt(formData, 'toma_id')) }, 'Conteo reabierto')
}

export async function actualizarSistema(formData: FormData) {
  await accionSimple(
    formData,
    'fn_toma_actualizar_sistema',
    { p_toma_id: Number(txt(formData, 'toma_id')) },
    'Existencias del sistema actualizadas con los movimientos ocurridos durante el conteo',
  )
}

export async function cancelarToma(formData: FormData) {
  await accionSimple(
    formData,
    'fn_toma_cancelar',
    { p_toma_id: Number(txt(formData, 'toma_id')), p_motivo: txt(formData, 'motivo') },
    'Toma física cancelada',
  )
}

export async function aprobarToma(formData: FormData) {
  const id = txt(formData, 'toma_id')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_toma_aprobar', { p_toma_id: Number(id) })
  if (error) volver(ruta(id), 'error', error.message)
  const r = data as { faltante: number; sobrante: number }
  revalidatePath(ruta(id))
  revalidatePath('/inventario/toma-fisica')
  revalidatePath('/contabilidad/kardex')
  const q = (n: number) => Number(n).toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' })
  volver(ruta(id), 'ok', `Toma aprobada: existencias ajustadas. Faltantes ${q(r.faltante)} · sobrantes ${q(r.sobrante)}`)
}
