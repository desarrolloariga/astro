import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, Truck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { formatearFechaHora, formatearPrecio, formatearNumero } from '@/lib/formato'
import { EstadoBadge, estadosPedido } from '@/components/app/estado-badge'
import { Paginacion } from '@/components/inventario/paginacion'

export const metadata = { title: 'Pedidos — ASTRO' }

const TAMANO_PAGINA = 25
const ESTADOS = ['en_espera', 'pago_rechazado', 'listo_para_despacho', 'en_preparacion', 'despachado', 'entregado']

const clasesCampo =
  'rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'

type Fila = {
  id: number
  estado: string
  fecha_creacion: string
  ciudad: string | null
  departamento: string | null
  nombre_destinatario: string | null
  ventas: {
    id: number
    total: number
    clientes: { nombre: string } | null
    vendedor: { nombre: string } | null
  } | null
}

function uno(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? ''
}

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol === 'contabilidad') redirect('/contabilidad/comprobantes')

  const sp = await searchParams
  const ok = uno(sp.ok)
  const error = uno(sp.error)
  const estado = uno(sp.estado)
  const desde = uno(sp.desde)
  const hasta = uno(sp.hasta)
  const buscar = uno(sp.buscar)
  const pagina = Math.max(1, Number(uno(sp.pagina)) || 1)

  const supabase = await createClient()

  // Alcance por RLS: embajador ve los suyos, asesor/supervisor su
  // cadena, admin/coordinador todos.
  let consulta = supabase
    .from('pedidos')
    .select(
      'id, estado, fecha_creacion, ciudad, departamento, nombre_destinatario, ventas ( id, total, clientes ( nombre ), vendedor:vendedor_id ( nombre ) )',
      { count: 'exact' },
    )
    .order('fecha_creacion', { ascending: false })

  if (estado && ESTADOS.includes(estado)) consulta = consulta.eq('estado', estado)
  if (/^\d{4}-\d{2}-\d{2}$/.test(desde)) consulta = consulta.gte('fecha_creacion', `${desde}T00:00:00`)
  if (/^\d{4}-\d{2}-\d{2}$/.test(hasta)) consulta = consulta.lte('fecha_creacion', `${hasta}T23:59:59`)
  if (buscar) {
    const seguro = buscar.replace(/[,()%]/g, ' ').trim()
    consulta = /^\d+$/.test(seguro)
      ? consulta.eq('id', Number(seguro))
      : consulta.or(`nombre_destinatario.ilike.%${seguro}%,ciudad.ilike.%${seguro}%`)
  }

  const inicio = (pagina - 1) * TAMANO_PAGINA
  const { data, count } = await consulta.range(inicio, inicio + TAMANO_PAGINA - 1)
  const lista = (data ?? []) as unknown as Fila[]
  const total = count ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA))

  const construirHref = (p: number) => {
    const params = new URLSearchParams()
    if (estado) params.set('estado', estado)
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    if (buscar) params.set('buscar', buscar)
    if (p > 1) params.set('pagina', String(p))
    return `/pedidos?${params.toString()}`
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <Truck className="h-5 w-5 text-primary" />
          Pedidos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatearNumero(total)} pedidos · seguimiento desde el pago hasta la recepción.
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

      <form className="flex flex-wrap items-end gap-2">
        <input name="buscar" defaultValue={buscar} placeholder="# pedido, destinatario o ciudad…" className={`${clasesCampo} min-w-48 flex-1`} />
        <select name="estado" defaultValue={estado} className={clasesCampo}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {estadosPedido[e]?.etiqueta ?? e}
            </option>
          ))}
        </select>
        <label className="flex flex-col text-xs text-muted-foreground">
          Desde
          <input type="date" name="desde" defaultValue={desde} className={clasesCampo} />
        </label>
        <label className="flex flex-col text-xs text-muted-foreground">
          Hasta
          <input type="date" name="hasta" defaultValue={hasta} className={clasesCampo} />
        </label>
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
          Filtrar
        </button>
      </form>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Truck className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Sin pedidos para estos filtros</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Pedido</th>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Cliente / recibe</th>
                  <th className="px-4 py-3 font-semibold">Vendedor</th>
                  <th className="px-4 py-3 font-semibold">Destino</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id} className="border-b border-border transition-colors last:border-0 hover:bg-secondary/40">
                    <td className="px-4 py-3">
                      <Link href={`/pedidos/${p.id}`} className="font-semibold text-primary hover:underline">
                        #{p.id}
                      </Link>
                      <p className="text-xs text-muted-foreground">Venta #{p.ventas?.id}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatearFechaHora(p.fecha_creacion)}</td>
                    <td className="px-4 py-3">
                      <p className="text-foreground">{p.ventas?.clientes?.nombre ?? '—'}</p>
                      {p.nombre_destinatario && p.nombre_destinatario !== p.ventas?.clientes?.nombre && (
                        <p className="text-xs text-muted-foreground">Recibe: {p.nombre_destinatario}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.ventas?.vendedor?.nombre ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {[p.ciudad, p.departamento].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      {formatearPrecio(Number(p.ventas?.total ?? 0))}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/pedidos/${p.id}`}>
                        <EstadoBadge estado={p.estado} config={estadosPedido} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacion paginaActual={pagina} totalPaginas={totalPaginas} total={total} construirHref={construirHref} />
        </>
      )}
    </main>
  )
}
