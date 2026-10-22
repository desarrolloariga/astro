import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { consultarPiezas, mapearPiezas } from '@/lib/catalogo-web/datos'
import { leerGeneral } from '@/lib/catalogo-web/config'
import type { ConfigGeneral, Contexto, ProductoWeb } from '@/lib/catalogo-web/tipos'
import { leerConfigEntrega, type ConfigEntrega } from '@/lib/entrega'
import { obtenerPoliticaEnvio } from '@/lib/envio-servidor'
import type { PoliticaEnvio } from '@/lib/envio'

type Supabase = Awaited<ReturnType<typeof createClient>>

export type ProductoFicha = ProductoWeb & {
  /** Hay existencia en un CEDI: permite entrega inmediata. */
  inmediata: boolean
  /** Dónde está la pieza (tienda / bodega). */
  ubicacion: string | null
}

export type ExistenciaRed = { tienda: string; tipo: string; cantidad: number }

export type DatosFicha = {
  producto: ProductoFicha
  relacionados: ProductoFicha[]
  red: ExistenciaRed[]
  entrega: ConfigEntrega
  general: ConfigGeneral
  politica: PoliticaEnvio | null
}

const MAX_RELACIONADOS = 12

const aFicha = (p: ProductoWeb): ProductoFicha => ({ ...p, inmediata: Boolean(p.inmediata), ubicacion: p.ubicacion ?? null })

/** Producto, relacionados (misma categoría con existencia), red y configuración de entrega: una sola ola de red. */
export async function cargarFicha(
  supabase: Supabase,
  contexto: Contexto,
  id: number,
  token?: string,
): Promise<DatosFicha | null> {
  const [{ data: config }, filas, { data: redData }, politica] = await Promise.all([
    supabase.from('catalogo_config').select('clave, valor').in('clave', ['entrega', 'general']),
    consultarPiezas(supabase, { token, mismaCategoriaQue: id }),
    contexto === 'backoffice' ? supabase.rpc('fn_existencias_red', { p_producto_id: id }) : Promise.resolve({ data: [] }),
    obtenerPoliticaEnvio(supabase),
  ])
  const bloques = new Map(((config ?? []) as { clave: string; valor: unknown }[]).map((c) => [c.clave, c.valor]))
  const general = leerGeneral(bloques.get('general'))
  const productos = mapearPiezas(filas, general.dias_nuevo)
  const producto = productos.find((p) => p.id === id)
  if (!producto) return null

  return {
    producto: aFicha(producto),
    relacionados: productos
      .filter((p) => p.id !== id && p.stock > 0)
      .slice(0, MAX_RELACIONADOS)
      .map(aFicha),
    red: ((redData ?? []) as { tienda: string; tipo: string; cantidad: number }[]).map((r) => ({
      tienda: r.tienda,
      tipo: r.tipo,
      cantidad: Number(r.cantidad ?? 0),
    })),
    entrega: leerConfigEntrega(bloques.get('entrega')),
    general,
    politica,
  }
}
