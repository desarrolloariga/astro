'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'

function aNumero(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export type LineaTraslado = { producto_id: number; cantidad: number | null }

export async function crearTraslado(
  tiendaOrigenId: number,
  tiendaDestinoId: number,
  lineas: LineaTraslado[],
) {
  if (!(await tienePermiso('inventario', 'transferir'))) redirect('/inicio')

  if (!tiendaOrigenId || !tiendaDestinoId) {
    redirect(`/traslados/nuevo?error=${encodeURIComponent('Elige bodega de origen y destino')}`)
  }
  if (!Array.isArray(lineas) || lineas.length === 0) {
    redirect(`/traslados/nuevo?error=${encodeURIComponent('Agrega al menos un artículo al traslado')}`)
  }

  const supabase = await createClient()
  const { data: traslado_id, error } = await supabase.rpc('fn_crear_traslado', {
    p_tienda_origen_id: tiendaOrigenId,
    p_tienda_destino_id: tiendaDestinoId,
    p_lineas: lineas,
  })

  if (error || !traslado_id) {
    redirect(`/traslados/nuevo?error=${encodeURIComponent(error?.message ?? 'No se pudo crear el traslado')}`)
  }

  revalidatePath('/traslados')
  redirect(`/traslados?ok=${encodeURIComponent(`Traslado #${traslado_id} creado`)}`)
}

export async function confirmarRecepcionTraslado(formData: FormData) {
  if (!(await tienePermiso('inventario', 'transferir'))) redirect('/inicio')

  const detalleId = aNumero(formData.get('detalle_id'))
  if (!detalleId) redirect('/traslados')

  const ok = formData.get('accion') !== 'incidencia'
  const comentario = String(formData.get('comentario') ?? '').trim() || null

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_confirmar_recepcion_traslado', {
    p_detalle_id: detalleId,
    p_ok: ok,
    p_comentario: comentario,
  })

  revalidatePath('/traslados')
  if (error) redirect(`/traslados?error=${encodeURIComponent(error.message)}`)
  redirect(`/traslados?ok=${encodeURIComponent(ok ? 'Línea recibida' : 'Incidencia registrada')}`)
}
