import Link from 'next/link'
import { textoDia } from '@/lib/entrega'
import { notFound } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  MapPin,
  Package,
  Receipt,
  Truck,
  PackageCheck,
  Upload,
  ClipboardCheck,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { tienePermiso } from '@/lib/permisos'
import { formatearFechaHora, formatearPrecio } from '@/lib/formato'
import { EstadoBadge, estadosPedido, estadosComprobante } from '@/components/app/estado-badge'
import { LineaTiempoPedido, type EventoPedido } from '@/components/app/linea-tiempo-pedido'
import { MapaUbicacionLectura } from '@/components/app/mapa-ubicacion'
import { confirmarRecepcion, reenviarComprobante } from '../acciones'

export const metadata = { title: 'Detalle de pedido — ASTRO' }

const clasesCampo =
  'rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'

const nombresDocumento: Record<string, string> = {
  orden_despacho: 'Orden de despacho (PDF)',
  firma_despacho: 'Firma de despacho',
  guia: 'Guía de envío',
  evidencia_entrega: 'Evidencia de entrega',
  otro: 'Documento',
}

type Pedido = {
  id: number
  estado: string
  fecha_creacion: string
  direccion_entrega: string | null
  para_cliente: boolean
  nombre_destinatario: string | null
  telefono_destinatario: string | null
  departamento: string | null
  ciudad: string | null
  referencia_entrega: string | null
  latitud: number | null
  longitud: number | null
  comprador_id: number | null
  metodo_entrega: 'domicilio' | 'recoger' | null
  tipo_entrega: 'inmediata' | 'programada' | null
  fecha_entrega: string | null
  franja_entrega: string | null
  ventas: {
    id: number
    total: number
    vendedor_id: number
    canal: string
    clientes: { nombre: string; telefono: string | null; correo: string | null } | null
    vendedor: { nombre: string } | null
    venta_detalles: { id: number; cantidad: number; precio: number; productos: { codigo: string; nombre: string } | null }[]
    pagos: {
      id: number
      metodo: string
      monto: number
      estado: string
      comprobantes: {
        id: number
        url_archivo: string
        estado: string
        comentario: string | null
        numero_referencia: string | null
        fecha_creacion: string
      }[]
    }[]
  } | null
  pedido_documentos: { id: number; tipo: string; url: string; fecha_creacion: string }[]
}

type ItemChecklist = { venta_detalle_id: number; verificado: boolean; observacion: string | null }

export default async function DetallePedidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const { id } = await params
  const { ok, error } = await searchParams
  const usuario = await obtenerUsuarioActual()
  const puedeDespachar = await tienePermiso('pedidos', 'despachar')
  const supabase = await createClient()

  const [{ data }, { data: eventosData }] = await Promise.all([
    supabase
      .from('pedidos')
      .select(
        `id, estado, fecha_creacion, direccion_entrega, para_cliente, nombre_destinatario, telefono_destinatario,
         departamento, ciudad, referencia_entrega, latitud, longitud, comprador_id,
         metodo_entrega, tipo_entrega, fecha_entrega, franja_entrega,
         ventas ( id, total, vendedor_id, canal, clientes ( nombre, telefono, correo ), vendedor:vendedor_id ( nombre ),
           venta_detalles ( id, cantidad, precio, productos ( codigo, nombre ) ),
           pagos ( id, metodo, monto, estado, comprobantes ( id, url_archivo, estado, comentario, numero_referencia, fecha_creacion ) ) ),
         pedido_documentos ( id, tipo, url, fecha_creacion )`,
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('pedido_eventos')
      .select('estado, fecha, comentario, usuarios:usuario_id ( nombre )')
      .eq('pedido_id', id)
      .order('fecha', { ascending: true }),
  ])

  const pedido = data as unknown as Pedido | null
  if (!pedido) notFound()
  const eventos = (eventosData ?? []) as unknown as EventoPedido[]

  // El checklist existe a partir de que logística inicia la preparación.
  const { data: checklistData } = await supabase
    .from('pedido_checklist')
    .select('venta_detalle_id, verificado, observacion')
    .eq('pedido_id', pedido.id)
  const checklist = new Map(((checklistData ?? []) as ItemChecklist[]).map((c) => [c.venta_detalle_id, c]))

  // URLs firmadas: comprobantes (ariga-comprobantes) y documentos (astro-pedidos).
  const admin = createAdminClient()
  const comprobantes = (pedido.ventas?.pagos ?? []).flatMap((p) => p.comprobantes)
  const firmadas = new Map<string, string>()
  if (comprobantes.length > 0) {
    const { data: urls } = await admin.storage
      .from('ariga-comprobantes')
      .createSignedUrls(comprobantes.map((c) => c.url_archivo), 3600)
    urls?.forEach((u) => u.signedUrl && firmadas.set(u.path ?? '', u.signedUrl))
  }
  if (pedido.pedido_documentos.length > 0) {
    const { data: urls } = await admin.storage
      .from('astro-pedidos')
      .createSignedUrls(pedido.pedido_documentos.map((d) => d.url), 3600)
    urls?.forEach((u) => u.signedUrl && firmadas.set(u.path ?? '', u.signedUrl))
  }

  const esDueno =
    pedido.ventas?.vendedor_id === usuario.id || pedido.comprador_id === usuario.id || usuario.rol === 'admin'
  const lineas = pedido.ventas?.venta_detalles ?? []

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <Link
        href="/pedidos"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a pedidos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Pedido #{pedido.id}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Venta #{pedido.ventas?.id} · {formatearFechaHora(pedido.fecha_creacion)} · vendedor{' '}
            {pedido.ventas?.vendedor?.nombre ?? '—'}
          </p>
        </div>
        <EstadoBadge estado={pedido.estado} config={estadosPedido} />
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

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted-foreground">Seguimiento</h2>
        <LineaTiempoPedido estadoActual={pedido.estado} eventos={eventos} />
      </section>

      {/* Acciones según rol y estado */}
      {pedido.estado === 'despachado' && esDueno && (
        <form action={confirmarRecepcion} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-600/30 bg-emerald-600/5 p-4">
          <input type="hidden" name="pedido_id" value={pedido.id} />
          <p className="text-sm text-foreground">El pedido fue enviado por logística. ¿Ya llegó a su destino?</p>
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
            <PackageCheck className="h-4 w-4" />
            Confirmar recepción
          </button>
        </form>
      )}

      {pedido.estado === 'pago_rechazado' && esDueno && (
        <form action={reenviarComprobante} encType="multipart/form-data" className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <input type="hidden" name="pedido_id" value={pedido.id} />
          <p className="text-sm font-semibold text-destructive">El pago fue rechazado — sube un comprobante nuevo.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input name="referencia_pago" placeholder="Referencia / boleta" className={clasesCampo} />
            <input name="banco_origen" placeholder="Banco" className={clasesCampo} />
            <input name="fecha_pago" type="date" className={clasesCampo} />
            <input name="monto_declarado" type="number" step="0.01" min="0" placeholder="Monto" className={clasesCampo} />
            <input name="comprobante" type="file" required accept="image/*,application/pdf" className="text-xs sm:col-span-2" />
          </div>
          <button type="submit" className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            <Upload className="h-4 w-4" />
            Reenviar comprobante
          </button>
        </form>
      )}

      {puedeDespachar && (pedido.estado === 'listo_para_despacho' || pedido.estado === 'en_preparacion') && (
        <Link
          href={`/logistica/${pedido.id}`}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Truck className="h-4 w-4" />
          Abrir en torre de control
        </Link>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <Package className="h-4 w-4 text-primary" />
            Productos
          </h2>
          <div className="flex flex-col gap-2">
            {lineas.map((l) => {
              const item = checklist.get(l.id)
              return (
                <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg bg-secondary/40 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {l.productos?.nombre ?? '—'}
                      {l.cantidad > 1 && <span className="text-muted-foreground"> ×{l.cantidad}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{l.productos?.codigo}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {item?.verificado && (
                      <span title="Verificado por logística" className="text-emerald-600">
                        <ClipboardCheck className="h-4 w-4" />
                      </span>
                    )}
                    <span className="font-semibold text-foreground">{formatearPrecio(Number(l.precio) * l.cantidad)}</span>
                  </div>
                </div>
              )
            })}
            <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
              <span className="font-semibold text-foreground">Total</span>
              <span className="text-base font-bold text-foreground">{formatearPrecio(Number(pedido.ventas?.total ?? 0))}</span>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <MapPin className="h-4 w-4 text-primary" />
            Envío
          </h2>
          <dl className="mb-3 grid grid-cols-[110px_1fr] gap-y-1 text-sm">
            <dt className="text-muted-foreground">Entrega</dt>
            <dd className="font-semibold text-foreground">
              {pedido.metodo_entrega === 'recoger' ? 'Recoge en CEDI' : 'A domicilio'}
              {pedido.tipo_entrega === 'inmediata' && ' · inmediata'}
              {pedido.tipo_entrega === 'programada' &&
                ` · programada${pedido.fecha_entrega ? ` el ${textoDia(pedido.fecha_entrega)}` : ''}${pedido.franja_entrega ? `, ${pedido.franja_entrega}` : ''}`}
            </dd>
            <dt className="text-muted-foreground">Cliente</dt>
            <dd className="text-foreground">{pedido.ventas?.clientes?.nombre ?? '—'}{!pedido.para_cliente && ' (compra propia)'}</dd>
            <dt className="text-muted-foreground">Recibe</dt>
            <dd className="text-foreground">{pedido.nombre_destinatario ?? '—'}</dd>
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
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <Receipt className="h-4 w-4 text-primary" />
            Pago y comprobantes
          </h2>
          {(pedido.ventas?.pagos ?? []).map((p) => (
            <div key={p.id} className="mb-3 flex flex-col gap-2">
              <p className="text-sm text-foreground">
                {p.metodo} · {formatearPrecio(Number(p.monto))} · <span className="text-muted-foreground">{p.estado}</span>
              </p>
              {p.comprobantes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin comprobante.</p>
              ) : (
                p.comprobantes.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-xs">
                    <a href={firmadas.get(c.url_archivo)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
                      <FileText className="h-3.5 w-3.5" />
                      Ver comprobante{c.numero_referencia ? ` · ref. ${c.numero_referencia}` : ''}
                    </a>
                    <EstadoBadge estado={c.estado} config={estadosComprobante} />
                    {c.comentario && <p className="w-full text-destructive">{c.comentario}</p>}
                  </div>
                ))
              )}
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <FileText className="h-4 w-4 text-primary" />
            Documentos
          </h2>
          {pedido.pedido_documentos.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              La orden de despacho (PDF) se genera cuando contabilidad aprueba el pago.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {pedido.pedido_documentos.map((d) => (
                <a
                  key={d.id}
                  href={firmadas.get(d.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-between gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-primary" />
                    {nombresDocumento[d.tipo] ?? d.tipo}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatearFechaHora(d.fecha_creacion)}</span>
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
