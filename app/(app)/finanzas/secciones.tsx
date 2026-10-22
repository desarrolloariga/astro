import { Users, Target, Percent } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatearPrecio, formatearNumero } from '@/lib/formato'
import { cn } from '@/lib/utils'

/**
 * Bloques secundarios de Finanzas que se transmiten con Suspense: margen por
 * categoría, red comercial y semáforo de metas. Cada uno trae sus propias
 * consultas para que los KPIs y las ventas del mes no esperen por ellos.
 */

type RedComercial = {
  usuario_id: number
  nombre: string
  rol: string
  tienda: string | null
  ventas_periodo: number
  num_ventas_periodo: number
  activo_periodo: boolean
}
type MargenProducto = {
  venta_id: number
  categoria: string | null
  precio_venta: number
  margen: number | null
  margen_pct: number | null
}
type MetaConProgreso = {
  id: number
  ambito: string
  usuario_id: number | null
  tienda_id: number | null
  monto_meta: number
  usuarios: { nombre: string } | null
  tiendas: { nombre: string } | null
  periodos: { fecha_inicio: string; fecha_fin: string } | null
}

/** Margen real por categoría en lo que va del mes (vw_margen_producto). */
export async function SeccionMargen({ desde }: { desde: string }) {
  const supabase = await createClient()
  // vw_margen_producto: margen real por línea de venta — sin usar en
  // ningún reporte hasta ahora.
  const { data: margenData } = await supabase
    .from('vw_margen_producto')
    .select('venta_id, categoria, precio_venta, margen, margen_pct')
    .gte('fecha_creacion', desde)

  const listaMargen = (margenData ?? []) as MargenProducto[]
  const margenPorCategoria = new Map<string, { piezas: number; margenTotal: number; ventaTotal: number }>()
  listaMargen.forEach((m) => {
    const clave = m.categoria ?? 'Sin categoría'
    const actual = margenPorCategoria.get(clave) ?? { piezas: 0, margenTotal: 0, ventaTotal: 0 }
    actual.piezas += 1
    actual.margenTotal += m.margen ?? 0
    actual.ventaTotal += m.precio_venta
    margenPorCategoria.set(clave, actual)
  })
  const filasMargen = Array.from(margenPorCategoria.entries())
    .map(([categoria, v]) => ({
      categoria,
      ...v,
      margenPct: v.ventaTotal > 0 ? (v.margenTotal / v.ventaTotal) * 100 : 0,
    }))
    .sort((a, b) => b.margenTotal - a.margenTotal)

  if (filasMargen.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
        <Percent className="h-4 w-4 text-primary" /> Margen por categoría (este mes)
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-semibold">Categoría</th>
              <th className="px-4 py-2 text-right font-semibold">Piezas</th>
              <th className="px-4 py-2 text-right font-semibold">Margen</th>
              <th className="px-4 py-2 text-right font-semibold">Margen %</th>
            </tr>
          </thead>
          <tbody>
            {filasMargen.map((f) => (
              <tr key={f.categoria} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-foreground">{f.categoria}</td>
                <td className="px-4 py-2 text-right text-muted-foreground">{formatearNumero(f.piezas)}</td>
                <td className="px-4 py-2 text-right font-semibold text-foreground">
                  {formatearPrecio(f.margenTotal)}
                </td>
                <td className="px-4 py-2 text-right text-muted-foreground">
                  {f.margenPct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** Red comercial: ventas del período y actividad de cada miembro. */
export async function SeccionRedComercial() {
  const supabase = await createClient()
  const { data: red } = await supabase.from('vw_red_comercial').select('*')

  const listaRed = (red ?? []) as RedComercial[]
  const activos = listaRed.filter((r) => r.activo_periodo).length

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
        <Users className="h-4 w-4 text-primary" /> Red comercial — {activos}/{listaRed.length} activos este mes
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-semibold">Nombre</th>
              <th className="px-4 py-2 font-semibold">Rol</th>
              <th className="px-4 py-2 text-right font-semibold">Ventas del mes</th>
              <th className="px-4 py-2 text-right font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {listaRed.map((r) => (
              <tr key={r.usuario_id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-foreground">{r.nombre}</td>
                <td className="px-4 py-2 text-muted-foreground">{r.rol}</td>
                <td className="px-4 py-2 text-right font-semibold text-foreground">{formatearPrecio(r.ventas_periodo)}</td>
                <td className="px-4 py-2 text-right">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      r.activo_periodo ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {r.activo_periodo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** Semáforo de metas vigentes: una consulta de ventas por meta, tras cargar las metas. */
export async function SeccionSemaforoMetas() {
  const supabase = await createClient()
  const { data: metas } = await supabase
    .from('metas')
    .select('id, ambito, usuario_id, tienda_id, monto_meta, usuarios ( nombre ), tiendas ( nombre ), periodos ( fecha_inicio, fecha_fin )')
    .order('id', { ascending: false })
    .limit(30)

  const listaMetas = (metas ?? []) as unknown as MetaConProgreso[]
  const metasVigentes = listaMetas.filter((m) => m.periodos && new Date(m.periodos.fecha_fin) >= new Date())

  const progresoMetas = await Promise.all(
    metasVigentes.map(async (m) => {
      if (!m.periodos) return { meta: m, actual: 0 }
      let consulta = supabase
        .from('ventas')
        .select('total')
        .neq('estado', 'anulada')
        .gte('fecha_creacion', m.periodos.fecha_inicio)
        .lt('fecha_creacion', m.periodos.fecha_fin)
      consulta = m.ambito === 'vendedor'
        ? consulta.eq('vendedor_id', m.usuario_id ?? 0)
        : consulta.eq('tienda_id', m.tienda_id ?? 0)
      const { data } = await consulta
      const actual = (data ?? []).reduce((acc, v) => acc + (v.total ?? 0), 0)
      return { meta: m, actual }
    }),
  )

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
        <Target className="h-4 w-4 text-primary" /> Semáforo de metas vigentes
      </h2>
      {progresoMetas.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay metas vigentes.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {progresoMetas.map(({ meta, actual }) => {
            const pct = meta.monto_meta > 0 ? (actual / meta.monto_meta) * 100 : 0
            const color = pct >= 100 ? 'bg-primary' : pct >= 70 ? 'bg-accent' : 'bg-destructive'
            return (
              <div key={meta.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm">
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', color)} />
                <span className="flex-1 font-medium text-foreground">
                  {meta.ambito === 'vendedor' ? meta.usuarios?.nombre : meta.tiendas?.nombre}
                </span>
                <span className="text-muted-foreground">
                  {formatearPrecio(actual)} / {formatearPrecio(meta.monto_meta)}
                </span>
                <span className="w-12 text-right font-semibold text-foreground">{Math.round(pct)}%</span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

/** Título + bloque del alto aproximado de la sección que se está cargando. */
export function EsqueletoSeccion({ alto }: { alto: 'h-32' | 'h-40' | 'h-64' }) {
  return (
    <div className="flex animate-pulse flex-col gap-3" aria-busy="true" aria-label="Cargando">
      <div className="h-5 w-64 max-w-full rounded-md bg-secondary" />
      <div className={`${alto} rounded-xl bg-secondary/70`} />
    </div>
  )
}
