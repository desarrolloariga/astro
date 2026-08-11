import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Boxes, Gem, Coins, TrendingDown, ArrowLeftRight, Tag, X, Percent } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { formatearPrecio, formatearNumero, formatearFecha, formatearFechaCorta } from '@/lib/formato'
import { EstadoPieza } from '@/components/app/estado-pieza'
import { KpiCard } from '@/components/app/kpi-card'
import { GraficoTendencia } from '@/components/inventario/grafico-tendencia'
import { GraficoBarras } from '@/components/inventario/grafico-barras'
import { GraficoBarraApilada } from '@/components/inventario/grafico-barra-apilada'
import { Paginacion } from '@/components/inventario/paginacion'
import {
  parsearFiltrosInventario,
  construirQueryStringInventario,
  calcularRango,
  calcularTotalPaginas,
  calcularDelta,
} from '@/lib/inventario'
import type { ChartConfig } from '@/components/ui/chart'
import { marcarDescuento, quitarDescuento } from './acciones'

export const metadata = { title: 'Inventario — ASTRO' }

const ESTADOS_INVENTARIO = ['disponible_cedi', 'en_transito', 'disponible_tienda', 'separada']

const ETIQUETAS_ESTADO: Record<string, string> = {
  disponible_cedi: 'Disponible CEDI',
  en_transito: 'En tránsito',
  disponible_tienda: 'Disponible en tienda',
  separada: 'Separada',
}

const clasesCampo =
  'rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'

type Pieza = {
  id: number
  codigo: string
  nombre: string
  categoria: string | null
  material: string | null
  kilataje: string | null
  peso_gramos: number | null
  estado: string
  precio_venta: number | null
  precio_lista: number | null
  en_descuento: boolean
  costo_produccion?: number | null
  tienda_id: number | null
  tienda: string | null
  tienda_tipo: string | null
  fecha_actualizacion: string | null
  modo_inventario: 'pieza_unica' | 'por_cantidad'
  cantidad_disponible: number | null
}

type Tienda = { id: number; nombre: string; tipo: string }
type Categoria = { id: number; nombre: string }
type Material = { id: number; nombre: string }

type ValorTienda = {
  tienda_id: number | null
  tienda: string | null
  piezas: number
  capital_inmovilizado: number
  valor_venta_potencial: number
  piezas_sin_movimiento_60d: number
}

type HistoricoDia = {
  fecha: string
  piezas: number
  capital_inmovilizado: number
  valor_venta_potencial: number
  piezas_sin_movimiento: number
  piezas_en_descuento: number
}

function agruparHistoricoPorFecha(filas: HistoricoDia[]): HistoricoDia[] {
  const mapa = new Map<string, HistoricoDia>()
  for (const f of filas) {
    const actual = mapa.get(f.fecha) ?? {
      fecha: f.fecha,
      piezas: 0,
      capital_inmovilizado: 0,
      valor_venta_potencial: 0,
      piezas_sin_movimiento: 0,
      piezas_en_descuento: 0,
    }
    actual.piezas += f.piezas
    actual.capital_inmovilizado += Number(f.capital_inmovilizado)
    actual.valor_venta_potencial += Number(f.valor_venta_potencial)
    actual.piezas_sin_movimiento += f.piezas_sin_movimiento
    actual.piezas_en_descuento += f.piezas_en_descuento
    mapa.set(f.fecha, actual)
  }
  return Array.from(mapa.values()).sort((a, b) => a.fecha.localeCompare(b.fecha))
}

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!(await tienePermiso('inventario', 'ver'))) redirect('/inicio')

  const usuario = await obtenerUsuarioActual()
  const verFinanzas = await tienePermiso('finanzas', 'ver')
  const puedeDescontar = await tienePermiso('inventario', 'marcar_descuento')
  const sp = await searchParams
  const filtros = parsearFiltrosInventario(sp)
  const supabase = await createClient()

  const tiendaFiltro = usuario.rol === 'tienda' ? usuario.tienda_id : filtros.tiendaId

  const [{ data: categoriasData }, { data: materialesData }] = await Promise.all([
    supabase.from('categorias').select('id, nombre').eq('activo', true).order('orden'),
    supabase.from('materiales').select('id, nombre').eq('activo', true).order('nombre'),
  ])
  const categorias = (categoriasData ?? []) as Categoria[]
  const materiales = (materialesData ?? []) as Material[]

  // Tabla: consulta paginada respetando todos los filtros activos.
  let consultaPiezas = supabase
    .from('vw_inventario_tienda')
    .select(
      'id, codigo, nombre, categoria, material, kilataje, peso_gramos, estado, precio_venta, precio_lista, en_descuento, costo_produccion, tienda_id, tienda, tienda_tipo, fecha_actualizacion, modo_inventario, cantidad_disponible',
      { count: 'exact' },
    )
    .order('tienda', { ascending: true })
    .order('nombre', { ascending: true })

  if (tiendaFiltro) consultaPiezas = consultaPiezas.eq('tienda_id', tiendaFiltro)
  if (filtros.estado && ESTADOS_INVENTARIO.includes(filtros.estado)) {
    consultaPiezas = consultaPiezas.eq('estado', filtros.estado)
  } else {
    consultaPiezas = consultaPiezas.in('estado', ESTADOS_INVENTARIO)
  }
  if (filtros.categoriaId != null) consultaPiezas = consultaPiezas.eq('categoria_id', filtros.categoriaId)
  if (filtros.materialId != null) consultaPiezas = consultaPiezas.eq('material_id', filtros.materialId)
  const buscarSeguro = filtros.buscar.replace(/[,()]/g, ' ').trim()
  if (buscarSeguro) {
    consultaPiezas = consultaPiezas.or(`nombre.ilike.%${buscarSeguro}%,codigo.ilike.%${buscarSeguro}%`)
  }
  const { desde, hasta } = calcularRango(filtros.pagina)
  consultaPiezas = consultaPiezas.range(desde, hasta)

  let consultaTiendas = supabase.from('tiendas').select('id, nombre, tipo').eq('activo', true).order('nombre')
  if (usuario.rol === 'tienda' && usuario.tienda_id) {
    consultaTiendas = consultaTiendas.eq('id', usuario.tienda_id)
  }

  // KPIs/gráficas — siempre acotados solo por bodega (nunca por los
  // filtros de texto/categoría/material de la tabla, para que buscar
  // una pieza no altere los números del panorama general).
  let consultaDescuento = supabase
    .from('vw_inventario_tienda')
    .select('id', { count: 'exact', head: true })
    .eq('en_descuento', true)
  if (tiendaFiltro) consultaDescuento = consultaDescuento.eq('tienda_id', tiendaFiltro)

  const consultasEstado = ESTADOS_INVENTARIO.map((estado) => {
    let q = supabase.from('vw_inventario_tienda').select('id', { count: 'exact', head: true }).eq('estado', estado)
    if (tiendaFiltro) q = q.eq('tienda_id', tiendaFiltro)
    return q
  })

  const hace30Dias = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  let consultaHistorico = supabase
    .from('inventario_historico_diario')
    .select('fecha, piezas, capital_inmovilizado, valor_venta_potencial, piezas_sin_movimiento, piezas_en_descuento')
    .gte('fecha', hace30Dias)
    .order('fecha', { ascending: true })
  if (tiendaFiltro) consultaHistorico = consultaHistorico.eq('tienda_id', tiendaFiltro)

  const [
    { data: piezasData, count: totalPiezas },
    { data: tiendasData },
    { data: valorData },
    { count: totalDescuento },
    conteosEstado,
    { data: historicoData },
  ] = await Promise.all([
    consultaPiezas,
    consultaTiendas,
    verFinanzas ? supabase.from('vw_inventario_valorizado').select('*') : Promise.resolve({ data: null }),
    verFinanzas ? consultaDescuento : Promise.resolve({ count: null }),
    Promise.all(consultasEstado),
    verFinanzas ? consultaHistorico : Promise.resolve({ data: null }),
  ])

  const piezas = (piezasData ?? []) as Pieza[]
  const tiendas = (tiendasData ?? []) as Tienda[]
  const valorPorTienda = (valorData ?? []) as ValorTienda[]
  const valorFiltrado = tiendaFiltro
    ? valorPorTienda.filter((v) => v.tienda_id === tiendaFiltro)
    : valorPorTienda

  const totales = valorFiltrado.reduce(
    (acc, v) => ({
      piezas: acc.piezas + v.piezas,
      capital: acc.capital + Number(v.capital_inmovilizado),
      valorVenta: acc.valorVenta + Number(v.valor_venta_potencial),
      sinMovimiento: acc.sinMovimiento + v.piezas_sin_movimiento_60d,
    }),
    { piezas: 0, capital: 0, valorVenta: 0, sinMovimiento: 0 },
  )

  const serieHistorico = agruparHistoricoPorFecha((historicoData ?? []) as HistoricoDia[])
  const ultimoSnapshot = serieHistorico.at(-1) ?? null

  const deltaPiezas = calcularDelta(totales.piezas, ultimoSnapshot?.piezas ?? null)
  const deltaCapital = calcularDelta(totales.capital, ultimoSnapshot?.capital_inmovilizado ?? null)
  const deltaValorVenta = calcularDelta(totales.valorVenta, ultimoSnapshot?.valor_venta_potencial ?? null)
  const deltaSinMovimiento = calcularDelta(totales.sinMovimiento, ultimoSnapshot?.piezas_sin_movimiento ?? null)
  const deltaDescuento = calcularDelta(totalDescuento ?? 0, ultimoSnapshot?.piezas_en_descuento ?? null)

  const totalPaginas = calcularTotalPaginas(totalPiezas ?? 0)
  const construirHref = (pagina: number) =>
    `/inventario?${construirQueryStringInventario(filtros, { pagina })}`

  const configPiezas: ChartConfig = { piezas: { label: 'Piezas', color: 'var(--chart-1)' } }
  const configCapital: ChartConfig = {
    capital_inmovilizado: { label: 'Capital inmovilizado', color: 'var(--chart-1)' },
  }
  const configPorBodega: ChartConfig = { valor: { label: 'Piezas', color: 'var(--chart-1)' } }
  const configPorEstado: ChartConfig = ESTADOS_INVENTARIO.reduce((acc, estado, i) => {
    acc[estado] = { label: ETIQUETAS_ESTADO[estado], color: `var(--chart-${(i % 5) + 1})` }
    return acc
  }, {} as ChartConfig)

  const datosPorEstado: [Record<string, string | number>] = [
    {
      nombre: 'Piezas',
      ...Object.fromEntries(
        ESTADOS_INVENTARIO.map((estado, i) => [estado, conteosEstado[i]?.count ?? 0]),
      ),
    },
  ]

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Inventario</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {usuario.rol === 'tienda'
              ? `Piezas en ${tiendas[0]?.nombre ?? 'tu bodega'}.`
              : 'Piezas por bodega, valoración y costo en toda la red.'}
          </p>
        </div>
        <Link
          href="/inventario/transferencias"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
        >
          <ArrowLeftRight className="h-4 w-4" />
          Transferencias
        </Link>
      </div>

      <form className="flex flex-wrap items-center gap-2">
        <input
          name="buscar"
          defaultValue={filtros.buscar}
          placeholder="Buscar por nombre o código…"
          className={`${clasesCampo} min-w-48 flex-1`}
        />
        <select name="categoria_id" defaultValue={filtros.categoriaId ?? ''} className={clasesCampo}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <select name="material_id" defaultValue={filtros.materialId ?? ''} className={clasesCampo}>
          <option value="">Todos los materiales</option>
          {materiales.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
        <select name="estado" defaultValue={filtros.estado} className={clasesCampo}>
          <option value="">Todos los estados</option>
          {ESTADOS_INVENTARIO.map((e) => (
            <option key={e} value={e}>
              {ETIQUETAS_ESTADO[e]}
            </option>
          ))}
        </select>
        {usuario.rol !== 'tienda' && (
          <select name="tienda_id" defaultValue={filtros.tiendaId ?? ''} className={clasesCampo}>
            <option value="">Todas las bodegas</option>
            {tiendas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        )}
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          Filtrar
        </button>
      </form>

      {verFinanzas && (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <KpiCard icon={Gem} label="Piezas" value={formatearNumero(totales.piezas)} delta={deltaPiezas} />
            <KpiCard
              icon={Coins}
              label="Capital inmovilizado"
              value={formatearPrecio(totales.capital)}
              delta={deltaCapital}
            />
            <KpiCard
              icon={Boxes}
              label="Valor de venta potencial"
              value={formatearPrecio(totales.valorVenta)}
              delta={deltaValorVenta}
            />
            <KpiCard
              icon={TrendingDown}
              label="Sin movimiento"
              value={formatearNumero(totales.sinMovimiento)}
              delta={deltaSinMovimiento}
              positivoEsBueno={false}
            />
            <KpiCard
              icon={Percent}
              label="En descuento"
              value={formatearNumero(totalDescuento ?? 0)}
              delta={deltaDescuento}
              positivoEsBueno={false}
            />
          </section>

          {totales.sinMovimiento > 0 && (
            <Link
              href="/logistica"
              className="flex items-center justify-between gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm text-accent-foreground transition-opacity hover:opacity-90"
            >
              <span>
                <strong>{formatearNumero(totales.sinMovimiento)}</strong> piezas sin movimiento —
                revisa candidatas a descuento en Logística.
              </span>
              <span className="shrink-0 font-semibold">Ver detalle →</span>
            </Link>
          )}

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-bold text-foreground">Tendencia de piezas (30 días)</h2>
              <GraficoTendencia
                data={serieHistorico.map((h) => ({ fecha: formatearFechaCorta(h.fecha), piezas: h.piezas }))}
                dataKey="piezas"
                config={configPiezas}
              />
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-bold text-foreground">Tendencia de capital inmovilizado (30 días)</h2>
              <GraficoTendencia
                data={serieHistorico.map((h) => ({
                  fecha: formatearFechaCorta(h.fecha),
                  capital_inmovilizado: h.capital_inmovilizado,
                }))}
                dataKey="capital_inmovilizado"
                config={configCapital}
                formato="precio"
              />
            </div>
          </section>

          {valorPorTienda.length > 1 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-bold text-foreground">Piezas por bodega</h2>
              <GraficoBarras
                data={valorPorTienda.map((v) => ({ etiqueta: v.tienda ?? 'Sin asignar', valor: v.piezas }))}
                config={configPorBodega}
                alto={Math.max(120, valorPorTienda.length * 44)}
              />
            </div>
          )}
        </>
      )}

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-bold text-foreground">Piezas por estado</h2>
        <GraficoBarraApilada data={datosPorEstado} config={configPorEstado} />
      </div>

      {piezas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Gem className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Sin piezas para estos filtros</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-semibold">Pieza</th>
                  <th className="px-4 py-2 font-semibold">Bodega</th>
                  <th className="px-4 py-2 text-right font-semibold">Existencias</th>
                  <th className="px-4 py-2 font-semibold">Estado</th>
                  <th className="px-4 py-2 text-right font-semibold">Precio</th>
                  {verFinanzas && <th className="px-4 py-2 text-right font-semibold">Costo</th>}
                  <th className="px-4 py-2 text-right font-semibold">Actualizado</th>
                  {puedeDescontar && <th className="px-4 py-2 text-right font-semibold">Descuento</th>}
                </tr>
              </thead>
              <tbody>
                {piezas.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <Link
                        href={`/inventario/movimientos?buscar=${encodeURIComponent(p.codigo)}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                        title="Ver historial de movimientos de esta pieza"
                      >
                        {p.nombre}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {[p.codigo, p.categoria, p.material, p.kilataje].filter(Boolean).join(' · ')}
                      </p>
                    </td>
                    <td className="px-4 py-2 text-foreground">{p.tienda ?? 'Sin asignar'}</td>
                    <td className="px-4 py-2 text-right font-semibold text-foreground">
                      {p.modo_inventario === 'por_cantidad' ? formatearNumero(p.cantidad_disponible ?? 0) : '1'}
                    </td>
                    <td className="px-4 py-2">
                      <EstadoPieza estado={p.estado} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="font-semibold text-foreground">
                        {p.precio_venta != null ? formatearPrecio(p.precio_venta) : '—'}
                      </span>
                      {p.en_descuento && p.precio_lista != null && (
                        <span className="ml-1.5 text-xs text-muted-foreground line-through">
                          {formatearPrecio(p.precio_lista)}
                        </span>
                      )}
                    </td>
                    {verFinanzas && (
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {p.costo_produccion != null ? formatearPrecio(p.costo_produccion) : '—'}
                      </td>
                    )}
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                      {p.fecha_actualizacion ? formatearFecha(p.fecha_actualizacion) : '—'}
                    </td>
                    {puedeDescontar && (
                      <td className="px-4 py-2 text-right">
                        {p.en_descuento ? (
                          <form action={quitarDescuento} className="inline">
                            <input type="hidden" name="producto_id" value={p.id} />
                            <button
                              type="submit"
                              className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive hover:bg-destructive/20"
                            >
                              <X className="h-3 w-3" />
                              Quitar
                            </button>
                          </form>
                        ) : (
                          <details className="inline-block text-left">
                            <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-foreground">
                              <Tag className="h-3 w-3" />
                              Marcar
                            </summary>
                            <form
                              action={marcarDescuento}
                              className="absolute z-10 mt-1 flex w-56 flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-lg"
                            >
                              <input type="hidden" name="producto_id" value={p.id} />
                              <input
                                name="precio_descuento"
                                type="number"
                                step="0.01"
                                min="0"
                                required
                                placeholder="Nuevo precio"
                                className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                              />
                              <input
                                name="motivo"
                                placeholder="Motivo (opcional)"
                                className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                              />
                              <button
                                type="submit"
                                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                              >
                                Aplicar
                              </button>
                            </form>
                          </details>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacion
            paginaActual={filtros.pagina}
            totalPaginas={totalPaginas}
            total={totalPiezas ?? 0}
            construirHref={construirHref}
          />
        </>
      )}
    </main>
  )
}
