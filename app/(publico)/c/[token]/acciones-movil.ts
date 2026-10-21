'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { nombreCookieCarrito, type ItemCarrito } from '@/lib/publico/carrito'
import { extraerDatosCheckout, subirComprobanteCheckout, eliminarComprobanteCheckout } from '@/lib/checkout'

/**
 * Acciones de la app móvil del catálogo público. A diferencia de
 * acciones.ts no redirigen: devuelven el carrito actualizado para que la
 * app cambie de pantalla sin recargar (y sin sumar visitas al enlace).
 */

export type ResultadoCarrito = { ok: boolean; error?: string; items: ItemCarrito[] }

async function leerItems(carritoToken: string | null | undefined): Promise<ItemCarrito[]> {
  if (!carritoToken) return []
  const supabase = await createClient()
  const { data } = await supabase.rpc('fn_ver_carrito', { p_carrito_token: carritoToken })
  return (data ?? []) as ItemCarrito[]
}

async function tokenCarrito(token: string) {
  const cookieStore = await cookies()
  return { cookieStore, carritoToken: cookieStore.get(nombreCookieCarrito(token))?.value ?? null }
}

async function agregar(token: string, productoId: number, cantidad: number) {
  const { cookieStore, carritoToken } = await tokenCarrito(token)
  const supabase = await createClient()
  const { data: nuevoToken, error } = await supabase.rpc('fn_agregar_al_carrito', {
    p_token: token,
    p_carrito_token: carritoToken,
    p_producto_id: productoId,
    p_cantidad: cantidad,
  })
  if (error || !nuevoToken) return { error: error?.message ?? 'No se pudo agregar la pieza', carritoToken }
  cookieStore.set(nombreCookieCarrito(token), nuevoToken, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 6,
    path: '/',
  })
  return { error: null, carritoToken: nuevoToken as string }
}

export async function verCarritoMovil(token: string): Promise<ResultadoCarrito> {
  const { carritoToken } = await tokenCarrito(token)
  return { ok: true, items: await leerItems(carritoToken) }
}

export async function agregarMovil(token: string, productoId: number, cantidad = 1): Promise<ResultadoCarrito> {
  if (!token || !productoId) return { ok: false, error: 'Pieza inválida', items: [] }
  const n = Number.isFinite(cantidad) && cantidad > 0 ? Math.floor(cantidad) : 1
  const r = await agregar(token, productoId, n)
  return { ok: !r.error, error: r.error ?? undefined, items: await leerItems(r.carritoToken) }
}

export async function quitarMovil(token: string, productoId: number): Promise<ResultadoCarrito> {
  const { carritoToken } = await tokenCarrito(token)
  if (!carritoToken) return { ok: true, items: [] }
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_quitar_del_carrito', {
    p_carrito_token: carritoToken,
    p_producto_id: productoId,
  })
  return { ok: !error, error: error?.message, items: await leerItems(carritoToken) }
}

/**
 * Cambia la cantidad de una línea por_cantidad. Subir suma la diferencia;
 * bajar libera la línea y la vuelve a apartar con la cantidad nueva (si eso
 * falla se intenta dejar la cantidad anterior).
 */
export async function cambiarCantidadMovil(
  token: string,
  productoId: number,
  actual: number,
  nueva: number,
): Promise<ResultadoCarrito> {
  if (nueva < 1) return quitarMovil(token, productoId)
  if (nueva === actual) return verCarritoMovil(token)
  if (nueva > actual) return agregarMovil(token, productoId, nueva - actual)

  const quitado = await quitarMovil(token, productoId)
  if (!quitado.ok) return quitado
  const r = await agregar(token, productoId, nueva)
  if (r.error) {
    const respaldo = await agregar(token, productoId, actual)
    return { ok: false, error: r.error, items: await leerItems(respaldo.carritoToken ?? r.carritoToken) }
  }
  return { ok: true, items: await leerItems(r.carritoToken) }
}

export async function confirmarMovil(
  formData: FormData,
): Promise<{ ok: true; ventaId: number } | { ok: false; error: string }> {
  const token = String(formData.get('token') ?? '')
  if (!token) return { ok: false, error: 'Enlace inválido' }

  const { cookieStore, carritoToken } = await tokenCarrito(token)
  if (!carritoToken) return { ok: false, error: 'Tu carrito venció. Vuelve a agregar las piezas.' }

  const datos = extraerDatosCheckout(formData)
  if (!datos.cliente.nombre) return { ok: false, error: 'Escribe tu nombre completo' }
  if (!datos.cliente.telefono) return { ok: false, error: 'Escribe tu teléfono' }
  if (!datos.envio.ciudad || !datos.envio.direccion) return { ok: false, error: 'Completa la ciudad y la dirección de envío' }
  if (!datos.pago.metodo) return { ok: false, error: 'Elige el método de pago' }

  let ruta: string
  try {
    ruta = await subirComprobanteCheckout(datos.archivo, carritoToken)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }

  const supabase = await createClient()
  const { data: ventaId, error } = await supabase.rpc('fn_confirmar_carrito', {
    p_carrito_token: carritoToken,
    p_cliente: datos.cliente,
    p_envio: { ...datos.envio, para_cliente: true },
    p_pago: { ...datos.pago, url_archivo: ruta },
  })

  if (error || !ventaId) {
    await eliminarComprobanteCheckout(ruta)
    return { ok: false, error: error?.message ?? 'No se pudo completar la compra' }
  }

  cookieStore.delete(nombreCookieCarrito(token))
  return { ok: true, ventaId: Number(ventaId) }
}
