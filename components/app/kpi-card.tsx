import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Delta } from '@/lib/inventario'

export function KpiCard({
  icon: Icon,
  label,
  value,
  subvalor,
  delta,
  positivoEsBueno = true,
  className,
}: {
  icon: LucideIcon
  label: string
  value: string
  /** Línea secundaria pequeña bajo el valor (ej. "duró 2.5 h"). */
  subvalor?: string
  /** `undefined`/`null` = sin comparación disponible todavía (no se dibuja badge). */
  delta?: Delta | null
  /** Si un aumento de este valor es una mala señal (ej. piezas sin movimiento), pásalo en `false`. */
  positivoEsBueno?: boolean
  className?: string
}) {
  const esNeutro = delta?.direccion === 'flat'
  const esBueno = delta && !esNeutro ? (delta.direccion === 'up') === positivoEsBueno : null

  return (
    <div className={cn('rounded-xl border border-border bg-card p-5', className)}>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <div className="mt-1 flex flex-wrap items-baseline gap-2">
        <p className="text-2xl font-bold text-foreground">{value}</p>
        {delta && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold',
              esNeutro
                ? 'bg-secondary text-secondary-foreground'
                : esBueno
                  ? 'bg-primary/10 text-primary'
                  : 'bg-destructive/10 text-destructive',
            )}
          >
            {esNeutro ? (
              <Minus className="h-3 w-3" />
            ) : delta.direccion === 'up' ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {Math.abs(delta.valor).toFixed(1)}%
          </span>
        )}
      </div>
      {subvalor && <p className="mt-0.5 text-xs text-muted-foreground">{subvalor}</p>}
    </div>
  )
}
