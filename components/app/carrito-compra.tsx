'use client'

import { useState, useTransition } from 'react'
import { ShoppingCart, Trash2, PlusCircle } from 'lucide-react'
import { SelectorProducto, type ProductoSeleccionable } from '@/components/app/selector-producto'
import { formatearPrecio } from '@/lib/formato'
import { agregarLineasCompraMasivo } from '@/app/(app)/compras/acciones'

type LineaCarrito = {
  key: string
  producto_id: number
  codigo: string
  nombre: string
  cantidad: number
  costo_unitario: number
  descuento_pct: number
}

export function CarritoCompra({
  ordenId,
  productos,
}: {
  ordenId: number
  productos: ProductoSeleccionable[]
}) {
  const [seleccionActual, setSeleccionActual] = useState<ProductoSeleccionable | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [costo, setCosto] = useState('')
  const [descuento, setDescuento] = useState('')
  const [carrito, setCarrito] = useState<LineaCarrito[]>([])
  const [selectorKey, setSelectorKey] = useState(0)
  const [pending, startTransition] = useTransition()

  function agregarAlCarrito() {
    const cant = Number(cantidad.replace(',', '.'))
    const cu = Number(costo.replace(',', '.'))
    const desc = descuento ? Number(descuento.replace(',', '.')) : 0
    if (!seleccionActual || !Number.isFinite(cant) || cant <= 0 || !Number.isFinite(cu) || cu < 0) return

    setCarrito((prev) => [
      ...prev,
      {
        key: `${seleccionActual.id}-${Date.now()}`,
        producto_id: seleccionActual.id,
        codigo: seleccionActual.codigo,
        nombre: seleccionActual.nombre,
        cantidad: cant,
        costo_unitario: cu,
        descuento_pct: desc,
      },
    ])
    setSeleccionActual(null)
    setCantidad('')
    setCosto('')
    setDescuento('')
    setSelectorKey((k) => k + 1)
  }

  function quitar(key: string) {
    setCarrito((prev) => prev.filter((l) => l.key !== key))
  }

  function confirmar() {
    startTransition(async () => {
      await agregarLineasCompraMasivo(
        ordenId,
        carrito.map((l) => ({
          producto_id: l.producto_id,
          descripcion: `${l.codigo} — ${l.nombre}`,
          cantidad: l.cantidad,
          costo_unitario: l.costo_unitario,
          descuento_pct: l.descuento_pct,
        })),
      )
    })
  }

  const total = carrito.reduce(
    (acc, l) => acc + l.cantidad * l.costo_unitario * (1 - l.descuento_pct / 100),
    0,
  )
  const puedeAgregarAlCarrito = seleccionActual != null && Number(cantidad) > 0 && costo !== '' && Number(costo) >= 0

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        <ShoppingCart className="h-4 w-4 text-primary" />
        Elige los productos a comprar
      </h2>

      <div className="flex flex-col gap-3">
        <SelectorProducto
          key={selectorKey}
          productos={productos}
          name="producto_id_carrito"
          onSeleccionar={setSeleccionActual}
        />
        <div className="grid grid-cols-3 gap-2">
          <input
            type="number"
            step="0.001"
            min="0.001"
            placeholder="Cantidad"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          />
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Costo unit."
            value={costo}
            onChange={(e) => setCosto(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          />
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            placeholder="% desc."
            value={descuento}
            onChange={(e) => setDescuento(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <button
          type="button"
          disabled={!puedeAgregarAlCarrito}
          onClick={agregarAlCarrito}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusCircle className="h-4 w-4" />
          Agregar al carrito
        </button>
      </div>

      {carrito.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          {carrito.map((l) => (
            <div
              key={l.key}
              className="flex items-center justify-between gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">
                  {l.codigo} — {l.nombre}
                </p>
                <p className="text-xs text-muted-foreground">
                  {l.cantidad} × {formatearPrecio(l.costo_unitario)}
                  {l.descuento_pct > 0 && ` · ${l.descuento_pct}% desc.`}
                </p>
              </div>
              <span className="shrink-0 font-semibold text-foreground">
                {formatearPrecio(l.cantidad * l.costo_unitario * (1 - l.descuento_pct / 100))}
              </span>
              <button
                type="button"
                onClick={() => quitar(l.key)}
                className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                aria-label="Quitar del carrito"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-bold text-foreground">
            <span>Total del carrito</span>
            <span>{formatearPrecio(total)}</span>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={confirmar}
            className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'Agregando…' : `Agregar ${carrito.length} línea${carrito.length !== 1 ? 's' : ''} a la orden`}
          </button>
        </div>
      )}
    </div>
  )
}
