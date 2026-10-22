import 'server-only'
import type { createClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>

export type PoliticaMayorista = { id: number; nombre: string; descuento_pct: number; minimo_compra: number }

/** Política activa del mayorista en sesión (null si no tiene o no es mayorista). */
export async function obtenerPoliticaMayorista(supabase: Supabase): Promise<PoliticaMayorista | null> {
  const { data } = await supabase.rpc('fn_mi_politica_mayorista')
  const fila = ((data ?? []) as PoliticaMayorista[])[0]
  if (!fila) return null
  return { ...fila, descuento_pct: Number(fila.descuento_pct), minimo_compra: Number(fila.minimo_compra) }
}
