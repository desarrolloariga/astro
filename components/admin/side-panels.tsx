import { AlertTriangle, PackageX, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

const lowStock = [
  { name: "Smartwatch Serie 6", stock: 18, min: 40 },
  { name: "Mochila Urban Tech", stock: 12, min: 30 },
  { name: "Tenis Runner Air", stock: 0, min: 25 },
  { name: "Teclado Mecánico K2", stock: 9, min: 20 },
]

const topCategories = [
  { label: "Electrónica", value: 46, color: "bg-primary" },
  { label: "Moda", value: 27, color: "bg-chart-2" },
  { label: "Hogar", value: 15, color: "bg-chart-3" },
  { label: "Accesorios", value: 12, color: "bg-chart-5" },
]

export function LowStockPanel() {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-bold text-foreground">Alertas de stock</h2>
          <p className="text-xs text-muted-foreground">Productos por debajo del mínimo</p>
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-3">
        {lowStock.map((item) => {
          const out = item.stock === 0
          return (
            <li key={item.name} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md",
                  out ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground",
                )}
              >
                <PackageX className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                <p className="text-xs text-muted-foreground">Mínimo sugerido: {item.min}</p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-1 text-xs font-semibold",
                  out ? "bg-destructive/10 text-destructive" : "bg-chart-5/25 text-accent-foreground",
                )}
              >
                {out ? "Agotado" : `${item.stock} uds`}
              </span>
            </li>
          )
        })}
      </ul>

      <button className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-input bg-background py-2 text-sm font-semibold text-primary transition-colors hover:bg-secondary">
        Reabastecer inventario
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  )
}

export function TopCategoriesPanel() {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-bold text-foreground">Ventas por categoría</h2>
      <p className="text-xs text-muted-foreground">Participación en ingresos</p>

      <ul className="mt-4 flex flex-col gap-4">
        {topCategories.map((c) => (
          <li key={c.label}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="text-foreground">{c.label}</span>
              <span className="font-semibold text-foreground">{c.value}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div className={cn("h-full rounded-full", c.color)} style={{ width: `${c.value}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
