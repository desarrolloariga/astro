import 'server-only'
import { cookies } from 'next/headers'
import type { createClient } from '@/lib/supabase/server'

/**
 * Modo de compra del carrito del backoffice: "para mí" o "para un
 * cliente". Se elige arriba del catálogo y se recuerda en una cookie;
 * define qué opción viene marcada en el checkout. Para un embajador,
 * "para mí" significa precio embajador.
 */
export type ModoCompra = 'mi' | 'cliente'

export const COOKIE_MODO_COMPRA = 'astro_modo_compra'

export async function obtenerModoCompra(): Promise<ModoCompra> {
  const valor = (await cookies()).get(COOKIE_MODO_COMPRA)?.value
  return valor === 'cliente' ? 'cliente' : 'mi'
}

type Supabase = Awaited<ReturnType<typeof createClient>>

/** Precio embajador por pieza. Vacío si el usuario no es embajador (lo filtra la base). */
export async function obtenerPreciosEmbajador(supabase: Supabase, ids: number[]): Promise<Map<number, number>> {
  const mapa = new Map<number, number>()
  if (ids.length === 0) return mapa
  const { data } = await supabase.rpc('fn_precios_embajador', { p_producto_ids: ids })
  for (const fila of (data ?? []) as { producto_id: number; precio_embajador: number | null }[]) {
    if (fila.precio_embajador != null) mapa.set(fila.producto_id, Number(fila.precio_embajador))
  }
  return mapa
}
