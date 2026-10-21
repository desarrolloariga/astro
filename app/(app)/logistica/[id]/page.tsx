import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AlertCircle, ArrowLeft, CheckCircle2, FileText, MapPin, PackageCheck, PlayCircle, Truck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tienePermiso } from '@/lib/permisos'
import { formatearFechaHora } from '@/lib/formato'
import { EstadoBadge, estadosPedido } from '@/components/app/estado-badge'
import { MapaUbicacionLectura } from '@/components/app/mapa-ubicacion'
import { FirmaCanvas } from '@/components/app/firma-canvas'
import { cn } from '@/lib/utils'
import { iniciarPreparacion, marcarItem, despacharPedido } from '../acciones'

export const metadata = { title: 'Despacho de pedido — ASTRO' }

const clasesCampo =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'

type Pedido = {
  id: number
  estado: string
  fecha_aprobacion_pago: string | null
  nombre_destinatario: string | null
  telefono_destinatario: string | null
  departamento: string | null
  ciudad: string | null
  direccion_entrega: string | null
  referencia_entrega: string | null
  latitud: number | null
  longitud: number | null
  firma_nombre: string | null
  guia_envio: string | null
  ventas: {
    id: number
    clientes: { nombre: string; telefono: string | null } | null
    vendedor: { nombre: string } | null
    venta_detalles: { id: number; cantidad: number; productos: { codigo: string; nombre: string } | null }[]
  } | null
  pedido_documentos: { id: number; tipo: string; url: string }[]
}

type ItemChecklist = { venta_detalle_id: number; verificado: boolean; observacion: string | null }

export default async function DespachoPedidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  if (!(await tienePermiso('pedidos', 'despachar'))) redirect('/inicio')
  const { id } = await params
  const { ok, error } = await searchParams
  const supabase = await createClient()

  const [{ data }, { data: checklistData }] = await Promise.all([
    supabase
      .from('pedidos')
      .select(
        `id, estado, fecha_aprobacion_pago, nombre_destinatario, telefono_destinatario, departamento, ciudad,
         direccion_entrega, referencia_entrega, latitud, longitud, firma_nombre, guia_envio,
         ventas ( id, clientes ( nombre, telefono ), vendedor:vendedor_id ( nombre ),
           venta_detalles ( id, cantidad, productos ( codigo, nombre ) ) ),
         pedido_documentos ( id, tipo, url )`,
      )
      .eq('id', id)
      .maybeSingle(),
    supabase.from('pedido_checklist').select('venta_detalle_id, verificado, observacion').eq('pedido_id', id),
  ])

  const pedido = data as unknown as Pedido | null
  if (!pedido) notFound()

  const checklist = new Map(((checklistData ?? []) as ItemChecklist[]).map((c) => [c.venta_detalle_id, c]))
  const lineas = pedido.ventas?.venta_detalles ?? []
  const verificados = lineas.filter((l) => checklist.get(l.id)?.verificado).length
  const enPreparacion = pedido.estado === 'en_preparacion'
  const completo = enPreparacion && lineas.length > 0 && verificados === lineas.length

  const admin = createAdminClient()
  const firmadas = new Map<string, string>()
  if (pedido.pedido_documentos.length > 0) {
    const { data: urls } = await admin.storage
      .from('astro-pedidos')
      .createSignedUrls(pedido.pedido_documentos.map((d) => d.url), 3600)
    urls?.forEach((u) => u.signedUrl && firmadas.set(u.path ?? '', u.signedUrl))
  }
  const orden = pedido.pedido_documentos.find((d) => d.tipo === 'orden_despacho')

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <Link
        href="/logistica"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Torre de control
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Pedido #{pedido.id}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Venta #{pedido.ventas?.id} · vendedor {pedido.ventas?.vendedor?.nombre ?? '—'}
            {pedido.fecha_aprobacion_pago && ` · pago aprobado ${formatearFechaHora(pedido.fecha_aprobacion_pago)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <EstadoBadge estado={pedido.estado} config={estadosPedido} />
          <Link href={`/pedidos/${pedido.id}`} className="text-xs font-semibold text-primary hover:underline">
            Ver trazabilidad
          </Link>
        </div>
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                <PackageCheck className="h-4 w-4 text-primary" />
                Checklist de artículos
              </h2>
              {enPreparacion && (
                <span className="text-xs font-semibold text-foreground">
                  {verificados} / {lineas.length} verificados
                </span>
              )}
            </div>

            {pedido.estado === 'listo_para_despacho' && (
              <form action={iniciarPreparacion} className="mb-4">
                <input type="hidden" name="pedido_id" value={pedido.id} />
                <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
                  <PlayCircle className="h-4 w-4" />
                  Iniciar preparación
                </button>
              </form>
            )}

            <div className="flex flex-col gap-2">
              {lineas.map((l) => {
                const item = checklist.get(l.id)
                const verificado = item?.verificado ?? false
                return (
                  <div
                    key={l.id}
                    className={cn(
                      'flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center',
                      verificado ? 'border-emerald-600/40 bg-emerald-600/5' : 'border-border bg-background',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {l.productos?.nombre ?? '—'} <span className="text-muted-foreground">×{l.cantidad}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{l.productos?.codigo}</p>
                      {item?.observacion && <p className="text-xs text-amber-700">{item.observacion}</p>}
                    </div>
                    {enPreparacion && (
                      <form action={marcarItem} className="flex items-center gap-2">
                        <input type="hidden" name="pedido_id" value={pedido.id} />
                        <input type="hidden" name="venta_detalle_id" value={l.id} />
                        <input type="hidden" name="verificado" value={verificado ? 'no' : 'si'} />
                        <input
                          name="observacion"
                          defaultValue={item?.observacion ?? ''}
                          placeholder="Observación"
                          className="w-36 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                        />
                        <button
                          type="submit"
                          className={cn(
                            'shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold',
                            verificado ? 'border border-border bg-card text-foreground' : 'bg-emerald-600 text-white',
                          )}
                        >
                          {verificado ? 'Desmarcar' : 'Verificado ✓'}
                        </button>
                      </form>
                    )}
                    {!enPreparacion && verificado && <span className="text-xs font-semibold text-emerald-700">Verificado</span>}
                  </div>
                )
              })}
            </div>
          </section>

          {enPreparacion && (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                <Truck className="h-4 w-4 text-primary" />
                Firma y envío
              </h2>
              {!completo && (
                <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
                  Verifica todos los artículos del checklist antes de marcar el envío.
                </p>
              )}
              <form action={despacharPedido} className="flex flex-col gap-3">
                <input type="hidden" name="pedido_id" value={pedido.id} />
                <FirmaCanvas />
                <input name="firma_nombre" required placeholder="Nombre de quien firma y despacha" className={clasesCampo} />
                <input name="guia" placeholder="Número de guía / transportista (opcional)" className={clasesCampo} />
                <button
                  type="submit"
                  disabled={!completo}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Truck className="h-4 w-4" />
                  Certificar y marcar enviado
                </button>
              </form>
            </section>
          )}

          {(pedido.estado === 'despachado' || pedido.estado === 'entregado') && (
            <section className="rounded-xl border border-emerald-600/30 bg-emerald-600/5 p-5 text-sm text-foreground">
              Enviado y firmado por <strong>{pedido.firma_nombre ?? '—'}</strong>
              {pedido.guia_envio && ` · guía ${pedido.guia_envio}`}.
            </section>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <MapPin className="h-4 w-4 text-primary" />
              Entrega
            </h2>
            <dl className="mb-3 grid grid-cols-[90px_1fr] gap-y-1 text-sm">
              <dt className="text-muted-foreground">Recibe</dt>
              <dd className="text-foreground">{pedido.nombre_destinatario ?? pedido.ventas?.clientes?.nombre ?? '—'}</dd>
              <dt className="text-muted-foreground">Teléfono</dt>
              <dd className="text-foreground">{pedido.telefono_destinatario ?? pedido.ventas?.clientes?.telefono ?? '—'}</dd>
              <dt className="text-muted-foreground">Ciudad</dt>
              <dd className="text-foreground">{[pedido.ciudad, pedido.departamento].filter(Boolean).join(', ') || '—'}</dd>
              <dt className="text-muted-foreground">Dirección</dt>
              <dd className="text-foreground">{pedido.direccion_entrega ?? '—'}</dd>
              {pedido.referencia_entrega && (
                <>
                  <dt className="text-muted-foreground">Referencias</dt>
                  <dd className="text-foreground">{pedido.referencia_entrega}</dd>
                </>
              )}
            </dl>
            <MapaUbicacionLectura latitud={pedido.latitud} longitud={pedido.longitud} />
          </section>

          {orden && (
            <a
              href={firmadas.get(orden.url)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm font-semibold text-foreground hover:bg-secondary"
            >
              <FileText className="h-4 w-4 text-primary" />
              Orden de despacho (PDF)
            </a>
          )}
        </div>
      </div>
    </main>
  )
}
