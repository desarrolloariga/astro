import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, Megaphone, PlusCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearFecha } from '@/lib/formato'
import { crearPublicidad, alternarPublicidad } from './acciones'

export const metadata = { title: 'Publicidad interna — ASTRO' }

const nombresPublico: Record<string, string> = {
  todos: 'Todos',
  embajador: 'Embajadores',
  asesor: 'Asesores',
  supervisor: 'Supervisores',
  tienda: 'Tiendas',
}

type Publicidad = {
  id: number
  titulo: string
  cuerpo: string | null
  publico_objetivo: string
  fecha_inicio: string
  fecha_fin: string | null
  activo: boolean
}

export default async function AdminPublicidadPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  if (!(await tienePermiso('publicidad', 'editar'))) redirect('/inicio')

  const { ok, error } = await searchParams
  const supabase = await createClient()

  const { data } = await supabase
    .from('publicidad_interna')
    .select('id, titulo, cuerpo, publico_objetivo, fecha_inicio, fecha_fin, activo')
    .order('fecha_creacion', { ascending: false })

  const lista = (data ?? []) as Publicidad[]

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Publicidad interna</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Anuncios que aparecen en el inicio de la red comercial, según a quién van dirigidos.
        </p>
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

      <details className="rounded-xl border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground">
          <PlusCircle className="h-4 w-4 text-primary" />
          Nueva publicidad
        </summary>
        <form action={crearPublicidad} className="flex flex-col gap-3 px-4 pb-4">
          <input
            name="titulo"
            required
            placeholder="Título"
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <textarea
            name="cuerpo"
            rows={2}
            placeholder="Mensaje (opcional)"
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              name="imagen_url"
              placeholder="URL de imagen (opcional)"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <input
              name="url_destino"
              placeholder="Enlace al hacer clic (opcional)"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select
              name="publico_objetivo"
              defaultValue="embajador"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              {Object.entries(nombresPublico).map(([valor, etiqueta]) => (
                <option key={valor} value={valor}>
                  {etiqueta}
                </option>
              ))}
            </select>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Vence (opcional)
              <input
                name="fecha_fin"
                type="date"
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </label>
          </div>
          <button
            type="submit"
            className="mt-1 w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
          >
            Crear publicidad
          </button>
        </form>
      </details>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Megaphone className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Aún no hay publicidad</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {lista.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{p.titulo}</p>
                <p className="text-xs text-muted-foreground">
                  {nombresPublico[p.publico_objetivo] ?? p.publico_objetivo} · desde {formatearFecha(p.fecha_inicio)}
                  {p.fecha_fin && ` hasta ${formatearFecha(p.fecha_fin)}`}
                </p>
              </div>
              <form action={alternarPublicidad}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="activo" value={p.activo ? '1' : '0'} />
                <button
                  type="submit"
                  className={
                    p.activo
                      ? 'rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary'
                      : 'rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground'
                  }
                >
                  {p.activo ? 'Activa' : 'Inactiva'}
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
