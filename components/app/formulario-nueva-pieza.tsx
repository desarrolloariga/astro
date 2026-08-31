'use client'

import { useMemo, useState } from 'react'
import { Tag, Boxes, ClipboardList, Layers, Calculator, ImagePlus } from 'lucide-react'
import { crearPieza } from '@/app/(app)/produccion/acciones'
import { formatearPrecio } from '@/lib/formato'
import { Campo, SeccionFormulario, BotonPrimario, BotonSecundario, clasesInput } from '@/components/app/formulario'

type Categoria = { id: number; nombre: string; grupo: string }
type Material = { id: number; nombre: string }
type Proveedor = { id: number; nombre: string }
/** Un factor por clave y, opcionalmente, por categoría — la excepción de categoría gana sobre el global. */
type ParametroPrecio = { clave: string; categoria_id: number | null; valor_pct: number }
type Cedi = { id: number; nombre: string }

function buscarFactor(parametros: ParametroPrecio[], clave: string, categoriaId: number | null): number {
  const porCategoria = categoriaId != null ? parametros.find((p) => p.clave === clave && p.categoria_id === categoriaId) : undefined
  if (porCategoria) return porCategoria.valor_pct
  return parametros.find((p) => p.clave === clave && p.categoria_id === null)?.valor_pct ?? 0
}

export function FormularioNuevaPieza({
  categorias,
  materiales,
  proveedores,
  parametrosPrecio,
  cedis,
}: {
  categorias: Categoria[]
  materiales: Material[]
  proveedores: Proveedor[]
  parametrosPrecio: ParametroPrecio[]
  cedis: Cedi[]
}) {
  const [categoriaId, setCategoriaId] = useState('')
  const [origen, setOrigen] = useState('local')
  const [costo, setCosto] = useState('')
  const [modoInventario, setModoInventario] = useState('pieza_unica')

  const grupo = categorias.find((c) => String(c.id) === categoriaId)?.grupo ?? 'joyeria'

  // Vista previa client-side de la misma cascada que corre en el
  // servidor (fn_calcular_precio) — el valor real y auditable se
  // calcula y guarda ahí; esto es solo una estimación en pantalla.
  // Usa el margen/comisión de la categoría elegida si tiene uno
  // propio (igual que el servidor: categoría gana sobre global).
  const estimado = useMemo(() => {
    const costoNum = Number(costo.replace(',', '.'))
    if (!Number.isFinite(costoNum) || costoNum <= 0) return null

    const catId = categoriaId ? Number(categoriaId) : null
    const factorEnvio = buscarFactor(parametrosPrecio, 'factor_envio', catId)
    const factorEmpaque = buscarFactor(parametrosPrecio, 'factor_empaque', catId)
    const factorMargen = buscarFactor(parametrosPrecio, 'factor_margen_empresa', catId)
    const factorComision = buscarFactor(parametrosPrecio, 'factor_comision_embajador', catId)
    const factorImpuesto = buscarFactor(parametrosPrecio, 'factor_impuesto', catId)

    const costoLogistico = costoNum * (1 + (factorEnvio + factorEmpaque) / 100)
    const precioAntesEmbajador = costoLogistico / (1 - factorMargen / 100)
    const precioSinImpuesto = precioAntesEmbajador * (1 + factorComision / 100)
    const impuesto = precioSinImpuesto * (factorImpuesto / 100)
    return { precioFinal: precioSinImpuesto + impuesto }
  }, [costo, categoriaId, parametrosPrecio])

  return (
    <form action={crearPieza} className="flex flex-col gap-6">
      <SeccionFormulario icon={Tag} titulo="Identificación" descripcion="El código se genera automáticamente al guardar.">
        <div className="grid grid-cols-1 gap-4">
          <Campo label="Nombre" required>
            <input name="nombre" required placeholder="Anillo solitario diamante" className={clasesInput} />
          </Campo>
          <Campo label="Descripción">
            <textarea
              name="descripcion"
              rows={3}
              placeholder="Detalles del artículo visibles en el catálogo…"
              className={clasesInput}
            />
          </Campo>
        </div>
      </SeccionFormulario>

      <SeccionFormulario icon={Boxes} titulo="Inventario">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Tipo de inventario">
            <select
              name="modo_inventario"
              className={clasesInput}
              defaultValue="pieza_unica"
              onChange={(e) => setModoInventario(e.target.value)}
            >
              <option value="pieza_unica">Pieza única</option>
              <option value="por_cantidad">Referencia por cantidad</option>
            </select>
          </Campo>
          {modoInventario === 'por_cantidad' && (
            <Campo label="Cantidad inicial" required>
              <input
                name="cantidad_inicial"
                type="number"
                step="1"
                min="1"
                required
                placeholder="10"
                className={clasesInput}
              />
            </Campo>
          )}
        </div>
      </SeccionFormulario>

      <SeccionFormulario icon={ClipboardList} titulo="Ficha técnica">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Categoría" required>
            <select
              name="categoria_id"
              required
              className={clasesInput}
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
          </Campo>
          <Campo label="Material">
            <select name="material_id" className={clasesInput} defaultValue="">
              <option value="">Selecciona… (opcional)</option>
              {materiales.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </Campo>

          {grupo === 'joyeria' && (
            <>
              <Campo label="Peso (gramos)">
                <input name="peso_gramos" type="number" step="0.001" min="0" placeholder="3.250" className={clasesInput} />
              </Campo>
              <Campo label="Kilataje">
                <input name="kilataje" placeholder="14k" className={clasesInput} />
              </Campo>
              <Campo label="Piedras" className="sm:col-span-2">
                <input
                  name="piedras"
                  placeholder="Diamante 0.25 ct, zafiros laterales…"
                  className={clasesInput}
                />
              </Campo>
            </>
          )}

          {grupo === 'cosmetico' && (
            <>
              <Campo label="Volumen (ml)">
                <input name="volumen_ml" type="number" step="1" min="0" placeholder="100" className={clasesInput} />
              </Campo>
              <Campo label="Fragancia">
                <input name="fragancia" placeholder="Floral" className={clasesInput} />
              </Campo>
            </>
          )}

          {grupo === 'lenceria' && (
            <>
              <Campo label="Talla">
                <input name="talla" placeholder="M" className={clasesInput} />
              </Campo>
              <Campo label="Color">
                <input name="color" placeholder="Rojo" className={clasesInput} />
              </Campo>
              <Campo label="Tela">
                <input name="tela" placeholder="Encaje" className={clasesInput} />
              </Campo>
            </>
          )}
        </div>
      </SeccionFormulario>

      <SeccionFormulario icon={Layers} titulo="Clasificación y logística">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Marca">
            <input name="marca" placeholder="Marca propia, licencia…" className={clasesInput} />
          </Campo>
          <Campo label="Colección">
            <input name="coleccion" placeholder="Primavera 2026, Clásica…" className={clasesInput} />
          </Campo>
          <Campo label="Código de barras / SKU externo">
            <input name="codigo_barras" placeholder="7501234567890" className={clasesInput} />
          </Campo>
          <Campo label="Etiquetas" helpText="Separadas por coma.">
            <input name="etiquetas" placeholder="novedad, edición limitada, dorado" className={clasesInput} />
          </Campo>
          <Campo label="Proveedor">
            <select name="proveedor_id" defaultValue="" className={clasesInput}>
              <option value="">Sin proveedor asignado</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Punto de reorden">
            <input
              name="punto_reorden"
              type="number"
              step="1"
              min="0"
              placeholder="Unidades mínimas antes de reabastecer"
              className={clasesInput}
            />
          </Campo>
        </div>
      </SeccionFormulario>

      <SeccionFormulario icon={Calculator} titulo="Costos y precio">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Origen">
            <select
              name="origen"
              className={clasesInput}
              defaultValue="local"
              onChange={(e) => setOrigen(e.target.value)}
            >
              <option value="local">Local</option>
              <option value="importado">Importado</option>
            </select>
          </Campo>
          <Campo label="Costo (GTQ)" helpText="Solo visible para administración y contabilidad.">
            <input
              name="costo_produccion"
              type="number"
              step="0.01"
              min="0"
              placeholder="1500.00"
              className={clasesInput}
              onChange={(e) => setCosto(e.target.value)}
            />
          </Campo>
          <div className="flex flex-col gap-1.5 rounded-lg border border-primary/15 bg-primary/5 px-4 py-3 sm:col-span-2">
            <span className="text-sm font-medium text-foreground">Precio de venta</span>
            {estimado ? (
              <span className="text-xl font-bold text-primary">≈ {formatearPrecio(estimado.precioFinal)}</span>
            ) : (
              <span className="text-sm text-muted-foreground">Indica el costo para ver el estimado</span>
            )}
            <span className="text-xs text-muted-foreground">
              Se calcula automáticamente a partir del costo — el valor final y auditable se confirma
              al guardar.
            </span>
          </div>
        </div>
      </SeccionFormulario>

      <SeccionFormulario icon={ImagePlus} titulo="Galería de fotos">
        <Campo label="Fotos del artículo" helpText="La primera será la principal. Se requiere al menos una foto para publicar al CEDI.">
          <input
            name="fotos"
            type="file"
            accept="image/*"
            multiple
            className="w-full rounded-lg border border-dashed border-input bg-background px-3 py-4 text-sm text-muted-foreground transition-colors hover:border-primary/40 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground hover:file:opacity-90"
          />
        </Campo>
      </SeccionFormulario>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {cedis.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            Bodega destino
            <select name="tienda_destino_id" defaultValue="" className={clasesInput}>
              <option value="">Cualquier CEDI activo</option>
              {cedis.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <BotonSecundario type="submit" name="accion" value="borrador">
          Guardar borrador
        </BotonSecundario>
        <BotonPrimario type="submit" name="accion" value="publicar">
          Guardar y publicar al CEDI
        </BotonPrimario>
      </div>
    </form>
  )
}
