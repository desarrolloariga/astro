import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, ClipboardCheck, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tienePermiso } from '@/lib/permisos'
import { formatearPrecio, formatearFechaHora } from '@/lib/formato'
import { revisarComprobante } from './acciones'

export const metadata = { title: 'Comprobantes — ASTRO' }

const BUCKET = 'ariga-comprobantes'

type ComprobantePendiente = {
  id: number
  url_archivo: string
  fecha_creacion: string
  numero_referencia: string | null
  banco_origen: string | null
  fecha_pago: string | null
  monto_declarado: number | null
  usuarios_subio: { nombre: string } | null
  pagos: {
    metodo: string
    monto: number
    ventas: {
      id: number
      clientes: { nombre: string } | null
      usuarios: { nombre: string } | null
    } | null
  } | null
}

export default async function BandejaComprobantesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  if (!(await tienePermiso('comprobantes', 'aprobar'))) redirect('/inicio')

  const { ok, error } = await searchParams
  const supabase = await createClient()

  const { data } = await supabase
    .from('comprobantes')
    .select(
      `id, url_archivo, fecha_creacion, numero_referencia, banco_origen, fecha_pago, monto_declarado,
       usuarios_subio:usuarios!comprobantes_subido_por_fkey ( nombre ),
       pagos ( metodo, monto, ventas ( id, clientes ( nombre ), usuarios:vendedor_id ( nombre ) ) )`,
    )
    .eq('estado', 'pendiente')
    .order('fecha_creacion', { ascending: true })

  const lista = (data ?? []) as unknown as ComprobantePendiente[]

  const admin = createAdminClient()
  const firmadas = new Map<string, string>()
  if (lista.length > 0) {
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
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Bandeja de comprobantes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aprueba o rechaza los comprobantes de pago pendientes de revisión.
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
          <ClipboardCheck className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Bandeja al día</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            No hay comprobantes pendientes de revisión.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map((c) => (
            <div key={c.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">
                    Venta #{c.pagos?.ventas?.id} · {c.pagos?.ventas?.clientes?.nombre ?? 'Cliente sin nombre'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Vendedor: {c.pagos?.ventas?.usuarios?.nombre ?? '—'} · Subido por{' '}
                    {c.usuarios_subio?.nombre ?? '—'} el {formatearFechaHora(c.fecha_creacion)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-foreground">
                    {c.pagos ? formatearPrecio(c.pagos.monto) : '—'}
                  </p>
                  {c.monto_declarado != null && c.pagos && c.monto_declarado !== c.pagos.monto && (
                    <p className="text-[11px] font-semibold text-destructive">
                      Declarado {formatearPrecio(c.monto_declarado)} — no coincide
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
          ))}
        </div>
      )}
    </main>
  )
}
