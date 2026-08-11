'use client'

import { useMemo, useRef, useState } from 'react'
import { crearPieza } from '@/app/(app)/produccion/acciones'
import { formatearPrecio } from '@/lib/formato'

const clasesCampo =
  'rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25'

type Categoria = { id: number; nombre: string; grupo: string }
type Material = { id: number; nombre: string }
type PoliticaMargen = { categoria_id: number | null; origen: string; margen_pct: number }
type Cedi = { id: number; nombre: string }

export function FormularioNuevaPieza({
  categorias,
  materiales,
  politicas,
  pctEmpaque,
  pctFleteImportado,
  cedis,
}: {
  categorias: Categoria[]
  materiales: Material[]
  politicas: PoliticaMargen[]
  pctEmpaque: number
  pctFleteImportado: number
  cedis: Cedi[]
}) {
  const [categoriaId, setCategoriaId] = useState('')
  const [origen, setOrigen] = useState('local')
  const [costo, setCosto] = useState('')
  const [modoInventario, setModoInventario] = useState('pieza_unica')
  const precioVentaRef = useRef<HTMLInputElement>(null)

  const grupo = categorias.find((c) => String(c.id) === categoriaId)?.grupo ?? 'joyeria'

  const sugerencia = useMemo(() => {
    const costoNum = Number(costo.replace(',', '.'))
    if (!Number.isFinite(costoNum) || costoNum <= 0) return null

    const catId = categoriaId ? Number(categoriaId) : null
    const politica =
      politicas.find((p) => p.origen === origen && p.categoria_id === catId) ??
      politicas.find((p) => p.origen === origen && p.categoria_id === null)
    if (!politica) return null

    const costoTotal =
      costoNum * (1 + pctEmpaque / 100) * (1 + (origen === 'importado' ? pctFleteImportado / 100 : 0))
    const precioSugerido = costoTotal * (1 + politica.margen_pct / 100)
    return { precioSugerido, margenPct: politica.margen_pct }
  }, [costo, categoriaId, origen, politicas, pctEmpaque, pctFleteImportado])

  return (
    <form action={crearPieza} className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Identificación
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Nombre *</span>
            <input
              name="nombre"
              required
              placeholder="Anillo solitario diamante"
              className={clasesCampo}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Descripción</span>
            <textarea
              name="descripcion"
              rows={3}
              placeholder="Detalles del artículo visibles en el catálogo…"
              className={clasesCampo}
            />
          </label>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          El código se genera automáticamente al guardar.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Inventario
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Tipo de inventario</span>
            <select
              name="modo_inventario"
              className={clasesCampo}
              defaultValue="pieza_unica"
              onChange={(e) => setModoInventario(e.target.value)}
            >
              <option value="pieza_unica">Pieza única</option>
              <option value="por_cantidad">Referencia por cantidad</option>
            </select>
          </label>
          {modoInventario === 'por_cantidad' && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Cantidad inicial *</span>
              <input
                name="cantidad_inicial"
                type="number"
                step="1"
                min="1"
                required
                placeholder="10"
                className={clasesCampo}
              />
            </label>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Ficha técnica
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Categoría *</span>
            <select
              name="categoria_id"
              required
              className={clasesCampo}
              defaultValue=""
              onChange={(e) => setCategoriaId(e.target.value)}
            >
              <option value="" disabled>
                Selecciona…
              </option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Material</span>
            <select name="material_id" className={clasesCampo} defaultValue="">
              <option value="">Selecciona… (opcional)</option>
              {materiales.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </label>

          {grupo === 'joyeria' && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Peso (gramos)</span>
                <input
                  name="peso_gramos"
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="3.250"
                  className={clasesCampo}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Kilataje</span>
                <input name="kilataje" placeholder="14k" className={clasesCampo} />
              </label>
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-sm font-medium text-foreground">Piedras</span>
                <input
                  name="piedras"
                  placeholder="Diamante 0.25 ct, zafiros laterales…"
                  className={clasesCampo}
                />
              </label>
            </>
          )}

          {grupo === 'cosmetico' && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Volumen (ml)</span>
                <input
                  name="volumen_ml"
                  type="number"
                  step="1"
                  min="0"
                  placeholder="100"
                  className={clasesCampo}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Fragancia</span>
                <input name="fragancia" placeholder="Floral" className={clasesCampo} />
              </label>
            </>
          )}

          {grupo === 'lenceria' && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Talla</span>
                <input name="talla" placeholder="M" className={clasesCampo} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Color</span>
                <input name="color" placeholder="Rojo" className={clasesCampo} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Tela</span>
                <input name="tela" placeholder="Encaje" className={clasesCampo} />
              </label>
            </>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Costos y precio
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Origen</span>
            <select
              name="origen"
              className={clasesCampo}
              defaultValue="local"
              onChange={(e) => setOrigen(e.target.value)}
            >
              <option value="local">Local</option>
              <option value="importado">Importado</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Costo (GTQ)</span>
            <input
              name="costo_produccion"
              type="number"
              step="0.01"
              min="0"
              placeholder="1500.00"
              className={clasesCampo}
              onChange={(e) => setCosto(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              Solo visible para administración y contabilidad.
            </span>
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-sm font-medium text-foreground">Precio de venta (GTQ) *</span>
            <input
              ref={precioVentaRef}
              name="precio_venta"
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="4990.00"
              className={clasesCampo}
            />
            {sugerencia && (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                Precio sugerido ({sugerencia.margenPct}% de margen):{' '}
                <span className="font-semibold text-foreground">
                  {formatearPrecio(sugerencia.precioSugerido)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (precioVentaRef.current) {
                      precioVentaRef.current.value = sugerencia.precioSugerido.toFixed(2)
                    }
                  }}
                  className="rounded-full border border-border px-2 py-0.5 font-semibold text-primary hover:bg-secondary"
                >
                  Usar
                </button>
              </span>
            )}
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Galería de fotos
        </h2>
        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            Fotos del artículo (la primera será la principal)
          </span>
          <input
            name="fotos"
            type="file"
            accept="image/*"
            multiple
            className="rounded-lg border border-dashed border-input bg-background px-3 py-4 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground hover:file:opacity-90"
          />
          <span className="text-xs text-muted-foreground">
            Se requiere al menos una foto para publicar al CEDI.
          </span>
        </label>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {cedis.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            Bodega destino
            <select name="tienda_destino_id" defaultValue="" className={clasesCampo}>
              <option value="">Cualquier CEDI activo</option>
              {cedis.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="submit"
          name="accion"
          value="borrador"
          className="rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
        >
          Guardar borrador
        </button>
        <button
          type="submit"
          name="accion"
          value="publicar"
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          Guardar y publicar al CEDI
        </button>
      </div>
    </form>
  )
}
