import { cn } from "@/lib/utils"
import { MoreHorizontal, Search, SlidersHorizontal } from "lucide-react"

type Status = "En stock" | "Stock bajo" | "Agotado"

const items: {
  sku: string
  name: string
  category: string
  stock: number
  price: string
  status: Status
}[] = [
  { sku: "AUR-1042", name: "Audífonos inalámbricos Pro", category: "Electrónica", stock: 320, price: "$1,299", status: "En stock" },
  { sku: "AUR-2087", name: "Smartwatch Serie 6", category: "Electrónica", stock: 18, price: "$2,499", status: "Stock bajo" },
  { sku: "AUR-3310", name: "Tenis Runner Air", category: "Moda", stock: 0, price: "$899", status: "Agotado" },
  { sku: "AUR-4521", name: "Bocina portátil Wave", category: "Electrónica", stock: 214, price: "$749", status: "En stock" },
  { sku: "AUR-5098", name: "Mochila Urban Tech", category: "Accesorios", stock: 12, price: "$649", status: "Stock bajo" },
  { sku: "AUR-6733", name: "Cámara Mirrorless X", category: "Electrónica", stock: 87, price: "$8,999", status: "En stock" },
]

const statusStyle: Record<Status, string> = {
  "En stock": "bg-primary/10 text-primary",
  "Stock bajo": "bg-chart-5/25 text-accent-foreground",
  Agotado: "bg-destructive/10 text-destructive",
}

export function InventoryTable() {
  return (
    <div className="rounded-xl border border-border bg-card lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <div>
          <h2 className="text-base font-bold text-foreground">Inventario reciente</h2>
          <p className="text-sm text-muted-foreground">Control de existencias por producto</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar SKU o producto"
              className="w-40 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <button className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            <span className="hidden sm:inline">Filtros</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-semibold">Producto</th>
              <th className="px-5 py-3 font-semibold">SKU</th>
              <th className="px-5 py-3 font-semibold">Categoría</th>
              <th className="px-5 py-3 font-semibold">Stock</th>
              <th className="px-5 py-3 font-semibold">Precio</th>
              <th className="px-5 py-3 font-semibold">Estado</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.sku} className="border-b border-border last:border-0 hover:bg-secondary/40">
                <td className="px-5 py-3.5 font-medium text-foreground">{item.name}</td>
                <td className="px-5 py-3.5 text-muted-foreground">{item.sku}</td>
                <td className="px-5 py-3.5 text-muted-foreground">{item.category}</td>
                <td className="px-5 py-3.5 font-semibold text-foreground">{item.stock}</td>
                <td className="px-5 py-3.5 font-semibold text-foreground">{item.price}</td>
                <td className="px-5 py-3.5">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                      statusStyle[item.status],
                    )}
                  >
                    {item.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    aria-label="Más opciones"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
