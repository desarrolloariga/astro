'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tienePermiso } from '@/lib/permisos'

const BUCKET = 'astro-pedidos'

function aNumero(valor: FormDataEntryValue | null): number | null {
  const n = Number(String(valor ?? '').trim())
  return Number.isFinite(n) && n > 0 ? n : null
}

async function exigirPermiso() {
  if (!(await tienePermiso('pedidos', 'despachar'))) redirect('/inicio')
}

function refrescar(pedidoId: number) {
  revalidatePath('/logistica')
  revalidatePath(`/logistica/${pedidoId}`)
  revalidatePath(`/pedidos/${pedidoId}`)
  revalidatePath('/pedidos')
}

export async function iniciarPreparacion(formData: FormData) {
  await exigirPermiso()
  const pedidoId = aNumero(formData.get('pedido_id'))
  if (!pedidoId) redirect('/logistica')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_iniciar_preparacion', { p_pedido_id: pedidoId })
  refrescar(pedidoId)
  if (error) redirect(`/logistica/${pedidoId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/logistica/${pedidoId}?ok=${encodeURIComponent('Preparación iniciada — verifica cada artículo')}`)
}

export async function marcarItem(formData: FormData) {
  await exigirPermiso()
  const pedidoId = aNumero(formData.get('pedido_id'))
  const detalleId = aNumero(formData.get('venta_detalle_id'))
  if (!pedidoId || !detalleId) redirect('/logistica')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_marcar_item_checklist', {
    p_pedido_id: pedidoId,
    p_venta_detalle_id: detalleId,
    p_verificado: formData.get('verificado') === 'si',
    p_observacion: String(formData.get('observacion') ?? '').trim() || null,
  })
  refrescar(pedidoId)
  if (error) redirect(`/logistica/${pedidoId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/logistica/${pedidoId}`)
}

export async function despacharPedido(formData: FormData) {
  await exigirPermiso()
  const pedidoId = aNumero(formData.get('pedido_id'))
  if (!pedidoId) redirect('/logistica')

  const firma = String(formData.get('firma') ?? '')
  const nombreFirma = String(formData.get('firma_nombre') ?? '').trim()
  if (!firma.startsWith('data:image/png;base64,')) {
    redirect(`/logistica/${pedidoId}?error=${encodeURIComponent('Falta la firma de quien despacha')}`)
  }
  if (!nombreFirma) {
    redirect(`/logistica/${pedidoId}?error=${encodeURIComponent('Indica el nombre de quien firma')}`)
  }

  // La firma se guarda como PNG en el bucket privado de pedidos.
  const buffer = Buffer.from(firma.replace('data:image/png;base64,', ''), 'base64')
  const ruta = `pedido-${pedidoId}/firma-despacho-${Date.now()}.png`
  const admin = createAdminClient()
  const { error: errorSubida } = await admin.storage.from(BUCKET).upload(ruta, buffer, { contentType: 'image/png' })
  if (errorSubida) {
    redirect(`/logistica/${pedidoId}?error=${encodeURIComponent(`No se pudo guardar la firma: ${errorSubida.message}`)}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_despachar_pedido', {
    p_pedido_id: pedidoId,
    p_firma_ruta: ruta,
    p_firma_nombre: nombreFirma,
    p_guia: String(formData.get('guia') ?? '').trim() || null,
  })
  refrescar(pedidoId)
  if (error) {
    await admin.storage.from(BUCKET).remove([ruta])
    redirect(`/logistica/${pedidoId}?error=${encodeURIComponent(error.message)}`)
  }
  redirect(`/logistica?ok=${encodeURIComponent(`Pedido #${pedidoId} enviado`)}`)
}
