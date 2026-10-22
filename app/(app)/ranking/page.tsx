import { redirect } from 'next/navigation'
import { Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { RankingGamificado } from '@/components/ranking/ranking-gamificado'
import type { DatosRanking } from '@/components/ranking/tokens'

export const metadata = { title: 'Ranking — ASTRO' }

const ALCANCES = new Set(['red', 'tienda', 'rol'])

/**
 * La página se arma en el servidor con fn_ranking: la base decide, según la
 * sesión, si las filas ajenas llevan nombre (admin/coordinador) o llegan
 * anónimas. El navegador nunca recibe nombres que no deba ver.
 */
export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; alcance?: string; rol?: string; tienda?: string }>
}) {
  const supabase = await createClient()
  const [usuario, sp] = await Promise.all([obtenerUsuarioActual(), searchParams])
  if (['produccion', 'contabilidad', 'logistica'].includes(usuario.rol)) redirect('/inicio')

  const periodo = Number(sp.periodo) || null
  const alcance = sp.alcance && ALCANCES.has(sp.alcance) ? sp.alcance : 'red'
  const { data, error } = await supabase.rpc('fn_ranking', {
    p_periodo_id: periodo,
    p_alcance: alcance,
    p_rol: sp.rol || null,
    p_tienda_id: Number(sp.tienda) || null,
  })
  const datos = data as DatosRanking | null

  if (error || !datos || datos.sin_periodo) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 px-4 py-16 text-center">
        <Trophy className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
        <p className="text-sm font-semibold text-foreground">Aún no hay ciclos con actividad</p>
        <p className="text-sm text-muted-foreground">{error ? error.message : 'El ranking aparecerá con la primera venta registrada.'}</p>
      </main>
    )
  }

  return <RankingGamificado datos={datos} filtros={{ rol: sp.rol ?? '', tienda: sp.tienda ?? '' }} />
}
