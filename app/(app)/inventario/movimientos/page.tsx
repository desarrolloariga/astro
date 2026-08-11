import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearFechaHora, formatearNumero } from '@/lib/formato'
import { Paginacion } from '@/components/inventario/paginacion'
import { calcularRango, calcularTotalPaginas } from '@/lib/inventario'

export const metadata = { title: 'Movimientos de inventario — ASTRO' }

const TAMANO_PAGINA_MOVIMIENTOS = 30

const TIPOS_MOVIMIENTO = [
  'alta_cedi',
  'salida_transferencia',
  'entrada_transferencia',
  'separado',
  'liberacion',
  'venta',
  'devolucion',
  'ajuste',
  'baja',
  'retenida',
  'entrega',
  'retencion_carrito',
] as const

const ETIQUETAS_TIPO: Record<string, string> = {
  alta_cedi: 'Alta en CEDI',
  salida_transferencia: 'Salida por transferencia',
  entrada_transferencia: 'Entrada por transferencia',
  separado: 'Separado',
  liberacion: 'Liberación',
  venta: 'Venta',
  devolucion: 'Devolución',
  ajuste: 'Ajuste',
  baja: 'Baja',
  retenida: 'Retenida',
  entrega: 'Entrega',
  retencion_carrito: 'Retención de carrito',
}

const CLASES_TIPO: Record<string, string> = {
  alta_cedi: 'bg-primary/10 text-primary',
  entrada_transferencia: 'bg-primary/10 text-primary',
  devolucion: 'bg-primary/10 text-primary',
  entrega: 'bg-primary/10 text-primary',
  salida_transferencia: 'bg-accent text-accent-foreground',
  separado: 'bg-accent text-accent-foreground',
  retenida: 'bg-accent text-accent-foreground',
  retencion_carrito: 'bg-accent text-accent-foreground',
  venta: 'bg-secondary text-secondary-foreground',
  liberacion: 'bg-muted text-muted-foreground',
  ajuste: 'bg-destructive/10 text-destructive',
  baja: 'bg-destructive/10 text-destructive',
}

const clasesCampo =
  'rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'

type Movimiento = {
  id: number
  tipo: string
  cantidad: number
  referencia: string | null
  fecha_creacion: string
  productos: { codigo: string; nombre: string } | null
  origen: { nombre: string } | null
  destino: { nombre: string } | null
  usuarios: { nombre: string } | null
}

export default async function MovimientosInventarioPage({
  searchParams,
}: {
  searchParams: Promise<{
    buscar?: string
    tipo?: string
    tienda_id?: string
    desde?: string
    hasta?: string
    pagina?: string
  }>
}) {
  if (!(await tienePermiso('inventario', 'ver'))) redirect('/inicio')

  const sp = await searchParams
  const buscar = (sp.buscar ?? '').trim()
  const tipo = (sp.tipo ?? '').trim()
  const tiendaId = sp.tienda_id ? Number(sp.tienda_id) : null
  const desde = (sp.desde ?? '').trim()
  const hasta = (sp.hasta ?? '').trim()
  const pagina = Math.max(1, Number(sp.pagina ?? '1') || 1)
  const supabase = await createClient()

  const { data: tiendasData } = await supabase.from('tiendas').select('id, nombre').eq('activo', true).order('nombre')
  const tiendas = tiendasData ?? []

  let productoIds: number[] | null = null
  if (buscar) {
    const buscarSeguro = buscar.replace(/[,()]/g, ' ')
    const { data: productosMatch } = await supabase
      .from('productos')
      .select('id')
      .or(`codigo.ilike.%${buscarSeguro}%,nombre.ilike.%${buscarSeguro}%`)
    productoIds = (productosMatch ?? []).map((p) => p.id)
  }

  let consulta = supabase
    .from('movimientos_inventario')
    .select(
      `id, tipo, cantidad, referencia, fecha_creacion,
       productos ( codigo, nombre ),
       origen:tienda_origen_id ( nombre ),
       destino:tienda_destino_id ( nombre ),
       usuarios ( nombre )`,
      { count: 'exact' },
    )
    .order('fecha_creacion', { ascending: false })

  if (tipo && (TIPOS_MOVIMIENTO as readonly string[]).includes(tipo)) consulta = consulta.eq('tipo', tipo)
  if (tiendaId) consulta = consulta.or(`tienda_origen_id.eq.${tiendaId},tienda_destino_id.eq.${tiendaId}`)
  if (desde) consulta = consulta.gte('fecha_creacion', desde)
  if (hasta) consulta = consulta.lt('fecha_creacion', `${hasta}T23:59:59.999`)
  if (productoIds) consulta = consulta.in('producto_id', productoIds.length > 0 ? productoIds : [-1])

  const { desde: rangoDesde, hasta: rangoHasta } = calcularRango(pagina, TAMANO_PAGINA_MOVIMIENTOS)
  consulta = consulta.range(rangoDesde, rangoHasta)

  const { data, count } = await consulta
  const lista = (data ?? []) as unknown as Movimiento[]
  const totalPaginas = calcularTotalPaginas(count ?? 0, TAMANO_PAGINA_MOVIMIENTOS)

  const construirHref = (paginaDestino: number) => {
    const params = new URLSearchParams()
    if (buscar) params.set('buscar', buscar)
    if (tipo) params.set('tipo', tipo)
    if (tiendaId) params.set('tienda_id', String(tiendaId))
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    if (paginaDestino > 1) params.set('pagina', String(paginaDestino))
    const qs = params.toString()
    return `/inventario/movimientos${qs ? `?${qs}` : ''}`
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <Link
        href="/inventario"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al inventario
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Movimientos de inventario</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bitácora de cada entrada, salida, venta, transferencia y ajuste — línea por línea.
        </p>
      </div>

      <form className="flex flex-wrap items-center gap-2">
        <input
          name="buscar"
          defaultValue={buscar}
          placeholder="Buscar por nombre o código de pieza…"
          className={`${clasesCampo} min-w-56 flex-1`}
        />
        <select name="tipo" defaultValue={tipo} className={clasesCampo}>
          <option value="">Todos los tipos</option>
          {TIPOS_MOVIMIENTO.map((t) => (
            <option key={t} value={t}>
              {ETIQUETAS_TIPO[t]}
            </option>
          ))}
        </select>
        <select name="tienda_id" defaultValue={tiendaId ?? ''} className={clasesCampo}>
          <option value="">Todas las bodegas</option>
          {tiendas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <input type="date" name="desde" defaultValue={desde} className={clasesCampo} />
        <input type="date" name="hasta" defaultValue={hasta} className={clasesCampo} />
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          Filtrar
        </button>
      </form>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <History className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Sin movimientos para estos filtros</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-semibold">Fecha</th>
                  <th className="px-4 py-2 font-semibold">Tipo</th>
                  <th className="px-4 py-2 font-semibold">Pieza</th>
                  <th className="px-4 py-2 font-semibold">Bodega</th>
                  <th className="px-4 py-2 text-right font-semibold">Cantidad</th>
                  <th className="px-4 py-2 font-semibold">Usuario</th>
                  <th className="px-4 py-2 font-semibold">Referencia</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                      {formatearFechaHora(m.fecha_creacion)}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          CLASES_TIPO[m.tipo] ?? 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {ETIQUETAS_TIPO[m.tipo] ?? m.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <p className="font-medium text-foreground">{m.productos?.nombre ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{m.productos?.codigo}</p>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                      {m.origen && m.destino
                        ? `${m.origen.nombre} → ${m.destino.nombre}`
                        : (m.destino ?? m.origen)?.nombre ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-foreground">
                      {formatearNumero(m.cantidad)}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{m.usuarios?.nombre ?? '—'}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{m.referencia ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacion
            paginaActual={pagina}
            totalPaginas={totalPaginas}
            total={count ?? 0}
            construirHref={construirHref}
          />
        </>
      )}
    </main>
  )
}
