import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearPrecio, formatearFechaHora } from '@/lib/formato'
import { EstadoBadge, estadosCompra } from '@/components/app/estado-badge'

export const metadata = { title: 'Historial de órdenes de compra — ASTRO' }

const ESTADOS_RECIBIDAS = ['recibida_parcial', 'recibida_total', 'facturada', 'pagada'] as const

type Orden = {
  id: number
  estado: string
  numero_factura_proveedor: string | null
  subtotal: number
  impuestos: number
  total: number
  fecha_creacion: string
  fecha_recepcion_total: string | null
  proveedores: { nombre: string } | null
}

export default async function HistorialComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; proveedor?: string }>
}) {
  if (!(await tienePermiso('compras', 'ver'))) redirect('/inicio')

  const sp = await searchParams
  const supabase = await createClient()

  let consulta = supabase
    .from('ordenes_compra')
    .select(
      'id, estado, numero_factura_proveedor, subtotal, impuestos, total, fecha_creacion, fecha_recepcion_total, proveedores ( nombre )',
    )
    .in('estado', ESTADOS_RECIBIDAS)
    .order('fecha_creacion', { ascending: false })

  if (sp.estado && ESTADOS_RECIBIDAS.includes(sp.estado as (typeof ESTADOS_RECIBIDAS)[number])) {
    consulta = consulta.eq('estado', sp.estado)
  }

  const { data } = await consulta
  const ordenes = (data ?? []) as unknown as Orden[]

  const totales = ordenes.reduce(
    (acc, o) => ({
      subtotal: acc.subtotal + o.subtotal,
      impuestos: acc.impuestos + o.impuestos,
      total: acc.total + o.total,
    }),
    { subtotal: 0, impuestos: 0, total: 0 },
  )

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <Link
          href="/compras"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a compras
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <History className="h-5 w-5 text-primary" />
          Historial de órdenes de compra
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Órdenes que ya tuvieron alguna recepción — factura, valores y estado. Da clic en cualquiera
          para ver el detalle completo.
        </p>
      </div>

      <form className="flex flex-wrap items-center gap-2">
        <select
          name="estado"
          defaultValue={sp.estado ?? ''}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
        >
          <option value="">Todos los estados recibidos</option>
          {ESTADOS_RECIBIDAS.map((e) => (
            <option key={e} value={e}>
              {estadosCompra[e]?.etiqueta ?? e}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          Filtrar
        </button>
      </form>

      {ordenes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <History className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Todavía no hay órdenes recibidas</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">Proveedor</th>
                  <th className="px-4 py-3 font-semibold">Factura</th>
                  <th className="px-4 py-3 font-semibold text-right">Subtotal</th>
                  <th className="px-4 py-3 font-semibold text-right">Impuestos</th>
                  <th className="px-4 py-3 font-semibold text-right">Total</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Recibida</th>
                </tr>
              </thead>
              <tbody>
                {ordenes.map((o) => (
                  <tr key={o.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/compras/${o.id}`} className="font-semibold text-primary hover:underline">
                        #{o.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-foreground">{o.proveedores?.nombre ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{o.numero_factura_proveedor ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatearPrecio(o.subtotal)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatearPrecio(o.impuestos)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">{formatearPrecio(o.total)}</td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={o.estado} config={estadosCompra} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {o.fecha_recepcion_total ? formatearFechaHora(o.fecha_recepcion_total) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-secondary/30">
                  <td colSpan={3} className="px-4 py-3 text-right text-sm font-semibold text-foreground">
                    {ordenes.length} orden{ordenes.length !== 1 ? 'es' : ''}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-foreground">
                    {formatearPrecio(totales.subtotal)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-foreground">
                    {formatearPrecio(totales.impuestos)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-foreground">
                    {formatearPrecio(totales.total)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </main>
  )
}
