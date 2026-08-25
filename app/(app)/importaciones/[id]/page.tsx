import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  ListPlus,
  Sparkles,
  ShieldCheck,
  Navigation,
  PackageCheck,
  Globe,
  Receipt,
  Banknote,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearPrecio, formatearFechaHora } from '@/lib/formato'
import { EstadoBadge, estadosImportacion } from '@/components/app/estado-badge'
import { SelectorProducto } from '@/components/app/selector-producto'
import { Campo, SeccionFormulario, BotonPrimario, BotonPeligro, clasesInput } from '@/components/app/formulario'
import {
  agregarLineaImportacion,
  autorizarImportacion,
  marcarEnTransitoImportacion,
  recibirLineaImportacion,
  nacionalizarImportacion,
  marcarFacturadaImportacion,
  marcarPagadaImportacion,
  cancelarImportacion,
  crearProductoYAgregarLineaImportacion,
} from '../acciones'

export const metadata = { title: 'Importación — ASTRO' }

type Detalle = {
  id: number
  producto_id: number | null
  descripcion: string
  cantidad: number
  valor_fob_unitario: number
  descuento_pct: number
  valor_fob_total: number
  costo_nacionalizado_unitario: number | null
  cantidad_recibida: number
  productos: { codigo: string; nombre: string } | null
}
type Importacion = {
  id: number
  estado: string
  fob_total: number
  tipo_cambio: number
  flete_internacional: number
  seguro: number
  aranceles: number
  gastos_aduana: number
  transporte_interno: number
  costo_nacionalizado_total: number | null
  notas: string | null
  condiciones_pago: string | null
  fecha_entrega_esperada: string | null
  direccion_entrega: string | null
  metodo_envio: string | null
  referencia_proveedor: string | null
  notas_proveedor: string | null
  numero_factura_proveedor: string | null
  fecha_creacion: string
  proveedores: { nombre: string } | null
}

const nombresCondicionesPago: Record<string, string> = {
  contado: 'Contado',
  '15_dias': '15 días',
  '30_dias': '30 días',
  '45_dias': '45 días',
  '60_dias': '60 días',
  '90_dias': '90 días',
  otro: 'Otro',
}
const nombresMetodoEnvio: Record<string, string> = {
  aereo: 'Aéreo',
  maritimo: 'Marítimo',
  terrestre: 'Terrestre',
  courier_local: 'Courier',
  otro: 'Otro',
}

export default async function ImportacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  if (!(await tienePermiso('importaciones', 'ver'))) redirect('/inicio')

  const { id } = await params
  const { ok, error } = await searchParams
  const importacionId = Number(id)

  const [puedeCrear, puedeAutorizar, puedeRecibir, puedeCostear, puedeFacturar, puedePagar] = await Promise.all([
    tienePermiso('importaciones', 'crear'),
    tienePermiso('importaciones', 'autorizar'),
    tienePermiso('importaciones', 'recibir'),
    tienePermiso('importaciones', 'costear'),
    tienePermiso('importaciones', 'facturar'),
    tienePermiso('importaciones', 'pagar'),
  ])

  const supabase = await createClient()
  const [{ data: importacion }, { data: detalles }] = await Promise.all([
    supabase
      .from('importaciones')
      .select(
        'id, estado, fob_total, tipo_cambio, flete_internacional, seguro, aranceles, gastos_aduana, transporte_interno, costo_nacionalizado_total, notas, condiciones_pago, fecha_entrega_esperada, direccion_entrega, metodo_envio, referencia_proveedor, notas_proveedor, numero_factura_proveedor, fecha_creacion, proveedores ( nombre )',
      )
      .eq('id', importacionId)
      .maybeSingle(),
    supabase
      .from('importacion_detalles')
      .select(
        'id, producto_id, descripcion, cantidad, valor_fob_unitario, descuento_pct, valor_fob_total, costo_nacionalizado_unitario, cantidad_recibida, productos ( codigo, nombre )',
      )
      .eq('importacion_id', importacionId)
      .order('id'),
  ])

  if (!importacion) redirect('/importaciones')
  const imp = importacion as unknown as Importacion
  const listaDetalles = (detalles ?? []) as unknown as Detalle[]

  let piezasDisponibles: { id: number; codigo: string; nombre: string; estado: string }[] = []
  let categorias: { id: number; nombre: string }[] = []
  if (imp.estado === 'borrador' && puedeCrear) {
    const [{ data: productosData }, { data: categoriasData }] = await Promise.all([
      supabase.from('productos').select('id, codigo, nombre, estado').eq('activo', true).order('codigo'),
      supabase.from('categorias').select('id, nombre').eq('activo', true).order('orden'),
    ])
    piezasDisponibles = productosData ?? []
    categorias = categoriasData ?? []
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <Link
          href="/importaciones"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a importaciones
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Embarque #{imp.id} · {imp.proveedores?.nombre ?? '—'}
          </h1>
          <EstadoBadge estado={imp.estado} config={estadosImportacion} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Creada {formatearFechaHora(imp.fecha_creacion)} · Tipo de cambio {imp.tipo_cambio}
          {imp.notas && ` · ${imp.notas}`}
        </p>
      </div>

      {(imp.condiciones_pago ||
        imp.fecha_entrega_esperada ||
        imp.direccion_entrega ||
        imp.metodo_envio ||
        imp.referencia_proveedor ||
        imp.notas_proveedor) && (
        <section className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border border-border bg-card p-5 text-sm sm:grid-cols-2">
          {imp.condiciones_pago && (
            <p>
              <span className="text-muted-foreground">Condiciones de pago</span>
              <br />
              <span className="font-medium text-foreground">
                {nombresCondicionesPago[imp.condiciones_pago] ?? imp.condiciones_pago}
              </span>
            </p>
          )}
          {imp.fecha_entrega_esperada && (
            <p>
              <span className="text-muted-foreground">Entrega esperada</span>
              <br />
              <span className="font-medium text-foreground">{imp.fecha_entrega_esperada}</span>
            </p>
          )}
          {imp.direccion_entrega && (
            <p>
              <span className="text-muted-foreground">Dirección de entrega</span>
              <br />
              <span className="font-medium text-foreground">{imp.direccion_entrega}</span>
            </p>
          )}
          {imp.metodo_envio && (
            <p>
              <span className="text-muted-foreground">Método de envío</span>
              <br />
              <span className="font-medium text-foreground">
                {nombresMetodoEnvio[imp.metodo_envio] ?? imp.metodo_envio}
              </span>
            </p>
          )}
          {imp.referencia_proveedor && (
            <p>
              <span className="text-muted-foreground">Referencia del proveedor</span>
              <br />
              <span className="font-medium text-foreground">{imp.referencia_proveedor}</span>
            </p>
          )}
          {imp.notas_proveedor && (
            <p className="sm:col-span-2">
              <span className="text-muted-foreground">Notas para el proveedor</span>
              <br />
              <span className="font-medium text-foreground">{imp.notas_proveedor}</span>
            </p>
          )}
        </section>
      )}

      {ok && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{ok}</span>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <section className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-semibold">Descripción</th>
              <th className="px-4 py-2 font-semibold">Cantidad</th>
              <th className="px-4 py-2 font-semibold">FOB unit.</th>
              <th className="px-4 py-2 font-semibold">Desc.</th>
              <th className="px-4 py-2 font-semibold">FOB total</th>
              <th className="px-4 py-2 font-semibold">Recibido</th>
              <th className="px-4 py-2 font-semibold">Costo nacionalizado</th>
            </tr>
          </thead>
          <tbody>
            {listaDetalles.map((d) => (
              <tr key={d.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 text-foreground">
                  {d.descripcion}
                  {d.productos && <span className="ml-1.5 text-xs text-muted-foreground">({d.productos.codigo})</span>}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{d.cantidad}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{formatearPrecio(d.valor_fob_unitario)}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {d.descuento_pct > 0 ? `${d.descuento_pct}%` : '—'}
                </td>
                <td className="px-4 py-2.5 font-semibold text-foreground">{formatearPrecio(d.valor_fob_total)}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {d.cantidad_recibida} / {d.cantidad}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {d.costo_nacionalizado_unitario != null ? formatearPrecio(d.costo_nacionalizado_unitario) : '—'}
                </td>
              </tr>
            ))}
            {listaDetalles.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                  Sin líneas todavía
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-border">
              <td colSpan={4} className="px-4 py-2.5 text-right text-sm font-semibold text-foreground">
                Total FOB
              </td>
              <td colSpan={3} className="px-4 py-2.5 text-sm font-bold text-foreground">
                {formatearPrecio(imp.fob_total)}
                {imp.costo_nacionalizado_total != null && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    · nacionalizado {formatearPrecio(imp.costo_nacionalizado_total)}
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {imp.estado === 'borrador' && puedeCrear && (
        <SeccionFormulario
          icon={ListPlus}
          titulo="Agregar línea — pieza del maestro"
          descripcion="Busca por código o nombre. Si la pieza no existe todavía, créala en el bloque de abajo."
        >
          <form action={agregarLineaImportacion} className="flex flex-col gap-4">
            <input type="hidden" name="importacion_id" value={imp.id} />
            <Campo label="Pieza">
              <SelectorProducto productos={piezasDisponibles} name="producto_id" />
            </Campo>
            <Campo label="Descripción" helpText="Opcional si eliges una pieza arriba.">
              <input name="descripcion" className={clasesInput} />
            </Campo>
            <div className="grid grid-cols-3 gap-4">
              <Campo label="Cantidad" required>
                <input name="cantidad" type="number" step="0.001" min="0.001" required className={clasesInput} />
              </Campo>
              <Campo label="Valor FOB unitario" required>
                <input name="valor_fob_unitario" type="number" step="0.01" min="0" required className={clasesInput} />
              </Campo>
              <Campo label="% descuento">
                <input name="descuento_pct" type="number" step="0.01" min="0" max="100" className={clasesInput} />
              </Campo>
            </div>
            <div>
              <BotonPrimario>Agregar</BotonPrimario>
            </div>
          </form>

          <details className="mt-5 border-t border-border pt-4">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              La pieza no existe — crearla y agregarla de una vez
            </summary>
            <form action={crearProductoYAgregarLineaImportacion} className="mt-3 flex flex-col gap-4">
              <input type="hidden" name="importacion_id" value={imp.id} />
              <Campo label="Nombre de la pieza" required>
                <input name="nombre" required className={clasesInput} />
              </Campo>
              <Campo label="Categoría" required>
                <select name="categoria_id" required defaultValue="" className={clasesInput}>
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
              <div className="grid grid-cols-2 gap-4">
                <Campo label="Tipo de inventario">
                  <select name="modo_inventario" defaultValue="pieza_unica" className={clasesInput}>
                    <option value="pieza_unica">Pieza única</option>
                    <option value="por_cantidad">Referencia por cantidad</option>
                  </select>
                </Campo>
                <Campo label="Cantidad inicial" helpText="Solo si es por cantidad.">
                  <input name="cantidad_inicial_producto" type="number" step="1" min="1" className={clasesInput} />
                </Campo>
              </div>
              <p className="text-xs text-muted-foreground">
                Queda como borrador en Producción, origen importado — el costo real se le asigna al
                nacionalizar el embarque.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <Campo label="Cantidad a importar" required>
                  <input name="cantidad" type="number" step="0.001" min="0.001" required className={clasesInput} />
                </Campo>
                <Campo label="Valor FOB unitario" required>
                  <input name="valor_fob_unitario" type="number" step="0.01" min="0" required className={clasesInput} />
                </Campo>
              </div>
              <div>
                <BotonPrimario>Crear pieza y agregar</BotonPrimario>
              </div>
            </form>
          </details>
        </SeccionFormulario>
      )}

      {imp.estado === 'borrador' && puedeAutorizar && (
        <SeccionFormulario icon={ShieldCheck} titulo="Autorización">
          <div className="flex flex-wrap items-center gap-3">
            <form action={autorizarImportacion}>
              <input type="hidden" name="importacion_id" value={imp.id} />
              <BotonPrimario>Autorizar importación</BotonPrimario>
            </form>
            <details className="flex-1">
              <summary className="cursor-pointer list-none text-sm font-semibold text-destructive">
                Cancelar
              </summary>
              <form action={cancelarImportacion} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                <input type="hidden" name="importacion_id" value={imp.id} />
                <Campo label="Motivo" required className="flex-1">
                  <input name="motivo" required className={clasesInput} />
                </Campo>
                <BotonPeligro>Confirmar cancelación</BotonPeligro>
              </form>
            </details>
          </div>
        </SeccionFormulario>
      )}

      {imp.estado === 'autorizada' && puedeAutorizar && (
        <SeccionFormulario icon={Navigation} titulo="Tránsito">
          <div className="flex flex-wrap items-center gap-3">
            <form action={marcarEnTransitoImportacion}>
              <input type="hidden" name="importacion_id" value={imp.id} />
              <BotonPrimario>Marcar en tránsito</BotonPrimario>
            </form>
            <details className="flex-1">
              <summary className="cursor-pointer list-none text-sm font-semibold text-destructive">
                Cancelar
              </summary>
              <form action={cancelarImportacion} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                <input type="hidden" name="importacion_id" value={imp.id} />
                <Campo label="Motivo" required className="flex-1">
                  <input name="motivo" required className={clasesInput} />
                </Campo>
                <BotonPeligro>Confirmar cancelación</BotonPeligro>
              </form>
            </details>
          </div>
        </SeccionFormulario>
      )}

      {(imp.estado === 'autorizada' || imp.estado === 'en_transito' || imp.estado === 'recibida_parcial') &&
        puedeRecibir && (
          <SeccionFormulario icon={PackageCheck} titulo="Recibir mercadería">
            <div className="flex flex-col gap-3">
              {listaDetalles
                .filter((d) => d.cantidad_recibida < d.cantidad)
                .map((d) => (
                  <form
                    key={d.id}
                    action={recibirLineaImportacion}
                    className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-secondary/30 p-3"
                  >
                    <input type="hidden" name="importacion_id" value={imp.id} />
                    <input type="hidden" name="detalle_id" value={d.id} />
                    <div className="min-w-40 flex-1 text-sm text-foreground">
                      {d.descripcion}
                      <p className="text-xs text-muted-foreground">Pendiente: {d.cantidad - d.cantidad_recibida}</p>
                    </div>
                    <input
                      name="cantidad_recibida"
                      type="number"
                      step="0.001"
                      min="0.001"
                      required
                      placeholder="Cantidad recibida"
                      className="w-40 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition-colors focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring/10"
                    />
                    <BotonPrimario className="px-4 py-2 text-xs">Recibir</BotonPrimario>
                  </form>
                ))}
            </div>
          </SeccionFormulario>
        )}

      {imp.estado === 'recibida_total' && puedeCostear && (
        <SeccionFormulario
          icon={Globe}
          titulo="Nacionalizar — distribuir costos por valor FOB"
          descripcion={`Cada línea recibe una parte de estos montos proporcional a su participación en el FOB total (${formatearPrecio(imp.fob_total)}).`}
        >
          <form action={nacionalizarImportacion} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input type="hidden" name="importacion_id" value={imp.id} />
            <Campo label="Flete internacional">
              <input name="flete_internacional" type="number" step="0.01" min="0" className={clasesInput} />
            </Campo>
            <Campo label="Seguro">
              <input name="seguro" type="number" step="0.01" min="0" className={clasesInput} />
            </Campo>
            <Campo label="Aranceles">
              <input name="aranceles" type="number" step="0.01" min="0" className={clasesInput} />
            </Campo>
            <Campo label="Gastos de aduana">
              <input name="gastos_aduana" type="number" step="0.01" min="0" className={clasesInput} />
            </Campo>
            <Campo label="Transporte interno">
              <input name="transporte_interno" type="number" step="0.01" min="0" className={clasesInput} />
            </Campo>
            <div className="flex items-end sm:col-span-2">
              <BotonPrimario>Nacionalizar</BotonPrimario>
            </div>
          </form>
        </SeccionFormulario>
      )}

      {imp.estado === 'nacionalizada' && puedeFacturar && (
        <SeccionFormulario icon={Receipt} titulo="Facturar">
          <form action={marcarFacturadaImportacion} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="importacion_id" value={imp.id} />
            <Campo label="Número de factura" required className="flex-1">
              <input name="numero_factura" required className={clasesInput} />
            </Campo>
            <BotonPrimario>Marcar facturada</BotonPrimario>
          </form>
        </SeccionFormulario>
      )}

      {imp.estado === 'facturada' && puedePagar && (
        <SeccionFormulario icon={Banknote} titulo="Pago">
          <p className="mb-3 text-sm text-muted-foreground">Factura {imp.numero_factura_proveedor}</p>
          <form action={marcarPagadaImportacion}>
            <input type="hidden" name="importacion_id" value={imp.id} />
            <BotonPrimario>Marcar pagada</BotonPrimario>
          </form>
        </SeccionFormulario>
      )}
    </main>
  )
}
