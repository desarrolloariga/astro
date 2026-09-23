'use client'

import { useState, useTransition } from 'react'
import { Scale, Trash2, PlusCircle, Sparkles } from 'lucide-react'
import { SelectorProducto, type ProductoSeleccionable } from '@/components/app/selector-producto'
import { Campo, SeccionFormulario, BotonPrimario, clasesInput } from '@/components/app/formulario'
import { formatearNumero, formatearPrecio } from '@/lib/formato'
import { crearRecepcionMetalConLineas, type LineaRecepcionMetal } from '@/app/(app)/recepcion-metal/acciones'

const NIVELES_GANANCIA = [
  { valor: 'introduccion', etiqueta: 'Introducción' },
  { valor: 'socio_comercial', etiqueta: 'Socio Comercial' },
  { valor: 'importacion', etiqueta: 'Importación' },
  { valor: 'descuento', etiqueta: 'Descuento' },
]

type Categoria = { id: number; nombre: string }
type Proveedor = { id: number; nombre: string }

type LineaCarrito = LineaRecepcionMetal & { key: string }

export function FormularioRecepcionMetal({
  proveedores,
  productos,
  categorias,
}: {
  proveedores: Proveedor[]
  productos: ProductoSeleccionable[]
  categorias: Categoria[]
}) {
  const [proveedorId, setProveedorId] = useState('')
  const [pesoTotal, setPesoTotal] = useState('')
  const [cantidadTotal, setCantidadTotal] = useState('')
  const [notas, setNotas] = useState('')

  const [modoNuevo, setModoNuevo] = useState(false)
  const [seleccionActual, setSeleccionActual] = useState<ProductoSeleccionable | null>(null)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [nivelGanancia, setNivelGanancia] = useState('socio_comercial')
  const [categoriaId, setCategoriaId] = useState('')
  const [referenciaProveedorLinea, setReferenciaProveedorLinea] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [peso, setPeso] = useState('')
  const [costo, setCosto] = useState('')

  const [carrito, setCarrito] = useState<LineaCarrito[]>([])
  const [selectorKey, setSelectorKey] = useState(0)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function limpiarLinea() {
    setSeleccionActual(null)
    setNombreNuevo('')
    setCategoriaId('')
    setReferenciaProveedorLinea('')
    setCantidad('')
    setPeso('')
    setCosto('')
    setSelectorKey((k) => k + 1)
  }

  function agregarAlCarrito() {
    const cant = Number(cantidad.replace(',', '.'))
    const p = Number(peso.replace(',', '.'))
    const cu = Number(costo.replace(',', '.'))
    if (!Number.isFinite(cant) || cant <= 0 || !Number.isFinite(p) || p <= 0 || !Number.isFinite(cu) || cu < 0) return

    if (modoNuevo) {
      if (!nombreNuevo.trim()) return
      setCarrito((prev) => [
        ...prev,
        {
          key: `nuevo-${Date.now()}`,
          producto_id: null,
          producto_nuevo: {
            nombre: nombreNuevo.trim(),
            nivel_ganancia: nivelGanancia,
            categoria_id: categoriaId ? Number(categoriaId) : null,
            referencia_proveedor: referenciaProveedorLinea.trim() || null,
          },
          codigo: '(nuevo)',
          nombre: nombreNuevo.trim(),
          cantidad: cant,
          peso_gramos: p,
          costo_unitario: cu,
        },
      ])
    } else {
      if (!seleccionActual) return
      setCarrito((prev) => [
        ...prev,
        {
          key: `${seleccionActual.id}-${Date.now()}`,
          producto_id: seleccionActual.id,
          producto_nuevo: null,
          codigo: seleccionActual.codigo,
          nombre: seleccionActual.nombre,
          cantidad: cant,
          peso_gramos: p,
          costo_unitario: cu,
        },
      ])
    }
    limpiarLinea()
  }

  function quitar(key: string) {
    setCarrito((prev) => prev.filter((l) => l.key !== key))
  }

  const sumaCantidad = carrito.reduce((acc, l) => acc + l.cantidad, 0)
  const sumaPeso = carrito.reduce((acc, l) => acc + l.peso_gramos, 0)
  const totalCosto = carrito.reduce((acc, l) => acc + l.cantidad * l.costo_unitario, 0)
  const pesoTotalNum = Number(pesoTotal.replace(',', '.')) || 0
  const cantidadTotalNum = Number(cantidadTotal.replace(',', '.')) || 0
  const cuadraCantidad = carrito.length > 0 && sumaCantidad === cantidadTotalNum
  const cuadraPeso = carrito.length > 0 && sumaPeso === pesoTotalNum

  function confirmar() {
    setError('')
    if (!pesoTotalNum || pesoTotalNum <= 0) {
      setError('Indica el peso total recibido')
      return
    }
    if (!cantidadTotalNum || cantidadTotalNum <= 0) {
      setError('Indica la cantidad total de piezas')
      return
    }
    if (carrito.length === 0) {
      setError('Agrega al menos un artículo')
      return
    }
    startTransition(async () => {
      await crearRecepcionMetalConLineas(
        {
          proveedor_id: proveedorId ? Number(proveedorId) : null,
          peso_total_gramos: pesoTotalNum,
          cantidad_total_piezas: cantidadTotalNum,
          notas: notas || null,
        },
        carrito.map(({ key: _key, ...linea }) => linea),
      )
    })
  }

  const puedeAgregar =
    (modoNuevo ? nombreNuevo.trim() !== '' : seleccionActual != null) &&
    Number(cantidad) > 0 &&
    Number(peso) > 0 &&
    costo !== '' &&
    Number(costo) >= 0

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_420px] lg:items-start">
      <div className="flex flex-col gap-6">
        <SeccionFormulario icon={Scale} titulo="Cabecera de la recepción">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo label="Peso total recibido (gramos)" required>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={pesoTotal}
                  onChange={(e) => setPesoTotal(e.target.value)}
                  required
                  className={clasesInput}
                />
              </Campo>
              <Campo label="Cantidad total de piezas" required>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={cantidadTotal}
                  onChange={(e) => setCantidadTotal(e.target.value)}
                  required
                  className={clasesInput}
                />
              </Campo>
            </div>
            <Campo label="Proveedor" helpText="Opcional — compra a particulares o fundición propia no necesita proveedor.">
              <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className={clasesInput}>
                <option value="">Sin proveedor</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Notas">
              <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={clasesInput} />
            </Campo>
          </div>
        </SeccionFormulario>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 lg:sticky lg:top-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <Scale className="h-4 w-4 text-primary" />
            Artículos recibidos
          </h2>
          <button
            type="button"
            onClick={() => {
              setModoNuevo((v) => !v)
              limpiarLinea()
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {modoNuevo ? 'Elegir existente' : 'Crear nuevo'}
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {modoNuevo ? (
            <>
              <input
                placeholder="Nombre del artículo nuevo"
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={nivelGanancia}
                  onChange={(e) => setNivelGanancia(e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                >
                  {NIVELES_GANANCIA.map((n) => (
                    <option key={n.valor} value={n.valor}>
                      {n.etiqueta}
                    </option>
                  ))}
                </select>
                <select
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="">Categoría (opcional)</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <input
                placeholder="Referencia del proveedor (opcional)"
                value={referenciaProveedorLinea}
                onChange={(e) => setReferenciaProveedorLinea(e.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </>
          ) : (
            <SelectorProducto
              key={selectorKey}
              productos={productos}
              name="producto_id_recepcion"
              onSeleccionar={setSeleccionActual}
            />
          )}
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
              step="0.001"
              min="0.001"
              placeholder="Peso (g)"
              value={peso}
              onChange={(e) => setPeso(e.target.value)}
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
          </div>
          <button
            type="button"
            disabled={!puedeAgregar}
            onClick={agregarAlCarrito}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PlusCircle className="h-4 w-4" />
            Agregar artículo
          </button>
        </div>

        {carrito.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            {carrito.map((l) => (
              <div key={l.key} className="flex items-center justify-between gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">
                    {l.codigo === '(nuevo)' ? `${l.nombre} (nuevo)` : `${l.codigo} — ${l.nombre}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatearNumero(l.cantidad)} pza · {formatearNumero(l.peso_gramos)} g ·{' '}
                    {formatearPrecio(l.costo_unitario)} c/u
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => quitar(l.key)}
                  className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                  aria-label="Quitar artículo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="border-t border-border pt-2 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Piezas</span>
                <span className={cuadraCantidad ? 'font-semibold text-primary' : 'font-semibold text-destructive'}>
                  {formatearNumero(sumaCantidad)} / {formatearNumero(cantidadTotalNum)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Peso</span>
                <span className={cuadraPeso ? 'font-semibold text-primary' : 'font-semibold text-destructive'}>
                  {formatearNumero(sumaPeso)} g / {formatearNumero(pesoTotalNum)} g
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between border-t border-border pt-1 text-sm font-bold text-foreground">
                <span>Costo total</span>
                <span>{formatearPrecio(totalCosto)}</span>
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-xs font-medium text-destructive">{error}</p>}

        <BotonPrimario type="button" disabled={pending} onClick={confirmar} className="w-full justify-center">
          {pending ? 'Creando…' : 'Crear recepción'}
        </BotonPrimario>
        <p className="text-center text-[11px] text-muted-foreground">
          Se puede revisar el cuadre antes de confirmar — confirmar y publicar al CEDI es un paso
          aparte, después de crear.
        </p>
      </div>
    </div>
  )
}
