import { redirect } from 'next/navigation'
import { Users, ShoppingBag, Phone, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { formatearPrecio, formatearFechaHora } from '@/lib/formato'
import { EstadoBadge, estadosVenta } from '@/components/app/estado-badge'

export const metadata = { title: 'Clientes — ASTRO' }

type VentaCliente = {
  id: number
  estado: string
  total: number
  fecha_creacion: string
  venta_detalles: { cantidad: number; productos: { nombre: string } | null }[]
}

type Cliente = {
  id: number
  nombre: string
  telefono: string | null
  correo: string | null
  fecha_creacion: string
  usuarios: { nombre: string } | null
  ventas: VentaCliente[]
}

const clasesCampo =
  'rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ buscar?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol === 'produccion') redirect('/inicio')

  const { buscar } = await searchParams
  const supabase = await createClient()

  let consulta = supabase
    .from('clientes')
    .select(
      `id, nombre, telefono, correo, fecha_creacion,
       usuarios:vendedor_id ( nombre ),
       ventas ( id, estado, total, fecha_creacion,
                venta_detalles ( cantidad, productos ( nombre ) ) )`,
    )
    .eq('activo', true)
    .order('fecha_creacion', { ascending: false })
    .limit(200)

  const buscarSeguro = (buscar ?? '').trim().replace(/[,()]/g, ' ')
  if (buscarSeguro) {
    consulta = consulta.or(`nombre.ilike.%${buscarSeguro}%,telefono.ilike.%${buscarSeguro}%`)
  }

  const { data } = await consulta
  const lista = (data ?? []) as unknown as Cliente[]

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Clientes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Clientes captados y su historial de compras.
        </p>
      </div>

      <form className="flex flex-wrap items-center gap-2">
        <input
          name="buscar"
          defaultValue={buscar ?? ''}
          placeholder="Buscar por nombre o teléfono…"
          className={`${clasesCampo} min-w-56 flex-1`}
        />
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          Buscar
        </button>
      </form>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Users className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">
            {buscarSeguro ? 'Sin clientes para esa búsqueda' : 'Aún no hay clientes'}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Los clientes se crean automáticamente al separar o vender una pieza a su nombre.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map((c) => {
            const ventasValidas = c.ventas.filter((v) => v.estado !== 'anulada')
            const totalGastado = ventasValidas.reduce((acc, v) => acc + v.total, 0)
            const ventasOrdenadas = [...c.ventas].sort((a, b) =>
              b.fecha_creacion.localeCompare(a.fecha_creacion),
            )

            return (
              <div key={c.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{c.nombre}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {c.telefono && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {c.telefono}
                        </span>
                      )}
                      {c.correo && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {c.correo}
                        </span>
                      )}
                      {c.usuarios && <span>Captado por {c.usuarios.nombre}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="flex items-center justify-end gap-1.5 text-sm font-bold text-foreground">
                      <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatearPrecio(totalGastado)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ventasValidas.length} compra{ventasValidas.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {c.ventas.length > 0 && (
                  <details>
                    <summary className="w-fit cursor-pointer list-none text-xs font-semibold text-primary">
                      Ver historial de compras ({c.ventas.length})
                    </summary>
                    <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                      <table className="w-full min-w-[520px] text-xs">
                        <thead>
                          <tr className="border-b border-border bg-secondary/40 text-left uppercase tracking-wide text-muted-foreground">
                            <th className="px-3 py-2 font-semibold">Venta</th>
                            <th className="px-3 py-2 font-semibold">Piezas</th>
                            <th className="px-3 py-2 font-semibold">Estado</th>
                            <th className="px-3 py-2 font-semibold">Fecha</th>
                            <th className="px-3 py-2 text-right font-semibold">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ventasOrdenadas.map((v) => (
                            <tr key={v.id} className="border-b border-border last:border-0">
                              <td className="px-3 py-2 text-foreground">
                                <a href={`/ventas#venta-${v.id}`} className="font-semibold hover:underline">
                                  #{v.id}
                                </a>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {v.venta_detalles
                                  .filter((d) => d.productos)
                                  .map((d) => (d.cantidad > 1 ? `${d.productos!.nombre} ×${d.cantidad}` : d.productos!.nombre))
                                  .join(', ') || '—'}
                              </td>
                              <td className="px-3 py-2">
                                <EstadoBadge estado={v.estado} config={estadosVenta} />
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {formatearFechaHora(v.fecha_creacion)}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-foreground">
                                {formatearPrecio(v.total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
