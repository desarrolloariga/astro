'use client'

import { useState, useTransition } from 'react'
import { Handshake, Truck, StickyNote, ShoppingCart, Trash2, PlusCircle } from 'lucide-react'
import { SelectorProducto, type ProductoSeleccionable } from '@/components/app/selector-producto'
import { Campo, SeccionFormulario, BotonPrimario, clasesInput } from '@/components/app/formulario'
import { formatearPrecio } from '@/lib/formato'
import { crearOrdenCompraConLineas } from '@/app/(app)/compras/acciones'

type LineaCarrito = {
  key: string
  producto_id: number
  codigo: string
  nombre: string
  cantidad: number
  costo_unitario: number
  descuento_pct: number
}

export function FormularioNuevaOrdenCompra({
  proveedores,
  productos,
}: {
  proveedores: { id: number; nombre: string }[]
  productos: ProductoSeleccionable[]
}) {
  const [proveedorId, setProveedorId] = useState('')
  const [condicionesPago, setCondicionesPago] = useState('')
  const [referenciaProveedor, setReferenciaProveedor] = useState('')
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [metodoEnvio, setMetodoEnvio] = useState('')
  const [direccionEntrega, setDireccionEntrega] = useState('')
  const [notasProveedor, setNotasProveedor] = useState('')
  const [notas, setNotas] = useState('')

  const [seleccionActual, setSeleccionActual] = useState<ProductoSeleccionable | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [costo, setCosto] = useState('')
  const [descuento, setDescuento] = useState('')
  const [carrito, setCarrito] = useState<LineaCarrito[]>([])
  const [selectorKey, setSelectorKey] = useState(0)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

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

  function crearOrden() {
    setError('')
    if (!proveedorId) {
      setError('Elige un proveedor')
      return
    }
    if (carrito.length === 0) {
      setError('Agrega al menos un producto al carrito')
      return
    }
    startTransition(async () => {
      await crearOrdenCompraConLineas(
        {
          proveedor_id: Number(proveedorId),
          condiciones_pago: condicionesPago || null,
          fecha_entrega_esperada: fechaEntrega || null,
          direccion_entrega: direccionEntrega || null,
          metodo_envio: metodoEnvio || null,
          referencia_proveedor: referenciaProveedor || null,
          notas_proveedor: notasProveedor || null,
          notas: notas || null,
        },
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
      <div className="flex flex-col gap-6">
        <SeccionFormulario icon={Handshake} titulo="Proveedor y condiciones">
          <div className="flex flex-col gap-4">
            <Campo label="Proveedor" required>
              <select
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                required
                className={clasesInput}
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo label="Condiciones de pago">
                <select value={condicionesPago} onChange={(e) => setCondicionesPago(e.target.value)} className={clasesInput}>
                  <option value="">Selecciona…</option>
                  <option value="contado">Contado</option>
                  <option value="15_dias">15 días</option>
                  <option value="30_dias">30 días</option>
                  <option value="45_dias">45 días</option>
                  <option value="60_dias">60 días</option>
                  <option value="90_dias">90 días</option>
                  <option value="otro">Otro</option>
                </select>
              </Campo>
              <Campo label="Referencia del proveedor" helpText="Número de cotización u orden propia del proveedor.">
                <input
                  value={referenciaProveedor}
                  onChange={(e) => setReferenciaProveedor(e.target.value)}
                  placeholder="COT-2026-045"
                  className={clasesInput}
                />
              </Campo>
            </div>
          </div>
        </SeccionFormulario>

        <SeccionFormulario icon={Truck} titulo="Entrega">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Fecha de entrega esperada">
              <input
                type="date"
                value={fechaEntrega}
                onChange={(e) => setFechaEntrega(e.target.value)}
                className={clasesInput}
              />
            </Campo>
            <Campo label="Método de envío">
              <select value={metodoEnvio} onChange={(e) => setMetodoEnvio(e.target.value)} className={clasesInput}>
                <option value="">Selecciona…</option>
                <option value="recoger_proveedor">Recoger con el proveedor</option>
                <option value="courier_local">Courier local</option>
                <option value="transporte_propio">Transporte propio</option>
                <option value="otro">Otro</option>
              </select>
            </Campo>
            <Campo label="Dirección de entrega" className="sm:col-span-2">
              <input
                value={direccionEntrega}
                onChange={(e) => setDireccionEntrega(e.target.value)}
                placeholder="CEDI, bodega…"
                className={clasesInput}
              />
            </Campo>
          </div>
        </SeccionFormulario>

        <SeccionFormulario icon={StickyNote} titulo="Notas">
          <div className="flex flex-col gap-4">
            <Campo label="Notas para el proveedor" helpText="Se compartirían con el proveedor si se le envía la orden.">
              <textarea value={notasProveedor} onChange={(e) => setNotasProveedor(e.target.value)} rows={2} className={clasesInput} />
            </Campo>
            <Campo label="Notas internas" helpText="Solo visibles dentro de ASTRO.">
              <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={clasesInput} />
            </Campo>
          </div>
        </SeccionFormulario>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 lg:sticky lg:top-6">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          <ShoppingCart className="h-4 w-4 text-primary" />
          Productos a comprar
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
              <div key={l.key} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-sm">
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
          </div>
        )}

        {error && <p className="text-xs font-medium text-destructive">{error}</p>}

        <BotonPrimario type="button" disabled={pending} onClick={crearOrden} className="w-full justify-center">
          {pending ? 'Creando…' : 'Crear orden'}
        </BotonPrimario>
      </div>
    </div>
  )
}
