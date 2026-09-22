'use client'

import { useMemo, useState, useTransition } from 'react'
import { ArrowRightLeft, Trash2, PlusCircle } from 'lucide-react'
import { SelectorProducto, type ProductoSeleccionable } from '@/components/app/selector-producto'
import { crearTraslado } from '@/app/(app)/traslados/acciones'

type Bodega = { id: number; nombre: string }
type ProductoTraslado = ProductoSeleccionable & {
  modo_inventario: 'pieza_unica' | 'por_cantidad'
  tienda_id: number | null
}
type Existencia = { producto_id: number; tienda_id: number; cantidad_disponible: number }

type LineaCarrito = {
  key: string
  producto_id: number
  codigo: string
  nombre: string
  modoInventario: 'pieza_unica' | 'por_cantidad'
  cantidad: number | null
}

export function CarritoTraslado({
  bodegas,
  productos,
  existencias,
}: {
  bodegas: Bodega[]
  productos: ProductoTraslado[]
  existencias: Existencia[]
}) {
  const [origenId, setOrigenId] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [seleccionActual, setSeleccionActual] = useState<ProductoSeleccionable | null>(null)
  const [cantidadInput, setCantidadInput] = useState('')
  const [carrito, setCarrito] = useState<LineaCarrito[]>([])
  const [selectorKey, setSelectorKey] = useState(0)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const productoSeleccionado = productos.find((p) => p.id === seleccionActual?.id) ?? null

  const disponiblePorCantidad = useMemo(() => {
    if (!origenId || !productoSeleccionado || productoSeleccionado.modo_inventario !== 'por_cantidad') return 0
    const origen = Number(origenId)
    return (
      existencias.find((e) => e.producto_id === productoSeleccionado.id && e.tienda_id === origen)
        ?.cantidad_disponible ?? 0
    )
  }, [existencias, origenId, productoSeleccionado])

  const productosDisponibles = useMemo(() => {
    if (!origenId) return []
    const origen = Number(origenId)
    return productos.filter((p) => {
      if (p.modo_inventario === 'pieza_unica') return p.estado === 'disponible_cedi' && p.tienda_id === origen
      const disponible = existencias.find((e) => e.producto_id === p.id && e.tienda_id === origen)?.cantidad_disponible ?? 0
      return disponible > 0
    })
  }, [productos, existencias, origenId])

  function agregarAlCarrito() {
    if (!seleccionActual || !productoSeleccionado) return
    if (productoSeleccionado.modo_inventario === 'por_cantidad') {
      const cantidad = Number(cantidadInput)
      if (!cantidad || cantidad <= 0 || cantidad > disponiblePorCantidad) return
      setCarrito((prev) => [
        ...prev,
        {
          key: `${seleccionActual.id}-${Date.now()}`,
          producto_id: seleccionActual.id,
          codigo: seleccionActual.codigo,
          nombre: seleccionActual.nombre,
          modoInventario: 'por_cantidad',
          cantidad,
        },
      ])
      setCantidadInput('')
    } else {
      setCarrito((prev) => [
        ...prev,
        {
          key: `${seleccionActual.id}-${Date.now()}`,
          producto_id: seleccionActual.id,
          codigo: seleccionActual.codigo,
          nombre: seleccionActual.nombre,
          modoInventario: 'pieza_unica',
          cantidad: null,
        },
      ])
    }
    setSeleccionActual(null)
    setSelectorKey((k) => k + 1)
  }

  function quitar(key: string) {
    setCarrito((prev) => prev.filter((l) => l.key !== key))
  }

  function confirmar() {
    setError('')
    if (!origenId || !destinoId) {
      setError('Elige bodega de origen y destino')
      return
    }
    if (origenId === destinoId) {
      setError('El origen y el destino no pueden ser la misma bodega')
      return
    }
    if (carrito.length === 0) {
      setError('Agrega al menos un artículo')
      return
    }
    startTransition(async () => {
      await crearTraslado(
        Number(origenId),
        Number(destinoId),
        carrito.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad })),
      )
    })
  }

  const puedeAgregar =
    seleccionActual != null &&
    productoSeleccionado != null &&
    (productoSeleccionado.modo_inventario === 'pieza_unica' ||
      (disponiblePorCantidad > 0 &&
        Number(cantidadInput) > 0 &&
        Number(cantidadInput) <= disponiblePorCantidad))

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          <ArrowRightLeft className="h-4 w-4 text-primary" />
          Bodegas
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm text-foreground">
            Origen
            <select
              value={origenId}
              onChange={(e) => {
                setOrigenId(e.target.value)
                setCarrito([])
                setSeleccionActual(null)
                setSelectorKey((k) => k + 1)
              }}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">Selecciona…</option>
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-foreground">
            Destino
            <select
              value={destinoId}
              onChange={(e) => setDestinoId(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">Selecciona…</option>
              {bodegas
                .filter((b) => String(b.id) !== origenId)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Artículos a trasladar</h2>
        {!origenId ? (
          <p className="text-sm text-muted-foreground">Elige primero la bodega de origen.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <SelectorProducto
              key={selectorKey}
              productos={productosDisponibles}
              name="producto_id_traslado"
              onSeleccionar={(p) => {
                setSeleccionActual(p)
                setCantidadInput('')
              }}
            />
            {productoSeleccionado?.modo_inventario === 'por_cantidad' && (
              <label className="flex flex-col gap-1.5 text-sm text-foreground">
                Cantidad a trasladar
                <input
                  type="number"
                  min={1}
                  max={disponiblePorCantidad}
                  step="1"
                  value={cantidadInput}
                  onChange={(e) => setCantidadInput(e.target.value)}
                  placeholder={`Máximo ${disponiblePorCantidad}`}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                />
                <span className="text-xs text-muted-foreground">
                  Disponible en esta bodega: <strong className="text-foreground">{disponiblePorCantidad} unidades</strong>
                </span>
              </label>
            )}
            <button
              type="button"
              disabled={!puedeAgregar}
              onClick={agregarAlCarrito}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PlusCircle className="h-4 w-4" />
              Agregar al traslado
            </button>
          </div>
        )}

        {carrito.length > 0 && (
          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
            {carrito.map((l) => (
              <div key={l.key} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">
                    {l.codigo} — {l.nombre}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {l.modoInventario === 'pieza_unica' ? 'Pieza única' : `${l.cantidad} unidades`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => quitar(l.key)}
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                  aria-label="Quitar del traslado"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-xs font-medium text-destructive">{error}</p>}

        <button
          type="button"
          disabled={pending}
          onClick={confirmar}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Creando…' : `Crear traslado (${carrito.length} artículo${carrito.length !== 1 ? 's' : ''})`}
        </button>
      </section>
    </div>
  )
}
