import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, Truck, FileText, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { formatearFechaHora } from '@/lib/formato'
import { EstadoBadge, estadosPedido } from '@/components/app/estado-badge'
import { avanzarPedido } from './acciones'

export const metadata = { title: 'Pedidos — ASTRO' }

const BUCKET = 'astro-pedidos'

type Documento = { id: number; tipo: string; url: string }

type Pedido = {
  id: number
  estado: string
  fecha_creacion: string
  fecha_listo_despacho: string | null
  fecha_despacho: string | null
  fecha_entrega: string | null
  direccion_entrega: string | null
  usuarios: { nombre: string } | null
  ventas: {
    id: number
    clientes: { nombre: string } | null
    venta_detalles: { productos: { nombre: string } | null }[]
  } | null
  pedido_documentos: Documento[]
}

const nombresDocumento: Record<string, string> = {
  guia: 'Guía de despacho',
  evidencia_entrega: 'Evidencia de entrega',
  otro: 'Documento',
}

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; estado?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol === 'contabilidad') redirect('/inicio')

  const { ok, error, estado } = await searchParams
  const supabase = await createClient()

  // Producción entra directo a su cola accionable (listos para despacho),
  // salvo que explícitamente pida ver otro estado.
  const filtroEstado = estado ?? (usuario.rol === 'produccion' ? 'listo_para_despacho' : undefined)

  let consulta = supabase
    .from('pedidos')
    .select(
      `id, estado, fecha_creacion, fecha_listo_despacho, fecha_despacho, fecha_entrega, direccion_entrega,
       usuarios:confirmado_por ( nombre ),
       ventas ( id, clientes ( nombre ), venta_detalles ( productos ( nombre ) ) ),
       pedido_documentos ( id, tipo, url )`,
    )
    .order('fecha_creacion', { ascending: false })
    .limit(100)
  if (filtroEstado) consulta = consulta.eq('estado', filtroEstado)

  const { data } = await consulta
  const lista = (data ?? []) as unknown as Pedido[]

  const admin = createAdminClient()
  const rutas = lista.flatMap((p) => p.pedido_documentos.map((d) => d.url))
  const firmadas = new Map<string, string>()
  if (rutas.length > 0) {
    const { data: urls } = await admin.storage.from(BUCKET).createSignedUrls(rutas, 3600)
    urls?.forEach((u) => {
      if (u.signedUrl) firmadas.set(u.path ?? '', u.signedUrl)
    })
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Pedidos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {usuario.rol === 'produccion'
            ? 'Cola de despacho: pedidos con el pago ya aprobado por contabilidad.'
            : 'Seguimiento de despacho y entrega de cada venta.'}
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
          <Truck className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">
            {filtroEstado ? 'Sin pedidos en este estado' : 'Aún no hay pedidos'}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Cada venta genera automáticamente un pedido para su seguimiento.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map((p) => {
            const siguienteEstado =
              p.estado === 'listo_para_despacho' ? 'despachado' : p.estado === 'despachado' ? 'entregado' : null

            return (
              <div key={p.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1">
                      <EstadoBadge estado={p.estado} config={estadosPedido} />
                    </div>
                    <p className="font-semibold text-foreground">
                      Pedido #{p.id} · Venta #{p.ventas?.id}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.ventas?.clientes?.nombre ?? 'Cliente sin nombre'} ·{' '}
                      {p.ventas?.venta_detalles.map((d) => d.productos?.nombre).filter(Boolean).join(', ')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.estado === 'entregado' && p.fecha_entrega
                        ? `Entregado: ${formatearFechaHora(p.fecha_entrega)}`
                        : p.estado === 'despachado' && p.fecha_despacho
                          ? `Despachado: ${formatearFechaHora(p.fecha_despacho)}`
                          : p.estado === 'listo_para_despacho' && p.fecha_listo_despacho
                            ? `Aprobado: ${formatearFechaHora(p.fecha_listo_despacho)}`
                            : `Creado: ${formatearFechaHora(p.fecha_creacion)}`}
                      {(p.estado === 'despachado' || p.estado === 'entregado') &&
                        p.usuarios &&
                        ` · por ${p.usuarios.nombre}`}
                    </p>
                    {p.direccion_entrega && (
                      <p className="text-xs text-muted-foreground">Entrega en: {p.direccion_entrega}</p>
                    )}
                  </div>
                </div>

                {p.pedido_documentos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {p.pedido_documentos.map((d) => (
                      <a
                        key={d.id}
                        href={firmadas.get(d.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium text-foreground hover:opacity-80"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {nombresDocumento[d.tipo] ?? d.tipo}
                      </a>
                    ))}
                  </div>
                )}

                {p.estado === 'en_espera' && (
                  <p className="text-xs text-muted-foreground">
                    Esperando que contabilidad apruebe el comprobante de pago.
                  </p>
                )}

                {siguienteEstado && (
                  <form
                    action={avanzarPedido}
                    encType="multipart/form-data"
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="pedido_id" value={p.id} />
                    <input type="hidden" name="nuevo_estado" value={siguienteEstado} />
                    <input
                      type="file"
                      name="archivo"
                      accept="image/*,application/pdf"
                      className="flex-1 text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-foreground"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {siguienteEstado === 'despachado' ? 'Marcar despachado' : 'Confirmar entrega'}
                    </button>
                  </form>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
