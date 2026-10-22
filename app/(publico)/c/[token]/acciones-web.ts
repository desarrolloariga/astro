'use server'

import { obtenerUrlBase } from '@/lib/url-publica'
import { adaptarLineaWeb } from '@/lib/catalogo-web/datos'
import type { ResultadoCarritoWeb } from '@/lib/catalogo-web/tipos'
import { agregarMovil, cambiarCantidadMovil, quitarMovil, type ResultadoCarrito } from './acciones-movil'

/** Carrito del enlace público para el catálogo web (mismas reglas que la app móvil). */

const adaptar = (r: ResultadoCarrito): ResultadoCarritoWeb => ({ ok: r.ok, error: r.error, items: r.items.map(adaptarLineaWeb) })

export async function agregarPublicoWeb(token: string, productoId: number, cantidad = 1) {
  return adaptar(await agregarMovil(token, productoId, cantidad))
}

export async function quitarPublicoWeb(token: string, productoId: number) {
  return adaptar(await quitarMovil(token, productoId))
}

export async function cambiarPublicoWeb(token: string, productoId: number, actual: number, nueva: number) {
  return adaptar(await cambiarCantidadMovil(token, productoId, actual, nueva))
}

/** Link para compartir una pieza del enlace público (el mismo enlace del embajador). */
export async function linkPiezaPublicaWeb(token: string, productoId: number): Promise<{ url?: string; error?: string }> {
  return { url: `${await obtenerUrlBase()}/c/${token}/p/${productoId}` }
}
