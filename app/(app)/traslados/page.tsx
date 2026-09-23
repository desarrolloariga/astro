import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, ArrowRightLeft, PlusCircle, PackageCheck, X, Camera } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearFechaHora, formatearNumero } from '@/lib/formato'
import { EstadoBadge, estadosTraslado, estadosRecepcionLinea } from '@/components/app/estado-badge'
import { confirmarRecepcionTraslado } from './acciones'

export const metadata = { title: 'Traslados entre bodegas — ASTRO' }

type Detalle = {
  id: number
  producto_id: number
  cantidad: number | null
  estado_recepcion: string
  comentario_incidencia: string | null
  productos: { codigo: string; nombre: string } | null
}
type Traslado = {
  id: number
  estado: string
  fecha_envio: string
  fecha_recepcion: string | null
  origen: { nombre: string } | null
  destino: { nombre: string } | null
  transferencia_detalles: Detalle[]
}

export default async function TrasladosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const puedeTrasladar = await tienePermiso('inventario', 'transferir')
  if (!puedeTrasladar) redirect('/inicio')

  const { ok, error } = await searchParams
  const supabase = await createClient()

  const { data } = await supabase
    .from('transferencias')
    .select(
      'id, estado, fecha_envio, fecha_recepcion, origen:tienda_origen_id ( nombre ), destino:tienda_destino_id ( nombre ), transferencia_detalles ( id, producto_id, cantidad, estado_recepcion, comentario_incidencia, productos ( codigo, nombre ) )',
    )
    .order('fecha_envio', { ascending: false })
    .limit(50)

  const traslados = (data ?? []) as unknown as Traslado[]

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Traslados entre bodegas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mover inventario y artículos entre bodegas (CEDI) — las tiendas de venta no participan.
          </p>
        </div>
        <Link
          href="/traslados/nuevo"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          <PlusCircle className="h-4 w-4" />
          Nuevo traslado
        </Link>
      </div>

      {ok && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{ok}</span>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {traslados.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <ArrowRightLeft className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Todavía no hay traslados</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {traslados.map((t) => {
            const pendientes = t.transferencia_detalles.filter((d) => d.estado_recepcion === 'pendiente')
            return (
              <section key={t.id} className="rounded-xl border border-border bg-card p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">
                      Traslado #{t.id} · {t.origen?.nombre ?? '—'} → {t.destino?.nombre ?? '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Enviado {formatearFechaHora(t.fecha_envio)}
                      {t.fecha_recepcion && ` · Recibido ${formatearFechaHora(t.fecha_recepcion)}`}
                    </p>
                  </div>
                  <EstadoBadge estado={t.estado} config={estadosTraslado} />
                </div>

                <div className="flex flex-col gap-2">
                  {t.transferencia_detalles.map((d) => (
                    <div
                      key={d.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 p-3 text-sm"
                    >
                      <div className="min-w-40 flex-1">
                        <span className="font-medium text-foreground">
                          {d.productos?.codigo} — {d.productos?.nombre}
                        </span>
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {d.cantidad != null ? `${formatearNumero(d.cantidad)} unidades` : 'pieza única'}
                        </span>
                        <Link
                          href={`/produccion/${d.producto_id}/fotos`}
                          target="_blank"
                          className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                        >
                          <Camera className="h-3 w-3" />
                          Fotos
                        </Link>
                        {d.comentario_incidencia && (
                          <p className="text-xs text-destructive">Incidencia: {d.comentario_incidencia}</p>
                        )}
                      </div>
                      {d.estado_recepcion === 'pendiente' ? (
                        <div className="flex items-center gap-2">
                          <form action={confirmarRecepcionTraslado} className="inline">
                            <input type="hidden" name="detalle_id" value={d.id} />
                            <input type="hidden" name="accion" value="confirmar" />
                            <button
                              type="submit"
                              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90"
                            >
                              <PackageCheck className="h-3.5 w-3.5" />
                              Recibir
                            </button>
                          </form>
                          <details className="inline-block text-left">
                            <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive">
                              <X className="h-3.5 w-3.5" />
                              Incidencia
                            </summary>
                            <form
                              action={confirmarRecepcionTraslado}
                              className="absolute z-10 mt-1 flex w-56 flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-lg"
                            >
                              <input type="hidden" name="detalle_id" value={d.id} />
                              <input type="hidden" name="accion" value="incidencia" />
                              <input
                                name="comentario"
                                placeholder="Motivo de la incidencia"
                                required
                                className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                              />
                              <button
                                type="submit"
                                className="rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground hover:opacity-90"
                              >
                                Confirmar incidencia
                              </button>
                            </form>
                          </details>
                        </div>
                      ) : (
                        <EstadoBadge estado={d.estado_recepcion} config={estadosRecepcionLinea} />
                      )}
                    </div>
                  ))}
                </div>

                {pendientes.length === 0 && t.estado !== 'con_incidencia' && (
                  <p className="mt-2 text-xs text-muted-foreground">Todo recibido.</p>
                )}
              </section>
            )
          })}
        </div>
      )}
    </main>
  )
}
