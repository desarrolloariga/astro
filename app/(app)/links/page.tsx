import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, Link2, Eye, ShoppingBag, QrCode, Percent } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { tienePermiso } from '@/lib/permisos'
import { formatearFechaHora, formatearNumero, formatearPrecio } from '@/lib/formato'
import { CopyButton } from '@/components/app/copy-button'
import { CodigoQr } from '@/components/app/codigo-qr'
import { EstadoBadge, estadosVenta } from '@/components/app/estado-badge'
import { crearLinkCatalogo, fijarComisionLink } from './acciones'

export const metadata = { title: 'Enlaces — ASTRO' }

const nombresTipo: Record<string, string> = {
  catalogo: 'Catálogo completo',
  subconjunto: 'Selección de piezas',
  pieza: 'Pieza única',
}

type LinkVenta = {
  id: number
  token: string
  tipo: string
  estado: string
  fecha_vencimiento: string | null
  contador_visitas: number
  fecha_creacion: string
  comision_embajador_pct: number | null
  carritos: { estado: string }[]
}

type VentaLink = {
  id: number
  link_id: number
  estado: string
  total: number
  fecha_creacion: string
  clientes: { nombre: string } | null
}

export default async function LinksPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (!['tienda', 'asesor', 'embajador', 'admin'].includes(usuario.rol)) redirect('/inicio')

  const puedeFijarComision = await tienePermiso('links', 'fijar_comision')
  const { ok, error } = await searchParams
  const supabase = await createClient()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const [{ data }, { data: parametroDefault }] = await Promise.all([
    supabase
      .from('links_venta')
      .select(
        'id, token, tipo, estado, fecha_vencimiento, contador_visitas, fecha_creacion, comision_embajador_pct, carritos ( estado )',
      )
      .order('fecha_creacion', { ascending: false })
      .limit(100),
    supabase
      .from('parametros')
      .select('valor')
      .eq('clave', 'comision_embajador_catalogo_pct_default')
      .maybeSingle(),
  ])

  const lista = (data ?? []) as unknown as LinkVenta[]
  const pctDefault = Number(parametroDefault?.valor ?? 0)

  // ventas.link_id no tiene FK declarada hacia links_venta (columna suelta
  // desde la fase 3), así que no se puede anidar en el select de arriba —
  // se consulta aparte y se agrupa en memoria.
  const ventasPorLink = new Map<number, VentaLink[]>()
  if (lista.length > 0) {
    const { data: ventasData } = await supabase
      .from('ventas')
      .select('id, link_id, estado, total, fecha_creacion, clientes ( nombre )')
      .in(
        'link_id',
        lista.map((l) => l.id),
      )
      .order('fecha_creacion', { ascending: false })

    ;(ventasData as unknown as VentaLink[] | null)?.forEach((v) => {
      const grupo = ventasPorLink.get(v.link_id) ?? []
      grupo.push(v)
      ventasPorLink.set(v.link_id, grupo)
    })
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Enlaces de venta</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Comparte el catálogo con un cliente final; la compra se te atribuye automáticamente.
          </p>
        </div>
        <form action={crearLinkCatalogo}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
          >
            <Link2 className="h-4 w-4" />
            Generar enlace de catálogo
          </button>
        </form>
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
          <Link2 className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Aún no has generado enlaces</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            También puedes generar un enlace de una pieza específica desde su ficha en el catálogo.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map((l) => {
            const confirmados = l.carritos.filter((c) => c.estado === 'confirmado').length
            const ventasLink = ventasPorLink.get(l.id) ?? []
            const url = `${baseUrl}/c/${l.token}`
            return (
              <div key={l.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">{nombresTipo[l.tipo] ?? l.tipo}</p>
                    <p className="text-xs text-muted-foreground">
                      Creado {formatearFechaHora(l.fecha_creacion)}
                      {l.fecha_vencimiento && ` · Vence ${formatearFechaHora(l.fecha_vencimiento)}`}
                    </p>
                  </div>
                  <span
                    className={
                      l.estado === 'activo'
                        ? 'rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary'
                        : 'rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground'
                    }
                  >
                    {l.estado === 'activo' ? 'Activo' : l.estado === 'vencido' ? 'Vencido' : 'Desactivado'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
                  <span className="flex-1 truncate font-mono">{url}</span>
                  <CopyButton texto={url} />
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" /> {l.contador_visitas} visitas
                  </span>
                  <span className="flex items-center gap-1">
                    <ShoppingBag className="h-3.5 w-3.5" /> {confirmados} compra(s)
                  </span>
                </div>

                {ventasLink.length > 0 && (
                  <details>
                    <summary className="w-fit cursor-pointer list-none text-xs font-semibold text-primary">
                      Ver compras generadas ({ventasLink.length})
                    </summary>
                    <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                      <table className="w-full min-w-[420px] text-xs">
                        <thead>
                          <tr className="border-b border-border bg-secondary/40 text-left uppercase tracking-wide text-muted-foreground">
                            <th className="px-3 py-1.5 font-semibold">Venta</th>
                            <th className="px-3 py-1.5 font-semibold">Cliente</th>
                            <th className="px-3 py-1.5 font-semibold">Estado</th>
                            <th className="px-3 py-1.5 font-semibold">Fecha</th>
                            <th className="px-3 py-1.5 text-right font-semibold">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ventasLink.map((v) => (
                            <tr key={v.id} className="border-b border-border last:border-0">
                              <td className="px-3 py-1.5 text-foreground">
                                <a href={`/ventas#venta-${v.id}`} className="font-semibold hover:underline">
                                  #{v.id}
                                </a>
                              </td>
                              <td className="px-3 py-1.5 text-muted-foreground">
                                {v.clientes?.nombre ?? '—'}
                              </td>
                              <td className="px-3 py-1.5">
                                <EstadoBadge estado={v.estado} config={estadosVenta} />
                              </td>
                              <td className="px-3 py-1.5 text-muted-foreground">
                                {formatearFechaHora(v.fecha_creacion)}
                              </td>
                              <td className="px-3 py-1.5 text-right font-semibold text-foreground">
                                {formatearPrecio(v.total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}

                <details>
                  <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-primary">
                    <QrCode className="h-3.5 w-3.5" />
                    Ver código QR
                  </summary>
                  <div className="flex flex-col items-center gap-2 pt-3">
                    <CodigoQr url={url} alt={`Código QR — ${nombresTipo[l.tipo] ?? l.tipo}`} />
                    <p className="text-center text-xs text-muted-foreground">
                      Escanéalo para abrir este enlace directamente.
                    </p>
                  </div>
                </details>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Percent className="h-3.5 w-3.5" />
                  Comisión por este catálogo:{' '}
                  <span className="font-semibold text-foreground">
                    {formatearNumero(l.comision_embajador_pct ?? pctDefault)}%
                  </span>
                  {l.comision_embajador_pct == null && <span>(por defecto)</span>}
                </div>

                {puedeFijarComision && (
                  <details>
                    <summary className="w-fit cursor-pointer list-none text-xs font-semibold text-primary">
                      Ajustar % de este enlace
                    </summary>
                    <form action={fijarComisionLink} className="mt-2 flex items-center gap-2">
                      <input type="hidden" name="link_id" value={l.id} />
                      <input
                        name="pct"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        defaultValue={l.comision_embajador_pct ?? ''}
                        placeholder={String(pctDefault)}
                        className="w-24 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
                      >
                        Guardar
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
