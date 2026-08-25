import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, ShoppingBag, Upload, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { tienePermiso } from '@/lib/permisos'
import { formatearPrecio, formatearFechaHora } from '@/lib/formato'
import {
  EstadoBadge,
  estadosVenta,
  estadosPago,
  estadosComprobante,
} from '@/components/app/estado-badge'
import { subirComprobante } from './acciones'
import { anularVenta } from '../red/acciones'

export const metadata = { title: 'Ventas — ASTRO' }

const BUCKET = 'ariga-comprobantes'

type Comprobante = {
  id: number
  estado: string
  url_archivo: string
  fecha_creacion: string
  comentario: string | null
  fecha_revision: string | null
  usuarios: { nombre: string } | null
}
type Pago = {
  id: number
  metodo: string
  monto: number
  estado: string
  comprobantes: Comprobante[]
}
type DetalleVenta = {
  cantidad: number
  precio: number
  descuento: number
  productos: { codigo: string; nombre: string } | null
}
type Venta = {
  id: number
  estado: string
  total: number
  fecha_creacion: string
  clientes: { nombre: string } | null
  venta_detalles: DetalleVenta[]
  pagos: Pago[]
}

const nombresMetodo: Record<string, string> = {
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  deposito: 'Depósito',
  pasarela: 'Pasarela',
}

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; aviso?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol === 'produccion' || usuario.rol === 'contabilidad') redirect('/inicio')

  const puedeAnular = await tienePermiso('ventas', 'anular')
  const { ok, error, aviso } = await searchParams
  const supabase = await createClient()

  const { data } = await supabase
    .from('ventas')
    .select(
      `id, estado, total, fecha_creacion,
       clientes ( nombre ),
       venta_detalles ( cantidad, precio, descuento, productos ( codigo, nombre ) ),
       pagos ( id, metodo, monto, estado,
               comprobantes ( id, estado, url_archivo, fecha_creacion, comentario, fecha_revision,
                              usuarios:revisado_por ( nombre ) ) )`,
    )
    .order('fecha_creacion', { ascending: false })
    .limit(100)

  const lista = (data ?? []) as unknown as Venta[]

  // URLs firmadas para los comprobantes ya subidos (documento privado)
  const admin = createAdminClient()
  const rutas = lista.flatMap((v) => v.pagos.flatMap((p) => p.comprobantes.map((c) => c.url_archivo)))
  const firmadas = new Map<string, string>()
  if (rutas.length > 0) {
    const { data: urls } = await admin.storage.from(BUCKET).createSignedUrls(rutas, 3600)
    urls?.forEach((u) => {
      if (u.signedUrl) firmadas.set(u.path ?? '', u.signedUrl)
    })
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Ventas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Historial de ventas registradas y estado de sus comprobantes de pago.
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
      {aviso && (
        <div className="flex items-start gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm text-accent-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{aviso}</span>
        </div>
      )}

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <ShoppingBag className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Aún no hay ventas</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Registra una venta desde el catálogo o al concretar un separado.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map((v) => {
            const pago = v.pagos[0]
            const ultimoComprobante = pago?.comprobantes.sort((a, b) =>
              b.fecha_creacion.localeCompare(a.fecha_creacion),
            )[0]
            const necesitaComprobante =
              pago && pago.estado === 'pendiente' &&
              (!ultimoComprobante || ultimoComprobante.estado === 'rechazado')

            const desalineado = pago != null && pago.monto !== v.total

            return (
              <div
                key={v.id}
                id={`venta-${v.id}`}
                className="flex scroll-mt-20 flex-col gap-3 rounded-xl border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <EstadoBadge estado={v.estado} config={estadosVenta} />
                      {pago && <EstadoBadge estado={pago.estado} config={estadosPago} />}
                    </div>
                    <p className="font-semibold text-foreground">
                      Venta #{v.id} · {v.clientes?.nombre ?? 'Cliente sin nombre'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {v.venta_detalles
                        .filter((d) => d.productos)
                        .map((d) => (d.cantidad > 1 ? `${d.productos!.nombre} ×${d.cantidad}` : d.productos!.nombre))
                        .join(', ')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatearFechaHora(v.fecha_creacion)}
                      {pago && ` · ${nombresMetodo[pago.metodo] ?? pago.metodo}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-foreground">{formatearPrecio(v.total)}</p>
                    {pago && (
                      <p
                        className={
                          desalineado
                            ? 'text-xs font-semibold text-destructive'
                            : 'text-xs text-muted-foreground'
                        }
                      >
                        Cobrado: {formatearPrecio(pago.monto)}
                        {desalineado && ' ⚠ no coincide con el total'}
                      </p>
                    )}
                  </div>
                </div>

                {v.venta_detalles.length > 0 && (
                  <details>
                    <summary className="w-fit cursor-pointer list-none text-xs font-semibold text-primary">
                      Ver desglose de precio
                    </summary>
                    <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                      <table className="w-full min-w-[420px] text-xs">
                        <thead>
                          <tr className="border-b border-border bg-secondary/40 text-left uppercase tracking-wide text-muted-foreground">
                            <th className="px-3 py-1.5 font-semibold">Pieza</th>
                            <th className="px-3 py-1.5 text-right font-semibold">Cant.</th>
                            <th className="px-3 py-1.5 text-right font-semibold">Precio</th>
                            <th className="px-3 py-1.5 text-right font-semibold">Descuento</th>
                          </tr>
                        </thead>
                        <tbody>
                          {v.venta_detalles.map((d, i) => (
                            <tr key={i} className="border-b border-border last:border-0">
                              <td className="px-3 py-1.5 text-foreground">{d.productos?.nombre ?? '—'}</td>
                              <td className="px-3 py-1.5 text-right text-muted-foreground">{d.cantidad}</td>
                              <td className="px-3 py-1.5 text-right text-muted-foreground">
                                {formatearPrecio(d.precio)}
                              </td>
                              <td className="px-3 py-1.5 text-right text-muted-foreground">
                                {d.descuento > 0 ? formatearPrecio(d.descuento) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}

                {ultimoComprobante && (
                  <div className="flex flex-col gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <EstadoBadge estado={ultimoComprobante.estado} config={estadosComprobante} />
                      {firmadas.get(ultimoComprobante.url_archivo) && (
                        <a
                          href={firmadas.get(ultimoComprobante.url_archivo)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary hover:underline"
                        >
                          Ver comprobante
                        </a>
                      )}
                    </div>
                    {ultimoComprobante.estado === 'rechazado' && (
                      <p className="text-destructive">
                        {ultimoComprobante.comentario ?? 'Rechazado sin motivo registrado.'}
                        {ultimoComprobante.usuarios && ` — ${ultimoComprobante.usuarios.nombre}`}
                        {ultimoComprobante.fecha_revision &&
                          ` · ${formatearFechaHora(ultimoComprobante.fecha_revision)}`}
                      </p>
                    )}
                  </div>
                )}

                {necesitaComprobante && pago && (
                  <form
                    action={subirComprobante}
                    encType="multipart/form-data"
                    className="flex flex-col gap-2"
                  >
                    <input type="hidden" name="pago_id" value={pago.id} />
                    <input type="hidden" name="venta_id" value={v.id} />
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="file"
                        name="archivo"
                        required
                        accept="image/*,application/pdf"
                        className="flex-1 text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-foreground"
                      />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Subir comprobante
                      </button>
                    </div>
                    <details>
                      <summary className="cursor-pointer list-none text-[11px] font-semibold text-primary">
                        + Datos del depósito/transferencia (opcional, agiliza la conciliación)
                      </summary>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <input
                          name="numero_referencia"
                          placeholder="N.° de referencia"
                          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                        />
                        <input
                          name="banco_origen"
                          placeholder="Banco de origen"
                          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                        />
                        <input
                          name="fecha_pago"
                          type="date"
                          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                        />
                        <input
                          name="monto_declarado"
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Monto depositado"
                          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                        />
                      </div>
                    </details>
                  </form>
                )}

                {puedeAnular && v.estado !== 'anulada' && (
                  <details>
                    <summary className="w-fit cursor-pointer list-none text-xs font-semibold text-destructive">
                      Anular venta
                    </summary>
                    <form
                      action={anularVenta}
                      className="mt-2 flex flex-col gap-2 rounded-lg border border-border bg-secondary p-3"
                    >
                      <input type="hidden" name="venta_id" value={v.id} />
                      <input type="hidden" name="redireccion" value="/ventas" />
                      <textarea
                        name="motivo"
                        required
                        placeholder="Motivo de la anulación"
                        rows={2}
                        className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="w-fit rounded-md bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20"
                      >
                        Confirmar anulación
                      </button>
                    </form>
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
