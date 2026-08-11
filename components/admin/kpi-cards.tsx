import { DollarSign, ShoppingBag, Boxes, Users, ArrowUpRight, ArrowDownRight } from "lucide-react"
import { cn } from "@/lib/utils"

const kpis = [
  {
    label: "Ventas del mes",
    value: "$482,300",
    delta: "+12.4%",
    up: true,
    icon: DollarSign,
    spark: [30, 45, 38, 52, 48, 61, 72],
  },
  {
    label: "Pedidos",
    value: "3,842",
    delta: "+8.1%",
    up: true,
    icon: ShoppingBag,
    spark: [40, 42, 50, 47, 55, 58, 66],
  },
  {
    label: "Productos en stock",
    value: "12,540",
    delta: "-3.2%",
    up: false,
    icon: Boxes,
    spark: [70, 66, 62, 60, 58, 55, 52],
  },
  {
    label: "Clientes activos",
    value: "9,127",
    delta: "+5.6%",
    up: true,
    icon: Users,
    spark: [35, 40, 44, 43, 50, 54, 60],
  },
]

function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  const max = Math.max(...data)
  return (
    <div className="flex h-10 items-end gap-1">
      {data.map((v, i) => (
        <span
          key={i}
          className={cn("w-1.5 rounded-full", up ? "bg-primary/70" : "bg-muted-foreground/40")}
          style={{ height: `${(v / max) * 100}%` }}
        />
      ))}
    </div>
  )
}

export function KpiCards() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-primary">
              <kpi.icon className="h-5 w-5" />
            </div>
            <span
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold",
                kpi.up ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
              )}
            >
              {kpi.up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {kpi.delta}
            </span>
          </div>
          <div className="mt-4 flex items-end justify-between gap-2">
            <div>
              <p className="text-sm text-muted-foreground">{kpi.label}</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{kpi.value}</p>
            </div>
            <Sparkline data={kpi.spark} up={kpi.up} />
          </div>
        </div>
      ))}
    </div>
  )
}
