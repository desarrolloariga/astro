import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { Paginacion } from '@/components/inventario/paginacion'
import { calcularRango, calcularTotalPaginas } from '@/lib/inventario'
import { crearReconocimiento } from './acciones'
import { SeccionInsignias, SeccionNiveles, SeccionPremios, type InsigniaAdm, type NivelAdm, type PremioAdm } from './formularios'

export const metadata = { title: 'Fidelización — ASTRO' }

const TAMANO_PAGINA_RECONOCIMIENTOS = 20

type Reconocimiento = { id: number; titulo: string; descripcion: string | null; usuarios: { nombre: string } | null; periodos: { nombre: string } | null }
type Periodo = { id: number; nombre: string }
type UsuarioSimple = { id: number; nombre: string }

export default async function AdminFidelizacionPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; pagina?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (!['admin', 'coordinador'].includes(usuario.rol)) redirect('/inicio')

  const { ok, error, pagina: paginaParam } = await searchParams
  const pagina = Math.max(1, Number(paginaParam ?? '1') || 1)
  const supabase = await createClient()
  const { desde, hasta } = calcularRango(pagina, TAMANO_PAGINA_RECONOCIMIENTOS)

  const [{ data: niveles }, { data: insignias }, { data: premios }, { data: reconocimientos, count: totalReconocimientos }, { data: periodos }, { data: usuarios }] =
    await Promise.all([
      supabase.from('niveles').select('id, nombre, umbral_puntos, orden, color, icono, beneficios, activo').order('umbral_puntos'),
      supabase.from('insignias').select('id, nombre, descripcion, criterio, icono, color, recompensa, orden, activo').order('orden').order('id'),
      supabase.from('premios').select('id, periodo_id, titulo, tipo, posicion_desde, posicion_hasta, minimo_puntos, descripcion, icono, activo, periodos ( nombre )').order('tipo').order('posicion_desde'),
      supabase
        .from('reconocimientos')
        .select('id, titulo, descripcion, usuarios ( nombre ), periodos ( nombre )', { count: 'exact' })
        .order('fecha_creacion', { ascending: false })
        .range(desde, hasta),
      supabase.from('periodos').select('id, nombre').order('fecha_inicio', { ascending: false }).limit(12),
      supabase.from('usuarios').select('id, nombre').eq('activo', true).order('nombre').limit(300),
    ])

  const esAdmin = usuario.rol === 'admin'
  const totalPaginasReconocimientos = calcularTotalPaginas(totalReconocimientos ?? 0, TAMANO_PAGINA_RECONOCIMIENTOS)
  const construirHrefReconocimientos = (paginaDestino: number) =>
    `/admin/fidelizacion${paginaDestino > 1 ? `?pagina=${paginaDestino}` : ''}#reconocimientos`

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Fidelización</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Niveles, insignias, premios y reconocimientos del programa de la red comercial.
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

      <SeccionNiveles niveles={(niveles ?? []) as NivelAdm[]} esAdmin={esAdmin} />
      <SeccionInsignias insignias={(insignias ?? []) as InsigniaAdm[]} esAdmin={esAdmin} />
      <SeccionPremios premios={(premios ?? []) as unknown as PremioAdm[]} periodos={(periodos ?? []) as Periodo[]} esAdmin={esAdmin} />

      {/* Reconocimientos */}
      <section id="reconocimientos" className="flex scroll-mt-6 flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <Star className="h-4 w-4 text-primary" /> Reconocimientos
        </h2>
        <div className="flex flex-col gap-2">
          {((reconocimientos ?? []) as unknown as Reconocimiento[]).map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-3 text-sm">
              <span className="font-semibold text-foreground">{r.titulo}</span>{' '}
              <span className="text-muted-foreground">
                — {r.usuarios?.nombre} ({r.periodos?.nombre})
              </span>
              {r.descripcion && <p className="text-muted-foreground">{r.descripcion}</p>}
            </div>
          ))}
        </div>
        <Paginacion
          paginaActual={pagina}
          totalPaginas={totalPaginasReconocimientos}
          total={totalReconocimientos ?? 0}
          construirHref={construirHrefReconocimientos}
        />
        <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">
            + Publicar reconocimiento
          </summary>
          <form action={crearReconocimiento} className="flex flex-col gap-3 px-4 pb-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Período
                <select
                  name="periodo_id"
                  required
                  defaultValue=""
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="" disabled>
                    Elige
                  </option>
                  {((periodos ?? []) as Periodo[]).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-1 min-w-48 flex-col gap-1 text-xs text-muted-foreground">
                Persona
                <select
                  name="usuario_id"
                  required
                  defaultValue=""
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="" disabled>
                    Elige
                  </option>
                  {((usuarios ?? []) as UsuarioSimple[]).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <input
              name="titulo"
              required
              placeholder="Título (ej. Destacado del mes)"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <input
              name="descripcion"
              placeholder="Descripción (opcional)"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <button type="submit" className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
              Publicar
            </button>
          </form>
        </details>
      </section>
    </main>
  )
}
