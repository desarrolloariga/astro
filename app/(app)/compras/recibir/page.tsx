import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, PackageCheck, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearFechaHora } from '@/lib/formato'
import { BotonPrimario } from '@/components/app/formulario'
import { recibirLineaCompra } from '../acciones'

export const metadata = { title: 'Recibir órdenes de compra — ASTRO' }

type Detalle = {
  id: number
  producto_id: number
  descripcion: string
  cantidad: number
  costo_unitario: number
  cantidad_recibida: number
}
type Orden = {
  id: number
  estado: string
  fecha_autorizacion: string | null
  proveedores: { nombre: string } | null
  orden_compra_detalles: Detalle[]
}

export default async function RecibirOrdenesCompraPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  if (!(await tienePermiso('compras', 'recibir'))) redirect('/inicio')

  const { ok, error } = await searchParams
  const supabase = await createClient()

  const { data } = await supabase
    .from('ordenes_compra')
    .select(
      'id, estado, fecha_autorizacion, proveedores ( nombre ), orden_compra_detalles ( id, producto_id, descripcion, cantidad, costo_unitario, cantidad_recibida )',
    )
    .in('estado', ['autorizada', 'recibida_parcial'])
    .order('fecha_autorizacion', { ascending: true })

  const ordenes = (data ?? []) as unknown as Orden[]

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
          <PackageCheck className="h-5 w-5 text-primary" />
          Recibir órdenes de compra
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todas las órdenes autorizadas con mercadería pendiente de recibir, en un solo lugar —
          reconfirma cantidad y costo de cada línea; al recibir, el artículo se publica directo al
          CEDI.
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

      {ordenes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <PackageCheck className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">No hay órdenes pendientes de recibir</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {ordenes.map((orden) => {
            const pendientes = orden.orden_compra_detalles.filter((d) => d.cantidad_recibida < d.cantidad)
            if (pendientes.length === 0) return null
            return (
              <section key={orden.id} className="rounded-xl border border-border bg-card p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link
                      href={`/compras/${orden.id}`}
                      className="font-semibold text-foreground hover:text-primary hover:underline"
                    >
                      Orden #{orden.id} · {orden.proveedores?.nombre ?? '—'}
                    </Link>
                    {orden.fecha_autorizacion && (
                      <p className="text-xs text-muted-foreground">
                        Autorizada {formatearFechaHora(orden.fecha_autorizacion)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {pendientes.map((d) => (
                    <form
                      key={d.id}
                      action={recibirLineaCompra}
                      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-secondary/30 p-3"
                    >
                      <input type="hidden" name="orden_compra_id" value={orden.id} />
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
                        defaultValue={d.cantidad - d.cantidad_recibida}
                        className="w-40 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition-colors focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring/10"
                      />
                      <input
                        name="costo_unitario_real"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Costo real"
                        defaultValue={d.costo_unitario}
                        className="w-44 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition-colors focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring/10"
                      />
                      <BotonPrimario className="px-4 py-2 text-xs">Recibir y publicar</BotonPrimario>
                    </form>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </main>
  )
}
