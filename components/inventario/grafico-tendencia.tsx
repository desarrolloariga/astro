'use client'

import { LineChart, Line, XAxis, CartesianGrid } from 'recharts'
import { TrendingUp } from 'lucide-react'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { formatearNumero, formatearPrecio } from '@/lib/formato'

/**
 * `formato`/`sufijo` en vez de una función: los Server Components no
 * pueden pasar funciones como prop a un Client Component (no son
 * serializables por el límite RSC) — así que el formateo vive aquí.
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
  const formatearValor = (valor: number) =>
    (formato === 'precio' ? formatearPrecio(valor) : formatearNumero(valor)) + sufijo

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

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: 200 }}>
      <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={etiquetaEje} tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent formatter={(valor) => formatearValor(Number(valor))} />}
        />
        <Line
          dataKey={dataKey}
          type="monotone"
          stroke={`var(--color-${dataKey})`}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  )
}
