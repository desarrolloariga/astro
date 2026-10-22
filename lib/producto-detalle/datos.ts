import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { COLUMNAS_PIEZA, enriquecerPiezas, type PiezaFuente } from '@/lib/catalogo-web/datos'
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

/** Producto, relacionados (misma categoría con existencia), red y configuración de entrega. */
export async function cargarFicha(
  supabase: Supabase,
  contexto: Contexto,
  id: number,
  token?: string,
): Promise<DatosFicha | null> {
  const configPromesa = supabase.from('catalogo_config').select('clave, valor').in('clave', ['entrega', 'general'])
  const politicaPromesa = obtenerPoliticaEnvio(supabase)

  let principal: (PiezaFuente & { tienda?: string | null }) | undefined
  let otras: PiezaFuente[] = []
  if (contexto === 'publico') {
    const { data } = await supabase.rpc('fn_catalogo_por_token', { p_token: token ?? '' })
    const todas = (data ?? []) as PiezaFuente[]
    principal = todas.find((p) => p.id === id)
    if (principal) otras = todas.filter((p) => p.id !== id && p.categoria === principal?.categoria)
  } else {
    const { data } = await supabase.from('vw_catalogo').select(`${COLUMNAS_PIEZA}, tienda`).eq('id', id).maybeSingle()
    principal = (data ?? undefined) as (PiezaFuente & { tienda?: string | null }) | undefined
    if (principal?.categoria_id != null) {
      const { data: rel } = await supabase
        .from('vw_catalogo')
        .select(COLUMNAS_PIEZA)
        .eq('categoria_id', principal.categoria_id)
        .neq('id', id)
        .order('id', { ascending: false })
        .limit(MAX_RELACIONADOS * 2)
      otras = (rel ?? []) as PiezaFuente[]
    }
  }
  if (!principal) return null

  const [{ data: config }, politica] = await Promise.all([configPromesa, politicaPromesa])
  const bloques = new Map(((config ?? []) as { clave: string; valor: unknown }[]).map((c) => [c.clave, c.valor]))
  const general = leerGeneral(bloques.get('general'))

  const piezas = [principal, ...otras]
  const ids = piezas.map((p) => p.id)
  const [productos, { data: inmediatas }, { data: redData }] = await Promise.all([
    enriquecerPiezas(supabase, piezas, contexto, general.dias_nuevo),
    supabase.rpc('fn_entrega_inmediata', { p_producto_ids: ids }),
    contexto === 'backoffice' ? supabase.rpc('fn_existencias_red', { p_producto_id: id }) : Promise.resolve({ data: [] }),
  ])
  const cedi = new Map(((inmediatas ?? []) as { producto_id: number; ubicacion: string }[]).map((f) => [Number(f.producto_id), f.ubicacion]))
  const conEntrega = (p: ProductoWeb): ProductoFicha => ({
    ...p,
    inmediata: p.stock > 0 && cedi.has(p.id),
    ubicacion: cedi.get(p.id) ?? null,
  })

  const producto = productos.find((p) => p.id === id)
  if (!producto) return null
  return {
    producto: { ...conEntrega(producto), ubicacion: cedi.get(id) ?? principal.tienda ?? null },
    relacionados: productos
      .filter((p) => p.id !== id && p.stock > 0)
      .slice(0, MAX_RELACIONADOS)
      .map(conEntrega),
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
