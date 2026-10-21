import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, ClipboardCheck, FileText, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tienePermiso } from '@/lib/permisos'
import { formatearPrecio, formatearFechaHora } from '@/lib/formato'
import { cn } from '@/lib/utils'
import {
  DesgloseVenta,
  EtiquetaBolsa,
  SELECT_DESGLOSE,
  resumenBolsa,
  type VentaDesglose,
} from '@/components/app/desglose-venta'
import { revisarComprobante } from './acciones'

export const metadata = { title: 'Comprobantes — ASTRO' }

const BUCKET = 'ariga-comprobantes'

type VentaConDatos = VentaDesglose & {
  fecha_creacion: string
  clientes: { nombre: string } | null
  usuarios: { nombre: string } | null
  pedidos: { id: number; estado: string }[] | null
}

type ComprobantePendiente = {
  id: number
  url_archivo: string
  fecha_creacion: string
  numero_referencia: string | null
  banco_origen: string | null
  fecha_pago: string | null
  monto_declarado: number | null
  usuarios_subio: { nombre: string } | null
  pagos: { id: number; metodo: string; monto: number; ventas: VentaConDatos | null } | null
}

const SELECT_VENTA = `${SELECT_DESGLOSE}, fecha_creacion, clientes ( nombre ), usuarios:vendedor_id ( nombre ), pedidos ( id, estado )`

export default async function BandejaComprobantesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; vista?: string }>
}) {
  if (!(await tienePermiso('comprobantes', 'aprobar'))) redirect('/inicio')

  const { ok, error, vista } = await searchParams
  const verBolsa = vista === 'bolsa'
  const supabase = await createClient()

  const [{ data }, { data: bolsaData }] = await Promise.all([
    supabase
      .from('comprobantes')
      .select(
        `id, url_archivo, fecha_creacion, numero_referencia, banco_origen, fecha_pago, monto_declarado,
         usuarios_subio:usuarios!comprobantes_subido_por_fkey ( nombre ),
         pagos ( id, metodo, monto, ventas ( ${SELECT_VENTA} ) )`,
      )
      .eq('estado', 'pendiente')
      .order('fecha_creacion', { ascending: true }),
    // Compras pagadas (total o parcialmente) con bolsa — informativo.
    supabase
      .from('pagos')
      .select(`id, fecha_creacion, ventas ( ${SELECT_VENTA} )`)
      .eq('metodo', 'bolsa')
      .neq('estado', 'rechazado')
      .order('fecha_creacion', { ascending: false })
      .limit(50),
  ])

  const lista = (data ?? []) as unknown as ComprobantePendiente[]
  const comprasBolsa = ((bolsaData ?? []) as unknown as { id: number; fecha_creacion: string; ventas: VentaConDatos | null }[])
    .map((p) => p.ventas)
    .filter((v): v is VentaConDatos => Boolean(v))
  const conBolsaPendientes = lista.filter((c) => c.pagos?.ventas && resumenBolsa(c.pagos.ventas).conBolsa).length

  const admin = createAdminClient()
  const firmadas = new Map<string, string>()
  if (!verBolsa && lista.length > 0) {
    const { data: urls } = await admin.storage
      .from(BUCKET)
      .createSignedUrls(lista.map((c) => c.url_archivo), 3600)
    urls?.forEach((u) => {
      if (u.signedUrl) firmadas.set(u.path ?? '', u.signedUrl)
    })
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Bandeja de comprobantes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aprueba o rechaza los comprobantes de pago pendientes. Abre el detalle para ver cómo se pagó y los productos.
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

      <div className="flex gap-1 border-b border-border">
        {[
          { href: '/contabilidad/comprobantes', etiqueta: `Por revisar (${lista.length})`, activa: !verBolsa },
          { href: '/contabilidad/comprobantes?vista=bolsa', etiqueta: `Compras con bolsa (${comprasBolsa.length})`, activa: verBolsa },
        ].map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors',
              t.activa ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.etiqueta}
          </Link>
        ))}
      </div>

      {verBolsa ? (
        <>
          <p className="text-sm text-muted-foreground">
            Compras de embajadores pagadas con su bolsa. Las pagadas al 100% no pasan por aprobación (salen directo a despacho);
            las mixtas aparecen también en &quot;Por revisar&quot; por la parte pagada con dinero.
          </p>
          {comprasBolsa.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
              <Wallet className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
              <p className="text-sm font-semibold text-foreground">Aún no hay compras con bolsa</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {comprasBolsa.map((v) => {
                const pedido = v.pedidos?.[0]
                return (
                  <div key={v.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
                          Venta #{v.id} · {v.usuarios?.nombre ?? '—'}
                          <EtiquetaBolsa venta={v} />
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatearFechaHora(v.fecha_creacion)}
                          {pedido && (
                            <>
                              {' · '}
                              <Link href={`/pedidos/${pedido.id}`} className="font-semibold text-primary hover:underline">
                                Pedido #{pedido.id}
                              </Link>
                            </>
                          )}
                        </p>
                      </div>
                      <p className="text-lg font-bold text-foreground">{formatearPrecio(Number(v.total))}</p>
                    </div>
                    <details>
                      <summary className="w-fit cursor-pointer list-none text-xs font-semibold text-primary">Ver desglose</summary>
                      <div className="mt-2">
                        <DesgloseVenta venta={v} />
                      </div>
                    </details>
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : lista.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <ClipboardCheck className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Bandeja al día</p>
          <p className="max-w-sm text-sm text-muted-foreground">No hay comprobantes pendientes de revisión.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {conBolsaPendientes > 0 && (
            <p className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800">
              <Wallet className="h-3.5 w-3.5" />
              {conBolsaPendientes} comprobante{conBolsaPendientes !== 1 ? 's' : ''} de compras pagadas en parte con bolsa: revisa
              que el monto en dinero corresponda solo al restante.
            </p>
          )}
          {lista.map((c) => {
            const venta = c.pagos?.ventas ?? null
            const bolsa = venta ? resumenBolsa(venta) : null
            return (
              <div
                key={c.id}
                className={cn(
                  'flex flex-col gap-3 rounded-xl border bg-card p-4',
                  bolsa?.conBolsa ? 'border-amber-500/40' : 'border-border',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
                      Venta #{venta?.id} · {venta?.clientes?.nombre ?? 'Cliente sin nombre'}
                      <EtiquetaBolsa venta={venta} />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Vendedor: {venta?.usuarios?.nombre ?? '—'} · Subido por {c.usuarios_subio?.nombre ?? '—'} el{' '}
                      {formatearFechaHora(c.fecha_creacion)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-foreground">{c.pagos ? formatearPrecio(Number(c.pagos.monto)) : '—'}</p>
                    {bolsa?.conBolsa && venta && (
                      <p className="text-[11px] text-muted-foreground">
                        de {formatearPrecio(Number(venta.total))} · {formatearPrecio(bolsa.bolsa)} con bolsa
                      </p>
                    )}
                    {c.monto_declarado != null && c.pagos && Number(c.monto_declarado) !== Number(c.pagos.monto) && (
                      <p className="text-[11px] font-semibold text-destructive">
                        Declarado {formatearPrecio(Number(c.monto_declarado))} — no coincide
                      </p>
                    )}
                  </div>
                </div>

                {(c.numero_referencia || c.banco_origen || c.fecha_pago) && (
                  <p className="text-xs text-muted-foreground">
                    {c.numero_referencia && `Ref. ${c.numero_referencia}`}
                    {c.banco_origen && ` · ${c.banco_origen}`}
                    {c.fecha_pago && ` · pagado ${c.fecha_pago}`}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  {firmadas.get(c.url_archivo) && (
                    <a
                      href={firmadas.get(c.url_archivo)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary/80"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Ver comprobante
                    </a>
                  )}
                </div>

                {venta && (
                  <details open={bolsa?.conBolsa}>
                    <summary className="w-fit cursor-pointer list-none text-xs font-semibold text-primary">
                      Ver desglose de pago y productos
                    </summary>
                    <div className="mt-2">
                      <DesgloseVenta venta={venta} montoDeclarado={c.monto_declarado} pagoRevisadoId={c.pagos?.id} />
                    </div>
                  </details>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <form action={revisarComprobante} className="flex items-center gap-2">
                    <input type="hidden" name="comprobante_id" value={c.id} />
                    <input type="hidden" name="accion" value="aprobar" />
                    <button
                      type="submit"
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90"
                    >
                      Aprobar
                    </button>
                  </form>
                  <form action={revisarComprobante} className="flex flex-1 items-center gap-2">
                    <input type="hidden" name="comprobante_id" value={c.id} />
                    <input type="hidden" name="accion" value="rechazar" />
                    <input
                      name="comentario"
                      placeholder="Motivo del rechazo"
                      className="flex-1 rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
                    >
                      Rechazar
                    </button>
                  </form>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
