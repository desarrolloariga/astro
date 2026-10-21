'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { subirComprobanteCheckout, eliminarComprobanteCheckout } from '@/lib/checkout'

function aNumero(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** El vendedor/comprador confirma que el pedido enviado por logística llegó — cierra el proceso. */
export async function confirmarRecepcion(formData: FormData) {
  const pedidoId = aNumero(formData.get('pedido_id'))
  if (!pedidoId) redirect('/pedidos')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_confirmar_recepcion', { p_pedido_id: pedidoId })

  revalidatePath('/pedidos')
  revalidatePath(`/pedidos/${pedidoId}`)
  if (error) redirect(`/pedidos/${pedidoId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/pedidos/${pedidoId}?ok=${encodeURIComponent('Recepción confirmada — pedido cerrado')}`)
}

/** Tras un pago rechazado: sube un comprobante nuevo y el pedido vuelve a revisión. */
export async function reenviarComprobante(formData: FormData) {
  const pedidoId = aNumero(formData.get('pedido_id'))
  if (!pedidoId) redirect('/pedidos')

  const archivo = formData.get('comprobante')
  let ruta: string
  try {
    ruta = await subirComprobanteCheckout(archivo instanceof File && archivo.size > 0 ? archivo : null, `pedido-${pedidoId}`)
  } catch (e) {
    redirect(`/pedidos/${pedidoId}?error=${encodeURIComponent((e as Error).message)}`)
  }

  const supabase = await createClient()
  const fechaPago = String(formData.get('fecha_pago') ?? '').trim()
  const { error } = await supabase.rpc('fn_reenviar_comprobante', {
    p_pedido_id: pedidoId,
    p_url_archivo: ruta,
    p_numero_referencia: String(formData.get('referencia_pago') ?? '').trim() || null,
    p_banco_origen: String(formData.get('banco_origen') ?? '').trim() || null,
    p_fecha_pago: fechaPago || null,
    p_monto_declarado: aNumero(formData.get('monto_declarado')),
  })

  revalidatePath(`/pedidos/${pedidoId}`)
  if (error) {
    await eliminarComprobanteCheckout(ruta)
    redirect(`/pedidos/${pedidoId}?error=${encodeURIComponent(error.message)}`)
  }
  redirect(`/pedidos/${pedidoId}?ok=${encodeURIComponent('Comprobante reenviado — vuelve a revisión')}`)
}
