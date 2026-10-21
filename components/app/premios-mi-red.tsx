import { Gift } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatearFechaHora, formatearNumero } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { BotonConfirmar } from '@/components/app/boton-confirmar'
import { canjearPremio } from '@/app/(app)/premiaciones/acciones'

type Premio = { id: number; nombre: string; descripcion: string | null; puntos: number; stock: number | null; imagenes: string[] }
type MiCanje = { id: number; puntos: number; estado: string; comentario: string | null; fecha_creacion: string; premio: { nombre: string } | null }

const estados: Record<string, { etiqueta: string; clases: string }> = {
  solicitado: { etiqueta: 'Por entregar', clases: 'bg-amber-500/15 text-amber-800' },
  entregado: { etiqueta: 'Entregado', clases: 'bg-emerald-600/10 text-emerald-700' },
  rechazado: { etiqueta: 'Rechazado', clases: 'bg-destructive/10 text-destructive' },
}

/** Premios para canjear con puntos + mis canjes (sección de Mi red). */
export async function PremiosMiRed({ usuarioId }: { usuarioId: number }) {
  const supabase = await createClient()
  const [{ data: premiosData }, { data: saldoData }, { data: canjesData }] = await Promise.all([
    supabase.from('premios_canje').select('id, nombre, descripcion, puntos, stock, imagenes').eq('activo', true).order('puntos'),
    supabase.rpc('fn_mis_puntos_canje'),
    supabase
      .from('canjes_premios')
      .select('id, puntos, estado, comentario, fecha_creacion, premio:premio_id ( nombre )')
      .eq('usuario_id', usuarioId)
      .order('fecha_creacion', { ascending: false })
      .limit(5),
  ])

  const premios = (premiosData ?? []) as Premio[]
  const saldo = (saldoData as { ganados: number; canjeados: number; disponibles: number }[] | null)?.[0]
  const disponibles = Number(saldo?.disponibles ?? 0)
  const canjes = (canjesData ?? []) as unknown as MiCanje[]

  if (premios.length === 0 && canjes.length === 0) return null

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Gift className="h-4 w-4 text-primary" />
          Canjea tus puntos
        </h2>
        <p className="text-xs text-muted-foreground">
          Tienes <span className="text-base font-bold text-foreground">{formatearNumero(disponibles)}</span> puntos para canjear
        </p>
      </div>

      {premios.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {premios.map((p) => {
            const agotado = p.stock != null && p.stock <= 0
            const faltan = Math.max(0, p.puntos - disponibles)
            return (
              <div key={p.id} className="flex flex-col overflow-hidden rounded-lg border border-border bg-background">
                <div className="relative aspect-square bg-secondary">
                  {p.imagenes[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imagenes[0]} alt={p.nombre} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Gift className="h-8 w-8 text-muted-foreground" strokeWidth={1.2} />
                    </div>
                  )}
                  <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                    {formatearNumero(p.puntos)} pts
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <p className="line-clamp-2 text-sm font-semibold text-foreground">{p.nombre}</p>
                  {p.descripcion && <p className="line-clamp-2 text-[11px] text-muted-foreground">{p.descripcion}</p>}
                  {p.imagenes.length > 1 && (
                    <div className="flex gap-1 pt-1">
                      {p.imagenes.slice(1, 4).map((url) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={url} src={url} alt="" className="h-8 w-8 rounded object-cover" />
                      ))}
                    </div>
                  )}
                  <form action={canjearPremio} className="mt-auto pt-2">
                    <input type="hidden" name="premio_id" value={p.id} />
                    <BotonConfirmar
                      mensaje={`¿Canjear "${p.nombre}" por ${p.puntos} puntos?`}
                      disabled={agotado || faltan > 0}
                      className="w-full rounded-md bg-primary px-2 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                    >
                      {agotado ? 'Agotado' : faltan > 0 ? `Te faltan ${formatearNumero(faltan)} pts` : 'Canjear'}
                    </BotonConfirmar>
                  </form>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {canjes.length > 0 && (
        <div className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3">
          <p className="text-xs font-semibold text-foreground">Mis canjes</p>
          {canjes.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                {c.premio?.nombre ?? '—'} · {formatearNumero(c.puntos)} pts · {formatearFechaHora(c.fecha_creacion)}
              </span>
              <span className={cn('rounded-full px-2 py-0.5 font-semibold', estados[c.estado]?.clases)}>
                {estados[c.estado]?.etiqueta ?? c.estado}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
