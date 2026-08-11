'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function nombreCookie(token: string) {
  return `ariga_carrito_${token}`
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
    redirect(`/c/${token}?error=${encodeURIComponent(error?.message ?? 'No se pudo agregar la pieza')}`)
  }

  cookieStore.set(nombreCookie(token), nuevoToken, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 6,
    path: '/',
  })

  revalidatePath(`/c/${token}`)
  redirect(`/c/${token}?ok=${encodeURIComponent('Pieza agregada a tu carrito')}`)
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

  revalidatePath(`/c/${token}`)
  if (error) {
    redirect(`/c/${token}?error=${encodeURIComponent(error.message)}`)
  }
  redirect(`/c/${token}?ok=${encodeURIComponent('Pieza retirada de tu carrito')}`)
}

export async function confirmarCompra(formData: FormData) {
  const token = String(formData.get('token') ?? '')
  if (!token) redirect('/')

  const cookieStore = await cookies()
  const carritoToken = cookieStore.get(nombreCookie(token))?.value
  if (!carritoToken) redirect(`/c/${token}`)

  const nombre = String(formData.get('nombre') ?? '').trim()
  const telefono = String(formData.get('telefono') ?? '').trim()
  const correo = String(formData.get('correo') ?? '').trim()
  const direccion = String(formData.get('direccion') ?? '').trim()
  const metodoPago = String(formData.get('metodo_pago') ?? '').trim()
  const referencia = String(formData.get('referencia') ?? '').trim()

  if (!nombre || !metodoPago) {
    redirect(
      `/c/${token}/checkout?error=${encodeURIComponent('Tu nombre y el método de pago son obligatorios')}`,
    )
  }

  const supabase = await createClient()
  const { data: ventaId, error } = await supabase.rpc('fn_confirmar_carrito', {
    p_carrito_token: carritoToken,
    p_nombre: nombre,
    p_telefono: telefono || null,
    p_correo: correo || null,
    p_direccion: direccion || null,
    p_metodo_pago: metodoPago,
    p_referencia: referencia || null,
  })

  if (error || !ventaId) {
    redirect(
      `/c/${token}/checkout?error=${encodeURIComponent(error?.message ?? 'No se pudo completar la compra')}`,
    )
  }

  cookieStore.delete(nombreCookie(token))
  redirect(`/c/${token}/gracias?venta=${ventaId}`)
}
