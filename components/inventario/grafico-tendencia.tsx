import { TrendingUp } from 'lucide-react'
import { formatearNumero, formatearPrecio } from '@/lib/formato'
import type { ChartConfig } from './tipos'

const ANCHO = 600
const ALTO = 150
const MARGEN = { arriba: 10, abajo: 6, izq: 6, der: 6 }

/**
 * Línea de tendencia en SVG puro (sin librería de gráficas). Se estira al
 * ancho disponible; los puntos tienen tooltip nativo con fecha y valor.
 */
export function GraficoTendencia({
  data,
  dataKey,
  etiquetaEje = 'fecha',
  config,
  formato = 'numero',
  sufijo = '',
}: {
  data: Record<string, string | number>[]
  dataKey: string
  etiquetaEje?: string
  config: ChartConfig
  formato?: 'numero' | 'precio'
  sufijo?: string
}) {
  const formatearValor = (valor: number) => (formato === 'precio' ? formatearPrecio(valor) : formatearNumero(valor)) + sufijo

  if (data.length < 2) {
    return (
      <div className="flex h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 text-center">
        <TrendingUp className="h-8 w-8 text-muted-foreground" strokeWidth={1.2} />
        <p className="text-sm text-muted-foreground">
          Aún no hay suficiente historial — la tendencia aparece a partir del segundo día.
        </p>
      </div>
    )
  }

  const valores = data.map((d) => Number(d[dataKey]) || 0)
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const rango = max - min || 1
  const anchoUtil = ANCHO - MARGEN.izq - MARGEN.der
  const altoUtil = ALTO - MARGEN.arriba - MARGEN.abajo
  const x = (i: number) => MARGEN.izq + (i / (valores.length - 1)) * anchoUtil
  const y = (v: number) => MARGEN.arriba + (1 - (v - min) / rango) * altoUtil
  const puntos = valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  const area = `M${MARGEN.izq},${ALTO - MARGEN.abajo} L${puntos.join(' L')} L${(ANCHO - MARGEN.der).toFixed(1)},${ALTO - MARGEN.abajo} Z`
  const color = config[dataKey]?.color ?? `var(--color-${dataKey}, var(--chart-1))`
  const etiqueta = config[dataKey]?.label
  const ultimo = valores[valores.length - 1]
  const primero = valores[0]
  const pasoColumna = anchoUtil / (valores.length - 1)
  const indicesEje = [0, Math.floor((valores.length - 1) / 2), valores.length - 1].filter((v, i, a) => a.indexOf(v) === i)

  return (
    <div className="flex flex-col gap-2" role="img" aria-label={typeof etiqueta === 'string' ? etiqueta : 'Tendencia'}>
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span>
          Inicio <span className="font-semibold text-foreground">{formatearValor(primero)}</span>
        </span>
        <span>
          Máx. <span className="font-semibold text-foreground">{formatearValor(max)}</span>
        </span>
        <span>
          Hoy <span className="font-semibold text-foreground">{formatearValor(ultimo)}</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none" className="h-[150px] w-full" aria-hidden="true">
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={MARGEN.izq}
            x2={ANCHO - MARGEN.der}
            y1={MARGEN.arriba + f * altoUtil}
            y2={MARGEN.arriba + f * altoUtil}
            stroke="var(--border)"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={area} fill={color} opacity={0.12} />
        <polyline points={puntos.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {valores.map((v, i) => (
          <rect key={i} x={x(i) - pasoColumna / 2} y={0} width={pasoColumna} height={ALTO} fill="transparent">
            <title>{`${String(data[i][etiquetaEje] ?? '')}: ${formatearValor(v)}`}</title>
          </rect>
        ))}
      </svg>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        {indicesEje.map((i) => (
          <span key={i}>{String(data[i][etiquetaEje] ?? '')}</span>
        ))}
      </div>
    </div>
  )
}
