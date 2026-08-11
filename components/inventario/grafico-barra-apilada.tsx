'use client'

import { BarChart, Bar, XAxis, YAxis } from 'recharts'
import { PieChart as PieIcon } from 'lucide-react'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

/** Barra apilada horizontal de una sola fila + leyenda de texto — nunca dona
 * (la paleta chart-1..5 de este proyecto es un degradado de un solo hue, no
 * distingue bien ≥3 categorías por color solo; posición + leyenda sí). */
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

  return (
    <div className="flex flex-col gap-4">
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height: 56 }}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="nombre" hide />
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          {claves.map((clave) => (
            <Bar key={clave} dataKey={clave} stackId="total" fill={`var(--color-${clave})`} radius={0} />
          ))}
        </BarChart>
      </ChartContainer>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {claves.map((clave) => {
          const valor = Number(fila[clave]) || 0
          const pct = total > 0 ? Math.round((valor / total) * 100) : 0
          return (
            <div key={clave} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: `var(--color-${clave})` }}
              />
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
