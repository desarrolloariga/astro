import { cn } from "@/lib/utils"

const data = [
  { month: "Ene", current: 42, prev: 34 },
  { month: "Feb", current: 48, prev: 40 },
  { month: "Mar", current: 55, prev: 45 },
  { month: "Abr", current: 50, prev: 47 },
  { month: "May", current: 63, prev: 52 },
  { month: "Jun", current: 72, prev: 58 },
  { month: "Jul", current: 68, prev: 60 },
  { month: "Ago", current: 80, prev: 64 },
]

const max = 100

export function SalesChart() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-foreground">Ingresos por mes</h2>
          <p className="text-sm text-muted-foreground">Comparado con el periodo anterior</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Este año
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-chart-3" /> Año anterior
          </span>
        </div>
      </div>

      <div className="mt-6 flex h-56 items-stretch justify-between gap-3">
        {data.map((d) => (
          <div key={d.month} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex min-h-0 flex-1 w-full items-end justify-center gap-1">
              <div
                className="w-1/2 max-w-4 rounded-t bg-chart-3"
                style={{ height: `${(d.prev / max) * 100}%` }}
                title={`Año anterior: ${d.prev}`}
              />
              <div
                className="w-1/2 max-w-4 rounded-t bg-primary"
                style={{ height: `${(d.current / max) * 100}%` }}
                title={`Este año: ${d.current}`}
              />
            </div>
            <span className="text-xs text-muted-foreground">{d.month}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const orderStatus = [
  { label: "Completados", value: 62, color: "bg-primary" },
  { label: "En proceso", value: 24, color: "bg-chart-2" },
  { label: "Pendientes", value: 10, color: "bg-chart-5" },
  { label: "Cancelados", value: 4, color: "bg-destructive/70" },
]

export function OrderStatusCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-bold text-foreground">Estado de pedidos</h2>
      <p className="text-sm text-muted-foreground">Distribución del mes en curso</p>

      <div className="mt-5 flex h-3 w-full overflow-hidden rounded-full">
        {orderStatus.map((s) => (
          <div key={s.label} className={cn(s.color)} style={{ width: `${s.value}%` }} />
        ))}
      </div>

      <ul className="mt-5 flex flex-col gap-3">
        {orderStatus.map((s) => (
          <li key={s.label} className="flex items-center gap-3 text-sm">
            <span className={cn("h-2.5 w-2.5 rounded-full", s.color)} />
            <span className="flex-1 text-muted-foreground">{s.label}</span>
            <span className="font-semibold text-foreground">{s.value}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
