'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { generarOrdenDespacho } from '@/lib/pdf/orden-despacho'
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
  // Con bolsa el método de pago solo hace falta si queda un restante por pagar;
  // eso lo valida la base (si la bolsa cubre todo, no hay método ni comprobante).
  if (!datos.usarBolsa && !datos.pago.metodo) {
    redirect(`/carrito/checkout?error=${encodeURIComponent('Elige el método de pago')}`)
  }

  // Con bolsa puede no haber comprobante (si el saldo cubre todo); la base valida si falta.
  let rutaComprobante: string | null = null
  if (!(datos.usarBolsa && !datos.archivo)) {
    try {
      rutaComprobante = await subirComprobanteCheckout(datos.archivo, `usuario-${usuario.id}`)
    } catch (e) {
      redirect(`/carrito/checkout?error=${encodeURIComponent((e as Error).message)}`)
    }
  }

  const supabase = await createClient()
  const { data: ventaId, error } = await supabase.rpc('fn_confirmar_mi_carrito', {
    p_para_cliente: datos.paraCliente,
    p_cliente: datos.cliente,
    p_envio: datos.envio,
    p_pago: { ...datos.pago, url_archivo: rutaComprobante },
    p_usar_bolsa: datos.usarBolsa,
  })

  if (error || !ventaId) {
    if (rutaComprobante) await eliminarComprobanteCheckout(rutaComprobante)
    redirect(`/carrito/checkout?error=${encodeURIComponent(error?.message ?? 'No se pudo confirmar el pedido')}`)
  }

  // Pagado por completo con bolsa: el pedido ya está liberado → se genera la orden de despacho.
  const { data: pedido } = await supabase.from('pedidos').select('id, estado').eq('venta_id', ventaId).maybeSingle()
  let mensaje = `Pedido de la venta #${ventaId} enviado — el pago queda en revisión`
  if (pedido?.estado === 'listo_para_despacho') {
    mensaje = `Pedido #${pedido.id} pagado con tu Billetera ASTRO — pasa directo a despacho`
    try {
      await generarOrdenDespacho(pedido.id, usuario.id)
    } catch (e) {
      mensaje += ` (no se pudo generar la orden de despacho: ${(e as Error).message})`
    }
  }

  revalidatePath('/', 'layout')
  redirect(`/pedidos?ok=${encodeURIComponent(mensaje)}`)
}
