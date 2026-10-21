import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import type { PoliticaEnvio } from '@/lib/envio'

type Supabase = Awaited<ReturnType<typeof createClient>>

/** Política de envío vigente (también para visitantes sin sesión del catálogo público). */
export async function obtenerPoliticaEnvio(supabase: Supabase): Promise<PoliticaEnvio | null> {
  const { data } = await supabase.rpc('fn_politica_envio_vigente')
  if (!data) return null
  const p = data as Record<string, unknown>
  return {
    tarifa: Number(p.tarifa ?? 0),
    envio_gratis_desde: p.envio_gratis_desde == null ? null : Number(p.envio_gratis_desde),
    costo_real: Number(p.costo_real ?? 0),
    cobrar_publico: Boolean(p.cobrar_publico),
    cobrar_backoffice_cliente: Boolean(p.cobrar_backoffice_cliente),
    cobrar_compra_propia: Boolean(p.cobrar_compra_propia),
  }
}
