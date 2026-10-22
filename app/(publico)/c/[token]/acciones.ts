'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { extraerDatosCheckout, subirComprobanteCheckout, eliminarComprobanteCheckout } from '@/lib/checkout'

function nombreCookie(token: string) {
  return `ariga_carrito_${token}`
}

export async function confirmarCompra(formData: FormData) {
  const token = String(formData.get('token') ?? '')
  if (!token) redirect('/')

  const cookieStore = await cookies()
  const carritoToken = cookieStore.get(nombreCookie(token))?.value
  if (!carritoToken) redirect(`/c/${token}`)

  const datos = extraerDatosCheckout(formData)
  if (!datos.cliente.nombre || !datos.pago.metodo) {
    redirect(
      `/c/${token}/checkout?error=${encodeURIComponent('Tu nombre y el método de pago son obligatorios')}`,
    )
  }

  let rutaComprobante: string
  try {
    rutaComprobante = await subirComprobanteCheckout(datos.archivo, carritoToken)
  } catch (e) {
    redirect(`/c/${token}/checkout?error=${encodeURIComponent((e as Error).message)}`)
  }

  const supabase = await createClient()
  const { data: ventaId, error } = await supabase.rpc('fn_confirmar_carrito', {
    p_carrito_token: carritoToken,
    p_cliente: datos.cliente,
    p_envio: { ...datos.envio, para_cliente: true },
    p_pago: { ...datos.pago, url_archivo: rutaComprobante },
  })

  if (error || !ventaId) {
    await eliminarComprobanteCheckout(rutaComprobante)
    redirect(
      `/c/${token}/checkout?error=${encodeURIComponent(error?.message ?? 'No se pudo completar la compra')}`,
    )
  }

  cookieStore.delete(nombreCookie(token))
  redirect(`/c/${token}/gracias?venta=${ventaId}`)
}
