'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts'
import { BarChart3 } from 'lucide-react'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { formatearNumero, formatearPrecio } from '@/lib/formato'

/**
 * `formato`/`sufijo` en vez de una función: los Server Components no
 * pueden pasar funciones como prop a un Client Component (no son
 * serializables por el límite RSC) — así que el formateo vive aquí.
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
  alto = 260,
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
  const formatearValor = (valor: number) =>
    (formato === 'precio' ? formatearPrecio(valor) : formatearNumero(valor)) + sufijo

  if (data.length === 0) {
    return (
      <div className="flex h-[160px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 text-center">
        <BarChart3 className="h-8 w-8 text-muted-foreground" strokeWidth={1.2} />
        <p className="text-sm text-muted-foreground">Sin datos para mostrar.</p>
      </div>
    )
  }

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: alto }}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} />
        <YAxis
          dataKey={etiquetaKey}
          type="category"
          tickLine={false}
          axisLine={false}
          width={140}
          tick={{ fontSize: 12 }}
        />
        <ChartTooltip
          cursor={{ fill: 'var(--muted)' }}
          content={<ChartTooltipContent formatter={(valor) => formatearValor(Number(valor))} />}
        />
        {referencia && (
          <ReferenceLine
            x={referencia.valor}
            stroke="var(--destructive)"
            strokeDasharray="4 4"
            label={{
              value: referencia.etiqueta,
              position: 'insideTopRight',
              fill: 'var(--destructive)',
              fontSize: 11,
            }}
          />
        )}
        <Bar dataKey={dataKey} fill={color} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
