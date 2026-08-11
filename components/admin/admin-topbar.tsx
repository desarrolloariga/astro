"use client"

import { Search, Bell, Calendar, ChevronDown, Download, Menu } from "lucide-react"

const quickStats = [
  { label: "Ventas hoy", value: "$18,240" },
  { label: "Pedidos hoy", value: "126" },
  { label: "Por enviar", value: "38" },
  { label: "Stock bajo", value: "12" },
]

export function AdminTopbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  return (
    <header className="sticky top-0 z-20">
      {/* Bloque 1: barra blanca con la información principal */}
      <div className="flex h-16 items-center gap-4 border-b border-border bg-card/85 px-4 backdrop-blur md:px-6">
        <button
          onClick={onToggleSidebar}
          className="flex shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-foreground/80 transition-colors hover:bg-secondary"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div>
          <h1 className="text-lg font-bold leading-tight tracking-tight text-foreground">Resumen general</h1>
          <p className="hidden text-xs text-muted-foreground sm:block">Vista consolidada de la operación</p>
        </div>

        <div className="ml-auto hidden items-center lg:flex">
          <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar productos, pedidos, clientes…"
              className="w-56 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <button className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="hidden sm:inline">Últimos 30 días</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>

        <button className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Exportar</span>
        </button>

        <button
          className="relative rounded-lg border border-input bg-background p-2 text-foreground transition-colors hover:bg-secondary"
          aria-label="Notificaciones"
        >
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
        </button>
      </div>

      {/* Bloque 2: barra rectangular en azul más oscuro con métricas rápidas */}
      <div className="bg-brand-deep text-brand-deep-foreground">
        <div className="flex h-12 items-center gap-6 overflow-x-auto px-4 md:px-6">
          {quickStats.map((stat) => (
            <div key={stat.label} className="flex shrink-0 items-baseline gap-2">
              <span className="text-xs font-medium text-brand-deep-foreground/70">{stat.label}</span>
              <span className="text-sm font-bold">{stat.value}</span>
            </div>
          ))}
        </div>
      </div>
    </header>
  )
}
