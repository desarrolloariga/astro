import { BarChart3 } from 'lucide-react'
import { formatearNumero, formatearPrecio } from '@/lib/formato'
import type { ChartConfig } from './tipos'

/**
 * Barras horizontales en HTML/CSS (sin librería de gráficas: antes recharts
 * sumaba ~375 KB de JavaScript a cada página de inventario).
 * `formato`/`sufijo` en vez de una función: los Server Components no
 * pueden pasar funciones como prop.
 */
export function GraficoBarras({
  data,
  dataKey = 'valor',
  etiquetaKey = 'etiqueta',
  config,
  color = 'var(--chart-1)',
  referencia,
  formato = 'numero',
  sufijo = '',
  alto,
}: {
  data: Record<string, string | number>[]
  dataKey?: string
  etiquetaKey?: string
  config: ChartConfig
  color?: string
  referencia?: { valor: number; etiqueta: string }
  formato?: 'numero' | 'precio'
  sufijo?: string
  alto?: number
}) {
  const formatearValor = (valor: number) => (formato === 'precio' ? formatearPrecio(valor) : formatearNumero(valor)) + sufijo

  if (data.length === 0) {
    return (
      <div className="flex h-[160px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 text-center">
        <BarChart3 className="h-8 w-8 text-muted-foreground" strokeWidth={1.2} />
        <p className="text-sm text-muted-foreground">Sin datos para mostrar.</p>
      </div>
    )
  }

  const valores = data.map((d) => Number(d[dataKey]) || 0)
  const maximo = Math.max(...valores, referencia?.valor ?? 0, 1)
  const nombreSerie = config[dataKey]?.label
  const colorSerie = config[dataKey]?.color ?? color
  const pctReferencia = referencia ? Math.min(100, (referencia.valor / maximo) * 100) : null

  return (
    <div role="img" aria-label={typeof nombreSerie === 'string' ? nombreSerie : 'Gráfica de barras'} className="flex flex-col gap-1.5" style={{ minHeight: alto }}>
      {data.map((fila, i) => {
        const valor = valores[i]
        const pct = Math.max(0, Math.min(100, (valor / maximo) * 100))
        const etiqueta = String(fila[etiquetaKey] ?? '')
        return (
          <div key={`${etiqueta}-${i}`} className="grid grid-cols-[140px_1fr] items-center gap-3 text-xs">
            <span className="truncate text-foreground" title={etiqueta}>
              {etiqueta}
            </span>
            <div className="relative flex h-7 items-center">
              <div className="h-full w-full overflow-hidden rounded-r-md bg-muted/40">
                <div
                  className="h-full rounded-r-md transition-[width] duration-500"
                  style={{ width: `${pct}%`, background: colorSerie }}
                  title={`${etiqueta}: ${formatearValor(valor)}`}
                />
              </div>
              <span
                className="pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap font-semibold tabular-nums"
                style={pct > 70 ? { right: `calc(${100 - pct}% + 6px)`, color: '#fff' } : { left: `calc(${pct}% + 6px)` }}
              >
                {formatearValor(valor)}
              </span>
            </div>
          </div>
        )
      })}
      {pctReferencia != null && referencia && (
        <div className="grid grid-cols-[140px_1fr] gap-3">
          <span />
          <div className="relative h-4">
            <span
              className="absolute -top-[calc(100%+var(--alto-barras,0px))] bottom-0 w-0 border-l border-dashed border-destructive"
              style={{ left: `${pctReferencia}%`, height: `${data.length * 34 + 16}px`, top: `-${data.length * 34 + 4}px` }}
              aria-hidden="true"
            />
            <span className="absolute top-0 text-[11px] font-medium text-destructive" style={{ left: `calc(${pctReferencia}% + 6px)` }}>
              {referencia.etiqueta}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
