import Link from 'next/link'
import { AlertCircle, CheckCircle2, HelpCircle, LifeBuoy } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { formatearFechaHora } from '@/lib/formato'
import { EstadoBadge, type ConfigEstado } from '@/components/app/estado-badge'
import { Paginacion } from '@/components/inventario/paginacion'
import { calcularRango, calcularTotalPaginas } from '@/lib/inventario'
import { crearTicket, crearFaq } from './acciones'

export const metadata = { title: 'Soporte — ASTRO' }

const TAMANO_PAGINA_TICKETS = 25

const ESTADOS_TICKET = ['abierto', 'en_proceso', 'resuelto', 'cerrado'] as const

const estadosTicket: ConfigEstado = {
  abierto: { etiqueta: 'Abierto', clases: 'bg-accent text-accent-foreground' },
  en_proceso: { etiqueta: 'En proceso', clases: 'bg-brand-deep-muted/40 text-brand-deep' },
  resuelto: { etiqueta: 'Resuelto', clases: 'bg-primary/10 text-primary' },
  cerrado: { etiqueta: 'Cerrado', clases: 'bg-muted text-muted-foreground' },
}

const clasesCampo =
  'rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25'

type Faq = { id: number; pregunta: string; respuesta: string; categoria: string | null }
type Ticket = { id: number; asunto: string; estado: string; fecha_creacion: string; usuarios?: { nombre: string } | null }
type TicketAdmin = Ticket & { categoria: string | null; asignado: { nombre: string } | null }

export default async function SoportePage({
  searchParams,
}: {
  searchParams: Promise<{
    ok?: string
    error?: string
    estado?: string
    categoria?: string
    asignado_a?: string
    pagina?: string
  }>
}) {
  const usuario = await obtenerUsuarioActual()
  const sp = await searchParams
  const { ok, error } = sp
  const estadoFiltro = (sp.estado ?? '').trim()
  const categoriaFiltro = (sp.categoria ?? '').trim()
  const asignadoFiltro = sp.asignado_a ? Number(sp.asignado_a) : null
  const pagina = Math.max(1, Number(sp.pagina ?? '1') || 1)
  const supabase = await createClient()
  const esAdmin = usuario.rol === 'admin'

  let consultaTodos = supabase
    .from('tickets')
    .select('id, asunto, estado, categoria, fecha_creacion, usuarios:usuario_id ( nombre ), asignado:asignado_a ( nombre )', {
      count: 'exact',
    })
    .order('fecha_creacion', { ascending: false })
  if (estadoFiltro && (ESTADOS_TICKET as readonly string[]).includes(estadoFiltro)) {
    consultaTodos = consultaTodos.eq('estado', estadoFiltro)
  }
  if (categoriaFiltro) consultaTodos = consultaTodos.eq('categoria', categoriaFiltro)
  if (asignadoFiltro) consultaTodos = consultaTodos.eq('asignado_a', asignadoFiltro)
  const { desde, hasta } = calcularRango(pagina, TAMANO_PAGINA_TICKETS)
  consultaTodos = consultaTodos.range(desde, hasta)

  const [{ data: faqs }, { data: misTickets }, { data: todosTickets, count: totalTickets }, { data: categoriasData }, { data: adminsData }] =
    await Promise.all([
      supabase.from('faqs').select('id, pregunta, respuesta, categoria').eq('activo', true).order('orden'),
      supabase
        .from('tickets')
        .select('id, asunto, estado, fecha_creacion')
        .eq('usuario_id', usuario.id)
        .order('fecha_creacion', { ascending: false }),
      esAdmin ? consultaTodos : Promise.resolve({ data: [], count: 0 }),
      esAdmin
        ? supabase.from('tickets').select('categoria').not('categoria', 'is', null)
        : Promise.resolve({ data: [] }),
      esAdmin
        ? supabase.from('usuarios').select('id, nombre, roles!inner ( nombre )').eq('roles.nombre', 'admin').eq('activo', true)
        : Promise.resolve({ data: [] }),
    ])

  const categorias = Array.from(new Set((categoriasData ?? []).map((c) => c.categoria).filter(Boolean))) as string[]
  const admins = adminsData ?? []
  const totalPaginas = calcularTotalPaginas(totalTickets ?? 0, TAMANO_PAGINA_TICKETS)
  const construirHref = (paginaDestino: number) => {
    const params = new URLSearchParams()
    if (estadoFiltro) params.set('estado', estadoFiltro)
    if (categoriaFiltro) params.set('categoria', categoriaFiltro)
    if (asignadoFiltro) params.set('asignado_a', String(asignadoFiltro))
    if (paginaDestino > 1) params.set('pagina', String(paginaDestino))
    const qs = params.toString()
    return `/soporte${qs ? `?${qs}` : ''}`
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Centro de ayuda</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Preguntas frecuentes y tickets de soporte interno.
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

      {/* FAQs */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <HelpCircle className="h-4 w-4 text-primary" /> Preguntas frecuentes
        </h2>
        {(faqs ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay preguntas frecuentes publicadas.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {((faqs ?? []) as Faq[]).map((f) => (
              <details key={f.id} className="rounded-xl border border-border bg-card">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">
                  {f.pregunta}
                </summary>
                <p className="px-4 pb-3 text-sm text-muted-foreground">{f.respuesta}</p>
              </details>
            ))}
          </div>
        )}
        {esAdmin && (
          <details className="rounded-xl border border-border bg-card">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">
              + Nueva pregunta frecuente
            </summary>
            <form action={crearFaq} className="flex flex-col gap-2 px-4 pb-4">
              <input name="pregunta" required placeholder="Pregunta" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
              <textarea name="respuesta" required rows={2} placeholder="Respuesta" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
              <input name="categoria" placeholder="Categoría (opcional)" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
              <button type="submit" className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
                Publicar
              </button>
            </form>
          </details>
        )}
      </section>

      {/* Mis tickets */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <LifeBuoy className="h-4 w-4 text-primary" /> Mis tickets
        </h2>

        <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">
            + Reportar una incidencia
          </summary>
          <form action={crearTicket} className="flex flex-col gap-2 px-4 pb-4">
            <input name="asunto" required placeholder="Asunto" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
            <input name="categoria" placeholder="Categoría (ej. pieza, pago, pedido)" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
            <textarea name="descripcion" rows={3} placeholder="Describe el problema" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
            <button type="submit" className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
              Enviar ticket
            </button>
          </form>
        </details>

        {(misTickets ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No has abierto ningún ticket.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {((misTickets ?? []) as Ticket[]).map((t) => (
              <Link key={t.id} href={`/soporte/tickets/${t.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary">
                <div>
                  <p className="text-sm font-semibold text-foreground">{t.asunto}</p>
                  <p className="text-xs text-muted-foreground">{formatearFechaHora(t.fecha_creacion)}</p>
                </div>
                <EstadoBadge estado={t.estado} config={estadosTicket} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Todos los tickets (admin) */}
      {esAdmin && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-bold text-foreground">Todos los tickets</h2>

          <form className="flex flex-wrap items-center gap-2">
            <select name="estado" defaultValue={estadoFiltro} className={clasesCampo}>
              <option value="">Todos los estados</option>
              {ESTADOS_TICKET.map((e) => (
                <option key={e} value={e}>
                  {estadosTicket[e].etiqueta}
                </option>
              ))}
            </select>
            <select name="categoria" defaultValue={categoriaFiltro} className={clasesCampo}>
              <option value="">Todas las categorías</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select name="asignado_a" defaultValue={asignadoFiltro ?? ''} className={clasesCampo}>
              <option value="">Cualquier asignación</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
            >
              Filtrar
            </button>
          </form>

          {((todosTickets ?? []) as unknown as TicketAdmin[]).length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay tickets para estos filtros.</p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {((todosTickets ?? []) as unknown as TicketAdmin[]).map((t) => (
                  <Link key={t.id} href={`/soporte/tickets/${t.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{t.asunto}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.usuarios?.nombre} · {formatearFechaHora(t.fecha_creacion)}
                        {t.categoria && ` · ${t.categoria}`}
                        {t.asignado && ` · asignado a ${t.asignado.nombre}`}
                      </p>
                    </div>
                    <EstadoBadge estado={t.estado} config={estadosTicket} />
                  </Link>
                ))}
              </div>
              <Paginacion
                paginaActual={pagina}
                totalPaginas={totalPaginas}
                total={totalTickets ?? 0}
                construirHref={construirHref}
              />
            </>
          )}
        </section>
      )}
    </main>
  )
}
