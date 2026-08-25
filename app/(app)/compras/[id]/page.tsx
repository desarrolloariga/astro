import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearPrecio, formatearFechaHora } from '@/lib/formato'
import { EstadoBadge, estadosCompra } from '@/components/app/estado-badge'
import {
  agregarLineaCompra,
  autorizarOrdenCompra,
  recibirLineaCompra,
  marcarFacturadaCompra,
  marcarPagadaCompra,
  cancelarOrdenCompra,
} from '../acciones'

export const metadata = { title: 'Orden de compra — ASTRO' }

const clasesCampo =
  'rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none'

type Detalle = {
  id: number
  producto_id: number | null
  descripcion: string
  cantidad: number
  costo_unitario: number
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
  numero_factura_proveedor: string | null
  fecha_creacion: string
  fecha_autorizacion: string | null
  fecha_recepcion_total: string | null
  fecha_facturacion: string | null
  fecha_pago: string | null
  proveedores: { nombre: string } | null
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
        'id, estado, subtotal, total, notas, numero_factura_proveedor, fecha_creacion, fecha_autorizacion, fecha_recepcion_total, fecha_facturacion, fecha_pago, proveedores ( nombre )',
      )
      .eq('id', ordenId)
      .maybeSingle(),
    supabase
      .from('orden_compra_detalles')
      .select('id, producto_id, descripcion, cantidad, costo_unitario, subtotal, cantidad_recibida, productos ( codigo, nombre )')
      .eq('orden_compra_id', ordenId)
      .order('id'),
  ])

  if (!orden) redirect('/compras')
  const ordenTipada = orden as unknown as Orden
  const listaDetalles = (detalles ?? []) as unknown as Detalle[]

  let piezasSinCosto: { id: number; codigo: string; nombre: string }[] = []
  if (ordenTipada.estado === 'borrador' && puedeCrear) {
    const { data } = await supabase
      .from('productos')
      .select('id, codigo, nombre')
      .eq('estado', 'en_produccion')
      .is('compra_detalle_id', null)
      .order('codigo')
    piezasSinCosto = data ?? []
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
                <td className="px-4 py-2.5 font-semibold text-foreground">{formatearPrecio(d.subtotal)}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {d.cantidad_recibida} / {d.cantidad}
                </td>
              </tr>
            ))}
            {listaDetalles.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  Sin líneas todavía
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-border">
              <td colSpan={3} className="px-4 py-2.5 text-right text-sm font-semibold text-foreground">
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
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Agregar línea</h2>
          <form action={agregarLineaCompra} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="orden_compra_id" value={ordenTipada.id} />
            <select name="producto_id" defaultValue="" className={clasesCampo}>
              <option value="">Sin vincular a una pieza específica</option>
              {piezasSinCosto.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} — {p.nombre}
                </option>
              ))}
            </select>
            <input name="descripcion" required placeholder="Descripción" className={clasesCampo} />
            <div className="grid grid-cols-2 gap-3">
              <input
                name="cantidad"
                type="number"
                step="0.001"
                min="0.001"
                required
                placeholder="Cantidad"
                className={clasesCampo}
              />
              <input
                name="costo_unitario"
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="Costo unitario (GTQ)"
                className={clasesCampo}
              />
            </div>
            <button
              type="submit"
              className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
            >
              Agregar
            </button>
          </form>
        </section>
      )}

      {ordenTipada.estado === 'borrador' && puedeAutorizar && (
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-5">
          <form action={autorizarOrdenCompra}>
            <input type="hidden" name="orden_compra_id" value={ordenTipada.id} />
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
            >
              Autorizar orden
            </button>
          </form>
          <details>
            <summary className="cursor-pointer list-none text-sm font-semibold text-destructive">
              Cancelar orden
            </summary>
            <form action={cancelarOrdenCompra} className="mt-2 flex flex-col gap-2">
              <input type="hidden" name="orden_compra_id" value={ordenTipada.id} />
              <input name="motivo" required placeholder="Motivo" className={clasesCampo} />
              <button
                type="submit"
                className="w-fit rounded-lg border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
              >
                Confirmar cancelación
              </button>
            </form>
          </details>
        </section>
      )}

      {(ordenTipada.estado === 'autorizada' || ordenTipada.estado === 'recibida_parcial') && puedeRecibir && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Recibir mercadería</h2>
          <div className="mt-3 flex flex-col gap-3">
            {listaDetalles
              .filter((d) => d.cantidad_recibida < d.cantidad)
              .map((d) => (
                <form
                  key={d.id}
                  action={recibirLineaCompra}
                  className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3"
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
                    className="w-40 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                  {d.producto_id && (
                    <input
                      name="costo_unitario_real"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Costo real (opcional)"
                      className="w-44 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    />
                  )}
                  <button
                    type="submit"
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90"
                  >
                    Recibir
                  </button>
                </form>
              ))}
          </div>
        </section>
      )}

      {ordenTipada.estado === 'recibida_total' && puedeFacturar && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Facturar</h2>
          <form action={marcarFacturadaCompra} className="mt-3 flex flex-wrap items-center gap-3">
            <input type="hidden" name="orden_compra_id" value={ordenTipada.id} />
            <input name="numero_factura" required placeholder="Número de factura" className={clasesCampo} />
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
            >
              Marcar facturada
            </button>
          </form>
        </section>
      )}

      {ordenTipada.estado === 'facturada' && puedePagar && (
        <section className="rounded-xl border border-border bg-card p-5">
          <p className="mb-3 text-sm text-muted-foreground">
            Factura {ordenTipada.numero_factura_proveedor}
          </p>
          <form action={marcarPagadaCompra}>
            <input type="hidden" name="orden_compra_id" value={ordenTipada.id} />
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
            >
              Marcar pagada
            </button>
          </form>
        </section>
      )}
    </main>
  )
}
