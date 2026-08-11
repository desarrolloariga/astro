import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, ArrowLeft, PlusCircle, Truck, Gem, TriangleAlert, ArrowLeftRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { formatearPrecio, formatearFechaHora, formatearNumero, formatearFechaCorta } from '@/lib/formato'
import { KpiCard } from '@/components/app/kpi-card'
import { AlertaCard } from '@/components/app/alerta-card'
import { GraficoTendencia } from '@/components/inventario/grafico-tendencia'
import { GraficoBarraApilada } from '@/components/inventario/grafico-barra-apilada'
import { Paginacion } from '@/components/inventario/paginacion'
import { calcularRango, calcularTotalPaginas } from '@/lib/inventario'
import type { ChartConfig } from '@/components/ui/chart'
import { crearTransferencia, confirmarRecepcion } from '../acciones'

export const metadata = { title: 'Transferencias — ASTRO' }

const TAMANO_PAGINA_TRANSFERENCIAS = 10
const SEMANAS_HISTORIAL = 8

const nombresEstadoTransferencia: Record<string, string> = {
  en_transito: 'En tránsito',
  recibida: 'Recibida',
  con_incidencia: 'Con incidencia',
}

const ESTADOS_TRANSFERENCIA = ['en_transito', 'recibida', 'con_incidencia']

type Tienda = { id: number; nombre: string; tipo: string }

type PiezaDisponible = {
  id: number
  codigo: string
  nombre: string
  precio_venta: number | null
}

type DetalleTransferencia = {
  id: number
  transferencia_id: number
  producto_id: number
  producto_codigo: string
  producto_nombre: string
  estado_recepcion: string
  comentario_incidencia: string | null
  transferencia_estado: string
  tienda_origen_id: number
  tienda_origen: string | null
  tienda_destino_id: number
  tienda_destino: string | null
  fecha_envio: string
  fecha_recepcion: string | null
  creado_por: number | null
  confirmado_por: number | null
}

type TransferenciaReciente = { id: number; estado: string; fecha_envio: string }

function agruparPorSemana(filas: TransferenciaReciente[], semanas = SEMANAS_HISTORIAL) {
  const ahora = Date.now()
  const buckets = Array.from({ length: semanas }, (_, i) => ({
    inicio: ahora - (semanas - i) * 7 * 86400000,
    valor: 0,
  }))
  for (const f of filas) {
    const t = new Date(f.fecha_envio).getTime()
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (t >= buckets[i].inicio) {
        buckets[i].valor++
        break
      }
    }
  }
  return buckets.map((b) => ({
    semana: formatearFechaCorta(new Date(b.inicio).toISOString()),
    transferencias: b.valor,
  }))
}

export default async function TransferenciasPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; origen?: string; pagina?: string }>
}) {
  if (!(await tienePermiso('inventario', 'ver'))) redirect('/inicio')

  const usuario = await obtenerUsuarioActual()
  const puedeTransferir = await tienePermiso('inventario', 'transferir')
  const { ok, error, origen, pagina: paginaParam } = await searchParams
  const origenId = origen ? Number(origen) : null
  const pagina = Math.max(1, Number(paginaParam ?? '1') || 1)
  const supabase = await createClient()

  const { desde, hasta } = calcularRango(pagina, TAMANO_PAGINA_TRANSFERENCIAS)
  const hace8Semanas = new Date(Date.now() - SEMANAS_HISTORIAL * 7 * 86400000).toISOString()
  const hace30Dias = new Date(Date.now() - 30 * 86400000).toISOString()

  const [
    { data: paginaIdsData, count: totalTransferencias },
    { data: tiendasData },
    { data: piezasOrigenData },
    { count: totalEnTransito },
    { count: totalConIncidencia },
    { data: recientesData },
    { data: incidenciasData },
  ] = await Promise.all([
    supabase
      .from('transferencias')
      .select('id, fecha_envio', { count: 'exact' })
      .order('fecha_envio', { ascending: false })
      .range(desde, hasta),
    puedeTransferir
      ? supabase.from('tiendas').select('id, nombre, tipo').eq('activo', true).order('nombre')
      : Promise.resolve({ data: null }),
    puedeTransferir && origenId
      ? supabase
          .from('vw_inventario_tienda')
          .select('id, codigo, nombre, precio_venta')
          .eq('tienda_id', origenId)
          .in('estado', ['disponible_cedi', 'disponible_tienda'])
          .order('nombre')
      : Promise.resolve({ data: null }),
    supabase.from('transferencias').select('id', { count: 'exact', head: true }).eq('estado', 'en_transito'),
    supabase.from('transferencias').select('id', { count: 'exact', head: true }).eq('estado', 'con_incidencia'),
    supabase.from('transferencias').select('id, estado, fecha_envio').gte('fecha_envio', hace8Semanas),
    supabase
      .from('vw_transferencia_detalles')
      .select('*')
      .eq('estado_recepcion', 'incidencia')
      .order('fecha_envio', { ascending: false })
      .limit(10),
  ])

  const tiendas = (tiendasData ?? []) as Tienda[]
  const piezasOrigen = (piezasOrigenData ?? []) as PiezaDisponible[]
  const recientes = (recientesData ?? []) as TransferenciaReciente[]
  const incidencias = (incidenciasData ?? []) as DetalleTransferencia[]

  const ordenIds = (paginaIdsData ?? []).map((t) => t.id)
  const { data: detallesData } =
    ordenIds.length > 0
      ? await supabase.from('vw_transferencia_detalles').select('*').in('transferencia_id', ordenIds)
      : { data: [] as DetalleTransferencia[] }

  const detalles = (detallesData ?? []) as DetalleTransferencia[]

  // vw_transferencia_detalles solo expone los IDs de autoría — se
  // resuelven los nombres aparte para no tener que extender la vista.
  const idsUsuarios = [...new Set(
    [...detalles, ...incidencias].flatMap((d) => [d.creado_por, d.confirmado_por]).filter((id): id is number => id != null),
  )]
  const nombresUsuarios = new Map<number, string>()
  if (idsUsuarios.length > 0) {
    const { data: usuariosData } = await supabase.from('usuarios').select('id, nombre').in('id', idsUsuarios)
    usuariosData?.forEach((u) => nombresUsuarios.set(u.id, u.nombre))
  }

  const transferenciasMap = new Map<number, DetalleTransferencia[]>()
  for (const d of detalles) {
    const lista = transferenciasMap.get(d.transferencia_id) ?? []
    lista.push(d)
    transferenciasMap.set(d.transferencia_id, lista)
  }
  const transferencias = ordenIds
    .map((id): [number, DetalleTransferencia[]] => [id, transferenciasMap.get(id) ?? []])
    .filter(([, items]) => items.length > 0)

  const totalUltimos30Dias = recientes.filter((t) => t.fecha_envio >= hace30Dias).length
  const seriePorSemana = agruparPorSemana(recientes)
  const conteoPorEstado = ESTADOS_TRANSFERENCIA.reduce<Record<string, number>>((acc, estado) => {
    acc[estado] = recientes.filter((t) => t.estado === estado).length
    return acc
  }, {})

  const totalPaginas = calcularTotalPaginas(totalTransferencias ?? 0, TAMANO_PAGINA_TRANSFERENCIAS)
  const construirHref = (paginaDestino: number) => {
    const params = new URLSearchParams()
    if (origen) params.set('origen', origen)
    if (paginaDestino > 1) params.set('pagina', String(paginaDestino))
    const qs = params.toString()
    return `/inventario/transferencias${qs ? `?${qs}` : ''}`
  }

  const configSemanas: ChartConfig = { transferencias: { label: 'Transferencias', color: 'var(--chart-1)' } }
  const configPorEstado: ChartConfig = ESTADOS_TRANSFERENCIA.reduce((acc, estado, i) => {
    acc[estado] = { label: nombresEstadoTransferencia[estado], color: `var(--chart-${(i % 5) + 1})` }
    return acc
  }, {} as ChartConfig)
  const datosPorEstado: [Record<string, string | number>] = [
    { nombre: 'Transferencias', ...conteoPorEstado },
  ]

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <Link
        href="/inventario"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al inventario
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Transferencias</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Traslados de piezas del CEDI a tienda y entre tiendas.
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

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard icon={Truck} label="En tránsito" value={formatearNumero(totalEnTransito ?? 0)} />
        <KpiCard
          icon={TriangleAlert}
          label="Con incidencia"
          value={formatearNumero(totalConIncidencia ?? 0)}
          positivoEsBueno={false}
        />
        <KpiCard
          icon={ArrowLeftRight}
          label="Últimos 30 días"
          value={formatearNumero(totalUltimos30Dias)}
        />
      </section>

      {incidencias.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Incidencias pendientes
          </h2>
          {incidencias.map((d) => (
            <AlertaCard
              key={d.id}
              icon={TriangleAlert}
              titulo={d.producto_nombre}
              subtitulo={`${d.tienda_origen ?? 'Origen'} → ${d.tienda_destino ?? 'Destino'} · ${d.comentario_incidencia ?? 'Sin detalle'}`}
              valor={formatearFechaCorta(d.fecha_envio)}
            />
          ))}
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-bold text-foreground">Transferencias por semana</h2>
          <GraficoTendencia
            data={seriePorSemana}
            dataKey="transferencias"
            etiquetaEje="semana"
            config={configSemanas}
          />
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-bold text-foreground">Por estado (últimas {SEMANAS_HISTORIAL} semanas)</h2>
          <GraficoBarraApilada data={datosPorEstado} config={configPorEstado} />
        </div>
      </section>

      {puedeTransferir && (
        <details className="rounded-xl border border-border bg-card" open={Boolean(origenId)}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground">
            <PlusCircle className="h-4 w-4 text-primary" />
            Nueva transferencia
          </summary>

          <div className="flex flex-col gap-3 px-4 pb-4">
            <form className="flex flex-wrap items-center gap-2">
              <select
                name="origen"
                defaultValue={origen ?? ''}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="" disabled>
                  Bodega de origen
                </option>
                {tiendas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
              >
                Ver piezas disponibles
              </button>
            </form>

            {origenId && (
              <form action={crearTransferencia} className="flex flex-col gap-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  Origen: <span className="font-semibold text-foreground">{tiendas.find((t) => t.id === origenId)?.nombre}</span>
                </p>

                {piezasOrigen.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Esta bodega no tiene piezas disponibles para transferir.</p>
                ) : (
                  <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto rounded-lg border border-border p-3">
                    {piezasOrigen.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm text-foreground">
                        <input type="checkbox" name="producto_ids" value={p.id} className="h-4 w-4 rounded border-input" />
                        <span className="flex-1">{p.nombre}</span>
                        <span className="text-xs text-muted-foreground">{p.codigo}</span>
                        <span className="font-semibold">
                          {p.precio_venta != null ? formatearPrecio(p.precio_venta) : '—'}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                <select
                  name="tienda_destino_id"
                  required
                  defaultValue=""
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="" disabled>
                    Bodega destino
                  </option>
                  {tiendas
                    .filter((t) => t.id !== origenId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                      </option>
                    ))}
                </select>

                <button
                  type="submit"
                  disabled={piezasOrigen.length === 0}
                  className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  Crear transferencia
                </button>
              </form>
            )}
          </div>
        </details>
      )}

      {transferencias.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Truck className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Sin transferencias registradas</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {transferencias.map(([id, items]) => {
              const primero = items[0]
              const puedeConfirmar =
                usuario.rol === 'admin' ||
                (usuario.rol === 'tienda' && usuario.tienda_id === primero.tienda_destino_id)

              return (
                <div key={id} className="rounded-xl border border-border bg-card">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {primero.tienda_origen ?? 'Origen'} → {primero.tienda_destino ?? 'Destino'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatearFechaHora(primero.fecha_envio)} · {items.length} pieza{items.length > 1 ? 's' : ''}
                        {primero.creado_por && nombresUsuarios.get(primero.creado_por) &&
                          ` · creada por ${nombresUsuarios.get(primero.creado_por)}`}
                      </p>
                    </div>
                    <span
                      className={
                        primero.transferencia_estado === 'recibida'
                          ? 'rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary'
                          : primero.transferencia_estado === 'con_incidencia'
                            ? 'rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive'
                            : 'rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground'
                      }
                    >
                      {nombresEstadoTransferencia[primero.transferencia_estado] ?? primero.transferencia_estado}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2 p-4">
                    {items.map((d) => (
                      <div key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <Gem className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="flex-1 font-medium text-foreground">{d.producto_nombre}</span>
                        <span className="text-xs text-muted-foreground">{d.producto_codigo}</span>

                        {d.estado_recepcion === 'pendiente' ? (
                          puedeConfirmar ? (
                            <div className="flex items-center gap-1.5">
                              <form action={confirmarRecepcion}>
                                <input type="hidden" name="detalle_id" value={d.id} />
                                <input type="hidden" name="accion" value="confirmar" />
                                <button
                                  type="submit"
                                  className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                                >
                                  Confirmar
                                </button>
                              </form>
                              <details className="relative">
                                <summary className="cursor-pointer list-none rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-destructive">
                                  Incidencia
                                </summary>
                                <form
                                  action={confirmarRecepcion}
                                  className="absolute right-0 z-10 mt-1 flex w-56 flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-lg"
                                >
                                  <input type="hidden" name="detalle_id" value={d.id} />
                                  <input type="hidden" name="accion" value="incidencia" />
                                  <textarea
                                    name="comentario"
                                    required
                                    placeholder="Describe la incidencia"
                                    rows={2}
                                    className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                                  />
                                  <button
                                    type="submit"
                                    className="rounded-md bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/20"
                                  >
                                    Registrar incidencia
                                  </button>
                                </form>
                              </details>
                            </div>
                          ) : (
                            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                              Pendiente
                            </span>
                          )
                        ) : d.estado_recepcion === 'confirmado' ? (
                          <span className="flex items-center gap-1.5 text-xs">
                            <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">
                              Recibida
                            </span>
                            {d.confirmado_por && nombresUsuarios.get(d.confirmado_por) && (
                              <span className="text-muted-foreground">
                                por {nombresUsuarios.get(d.confirmado_por)}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span
                            title={d.comentario_incidencia ?? undefined}
                            className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive"
                          >
                            Incidencia
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <Paginacion
            paginaActual={pagina}
            totalPaginas={totalPaginas}
            total={totalTransferencias ?? 0}
            construirHref={construirHref}
          />
        </>
      )}
    </main>
  )
}
