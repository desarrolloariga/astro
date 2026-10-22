import { PieChart as PieIcon } from 'lucide-react'
import type { ChartConfig } from './tipos'

/**
 * Barra apilada horizontal de una sola fila + leyenda de texto, en HTML/CSS.
 * Nunca dona: la paleta chart-1..5 es un degradado de un solo hue y no
 * distingue bien ≥3 categorías por color solo; posición + leyenda sí.
 */
export function GraficoBarraApilada({
  data,
  config,
}: {
  /** Exactamente una fila: { nombre: string, <segmento>: number, ... } */
  data: [Record<string, string | number>]
  config: ChartConfig
}) {
  const claves = Object.keys(config)
  const fila = data[0]
  const total = claves.reduce((acc, clave) => acc + (Number(fila?.[clave]) || 0), 0)

  if (!fila || total === 0) {
    return (
      <div className="flex h-[120px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 text-center">
        <PieIcon className="h-8 w-8 text-muted-foreground" strokeWidth={1.2} />
        <p className="text-sm text-muted-foreground">Sin datos para mostrar.</p>
      </div>
    )
  }

  const colorDe = (clave: string, i: number) => config[clave]?.color ?? `var(--chart-${(i % 5) + 1})`

  return (
    <div className="flex flex-col gap-4">
      <div role="img" aria-label={String(fila.nombre ?? 'Distribución')} className="flex h-10 w-full overflow-hidden rounded-lg bg-muted/40">
        {claves.map((clave, i) => {
          const valor = Number(fila[clave]) || 0
          if (valor <= 0) return null
          const pct = (valor / total) * 100
          const etiqueta = config[clave]?.label
          return (
            <div
              key={clave}
              className="h-full transition-[width] duration-500"
              style={{ width: `${pct}%`, background: colorDe(clave, i) }}
              title={`${typeof etiqueta === 'string' ? etiqueta : clave}: ${valor} (${Math.round(pct)}%)`}
            />
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {claves.map((clave, i) => {
          const valor = Number(fila[clave]) || 0
          const pct = total > 0 ? Math.round((valor / total) * 100) : 0
          return (
            <div key={clave} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: colorDe(clave, i) }} />
              <span className="text-foreground">{config[clave]?.label}</span>
              <span className="text-muted-foreground">
                {valor} · {pct}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
