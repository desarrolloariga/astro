import { redirect } from 'next/navigation'
import { HandCoins, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { formatearPrecio, formatearFecha } from '@/lib/formato'
import { EstadoBadge, type ConfigEstado } from '@/components/app/estado-badge'
import { Paginacion } from '@/components/inventario/paginacion'
import { calcularRango, calcularTotalPaginas } from '@/lib/inventario'

export const metadata = { title: 'Comisiones — ASTRO' }

const TAMANO_PAGINA_COMISIONES = 20

const estadosComision: ConfigEstado = {
  calculada: { etiqueta: 'Calculada', clases: 'bg-accent text-accent-foreground' },
  aprobada: { etiqueta: 'Aprobada', clases: 'bg-brand-deep-muted/40 text-brand-deep' },
  pagada: { etiqueta: 'Pagada', clases: 'bg-primary/10 text-primary' },
}

type Comision = {
  id: number
  venta_id: number | null
  monto: number
  estado: string
  motivo: string | null
  fecha_creacion: string
  periodos: { nombre: string } | null
}
type Liquidacion = {
  id: number
  total: number
  estado: string
  periodos: { nombre: string } | null
}

export default async function ComisionesPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol === 'produccion' || usuario.rol === 'contabilidad') redirect('/inicio')

  const { pagina: paginaParam } = await searchParams
  const pagina = Math.max(1, Number(paginaParam ?? '1') || 1)
  const supabase = await createClient()
  const { desde, hasta } = calcularRango(pagina, TAMANO_PAGINA_COMISIONES)

  const [{ data: comisiones, count: totalComisiones }, { data: liquidaciones }, { data: pendientesData }] =
    await Promise.all([
      supabase
        .from('comisiones')
        .select('id, venta_id, monto, estado, motivo, fecha_creacion, periodos ( nombre )', { count: 'exact' })
        .eq('usuario_id', usuario.id)
        .order('fecha_creacion', { ascending: false })
        .range(desde, hasta),
      supabase
        .from('liquidaciones')
        .select('id, total, estado, periodos ( nombre )')
        .eq('usuario_id', usuario.id)
        .order('id', { ascending: false })
        .limit(12),
      // Aparte y sin límite: el "pendiente de pago" debe sumar el ledger
      // completo, no solo la página que se muestra en pantalla.
      supabase.from('comisiones').select('monto').eq('usuario_id', usuario.id).neq('estado', 'pagada'),
    ])

  const listaComisiones = (comisiones ?? []) as unknown as Comision[]
  const listaLiquidaciones = (liquidaciones ?? []) as unknown as Liquidacion[]
  const pendiente = (pendientesData ?? []).reduce((acc, c) => acc + c.monto, 0)
  const totalPaginas = calcularTotalPaginas(totalComisiones ?? 0, TAMANO_PAGINA_COMISIONES)
  const construirHref = (paginaDestino: number) =>
    `/comisiones${paginaDestino > 1 ? `?pagina=${paginaDestino}` : ''}`

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Mis comisiones</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Comisiones por venta, liderazgo de red y bonos — se liquidan al cierre de cada período.
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Wallet className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm text-muted-foreground">Pendiente de pago</p>
          <p className="text-2xl font-bold text-foreground">{formatearPrecio(pendiente)}</p>
        </div>
      </div>

      {listaLiquidaciones.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-foreground">Liquidaciones por período</h2>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <tbody>
                {listaLiquidaciones.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 text-foreground">{l.periodos?.nombre}</td>
                    <td className="px-4 py-2.5">
                      <EstadoBadge estado={l.estado} config={estadosComision} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-foreground">
                      {formatearPrecio(l.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold text-foreground">Detalle</h2>
        {listaComisiones.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <HandCoins className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
            <p className="text-sm font-semibold text-foreground">Aún no tienes comisiones</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Se generan automáticamente con cada venta, según las reglas activas.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {listaComisiones.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{c.motivo ?? 'Comisión'}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.periodos?.nombre} · {formatearFecha(c.fecha_creacion)}
                      {c.venta_id && (
                        <>
                          {' · '}
                          <a href={`/ventas#venta-${c.venta_id}`} className="font-medium text-primary hover:underline">
                            Ver venta #{c.venta_id}
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <EstadoBadge estado={c.estado} config={estadosComision} />
                    <span className="font-bold text-foreground">{formatearPrecio(c.monto)}</span>
                  </div>
                </div>
              ))}
            </div>
            <Paginacion
              paginaActual={pagina}
              totalPaginas={totalPaginas}
              total={totalComisiones ?? 0}
              construirHref={construirHref}
            />
          </>
        )}
      </section>
    </main>
  )
}
