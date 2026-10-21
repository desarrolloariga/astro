'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { COOKIE_MODO_COMPRA } from '@/lib/modo-compra'
import { extraerDatosCheckout, subirComprobanteCheckout, eliminarComprobanteCheckout } from '@/lib/checkout'

/** Destino tras agregar/quitar: la página desde la que se hizo (solo rutas internas del backoffice). */
function destino(formData: FormData, porDefecto: string, clave: 'ok' | 'error', mensaje: string) {
  const volver = String(formData.get('volver') ?? '')
  const base = volver.startsWith('/') && !volver.startsWith('//') ? volver : porDefecto
  return `${base}${base.includes('?') ? '&' : '?'}${clave}=${encodeURIComponent(mensaje)}`
}

export async function agregarAMiCarrito(formData: FormData) {
  const productoId = Number(formData.get('producto_id'))
  if (!productoId) redirect('/catalogo')
  const cantidadTexto = String(formData.get('cantidad') ?? '').trim()
  const cantidad = cantidadTexto ? Number(cantidadTexto) : 1

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_agregar_a_mi_carrito', {
    p_producto_id: productoId,
    p_cantidad: Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1,
  })

  revalidatePath('/', 'layout')
  if (error) redirect(destino(formData, '/catalogo', 'error', error.message))
  redirect(destino(formData, '/catalogo', 'ok', 'Agregado al carrito'))
}

export async function quitarDeMiCarrito(formData: FormData) {
  const productoId = Number(formData.get('producto_id'))
  if (!productoId) redirect('/carrito')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_quitar_de_mi_carrito', { p_producto_id: productoId })

  revalidatePath('/', 'layout')
  if (error) redirect(destino(formData, '/carrito', 'error', error.message))
  redirect(destino(formData, '/carrito', 'ok', 'Quitado del carrito'))
}

export async function confirmarMiCarrito(formData: FormData) {
  const usuario = await obtenerUsuarioActual()
  const datos = extraerDatosCheckout(formData)

  if (datos.paraCliente && !datos.cliente.nombre) {
    redirect(`/carrito/checkout?error=${encodeURIComponent('Indica el nombre del cliente')}`)
  }
  if (!datos.pago.metodo) {
    redirect(`/carrito/checkout?error=${encodeURIComponent('Elige el método de pago')}`)
  }

  let rutaComprobante: string
  try {
    rutaComprobante = await subirComprobanteCheckout(datos.archivo, `usuario-${usuario.id}`)
  } catch (e) {
    redirect(`/carrito/checkout?error=${encodeURIComponent((e as Error).message)}`)
  }

  const supabase = await createClient()
  const { data: ventaId, error } = await supabase.rpc('fn_confirmar_mi_carrito', {
    p_para_cliente: datos.paraCliente,
    p_cliente: datos.cliente,
    p_envio: datos.envio,
    p_pago: { ...datos.pago, url_archivo: rutaComprobante },
  })

  if (error || !ventaId) {
    await eliminarComprobanteCheckout(rutaComprobante)
    redirect(`/carrito/checkout?error=${encodeURIComponent(error?.message ?? 'No se pudo confirmar el pedido')}`)
  }

  revalidatePath('/', 'layout')
  redirect(`/pedidos?ok=${encodeURIComponent(`Pedido de la venta #${ventaId} enviado — el pago queda en revisión`)}`)
}

/** Cambia "Comprar para mí / Para un cliente" (cookie) y vuelve a la página de origen. */
export async function cambiarModoCompra(formData: FormData) {
  const modo = formData.get('modo') === 'cliente' ? 'cliente' : 'mi'
  const volver = String(formData.get('volver') ?? '')
  ;(await cookies()).set(COOKIE_MODO_COMPRA, modo, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  revalidatePath('/', 'layout')
  redirect(volver.startsWith('/') && !volver.startsWith('//') ? volver : '/catalogo')
}
