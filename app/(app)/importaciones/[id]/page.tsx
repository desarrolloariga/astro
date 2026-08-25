import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearPrecio, formatearFechaHora } from '@/lib/formato'
import { EstadoBadge, estadosImportacion } from '@/components/app/estado-badge'
import {
  agregarLineaImportacion,
  autorizarImportacion,
  marcarEnTransitoImportacion,
  recibirLineaImportacion,
  nacionalizarImportacion,
  marcarFacturadaImportacion,
  marcarPagadaImportacion,
  cancelarImportacion,
} from '../acciones'

export const metadata = { title: 'Importación — ASTRO' }

const clasesCampo =
  'rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none'

type Detalle = {
  id: number
  producto_id: number | null
  descripcion: string
  cantidad: number
  valor_fob_unitario: number
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
  numero_factura_proveedor: string | null
  fecha_creacion: string
  proveedores: { nombre: string } | null
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
        'id, estado, fob_total, tipo_cambio, flete_internacional, seguro, aranceles, gastos_aduana, transporte_interno, costo_nacionalizado_total, notas, numero_factura_proveedor, fecha_creacion, proveedores ( nombre )',
      )
      .eq('id', importacionId)
      .maybeSingle(),
    supabase
      .from('importacion_detalles')
      .select(
        'id, producto_id, descripcion, cantidad, valor_fob_unitario, valor_fob_total, costo_nacionalizado_unitario, cantidad_recibida, productos ( codigo, nombre )',
      )
      .eq('importacion_id', importacionId)
      .order('id'),
  ])

  if (!importacion) redirect('/importaciones')
  const imp = importacion as unknown as Importacion
  const listaDetalles = (detalles ?? []) as unknown as Detalle[]

  let piezasSinCosto: { id: number; codigo: string; nombre: string }[] = []
  if (imp.estado === 'borrador' && puedeCrear) {
    const { data } = await supabase
      .from('productos')
      .select('id, codigo, nombre')
      .eq('estado', 'en_produccion')
      .is('compra_detalle_id', null)
      .is('importacion_detalle_id', null)
      .order('codigo')
    piezasSinCosto = data ?? []
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
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Sin líneas todavía
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-border">
              <td colSpan={3} className="px-4 py-2.5 text-right text-sm font-semibold text-foreground">
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
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Agregar línea</h2>
          <form action={agregarLineaImportacion} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="importacion_id" value={imp.id} />
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
                name="valor_fob_unitario"
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="Valor FOB unitario"
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

      {imp.estado === 'borrador' && puedeAutorizar && (
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-5">
          <form action={autorizarImportacion}>
            <input type="hidden" name="importacion_id" value={imp.id} />
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
            >
              Autorizar importación
            </button>
          </form>
          <details>
            <summary className="cursor-pointer list-none text-sm font-semibold text-destructive">
              Cancelar
            </summary>
            <form action={cancelarImportacion} className="mt-2 flex flex-col gap-2">
              <input type="hidden" name="importacion_id" value={imp.id} />
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

      {imp.estado === 'autorizada' && puedeAutorizar && (
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-5">
          <form action={marcarEnTransitoImportacion}>
            <input type="hidden" name="importacion_id" value={imp.id} />
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
            >
              Marcar en tránsito
            </button>
          </form>
          <details>
            <summary className="cursor-pointer list-none text-sm font-semibold text-destructive">
              Cancelar
            </summary>
            <form action={cancelarImportacion} className="mt-2 flex flex-col gap-2">
              <input type="hidden" name="importacion_id" value={imp.id} />
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

      {(imp.estado === 'autorizada' || imp.estado === 'en_transito' || imp.estado === 'recibida_parcial') &&
        puedeRecibir && (
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Recibir mercadería
            </h2>
            <div className="mt-3 flex flex-col gap-3">
              {listaDetalles
                .filter((d) => d.cantidad_recibida < d.cantidad)
                .map((d) => (
                  <form
                    key={d.id}
                    action={recibirLineaImportacion}
                    className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3"
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
                      className="w-40 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    />
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

      {imp.estado === 'recibida_total' && puedeCostear && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Nacionalizar — distribuir costos por valor FOB
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Cada línea recibe una parte de estos montos proporcional a su participación en el FOB
            total ({formatearPrecio(imp.fob_total)}).
          </p>
          <form action={nacionalizarImportacion} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input type="hidden" name="importacion_id" value={imp.id} />
            <input
              name="flete_internacional"
              type="number"
              step="0.01"
              min="0"
              placeholder="Flete internacional"
              className={clasesCampo}
            />
            <input name="seguro" type="number" step="0.01" min="0" placeholder="Seguro" className={clasesCampo} />
            <input name="aranceles" type="number" step="0.01" min="0" placeholder="Aranceles" className={clasesCampo} />
            <input
              name="gastos_aduana"
              type="number"
              step="0.01"
              min="0"
              placeholder="Gastos de aduana"
              className={clasesCampo}
            />
            <input
              name="transporte_interno"
              type="number"
              step="0.01"
              min="0"
              placeholder="Transporte interno"
              className={clasesCampo}
            />
            <button
              type="submit"
              className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 sm:col-span-2"
            >
              Nacionalizar
            </button>
          </form>
        </section>
      )}

      {imp.estado === 'nacionalizada' && puedeFacturar && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Facturar</h2>
          <form action={marcarFacturadaImportacion} className="mt-3 flex flex-wrap items-center gap-3">
            <input type="hidden" name="importacion_id" value={imp.id} />
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

      {imp.estado === 'facturada' && puedePagar && (
        <section className="rounded-xl border border-border bg-card p-5">
          <p className="mb-3 text-sm text-muted-foreground">Factura {imp.numero_factura_proveedor}</p>
          <form action={marcarPagadaImportacion}>
            <input type="hidden" name="importacion_id" value={imp.id} />
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
