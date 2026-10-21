'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { extraerDatosCheckout, subirComprobanteCheckout, eliminarComprobanteCheckout } from '@/lib/checkout'

function nombreCookie(token: string) {
  return `ariga_carrito_${token}`
}

/** Destino tras agregar/quitar: la página desde la que se hizo, si es del mismo link. */
function destino(token: string, formData: FormData, clave: 'ok' | 'error', mensaje: string) {
  const volver = String(formData.get('volver') ?? '')
  const base = volver.startsWith(`/c/${token}`) ? volver : `/c/${token}`
  return `${base}${base.includes('?') ? '&' : '?'}${clave}=${encodeURIComponent(mensaje)}`
}

export async function agregarAlCarrito(formData: FormData) {
  const token = String(formData.get('token') ?? '')
  const productoId = Number(formData.get('producto_id'))
  if (!token || !productoId) redirect('/')

  const cantidadTexto = String(formData.get('cantidad') ?? '').trim()
  const cantidad = cantidadTexto ? Number(cantidadTexto) : 1

  const cookieStore = await cookies()
  const carritoToken = cookieStore.get(nombreCookie(token))?.value ?? null

  const supabase = await createClient()
  const { data: nuevoToken, error } = await supabase.rpc('fn_agregar_al_carrito', {
    p_token: token,
    p_carrito_token: carritoToken,
    p_producto_id: productoId,
    p_cantidad: Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1,
  })

  if (error || !nuevoToken) {
    redirect(destino(token, formData, 'error', error?.message ?? 'No se pudo agregar la pieza'))
  }

  cookieStore.set(nombreCookie(token), nuevoToken, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 6,
    path: '/',
  })

  revalidatePath(`/c/${token}`, 'layout')
  redirect(destino(token, formData, 'ok', 'Pieza agregada a tu carrito'))
}

export async function quitarDelCarrito(formData: FormData) {
  const token = String(formData.get('token') ?? '')
  const productoId = Number(formData.get('producto_id'))
  if (!token || !productoId) redirect('/')

  const cookieStore = await cookies()
  const carritoToken = cookieStore.get(nombreCookie(token))?.value
  if (!carritoToken) redirect(`/c/${token}`)

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_quitar_del_carrito', {
    p_carrito_token: carritoToken,
    p_producto_id: productoId,
  })

  revalidatePath(`/c/${token}`, 'layout')
  if (error) {
    redirect(destino(token, formData, 'error', error.message))
  }
  redirect(destino(token, formData, 'ok', 'Pieza retirada de tu carrito'))
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
