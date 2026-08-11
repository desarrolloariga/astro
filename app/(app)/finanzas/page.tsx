import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Download, TrendingUp, Boxes, Users, Target, Percent, ListOrdered } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearPrecio, formatearNumero, formatearFechaHora } from '@/lib/formato'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Finanzas — ASTRO' }

type VentaKpi = {
  id: number
  fecha_creacion: string
  canal: string
  total: number
  estado: string
  tienda: string | null
}
type InventarioTienda = {
  tienda_id: number | null
  tienda: string | null
  tienda_tipo: string | null
  piezas: number
  capital_inmovilizado: number
  valor_venta_potencial: number
  piezas_sin_movimiento_60d: number
}
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

const nombresCanal: Record<string, string> = {
  tienda: 'Tienda',
  asesor: 'Asesor',
  embajador: 'Embajador',
  link: 'Enlace',
}

export default async function FinanzasPage() {
  if (!(await tienePermiso('finanzas', 'ver'))) redirect('/inicio')

  const supabase = await createClient()
  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const [{ data: ventas }, { data: inventario }, { data: red }, { data: metas }, { data: margenData }] =
    await Promise.all([
      supabase
        .from('vw_ventas_kpi')
        .select('id, fecha_creacion, canal, total, estado, tienda')
        .gte('fecha_creacion', inicioMes.toISOString())
        .limit(5000),
      supabase.from('vw_inventario_valorizado').select('*'),
      supabase.from('vw_red_comercial').select('*'),
      supabase
        .from('metas')
        .select('id, ambito, usuario_id, tienda_id, monto_meta, usuarios ( nombre ), tiendas ( nombre ), periodos ( fecha_inicio, fecha_fin )')
        .order('id', { ascending: false })
        .limit(30),
      // vw_margen_producto: margen real por línea de venta — sin usar en
      // ningún reporte hasta ahora.
      supabase
        .from('vw_margen_producto')
        .select('venta_id, categoria, precio_venta, margen, margen_pct')
        .gte('fecha_creacion', inicioMes.toISOString()),
    ])

  const ventasMes = ((ventas ?? []) as VentaKpi[]).filter((v) => v.estado !== 'anulada')
  const totalVentas = ventasMes.reduce((acc, v) => acc + v.total, 0)
  const ticketPromedio = ventasMes.length > 0 ? totalVentas / ventasMes.length : 0

  const porCanal = new Map<string, number>()
  ventasMes.forEach((v) => porCanal.set(v.canal, (porCanal.get(v.canal) ?? 0) + v.total))

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

  const ventasRecientes = [...ventasMes]
    .sort((a, b) => b.fecha_creacion.localeCompare(a.fecha_creacion))
    .slice(0, 15)

  const listaInventario = (inventario ?? []) as InventarioTienda[]
  const capitalTotal = listaInventario.reduce((acc, i) => acc + i.capital_inmovilizado, 0)
  const piezasSinMovimiento = listaInventario.reduce((acc, i) => acc + i.piezas_sin_movimiento_60d, 0)

  const listaRed = (red ?? []) as RedComercial[]
  const activos = listaRed.filter((r) => r.activo_periodo).length

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
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Finanzas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ventas, inventario valorizado y actividad de la red comercial.
          </p>
        </div>
        <a
          href="/finanzas/exportar"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
        >
          <Download className="h-4 w-4" />
          Exportar ventas CSV
        </a>
      </div>

      {/* KPIs generales */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Ventas del mes</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{formatearPrecio(totalVentas)}</p>
          <p className="text-xs text-muted-foreground">{ventasMes.length} transacciones</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Ticket promedio</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{formatearPrecio(ticketPromedio)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Capital inmovilizado</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{formatearPrecio(capitalTotal)}</p>
          <p className="text-xs text-muted-foreground">{piezasSinMovimiento} piezas sin movimiento (60+ días)</p>
        </div>
      </section>

      {/* Ventas por canal */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <TrendingUp className="h-4 w-4 text-primary" /> Ventas del mes por canal
        </h2>
        {porCanal.size === 0 ? (
          <p className="text-sm text-muted-foreground">Sin ventas este mes.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {Array.from(porCanal.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([canal, monto]) => (
                <div key={canal} className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm">
                  <span className="font-medium text-foreground">{nombresCanal[canal] ?? canal}</span>
                  <span className="font-bold text-foreground">{formatearPrecio(monto)}</span>
                </div>
              ))}
          </div>
        )}
      </section>

      {/* Margen por categoría — vw_margen_producto */}
      {filasMargen.length > 0 && (
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
      )}

      {/* Ventas recientes — línea por línea; el CSV trae el mes completo */}
      {ventasRecientes.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
              <ListOrdered className="h-4 w-4 text-primary" /> Ventas recientes
            </h2>
            <Link href="/ventas" className="text-xs font-medium text-primary hover:underline">
              Ver todas en /ventas →
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-semibold">Venta</th>
                  <th className="px-4 py-2 font-semibold">Tienda</th>
                  <th className="px-4 py-2 font-semibold">Canal</th>
                  <th className="px-4 py-2 font-semibold">Fecha</th>
                  <th className="px-4 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {ventasRecientes.map((v) => (
                  <tr key={v.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-foreground">
                      <a href={`/ventas#venta-${v.id}`} className="font-semibold hover:underline">
                        #{v.id}
                      </a>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{v.tienda ?? '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{nombresCanal[v.canal] ?? v.canal}</td>
                    <td className="px-4 py-2 text-muted-foreground">{formatearFechaHora(v.fecha_creacion)}</td>
                    <td className="px-4 py-2 text-right font-semibold text-foreground">
                      {formatearPrecio(v.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Inventario valorizado */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <Boxes className="h-4 w-4 text-primary" /> Inventario valorizado por tienda
        </h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-semibold">Tienda</th>
                <th className="px-4 py-2 text-right font-semibold">Piezas</th>
                <th className="px-4 py-2 text-right font-semibold">Capital</th>
                <th className="px-4 py-2 text-right font-semibold">Sin movimiento</th>
              </tr>
            </thead>
            <tbody>
              {listaInventario.map((i) => (
                <tr key={i.tienda_id ?? 'sin-tienda'} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-foreground">{i.tienda ?? 'Sin asignar'}</td>
                  <td className="px-4 py-2 text-right text-foreground">{formatearNumero(i.piezas)}</td>
                  <td className="px-4 py-2 text-right font-semibold text-foreground">{formatearPrecio(i.capital_inmovilizado)}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{i.piezas_sin_movimiento_60d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Red comercial */}
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

      {/* Semáforos de metas */}
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
    </main>
  )
}
