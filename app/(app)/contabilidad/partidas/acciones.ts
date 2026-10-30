'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { autorizarSiCerrado } from '@/lib/contabilidad-servidor'
import { esFecha } from '@/lib/contabilidad-general'

export type EstadoFormulario = { error?: string }

const txt = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

type LineaEntrada = { cuenta_id: number | null; centro_costo_id: number | null; debe: number; haber: number; descripcion: string }

function refrescar(id?: number) {
  revalidatePath('/contabilidad/partidas')
  if (id) revalidatePath(`/contabilidad/partidas/${id}`)
  revalidatePath('/contabilidad/nomenclatura')
}

/** Guarda el borrador (y lo contabiliza si se pidió). Devuelve el error para no perder lo capturado. */
export async function guardarPartidaAccion(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const id = Number(txt(formData, 'id')) || null
  const fecha = txt(formData, 'fecha')
  const descripcion = txt(formData, 'descripcion')
  const contabilizar = txt(formData, 'contabilizar') === '1'
  if (!esFecha(fecha)) return { error: 'Indica la fecha de la partida' }
  if (!descripcion) return { error: 'Escribe la descripción o concepto de la partida' }

  let lineas: LineaEntrada[]
  try {
    lineas = JSON.parse(txt(formData, 'lineas') || '[]')
  } catch {
    return { error: 'No se pudieron leer las líneas' }
  }
  lineas = lineas.filter((l) => Number(l.debe) > 0 || Number(l.haber) > 0)
  if (lineas.length === 0) return { error: 'Agrega al menos una línea con monto' }
  if (lineas.some((l) => !l.cuenta_id)) return { error: 'Cada línea con monto necesita una cuenta' }

  const supabase = await createClient()
  const { autorizacionId, error: errorAut } = await autorizarSiCerrado(
    supabase,
    [fecha, txt(formData, 'fecha_original') || null],
    formData,
  )
  if (errorAut) return { error: errorAut }

  const { data, error } = await supabase.rpc('fn_guardar_partida', {
    p_id: id,
    p_fecha: fecha,
    p_tipo: txt(formData, 'tipo') || 'manual',
    p_descripcion: descripcion,
    p_lineas: lineas,
    p_contabilizar: contabilizar,
    p_autorizacion_id: autorizacionId,
  })
  if (error) return { error: error.message }

  const partidaId = data as number
  refrescar(partidaId)
  redirect(
    `/contabilidad/partidas/${partidaId}?ok=${encodeURIComponent(contabilizar ? 'Partida contabilizada' : 'Borrador guardado')}`,
  )
}

export async function descartarPartidaAccion(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const id = Number(txt(formData, 'id'))
  const supabase = await createClient()
  const { autorizacionId, error: errorAut } = await autorizarSiCerrado(supabase, [txt(formData, 'fecha')], formData)
  if (errorAut) return { error: errorAut }
  const { error } = await supabase.rpc('fn_descartar_borrador_partida', { p_id: id, p_autorizacion_id: autorizacionId })
  if (error) return { error: error.message }
  refrescar()
  redirect(`/contabilidad/partidas?ok=${encodeURIComponent('Borrador descartado')}`)
}

export async function revertirPartidaAccion(_previo: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const id = Number(txt(formData, 'id'))
  const fecha = txt(formData, 'fecha')
  const motivo = txt(formData, 'motivo')
  if (!esFecha(fecha)) return { error: 'Indica la fecha de la reversión' }
  if (!motivo) return { error: 'Escribe el motivo de la reversión' }
  const supabase = await createClient()
  const { autorizacionId, error: errorAut } = await autorizarSiCerrado(supabase, [fecha], formData)
  if (errorAut) return { error: errorAut }
  const { data, error } = await supabase.rpc('fn_revertir_partida', {
    p_id: id,
    p_fecha: fecha,
    p_motivo: motivo,
    p_autorizacion_id: autorizacionId,
  })
  if (error) return { error: error.message }
  refrescar(id)
  redirect(`/contabilidad/partidas/${data as number}?ok=${encodeURIComponent('Partida revertida')}`)
}
