import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, Layers, BadgeCheck, Gift, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { Paginacion } from '@/components/inventario/paginacion'
import { calcularRango, calcularTotalPaginas } from '@/lib/inventario'
import { crearNivel, crearInsignia, crearPremio, crearReconocimiento } from './acciones'

export const metadata = { title: 'Fidelización — ASTRO' }

const TAMANO_PAGINA_RECONOCIMIENTOS = 20

type Nivel = { id: number; nombre: string; umbral_puntos: number; orden: number }
type Insignia = { id: number; nombre: string; descripcion: string | null; criterio: Record<string, unknown> }
type Premio = { id: number; posicion_desde: number; posicion_hasta: number; descripcion: string; periodos: { nombre: string } | null }
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
      supabase.from('niveles').select('id, nombre, umbral_puntos, orden').order('orden'),
      supabase.from('insignias').select('id, nombre, descripcion, criterio').order('nombre'),
      supabase.from('premios').select('id, posicion_desde, posicion_hasta, descripcion, periodos ( nombre )').order('id', { ascending: false }),
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

      {/* Niveles */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <Layers className="h-4 w-4 text-primary" /> Niveles
        </h2>
        <div className="flex flex-wrap gap-2">
          {((niveles ?? []) as Nivel[]).map((n) => (
            <span key={n.id} className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
              {n.nombre} · {n.umbral_puntos} pts
            </span>
          ))}
        </div>
        {esAdmin && (
          <details className="rounded-xl border border-border bg-card">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">
              + Nuevo nivel
            </summary>
            <form action={crearNivel} className="flex flex-wrap items-end gap-3 px-4 pb-4">
              <input
                name="nombre"
                required
                placeholder="Nombre (ej. Oro)"
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <input
                name="umbral_puntos"
                type="number"
                step="0.01"
                required
                placeholder="Umbral de puntos"
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <input
                name="orden"
                type="number"
                placeholder="Orden"
                className="w-24 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
                Crear nivel
              </button>
            </form>
          </details>
        )}
      </section>

      {/* Insignias */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <BadgeCheck className="h-4 w-4 text-primary" /> Insignias
        </h2>
        <div className="flex flex-col gap-2">
          {((insignias ?? []) as Insignia[]).map((i) => (
            <div key={i.id} className="rounded-xl border border-border bg-card p-3">
              <p className="text-sm font-semibold text-foreground">{i.nombre}</p>
              <p className="text-xs text-muted-foreground">{i.descripcion}</p>
            </div>
          ))}
        </div>
        {esAdmin && (
          <details className="rounded-xl border border-border bg-card">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">
              + Nueva insignia
            </summary>
            <form action={crearInsignia} className="flex flex-col gap-3 px-4 pb-4">
              <input
                name="nombre"
                required
                placeholder="Nombre"
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <input
                name="descripcion"
                placeholder="Descripción"
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Criterio automático
                  <select
                    name="criterio_tipo"
                    required
                    defaultValue=""
                    className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="" disabled>
                      Elige
                    </option>
                    <option value="primera_venta">Primera venta</option>
                    <option value="ventas_mes">N ventas en el mes</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Umbral (solo "N ventas")
                  <input
                    name="criterio_umbral"
                    type="number"
                    placeholder="10"
                    className="w-28 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                </label>
              </div>
              <button type="submit" className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
                Crear insignia
              </button>
            </form>
          </details>
        )}
      </section>

      {/* Premios */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <Gift className="h-4 w-4 text-primary" /> Premios por posición
        </h2>
        <div className="flex flex-col gap-2">
          {((premios ?? []) as unknown as Premio[]).map((p) => (
            <div key={p.id} className="rounded-xl border border-border bg-card p-3 text-sm">
              <span className="font-semibold text-foreground">
                {p.periodos?.nombre ?? 'Todos los períodos'} · posiciones {p.posicion_desde}–{p.posicion_hasta}
              </span>
              <p className="text-muted-foreground">{p.descripcion}</p>
            </div>
          ))}
        </div>
        {esAdmin && (
          <details className="rounded-xl border border-border bg-card">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">
              + Nuevo premio
            </summary>
            <form action={crearPremio} className="flex flex-wrap items-end gap-3 px-4 pb-4">
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
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Desde posición
                <input name="posicion_desde" type="number" required defaultValue={1} className="w-24 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Hasta posición
                <input name="posicion_hasta" type="number" required defaultValue={1} className="w-24 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none" />
              </label>
              <input
                name="descripcion"
                required
                placeholder="Descripción del premio"
                className="flex-1 min-w-48 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
                Crear premio
              </button>
            </form>
          </details>
        )}
      </section>

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
