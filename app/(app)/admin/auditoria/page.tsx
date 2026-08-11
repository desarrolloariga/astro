import { redirect } from 'next/navigation'
import { ScrollText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { formatearFechaHora } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { Paginacion } from '@/components/inventario/paginacion'
import { calcularRango, calcularTotalPaginas } from '@/lib/inventario'

export const metadata = { title: 'Auditoría — ASTRO' }

const TAMANO_PAGINA_AUDITORIA = 30

const ACCIONES = ['crear', 'actualizar', 'eliminar'] as const

type Entrada = {
  id: number
  tabla: string
  registro_id: number | null
  accion: string
  valor_anterior: Record<string, unknown> | null
  valor_nuevo: Record<string, unknown> | null
  fecha_creacion: string
  usuarios: { nombre: string } | null
}

const clasesAccion: Record<string, string> = {
  crear: 'bg-primary/10 text-primary',
  actualizar: 'bg-accent text-accent-foreground',
  eliminar: 'bg-destructive/10 text-destructive',
}

const clasesCampo =
  'rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25'

export default async function AdminAuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{
    tabla?: string
    accion?: string
    usuario_id?: string
    desde?: string
    hasta?: string
    pagina?: string
  }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'admin') redirect('/inicio')

  const sp = await searchParams
  const tabla = (sp.tabla ?? '').trim()
  const accion = (sp.accion ?? '').trim()
  const usuarioId = sp.usuario_id ? Number(sp.usuario_id) : null
  const desde = (sp.desde ?? '').trim()
  const hasta = (sp.hasta ?? '').trim()
  const pagina = Math.max(1, Number(sp.pagina ?? '1') || 1)
  const supabase = await createClient()

  let consulta = supabase
    .from('auditoria')
    .select('id, tabla, registro_id, accion, valor_anterior, valor_nuevo, fecha_creacion, usuarios ( nombre )', {
      count: 'exact',
    })
    .order('fecha_creacion', { ascending: false })

  if (tabla) consulta = consulta.eq('tabla', tabla)
  if (accion && (ACCIONES as readonly string[]).includes(accion)) consulta = consulta.eq('accion', accion)
  if (usuarioId) consulta = consulta.eq('usuario_id', usuarioId)
  if (desde) consulta = consulta.gte('fecha_creacion', desde)
  if (hasta) consulta = consulta.lt('fecha_creacion', `${hasta}T23:59:59.999`)

  const { desde: rangoDesde, hasta: rangoHasta } = calcularRango(pagina, TAMANO_PAGINA_AUDITORIA)
  consulta = consulta.range(rangoDesde, rangoHasta)

  const [{ data: entradas, count: total }, { data: tablasData }, { data: usuariosData }] = await Promise.all([
    consulta,
    supabase.from('auditoria').select('tabla').order('tabla'),
    supabase.from('usuarios').select('id, nombre').eq('activo', true).order('nombre'),
  ])

  const lista = (entradas ?? []) as unknown as Entrada[]
  const tablas = Array.from(new Set((tablasData ?? []).map((t) => t.tabla)))
  const usuarios = usuariosData ?? []
  const totalPaginas = calcularTotalPaginas(total ?? 0, TAMANO_PAGINA_AUDITORIA)

  const construirHref = (paginaDestino: number) => {
    const params = new URLSearchParams()
    if (tabla) params.set('tabla', tabla)
    if (accion) params.set('accion', accion)
    if (usuarioId) params.set('usuario_id', String(usuarioId))
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    if (paginaDestino > 1) params.set('pagina', String(paginaDestino))
    const qs = params.toString()
    return `/admin/auditoria${qs ? `?${qs}` : ''}`
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Auditoría</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bitácora de quién cambió qué, cuándo y con qué valor anterior/nuevo.
        </p>
      </div>

      <form className="flex flex-wrap items-center gap-2">
        <select name="tabla" defaultValue={tabla} className={clasesCampo}>
          <option value="">Todas las tablas</option>
          {tablas.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select name="accion" defaultValue={accion} className={clasesCampo}>
          <option value="">Todas las acciones</option>
          {ACCIONES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select name="usuario_id" defaultValue={usuarioId ?? ''} className={clasesCampo}>
          <option value="">Todos los usuarios</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>
        <input type="date" name="desde" defaultValue={desde} className={clasesCampo} />
        <input type="date" name="hasta" defaultValue={hasta} className={clasesCampo} />
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          Filtrar
        </button>
      </form>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <ScrollText className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Sin registros de auditoría para estos filtros</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {lista.map((e) => (
              <details key={e.id} className="rounded-xl border border-border bg-card">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        clasesAccion[e.accion] ?? 'bg-muted text-muted-foreground',
                      )}
                    >
                      {e.accion}
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      {e.tabla}
                      {e.registro_id != null && ` #${e.registro_id}`}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {e.usuarios?.nombre ?? 'Sistema'} · {formatearFechaHora(e.fecha_creacion)}
                  </span>
                </summary>
                <div className="grid grid-cols-1 gap-3 border-t border-border px-4 py-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Antes</p>
                    <pre className="overflow-x-auto rounded-lg bg-secondary p-2 text-[11px] text-secondary-foreground">
                      {e.valor_anterior ? JSON.stringify(e.valor_anterior, null, 2) : '—'}
                    </pre>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Después</p>
                    <pre className="overflow-x-auto rounded-lg bg-secondary p-2 text-[11px] text-secondary-foreground">
                      {e.valor_nuevo ? JSON.stringify(e.valor_nuevo, null, 2) : '—'}
                    </pre>
                  </div>
                </div>
              </details>
            ))}
          </div>
          <Paginacion paginaActual={pagina} totalPaginas={totalPaginas} total={total ?? 0} construirHref={construirHref} />
        </>
      )}
    </main>
  )
}
