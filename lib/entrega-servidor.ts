import 'server-only'
import { cookies } from 'next/headers'
import type { createClient } from '@/lib/supabase/server'
import { COOKIE_ENTREGA, leerConfigEntrega, parsearEleccion } from '@/lib/entrega'

type Supabase = Awaited<ReturnType<typeof createClient>>

/** Datos de entrega para el checkout: configuración, lo elegido en la ficha y si todo el carrito permite entrega inmediata. */
export async function cargarEntregaCheckout(supabase: Supabase, productoIds: number[]) {
  const [{ data: config }, { data: inmediatas }, galletas] = await Promise.all([
    supabase.from('catalogo_config').select('valor').eq('clave', 'entrega').maybeSingle(),
    productoIds.length ? supabase.rpc('fn_entrega_inmediata', { p_producto_ids: productoIds }) : Promise.resolve({ data: [] }),
    cookies(),
  ])
  const conCedi = new Set(((inmediatas ?? []) as { producto_id: number }[]).map((f) => Number(f.producto_id)))
  return {
    config: leerConfigEntrega(config?.valor),
    inicial: parsearEleccion(galletas.get(COOKIE_ENTREGA)?.value),
    permiteInmediata: productoIds.length > 0 && productoIds.every((id) => conCedi.has(id)),
  }
}
