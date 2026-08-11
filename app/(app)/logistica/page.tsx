import { redirect } from 'next/navigation'
import {
  AlertCircle,
  CheckCircle2,
  PackageSearch,
  Send,
  TrendingUp,
  TriangleAlert,
  Clock,
  ClipboardList,
  Gauge,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { tienePermiso } from '@/lib/permisos'
import { formatearNumero, formatearFechaHora } from '@/lib/formato'
import { EstadoBadge, estadosSolicitudReposicion } from '@/components/app/estado-badge'
import { KpiCard } from '@/components/app/kpi-card'
import { AlertaCard } from '@/components/app/alerta-card'
import { GraficoBarras } from '@/components/inventario/grafico-barras'
import { Paginacion } from '@/components/inventario/paginacion'
import {
  parsearFiltrosSolicitudes,
  construirQueryStringSolicitudes,
  calcularRangoSolicitudes,
  calcularTotalPaginasSolicitudes,
} from '@/lib/logistica'
import type { ChartConfig } from '@/components/ui/chart'
import { crearSolicitud, resolverSolicitud } from './acciones'

export const metadata = { title: 'Logística — ASTRO' }

const clasesCampo =
  'rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none'

const ESTADOS_SOLICITUD = ['pendiente', 'en_proceso', 'atendida', 'rechazada']

type Categoria = { id: number; nombre: string }
type Material = { id: number; nombre: string }

type Solicitud = {
  id: number
  solicitante_id: number
  categoria_id: number | null
  material_id: number | null
  descripcion: string | null
  cantidad_sugerida: number | null
  estado: string
  comentario_resolucion: string | null
  fecha_creacion: string
  categoria: { nombre: string } | null
  material: { nombre: string } | null
  solicitante: { nombre: string } | null
}

type Alerta = {
  categoria_id: number
  categoria: string
  material_id: number
  material: string
  piezas_disponibles: number
}

type Rotacion = {
  categoria_id: number
  categoria: string
  material_id: number
  material: string
  piezas_vendidas: number
  dias_promedio_venta: number | null
}

type PiezaLenta = {
  id: number
  codigo: string
  nombre: string
  categoria: string | null
  material: string | null
  tienda: string | null
  precio_venta: number | null
  dias_sin_movimiento: number
}

export default async function LogisticaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const usuario = await obtenerUsuarioActual()
  const puedeSolicitar = await tienePermiso('logistica', 'solicitar')
  const puedeGestionar = await tienePermiso('logistica', 'gestionar')
  if (!puedeSolicitar && !puedeGestionar) redirect('/inicio')

  const sp = await searchParams
  const ok = typeof sp.ok === 'string' ? sp.ok : undefined
  const error = typeof sp.error === 'string' ? sp.error : undefined
  const filtros = parsearFiltrosSolicitudes(sp)
  const supabase = await createClient()

  const [{ data: categoriasData }, { data: materialesData }, { data: umbralData }] = await Promise.all([
    supabase.from('categorias').select('id, nombre').eq('activo', true).order('orden'),
    supabase.from('materiales').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('parametros').select('valor').eq('clave', 'umbral_quiebre_stock').maybeSingle(),
  ])
  const categorias = (categoriasData ?? []) as Categoria[]
  const materiales = (materialesData ?? []) as Material[]
  const umbralQuiebre = Number(umbralData?.valor ?? 0)

  const { desde, hasta } = calcularRangoSolicitudes(filtros.pagina)

  let consultaSolicitudes = supabase
    .from('solicitudes_reposicion')
    .select(
      'id, solicitante_id, categoria_id, material_id, descripcion, cantidad_sugerida, estado, comentario_resolucion, fecha_creacion, categoria:categorias(nombre), material:materiales(nombre), solicitante:usuarios!solicitudes_reposicion_solicitante_id_fkey(nombre)',
      { count: 'exact' },
    )
    .order('fecha_creacion', { ascending: false })
    .range(desde, hasta)
  if (!puedeGestionar) consultaSolicitudes = consultaSolicitudes.eq('solicitante_id', usuario.id)
  if (filtros.estado) consultaSolicitudes = consultaSolicitudes.eq('estado', filtros.estado)

  let consultaPendientes = supabase
    .from('solicitudes_reposicion')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'pendiente')
  if (!puedeGestionar) consultaPendientes = consultaPendientes.eq('solicitante_id', usuario.id)

  const [
    { data: solicitudesData, count: totalSolicitudes },
    { count: totalPendientes },
    { data: alertasData },
    { data: rotacionData },
    { data: lentasData },
    { count: totalLentas },
  ] = await Promise.all([
    consultaSolicitudes,
    consultaPendientes,
    puedeGestionar
      ? supabase.from('vw_alertas_quiebre_stock').select('*').order('piezas_disponibles')
      : Promise.resolve({ data: null }),
    puedeGestionar
      ? supabase.from('vw_rotacion_producto').select('*').order('dias_promedio_venta')
      : Promise.resolve({ data: null }),
    puedeGestionar
      ? supabase
          .from('vw_piezas_lentas')
          .select('id, codigo, nombre, categoria, material, tienda, precio_venta, dias_sin_movimiento')
          .order('dias_sin_movimiento', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: null }),
    puedeGestionar
      ? supabase.from('vw_piezas_lentas').select('id', { count: 'exact', head: true })
      : Promise.resolve({ count: null }),
  ])

  const solicitudes = (solicitudesData ?? []) as unknown as Solicitud[]
  const alertas = (alertasData ?? []) as Alerta[]
  const rotacion = (rotacionData ?? []) as Rotacion[]
  const piezasLentas = (lentasData ?? []) as PiezaLenta[]

  const rotacionValida = rotacion.filter((r) => r.dias_promedio_venta != null)
  const rotacionPromedio =
    rotacionValida.length > 0
      ? rotacionValida.reduce((acc, r) => acc + Number(r.dias_promedio_venta), 0) / rotacionValida.length
      : null

  const lentasPorBodega = new Map<string, number>()
  for (const p of piezasLentas) {
    const clave = p.tienda ?? 'Sin asignar'
    lentasPorBodega.set(clave, (lentasPorBodega.get(clave) ?? 0) + 1)
  }
  const datosLentasPorBodega = Array.from(lentasPorBodega.entries()).map(([etiqueta, valor]) => ({
    etiqueta,
    valor,
  }))

  const totalPaginas = calcularTotalPaginasSolicitudes(totalSolicitudes ?? 0)
  const construirHref = (pagina: number) =>
    `/logistica?${construirQueryStringSolicitudes(filtros, { pagina })}`

  const configRotacion: ChartConfig = { valor: { label: 'Días promedio', color: 'var(--chart-1)' } }
  const configAlertas: ChartConfig = { valor: { label: 'Piezas disponibles', color: 'var(--destructive)' } }
  const configLentasBodega: ChartConfig = { valor: { label: 'Piezas lentas', color: 'var(--chart-1)' } }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Logística</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {puedeGestionar
            ? 'Solicitudes de reposición, alertas de quiebre y rotación de inventario.'
            : 'Solicita reposición de piezas agotadas a producción.'}
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

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={ClipboardList}
          label="Solicitudes pendientes"
          value={formatearNumero(totalPendientes ?? 0)}
          positivoEsBueno={false}
        />
        {puedeGestionar && (
          <>
            <KpiCard
              icon={TriangleAlert}
              label="Combinaciones en alerta"
              value={formatearNumero(alertas.length)}
              positivoEsBueno={false}
            />
            <KpiCard
              icon={Clock}
              label="Piezas de lento movimiento"
              value={formatearNumero(totalLentas ?? 0)}
              positivoEsBueno={false}
            />
            <KpiCard
              icon={Gauge}
              label="Rotación promedio"
              value={rotacionPromedio != null ? `${rotacionPromedio.toFixed(1)} días` : '—'}
            />
          </>
        )}
      </section>

      {puedeSolicitar && (
        <details className="rounded-xl border border-border bg-card" open={!puedeGestionar}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground">
            <Send className="h-4 w-4 text-primary" />
            Nueva solicitud de reposición
          </summary>
          <form action={crearSolicitud} className="flex flex-col gap-3 px-4 pb-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <select name="categoria_id" defaultValue="" className={clasesCampo}>
                <option value="">Categoría (opcional)</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <select name="material_id" defaultValue="" className={clasesCampo}>
                <option value="">Material (opcional)</option>
                {materiales.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              name="descripcion"
              rows={2}
              placeholder="Describe lo que hace falta…"
              className={clasesCampo}
            />
            <input
              name="cantidad_sugerida"
              type="number"
              min="1"
              placeholder="Cantidad sugerida (opcional)"
              className={clasesCampo}
            />
            <button
              type="submit"
              className="mt-1 w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
            >
              Enviar solicitud
            </button>
          </form>
        </details>
      )}

      {puedeGestionar && alertas.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <TriangleAlert className="h-4 w-4 text-destructive" />
            Alertas de quiebre de stock
          </h2>
          <div className="flex flex-col gap-2">
            {alertas.map((a) => (
              <AlertaCard
                key={`${a.categoria_id}-${a.material_id}`}
                icon={TriangleAlert}
                titulo={`${a.categoria} · ${a.material}`}
                subtitulo={`Mínimo esperado: ${formatearNumero(umbralQuiebre)}`}
                valor={`${formatearNumero(a.piezas_disponibles)} disponibles`}
              />
            ))}
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <GraficoBarras
              data={alertas.map((a) => ({ etiqueta: `${a.categoria} · ${a.material}`, valor: a.piezas_disponibles }))}
              config={configAlertas}
              color="var(--destructive)"
              referencia={{ valor: umbralQuiebre, etiqueta: `Mínimo: ${umbralQuiebre}` }}
              alto={Math.max(120, alertas.length * 40)}
            />
          </div>
        </section>
      )}

      {puedeGestionar && rotacion.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
            <TrendingUp className="h-4 w-4 text-primary" />
            Rotación de producto — más lentas primero
          </h2>
          <GraficoBarras
            data={[...rotacion]
              .sort((a, b) => (b.dias_promedio_venta ?? 0) - (a.dias_promedio_venta ?? 0))
              .slice(0, 15)
              .map((r) => ({ etiqueta: `${r.categoria} · ${r.material}`, valor: r.dias_promedio_venta ?? 0 }))}
            config={configRotacion}
            sufijo=" días"
            alto={Math.max(120, Math.min(rotacion.length, 15) * 32)}
          />
          {rotacion.length > 15 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Mostrando las 15 combinaciones más lentas de {rotacion.length}.
            </p>
          )}
        </section>
      )}

      {puedeGestionar && piezasLentas.length > 0 && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Piezas de lento movimiento (top 20)
            </h2>
            <div className="flex flex-col gap-2">
              {piezasLentas.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {[p.categoria, p.material, p.tienda].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                    {p.dias_sin_movimiento} días sin movimiento
                  </span>
                </div>
              ))}
            </div>
            {(totalLentas ?? 0) > piezasLentas.length && (
              <p className="mt-2 text-xs text-muted-foreground">
                Mostrando 20 de {formatearNumero(totalLentas ?? 0)} en total.
              </p>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 text-sm font-bold text-foreground">Lento movimiento por bodega (top 20)</h2>
            <GraficoBarras
              data={datosLentasPorBodega}
              config={configLentasBodega}
              alto={Math.max(120, datosLentasPorBodega.length * 40)}
            />
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            {puedeGestionar ? 'Todas las solicitudes' : 'Mis solicitudes'}
          </h2>
          <form className="flex items-center gap-2">
            <select name="estado" defaultValue={filtros.estado} className={clasesCampo}>
              <option value="">Todos los estados</option>
              {ESTADOS_SOLICITUD.map((e) => (
                <option key={e} value={e}>
                  {estadosSolicitudReposicion[e]?.etiqueta ?? e}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              Filtrar
            </button>
          </form>
        </div>
        {solicitudes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <PackageSearch className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
            <p className="text-sm font-semibold text-foreground">Sin solicitudes por ahora</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {solicitudes.map((s) => (
                <div key={s.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {[s.categoria?.nombre, s.material?.nombre].filter(Boolean).join(' · ') || 'Sin categoría/material'}
                      </p>
                      {s.descripcion && <p className="mt-0.5 text-xs text-muted-foreground">{s.descripcion}</p>}
                      {s.cantidad_sugerida != null && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Cantidad sugerida: {formatearNumero(s.cantidad_sugerida)}
                        </p>
                      )}
                      {puedeGestionar && s.solicitante?.nombre && (
                        <p className="mt-0.5 text-xs text-muted-foreground">Solicitado por {s.solicitante.nombre}</p>
                      )}
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatearFechaHora(s.fecha_creacion)}</p>
                      {s.comentario_resolucion && (
                        <p className="mt-1 text-xs italic text-muted-foreground">“{s.comentario_resolucion}”</p>
                      )}
                    </div>
                    <EstadoBadge estado={s.estado} config={estadosSolicitudReposicion} />
                  </div>

                  {puedeGestionar && s.estado === 'pendiente' && (
                    <form action={resolverSolicitud} className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                      <input type="hidden" name="solicitud_id" value={s.id} />
                      <select name="estado" required defaultValue="" className={clasesCampo}>
                        <option value="" disabled>
                          Resolver como…
                        </option>
                        <option value="en_proceso">En proceso</option>
                        <option value="atendida">Atendida</option>
                        <option value="rechazada">Rechazada</option>
                      </select>
                      <input
                        name="comentario"
                        placeholder="Comentario (opcional)"
                        className={`${clasesCampo} min-w-0 flex-1`}
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
                      >
                        Guardar
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
            <Paginacion
              paginaActual={filtros.pagina}
              totalPaginas={totalPaginas}
              total={totalSolicitudes ?? 0}
              construirHref={construirHref}
            />
          </>
        )}
      </section>
    </main>
  )
}
