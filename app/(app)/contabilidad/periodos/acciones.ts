'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { autorizarSiCerrado } from '@/lib/contabilidad-servidor'

const txt = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

function volver(anio: number | string, clave: 'ok' | 'error', mensaje: string): never {
  redirect(`/contabilidad/periodos?anio=${anio}&${clave}=${encodeURIComponent(mensaje)}`)
}

function refrescar() {
  revalidatePath('/contabilidad/periodos')
  revalidatePath('/contabilidad/partidas')
}

export async function cerrarMes(formData: FormData) {
  const anio = Number(txt(formData, 'anio'))
  const mes = Number(txt(formData, 'mes'))
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_cerrar_mes_contable', {
    p_anio: anio,
    p_mes: mes,
    p_notas: txt(formData, 'notas') || null,
  })
  if (error) volver(anio, 'error', error.message)
  refrescar()
  volver(anio, 'ok', `Mes ${String(mes).padStart(2, '0')}/${anio} cerrado`)
}

export async function reabrirMes(formData: FormData) {
  const anio = Number(txt(formData, 'anio'))
  const mes = Number(txt(formData, 'mes'))
  const supabase = await createClient()
  const fecha = `${anio}-${String(mes).padStart(2, '0')}-01`
  const { autorizacionId, error: errorAut } = await autorizarSiCerrado(supabase, [fecha], formData, 'reabrir_periodo')
  if (errorAut) volver(anio, 'error', errorAut)
  const { error } = await supabase.rpc('fn_reabrir_mes_contable', {
    p_anio: anio,
    p_mes: mes,
    p_autorizacion_id: autorizacionId,
  })
  if (error) volver(anio, 'error', error.message)
  refrescar()
  volver(anio, 'ok', `Mes ${String(mes).padStart(2, '0')}/${anio} reabierto`)
}

export async function generarCierreAnual(formData: FormData) {
  const anio = Number(txt(formData, 'anio'))
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_ctb_generar_cierre_anual', { p_anio: anio })
  if (error) volver(anio, 'error', error.message)
  revalidatePath('/contabilidad/partidas')
  redirect(`/contabilidad/partidas/${data as number}?ok=${encodeURIComponent(`Partida de cierre ${anio} generada en borrador: revísala y contabilízala`)}`)
}

export async function guardarPin(formData: FormData) {
  const anio = txt(formData, 'anio')
  const nuevo = txt(formData, 'pin_nuevo')
  if (nuevo !== txt(formData, 'pin_confirmar')) volver(anio, 'error', 'La confirmación no coincide con el PIN nuevo')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_establecer_pin_contable', {
    p_pin_actual: txt(formData, 'pin_actual') || null,
    p_pin_nuevo: nuevo,
  })
  if (error) volver(anio, 'error', error.message)
  if (data) volver(anio, 'error', data as string)
  revalidatePath('/contabilidad/periodos')
  volver(anio, 'ok', 'PIN contable guardado')
}
