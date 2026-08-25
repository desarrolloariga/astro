import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, UserPlus, PlusCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearPrecio, formatearFecha } from '@/lib/formato'
import { EstadoBadge, estadosContratacion } from '@/components/app/estado-badge'
import { decidirContratacion } from './acciones'

export const metadata = { title: 'Contrataciones — ASTRO' }

type Contratacion = {
  id: number
  candidato_nombre: string
  puesto: string
  salario_propuesto: number | null
  estado: string
  fecha_creacion: string
  usuarios_solicitante: { nombre: string } | null
}

export default async function ContratacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  if (!(await tienePermiso('contrataciones', 'ver')) && !(await tienePermiso('contrataciones', 'crear'))) {
    redirect('/inicio')
  }
  const puedeCrear = await tienePermiso('contrataciones', 'crear')
  const puedeDecidir = await tienePermiso('contrataciones', 'decidir')

  const { ok, error } = await searchParams
  const supabase = await createClient()
  const { data: solicitudes } = await supabase
    .from('contrataciones')
    .select(
      'id, candidato_nombre, puesto, salario_propuesto, estado, fecha_creacion, usuarios_solicitante:usuarios!contrataciones_solicitado_por_fkey ( nombre )',
    )
    .order('fecha_creacion', { ascending: false })

  const lista = (solicitudes ?? []) as unknown as Contratacion[]

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Contrataciones</h1>
          <p className="mt-1 text-sm text-muted-foreground">Solicitudes de contratación y su decisión.</p>
        </div>
        {puedeCrear && (
          <Link
            href="/contrataciones/nueva"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
          >
            <PlusCircle className="h-4 w-4" />
            Nueva solicitud
          </Link>
        )}
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

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <UserPlus className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Aún no hay solicitudes de contratación</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {lista.map((c) => (
            <div key={c.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {c.candidato_nombre} <span className="font-normal text-muted-foreground">· {c.puesto}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatearFecha(c.fecha_creacion)}
                    {c.usuarios_solicitante && ` · pedido por ${c.usuarios_solicitante.nombre}`}
                    {c.salario_propuesto != null && ` · ${formatearPrecio(c.salario_propuesto)}`}
                  </p>
                </div>
                <EstadoBadge estado={c.estado} config={estadosContratacion} />
              </div>
              {puedeDecidir && ['solicitada', 'en_evaluacion'].includes(c.estado) && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                  {c.estado === 'solicitada' && (
                    <form action={decidirContratacion}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="nuevo_estado" value="en_evaluacion" />
                      <button
                        type="submit"
                        className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
                      >
                        Pasar a evaluación
                      </button>
                    </form>
                  )}
                  <form action={decidirContratacion}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="nuevo_estado" value="aprobada" />
                    <button
                      type="submit"
                      className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
                    >
                      Aprobar
                    </button>
                  </form>
                  <form action={decidirContratacion}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="nuevo_estado" value="rechazada" />
                    <button
                      type="submit"
                      className="rounded-full border border-destructive/40 px-3 py-1 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
                    >
                      Rechazar
                    </button>
                  </form>
                </div>
              )}
              {puedeDecidir && c.estado === 'aprobada' && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                  <form action={decidirContratacion}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="nuevo_estado" value="contratada" />
                    <button
                      type="submit"
                      className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
                    >
                      Marcar contratada
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
