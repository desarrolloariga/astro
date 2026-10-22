import { Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatearNumero } from '@/lib/formato'

/**
 * Bloques secundarios de Mi red que se transmiten con Suspense, para que la
 * Billetera y la lista de embajadores no esperen por el ranking ni por los
 * puntos de toda la red.
 */

export type PuntosBolsa = {
  usuario_id: number
  nombre: string
  puntos_periodo: number
  puntos_total: number
  bolsa_disponible: number
  bolsa_en_espera: number
}

type MisPuntos = {
  ganados: number
  propios: number
  de_red: number
  periodo: number
  periodo_propios: number
  canjeados: number
  disponibles: number
  equipo: number
}

/**
 * "Tus puntos": disponibles para premios, del período y acumulados. Incluye
 * los puntos de quienes están debajo en la jerarquía (fn_mis_puntos_canje).
 */
export async function SeccionPuntos({ usuarioId, conRanking = false }: { usuarioId: number; conRanking?: boolean }) {
  const supabase = await createClient()
  const [{ data: rankingData }, { data: misData }] = await Promise.all([
    conRanking ? supabase.rpc('fn_mi_posicion_ranking').maybeSingle<{ posicion: number }>() : Promise.resolve({ data: null as { posicion: number } | null }),
    supabase.rpc('fn_mis_puntos_canje'),
  ])

  const mios = ((misData ?? []) as MisPuntos[])[0]
  const n = (v: number | undefined) => formatearNumero(Number(v ?? 0))
  const equipo = Number(mios?.equipo ?? 0)

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
        <Trophy className="h-4 w-4 text-primary" />
        Tus puntos
      </h2>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-2xl font-bold text-foreground">{n(mios?.disponibles)}</p>
          <p className="text-xs text-muted-foreground">para premios</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-foreground">{n(mios?.periodo)}</p>
          <p className="text-xs text-muted-foreground">este período</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-foreground">{n(mios?.ganados)}</p>
          <p className="text-xs text-muted-foreground">acumulados</p>
        </div>
      </div>
      {equipo > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Incluye {n(mios?.de_red)} puntos de las {equipo} persona{equipo !== 1 ? 's' : ''} que están debajo de ti en la jerarquía.
        </p>
      )}
      <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800">
        Estos puntos no se canjean por productos ni por dinero: solo se redimen por premios.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        1 quetzal vendido = 1 punto, cuando se aprueba el pago de la venta.
        {rankingData?.posicion ? ` Posición #${rankingData.posicion} en el ranking este período.` : ''}
      </p>
    </div>
  )
}

/** Tarjeta en blanco del alto aproximado del bloque que se está cargando. */
export function EsqueletoTarjeta({ alto }: { alto: 'h-36' | 'h-48' }) {
  return <div className={`${alto} animate-pulse rounded-xl bg-secondary/70`} aria-busy="true" aria-label="Cargando" />
}
