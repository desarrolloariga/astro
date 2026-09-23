import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, History, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { formatearFechaHora, formatearPrecio, formatearNumero } from '@/lib/formato'
import { EstadoPieza } from '@/components/app/estado-pieza'

export const metadata = { title: 'Historial de compras — ASTRO' }

type ProductoCarga = {
  id: number
  codigo: string
  nombre: string
  estado: string
  modo_inventario: 'pieza_unica' | 'por_cantidad'
  cantidad_inicial: number | null
  costo_produccion: number | null
}
type CargaMasiva = {
  id: number
  numero_factura: string | null
  referencia_orden_compra: string | null
  subtotal: number | null
  impuestos: number
  total: number
  notas: string | null
  fecha_creacion: string
  usuarios: { nombre: string } | null
  proveedores: { nombre: string } | null
  productos: ProductoCarga[]
}

export default async function HistorialCargaMasivaPage() {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'produccion' && usuario.rol !== 'admin' && usuario.rol !== 'coordinador' && usuario.rol !== 'contabilidad') {
    redirect('/inicio')
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('cargas_masivas')
    .select(
      'id, numero_factura, referencia_orden_compra, subtotal, impuestos, total, notas, fecha_creacion, usuarios:creado_por ( nombre ), proveedores ( nombre ), productos ( id, codigo, nombre, estado, modo_inventario, cantidad_inicial, costo_produccion )',
    )
    .order('fecha_creacion', { ascending: false })
    .limit(50)

  const cargas = (data ?? []) as unknown as CargaMasiva[]

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <Link
          href="/produccion/carga-masiva"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a carga masiva
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <History className="h-5 w-5 text-primary" />
          Historial de compras
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cabecera de cada carga masiva con factura, proveedor y total — despliega para ver los
          artículos que trajo.
        </p>
      </div>

      {cargas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <FileText className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Todavía no hay cargas con trazabilidad</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Al subir una carga masiva, completa factura, proveedor y montos para que aparezca aquí.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {cargas.map((c) => (
            <details key={c.id} className="rounded-xl border border-border bg-card">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-48">
                  <p className="font-semibold text-foreground">
                    {c.numero_factura ? `Factura ${c.numero_factura}` : `Carga #${c.id}`}
                    {c.referencia_orden_compra && (
                      <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                        · OC {c.referencia_orden_compra}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.proveedores?.nombre ?? 'Sin proveedor'} · {formatearFechaHora(c.fecha_creacion)}
                    {c.usuarios?.nombre && ` · ${c.usuarios.nombre}`}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-right text-sm">
                  <span className="text-muted-foreground">
                    {formatearNumero(c.productos.length)} artículo{c.productos.length !== 1 ? 's' : ''}
                  </span>
                  <span className="font-bold text-foreground">{formatearPrecio(c.total)}</span>
                </div>
              </summary>

              <div className="border-t border-border px-5 py-4">
                <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Subtotal</p>
                    <p className="font-semibold text-foreground">{formatearPrecio(c.subtotal ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Impuestos</p>
                    <p className="font-semibold text-foreground">{formatearPrecio(c.impuestos)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-semibold text-foreground">{formatearPrecio(c.total)}</p>
                  </div>
                </div>
                {c.notas && <p className="mb-4 text-sm text-muted-foreground">{c.notas}</p>}

                {c.productos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin artículos vinculados.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2 font-semibold">Artículo</th>
                          <th className="px-3 py-2 font-semibold">Estado</th>
                          <th className="px-3 py-2 font-semibold text-right">Cantidad</th>
                          <th className="px-3 py-2 font-semibold text-right">Costo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.productos.map((p) => (
                          <tr key={p.id} className="border-b border-border last:border-0">
                            <td className="px-3 py-2">
                              <Link href={`/produccion/${p.id}/costos`} className="font-medium text-primary hover:underline">
                                {p.codigo}
                              </Link>{' '}
                              <span className="text-foreground">{p.nombre}</span>
                            </td>
                            <td className="px-3 py-2">
                              <EstadoPieza estado={p.estado} />
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                              {p.modo_inventario === 'pieza_unica' ? 'Pieza única' : formatearNumero(p.cantidad_inicial ?? 0)}
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                              {p.costo_produccion != null ? formatearPrecio(p.costo_produccion) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </main>
  )
}
