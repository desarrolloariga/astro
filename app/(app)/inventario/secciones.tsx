import Link from 'next/link'
import { Boxes, Gem, Coins, TrendingDown, Percent } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatearPrecio, formatearNumero, formatearFechaCorta } from '@/lib/formato'
import { calcularDelta } from '@/lib/inventario'
import { KpiCard } from '@/components/app/kpi-card'
import { GraficoTendencia } from '@/components/inventario/grafico-tendencia'
import { GraficoBarras } from '@/components/inventario/grafico-barras'
import { GraficoBarraApilada } from '@/components/inventario/grafico-barra-apilada'
import type { ChartConfig } from '@/components/inventario/tipos'

/**
 * Bloques secundarios de Inventario que se transmiten con Suspense: el
 * panorama financiero (KPIs, tendencias, piezas por bodega) y la
 * distribución por estado. Cada uno trae sus propias consultas para que
 * los filtros y la tabla no esperen por los agregados.
 */

export const ESTADOS_INVENTARIO = ['disponible_cedi', 'en_transito', 'disponible_tienda', 'separada']

export const ETIQUETAS_ESTADO: Record<string, string> = {
  disponible_cedi: 'Disponible CEDI',
  en_transito: 'En tránsito',
  disponible_tienda: 'Disponible en tienda',
  separada: 'Separada',
}

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

const configPiezas: ChartConfig = { piezas: { label: 'Piezas', color: 'var(--chart-1)' } }
const configCapital: ChartConfig = {
  capital_inmovilizado: { label: 'Capital inmovilizado', color: 'var(--chart-1)' },
}
const configPorBodega: ChartConfig = { valor: { label: 'Piezas', color: 'var(--chart-1)' } }
const configPorEstado: ChartConfig = ESTADOS_INVENTARIO.reduce((acc, estado, i) => {
  acc[estado] = { label: ETIQUETAS_ESTADO[estado], color: `var(--chart-${(i % 5) + 1})` }
  return acc
}, {} as ChartConfig)

/**
 * KPIs, aviso de piezas sin movimiento, tendencias a 30 días y piezas por
 * bodega. Siempre acotados solo por bodega (nunca por los filtros de
 * texto/categoría/material de la tabla, para que buscar una pieza no
 * altere los números del panorama general).
 */
export async function SeccionPanorama({ tiendaFiltro }: { tiendaFiltro: number | null }) {
  const supabase = await createClient()

  let consultaDescuento = supabase
    .from('vw_inventario_tienda')
    .select('id', { count: 'exact', head: true })
    .eq('en_descuento', true)
  if (tiendaFiltro) consultaDescuento = consultaDescuento.eq('tienda_id', tiendaFiltro)

  const hace30Dias = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  let consultaHistorico = supabase
    .from('inventario_historico_diario')
    .select('fecha, piezas, capital_inmovilizado, valor_venta_potencial, piezas_sin_movimiento, piezas_en_descuento')
    .gte('fecha', hace30Dias)
    .order('fecha', { ascending: true })
  if (tiendaFiltro) consultaHistorico = consultaHistorico.eq('tienda_id', tiendaFiltro)

  const [{ data: valorData }, { count: totalDescuento }, { data: historicoData }] = await Promise.all([
    supabase.from('vw_inventario_valorizado').select('*'),
    consultaDescuento,
    consultaHistorico,
  ])

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

  return (
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
          href="/inventario/reposicion"
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
  )
}

export function EsqueletoPanorama() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="Cargando">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-secondary/70" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-64 rounded-xl bg-secondary/70" />
        <div className="h-64 rounded-xl bg-secondary/70" />
      </div>
    </div>
  )
}

/** Barra apilada con el conteo de piezas en cada estado de inventario. */
export async function SeccionPorEstado({ tiendaFiltro }: { tiendaFiltro: number | null }) {
  const supabase = await createClient()

  const conteosEstado = await Promise.all(
    ESTADOS_INVENTARIO.map((estado) => {
      let q = supabase.from('vw_inventario_tienda').select('id', { count: 'exact', head: true }).eq('estado', estado)
      if (tiendaFiltro) q = q.eq('tienda_id', tiendaFiltro)
      return q
    }),
  )

  const datosPorEstado: [Record<string, string | number>] = [
    {
      nombre: 'Piezas',
      ...Object.fromEntries(
        ESTADOS_INVENTARIO.map((estado, i) => [estado, conteosEstado[i]?.count ?? 0]),
      ),
    },
  ]

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-3 text-sm font-bold text-foreground">Piezas por estado</h2>
      <GraficoBarraApilada data={datosPorEstado} config={configPorEstado} />
    </div>
  )
}

export function EsqueletoPorEstado() {
  return <div className="h-36 animate-pulse rounded-xl bg-secondary/70" aria-busy="true" aria-label="Cargando" />
}
