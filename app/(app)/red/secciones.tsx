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

/** "Tus puntos" del embajador: posición en el ranking y puntos del período. */
export async function SeccionPuntosEmbajador({ usuarioId }: { usuarioId: number }) {
  const supabase = await createClient()
  const [{ data: puntosData }, { data: incentivosData }] = await Promise.all([
    supabase
      .from('vw_ranking')
      .select('puntos_totales, posicion')
      .eq('usuario_id', usuarioId)
      .order('periodo_id', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.rpc('fn_red_puntos_bolsa'),
  ])

  const mios = ((incentivosData ?? []) as PuntosBolsa[]).find((r) => r.usuario_id === usuarioId)

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
        <Trophy className="h-4 w-4 text-primary" />
        Tus puntos
      </h2>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-2xl font-bold text-foreground">{formatearNumero(Number(mios?.puntos_periodo ?? 0))}</p>
          <p className="text-xs text-muted-foreground">este período</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-foreground">{formatearNumero(Number(mios?.puntos_total ?? 0))}</p>
          <p className="text-xs text-muted-foreground">acumulados</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        1 quetzal vendido = 1 punto, cuando se aprueba el pago de la venta.
        {puntosData?.posicion ? ` Posición #${puntosData.posicion} este período.` : ''}
      </p>
    </div>
  )
}

/** Tarjeta en blanco del alto aproximado del bloque que se está cargando. */
export function EsqueletoTarjeta({ alto }: { alto: 'h-36' | 'h-48' }) {
  return <div className={`${alto} animate-pulse rounded-xl bg-secondary/70`} aria-busy="true" aria-label="Cargando" />
}
