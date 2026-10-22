'use server'

import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { obtenerUrlBase } from '@/lib/url-publica'
import { adaptarLineaWeb } from '@/lib/catalogo-web/datos'
import type { ItemCarrito } from '@/lib/publico/carrito'
import type { ResultadoCarritoWeb } from '@/lib/catalogo-web/tipos'

/**
 * Carrito del backoffice para el catálogo web: a diferencia de
 * carrito/acciones.ts no redirigen, devuelven el carrito actualizado
 * para que el catálogo lo pinte sin recargar la página.
 */

async function leer(): Promise<ResultadoCarritoWeb['items']> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('fn_ver_mi_carrito')
  return ((data ?? []) as ItemCarrito[]).map(adaptarLineaWeb)
}

export async function agregarMiCarritoWeb(productoId: number, cantidad = 1): Promise<ResultadoCarritoWeb> {
  if (!productoId) return { ok: false, error: 'Pieza inválida', items: await leer() }
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_agregar_a_mi_carrito', {
    p_producto_id: productoId,
    p_cantidad: Number.isFinite(cantidad) && cantidad > 0 ? Math.floor(cantidad) : 1,
  })
  return { ok: !error, error: error?.message, items: await leer() }
}

export async function quitarMiCarritoWeb(productoId: number): Promise<ResultadoCarritoWeb> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_quitar_de_mi_carrito', { p_producto_id: productoId })
  return { ok: !error, error: error?.message, items: await leer() }
}

/** Subir suma la diferencia; bajar libera la línea y la vuelve a apartar con la cantidad nueva. */
export async function cambiarMiCarritoWeb(productoId: number, actual: number, nueva: number): Promise<ResultadoCarritoWeb> {
  if (nueva < 1) return quitarMiCarritoWeb(productoId)
  if (nueva === actual) return { ok: true, items: await leer() }
  if (nueva > actual) return agregarMiCarritoWeb(productoId, nueva - actual)

  const quitado = await quitarMiCarritoWeb(productoId)
  if (!quitado.ok) return quitado
  const r = await agregarMiCarritoWeb(productoId, nueva)
  if (!r.ok) {
    const respaldo = await agregarMiCarritoWeb(productoId, actual)
    return { ok: false, error: r.error, items: respaldo.items }
  }
  return r
}

/** Link real del embajador para una pieza (mismo fn_crear_link_venta que "Generar enlace"); no redirige. */
export async function generarLinkPiezaWeb(productoId: number): Promise<{ url?: string; error?: string }> {
  const usuario = await obtenerUsuarioActual()
  if (!['tienda', 'asesor', 'embajador', 'admin'].includes(usuario.rol)) return { error: 'Tu rol no puede generar enlaces' }
  const supabase = await createClient()
  const { data: token, error } = await supabase.rpc('fn_crear_link_venta', { p_tipo: 'pieza', p_producto_ids: [productoId] })
  if (error || !token) return { error: error?.message ?? 'No se pudo generar el enlace' }
  return { url: `${await obtenerUrlBase()}/c/${token}` }
}
