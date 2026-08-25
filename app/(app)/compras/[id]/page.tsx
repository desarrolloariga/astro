import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, ArrowLeft, ListPlus, Sparkles, ShieldCheck, PackageCheck, Receipt, Banknote } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearPrecio, formatearFechaHora } from '@/lib/formato'
import { EstadoBadge, estadosCompra } from '@/components/app/estado-badge'
import { SelectorProducto } from '@/components/app/selector-producto'
import { Campo, SeccionFormulario, BotonPrimario, BotonPeligro, clasesInput } from '@/components/app/formulario'
import {
  agregarLineaCompra,
  autorizarOrdenCompra,
  recibirLineaCompra,
  marcarFacturadaCompra,
  marcarPagadaCompra,
  cancelarOrdenCompra,
  crearProductoYAgregarLineaCompra,
} from '../acciones'

export const metadata = { title: 'Orden de compra — ASTRO' }

type Detalle = {
  id: number
  producto_id: number | null
  descripcion: string
  cantidad: number
  costo_unitario: number
  descuento_pct: number
  subtotal: number
  cantidad_recibida: number
  productos: { codigo: string; nombre: string } | null
}
type Orden = {
  id: number
  estado: string
  subtotal: number
  total: number
  notas: string | null
  condiciones_pago: string | null
  fecha_entrega_esperada: string | null
  direccion_entrega: string | null
  metodo_envio: string | null
  referencia_proveedor: string | null
  notas_proveedor: string | null
  numero_factura_proveedor: string | null
  fecha_creacion: string
  fecha_autorizacion: string | null
  fecha_recepcion_total: string | null
  fecha_facturacion: string | null
  fecha_pago: string | null
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
  recoger_proveedor: 'Recoger con el proveedor',
  courier_local: 'Courier local',
  transporte_propio: 'Transporte propio',
  otro: 'Otro',
}

export default async function OrdenCompraPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  if (!(await tienePermiso('compras', 'ver'))) redirect('/inicio')

  const { id } = await params
  const { ok, error } = await searchParams
  const ordenId = Number(id)

  const [puedeCrear, puedeAutorizar, puedeRecibir, puedeFacturar, puedePagar] = await Promise.all([
    tienePermiso('compras', 'crear'),
    tienePermiso('compras', 'autorizar'),
    tienePermiso('compras', 'recibir'),
    tienePermiso('compras', 'facturar'),
    tienePermiso('compras', 'pagar'),
  ])

  const supabase = await createClient()
  const [{ data: orden }, { data: detalles }] = await Promise.all([
    supabase
      .from('ordenes_compra')
      .select(
        'id, estado, subtotal, total, notas, condiciones_pago, fecha_entrega_esperada, direccion_entrega, metodo_envio, referencia_proveedor, notas_proveedor, numero_factura_proveedor, fecha_creacion, fecha_autorizacion, fecha_recepcion_total, fecha_facturacion, fecha_pago, proveedores ( nombre )',
      )
      .eq('id', ordenId)
      .maybeSingle(),
    supabase
      .from('orden_compra_detalles')
      .select('id, producto_id, descripcion, cantidad, costo_unitario, descuento_pct, subtotal, cantidad_recibida, productos ( codigo, nombre )')
      .eq('orden_compra_id', ordenId)
      .order('id'),
  ])

  if (!orden) redirect('/compras')
  const ordenTipada = orden as unknown as Orden
  const listaDetalles = (detalles ?? []) as unknown as Detalle[]

  let piezasDisponibles: { id: number; codigo: string; nombre: string; estado: string }[] = []
  let categorias: { id: number; nombre: string }[] = []
  if (ordenTipada.estado === 'borrador' && puedeCrear) {
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
          href="/compras"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a compras
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Orden #{ordenTipada.id} · {ordenTipada.proveedores?.nombre ?? '—'}
          </h1>
          <EstadoBadge estado={ordenTipada.estado} config={estadosCompra} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Creada {formatearFechaHora(ordenTipada.fecha_creacion)}
          {ordenTipada.notas && ` · ${ordenTipada.notas}`}
        </p>
      </div>

      {(ordenTipada.condiciones_pago ||
        ordenTipada.fecha_entrega_esperada ||
        ordenTipada.direccion_entrega ||
        ordenTipada.metodo_envio ||
        ordenTipada.referencia_proveedor ||
        ordenTipada.notas_proveedor) && (
        <section className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border border-border bg-card p-5 text-sm sm:grid-cols-2">
          {ordenTipada.condiciones_pago && (
            <p>
              <span className="text-muted-foreground">Condiciones de pago</span>
              <br />
              <span className="font-medium text-foreground">
                {nombresCondicionesPago[ordenTipada.condiciones_pago] ?? ordenTipada.condiciones_pago}
              </span>
            </p>
          )}
          {ordenTipada.fecha_entrega_esperada && (
            <p>
              <span className="text-muted-foreground">Entrega esperada</span>
              <br />
              <span className="font-medium text-foreground">{ordenTipada.fecha_entrega_esperada}</span>
            </p>
          )}
          {ordenTipada.direccion_entrega && (
            <p>
              <span className="text-muted-foreground">Dirección de entrega</span>
              <br />
              <span className="font-medium text-foreground">{ordenTipada.direccion_entrega}</span>
            </p>
          )}
          {ordenTipada.metodo_envio && (
            <p>
              <span className="text-muted-foreground">Método de envío</span>
              <br />
              <span className="font-medium text-foreground">
                {nombresMetodoEnvio[ordenTipada.metodo_envio] ?? ordenTipada.metodo_envio}
              </span>
            </p>
          )}
          {ordenTipada.referencia_proveedor && (
            <p>
              <span className="text-muted-foreground">Referencia del proveedor</span>
              <br />
              <span className="font-medium text-foreground">{ordenTipada.referencia_proveedor}</span>
            </p>
          )}
          {ordenTipada.notas_proveedor && (
            <p className="sm:col-span-2">
              <span className="text-muted-foreground">Notas para el proveedor</span>
              <br />
              <span className="font-medium text-foreground">{ordenTipada.notas_proveedor}</span>
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
              <th className="px-4 py-2 font-semibold">Costo unit.</th>
              <th className="px-4 py-2 font-semibold">Desc.</th>
              <th className="px-4 py-2 font-semibold">Subtotal</th>
              <th className="px-4 py-2 font-semibold">Recibido</th>
            </tr>
          </thead>
          <tbody>
            {listaDetalles.map((d) => (
              <tr key={d.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 text-foreground">
                  {d.descripcion}
                  {d.productos && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      ({d.productos.codigo})
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{d.cantidad}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{formatearPrecio(d.costo_unitario)}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {d.descuento_pct > 0 ? `${d.descuento_pct}%` : '—'}
                </td>
                <td className="px-4 py-2.5 font-semibold text-foreground">{formatearPrecio(d.subtotal)}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {d.cantidad_recibida} / {d.cantidad}
                </td>
              </tr>
            ))}
            {listaDetalles.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Sin líneas todavía
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-border">
              <td colSpan={4} className="px-4 py-2.5 text-right text-sm font-semibold text-foreground">
                Total
              </td>
              <td colSpan={2} className="px-4 py-2.5 text-sm font-bold text-foreground">
                {formatearPrecio(ordenTipada.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {ordenTipada.estado === 'borrador' && puedeCrear && (
        <SeccionFormulario
          icon={ListPlus}
          titulo="Agregar línea — pieza del maestro"
          descripcion="Busca por código o nombre. Si la pieza no existe todavía, créala en el bloque de abajo."
        >
          <form action={agregarLineaCompra} className="flex flex-col gap-4">
            <input type="hidden" name="orden_compra_id" value={ordenTipada.id} />
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
              <Campo label="Costo unitario (GTQ)" required>
                <input name="costo_unitario" type="number" step="0.01" min="0" required className={clasesInput} />
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
            <form action={crearProductoYAgregarLineaCompra} className="mt-3 flex flex-col gap-4">
              <input type="hidden" name="orden_compra_id" value={ordenTipada.id} />
              <Campo label="Nombre de la pieza" required>
                <input name="nombre" required className={clasesInput} />
              </Campo>
              <div className="grid grid-cols-2 gap-4">
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
                <Campo label="Origen">
                  <select name="origen" defaultValue="local" className={clasesInput}>
                    <option value="local">Local</option>
                    <option value="importado">Importado</option>
                  </select>
                </Campo>
              </div>
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
                Queda como borrador en Producción — luego se completa foto, material y demás desde
                ahí. El costo real de esta línea se le asigna al recibir la mercadería.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <Campo label="Cantidad a comprar" required>
                  <input name="cantidad" type="number" step="0.001" min="0.001" required className={clasesInput} />
                </Campo>
                <Campo label="Costo unitario (GTQ)" required>
                  <input name="costo_unitario" type="number" step="0.01" min="0" required className={clasesInput} />
                </Campo>
              </div>
              <div>
                <BotonPrimario>Crear pieza y agregar</BotonPrimario>
              </div>
            </form>
          </details>
        </SeccionFormulario>
      )}

      {ordenTipada.estado === 'borrador' && puedeAutorizar && (
        <SeccionFormulario icon={ShieldCheck} titulo="Autorización">
          <div className="flex flex-wrap items-center gap-3">
            <form action={autorizarOrdenCompra}>
              <input type="hidden" name="orden_compra_id" value={ordenTipada.id} />
              <BotonPrimario>Autorizar orden</BotonPrimario>
            </form>
            <details className="flex-1">
              <summary className="cursor-pointer list-none text-sm font-semibold text-destructive">
                Cancelar orden
              </summary>
              <form action={cancelarOrdenCompra} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                <input type="hidden" name="orden_compra_id" value={ordenTipada.id} />
                <Campo label="Motivo" required className="flex-1">
                  <input name="motivo" required className={clasesInput} />
                </Campo>
                <BotonPeligro>Confirmar cancelación</BotonPeligro>
              </form>
            </details>
          </div>
        </SeccionFormulario>
      )}

      {(ordenTipada.estado === 'autorizada' || ordenTipada.estado === 'recibida_parcial') && puedeRecibir && (
        <SeccionFormulario icon={PackageCheck} titulo="Recibir mercadería">
          <div className="flex flex-col gap-3">
            {listaDetalles
              .filter((d) => d.cantidad_recibida < d.cantidad)
              .map((d) => (
                <form
                  key={d.id}
                  action={recibirLineaCompra}
                  className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-secondary/30 p-3"
                >
                  <input type="hidden" name="orden_compra_id" value={ordenTipada.id} />
                  <input type="hidden" name="detalle_id" value={d.id} />
                  <div className="min-w-40 flex-1 text-sm text-foreground">
                    {d.descripcion}
                    <p className="text-xs text-muted-foreground">
                      Pendiente: {d.cantidad - d.cantidad_recibida}
                    </p>
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
                  {d.producto_id && (
                    <input
                      name="costo_unitario_real"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Costo real (opcional)"
                      className="w-44 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition-colors focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring/10"
                    />
                  )}
                  <BotonPrimario className="px-4 py-2 text-xs">Recibir</BotonPrimario>
                </form>
              ))}
          </div>
        </SeccionFormulario>
      )}

      {ordenTipada.estado === 'recibida_total' && puedeFacturar && (
        <SeccionFormulario icon={Receipt} titulo="Facturar">
          <form action={marcarFacturadaCompra} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="orden_compra_id" value={ordenTipada.id} />
            <Campo label="Número de factura" required className="flex-1">
              <input name="numero_factura" required className={clasesInput} />
            </Campo>
            <BotonPrimario>Marcar facturada</BotonPrimario>
          </form>
        </SeccionFormulario>
      )}

      {ordenTipada.estado === 'facturada' && puedePagar && (
        <SeccionFormulario icon={Banknote} titulo="Pago">
          <p className="mb-3 text-sm text-muted-foreground">
            Factura {ordenTipada.numero_factura_proveedor}
          </p>
          <form action={marcarPagadaCompra}>
            <input type="hidden" name="orden_compra_id" value={ordenTipada.id} />
            <BotonPrimario>Marcar pagada</BotonPrimario>
          </form>
        </SeccionFormulario>
      )}
    </main>
  )
}
