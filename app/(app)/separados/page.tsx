import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, Bookmark, ImageOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { formatearPrecio, formatearFechaHora } from '@/lib/formato'
import { EstadoBadge, estadosSeparado } from '@/components/app/estado-badge'
import { liberarSeparado, venderDesdeSeparado } from './acciones'

export const metadata = { title: 'Separados — ASTRO' }

type Separado = {
  id: number
  estado: string
  fecha_expiracion: string
  fecha_creacion: string
  productos: {
    id: number
    codigo: string
    nombre: string
    precio_venta: number | null
    producto_imagenes: { url: string; es_principal: boolean }[]
  } | null
  clientes: { nombre: string; telefono: string | null } | null
  usuarios: { nombre: string } | null
  ventas: { id: number }[]
}

export default async function SeparadosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol === 'produccion' || usuario.rol === 'contabilidad') redirect('/inicio')

  const { ok, error } = await searchParams
  const supabase = await createClient()
  const esGerencial = ['admin', 'coordinador'].includes(usuario.rol)

  const { data } = await supabase
    .from('separados')
    .select(
      `id, estado, fecha_expiracion, fecha_creacion,
       productos ( id, codigo, nombre, precio_venta, producto_imagenes ( url, es_principal ) ),
       clientes ( nombre, telefono ),
       usuarios:vendedor_id ( nombre ),
       ventas ( id )`,
    )
    .order('fecha_creacion', { ascending: false })
    .limit(100)

  const lista = (data ?? []) as unknown as Separado[]

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Separados</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Piezas reservadas con promesa de venta. Se liberan automáticamente al vencer.
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

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Bookmark className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">No hay separados</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Separa una pieza desde el catálogo para reservarla a nombre de un cliente.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map((s) => {
            const portada =
              s.productos?.producto_imagenes.find((i) => i.es_principal)?.url ??
              s.productos?.producto_imagenes[0]?.url ??
              null
            const activo = s.estado === 'activo'
            const vencido = activo && new Date(s.fecha_expiracion) < new Date()

            return (
              <div
                key={s.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center"
              >
                {portada ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={portada}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                    <ImageOff className="h-5 w-5" />
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <EstadoBadge estado={s.estado} config={estadosSeparado} />
                    {s.estado === 'convertido' && s.ventas[0] && (
                      <a
                        href={`/ventas#venta-${s.ventas[0].id}`}
                        className="text-[11px] font-semibold text-primary hover:underline"
                      >
                        Ver venta #{s.ventas[0].id}
                      </a>
                    )}
                    {vencido && (
                      <span className="text-[11px] font-semibold text-destructive">
                        Vencido, en espera de liberación automática
                      </span>
                    )}
                    {esGerencial && s.usuarios && (
                      <span className="text-[11px] text-muted-foreground">
                        Vendedor: {s.usuarios.nombre}
                      </span>
                    )}
                  </div>
                  <p className="truncate font-semibold text-foreground">{s.productos?.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.productos?.codigo} · Cliente: {s.clientes?.nombre ?? '—'}
                    {s.clientes?.telefono ? ` (${s.clientes.telefono})` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Vence: {formatearFechaHora(s.fecha_expiracion)}
                  </p>
                </div>

                {activo && (
                  <div className="flex shrink-0 flex-col gap-2 sm:w-56">
                    <details className="group rounded-lg border border-border">
                      <summary className="cursor-pointer list-none rounded-lg bg-primary px-3 py-2 text-center text-xs font-semibold text-primary-foreground">
                        Registrar venta
                      </summary>
                      <form action={venderDesdeSeparado} className="flex flex-col gap-2 p-3">
                        <input type="hidden" name="separado_id" value={s.id} />
                        <input type="hidden" name="producto_id" value={s.productos?.id} />
                        <input
                          type="hidden"
                          name="cliente_nombre"
                          value={s.clientes?.nombre ?? ''}
                        />
                        <input
                          type="hidden"
                          name="cliente_telefono"
                          value={s.clientes?.telefono ?? ''}
                        />
                        <select
                          name="metodo_pago"
                          required
                          defaultValue=""
                          className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                        >
                          <option value="" disabled>
                            Método de pago
                          </option>
                          <option value="transferencia">Transferencia</option>
                          <option value="deposito">Depósito</option>
                          <option value="tarjeta">Tarjeta</option>
                          <option value="pasarela">Pasarela</option>
                        </select>
                        <input
                          name="monto"
                          type="number"
                          step="0.01"
                          required
                          defaultValue={s.productos?.precio_venta ?? undefined}
                          placeholder="Monto"
                          className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                        />
                        <input
                          name="referencia"
                          placeholder="Referencia (opcional)"
                          className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-primary py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90"
                        >
                          Confirmar venta
                        </button>
                      </form>
                    </details>

                    <form action={liberarSeparado}>
                      <input type="hidden" name="separado_id" value={s.id} />
                      <button
                        type="submit"
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
                      >
                        Liberar
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
