import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Download, TrendingUp, Boxes, ListOrdered } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearPrecio, formatearNumero, formatearFechaHora } from '@/lib/formato'
import { SeccionMargen, SeccionRedComercial, SeccionSemaforoMetas, EsqueletoSeccion } from './secciones'

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

  // Ventas e inventario alimentan los KPIs de arriba; margen, red comercial
  // y semáforo de metas se transmiten aparte con sus propias consultas.
  const [{ data: ventas }, { data: inventario }] = await Promise.all([
    supabase
      .from('vw_ventas_kpi')
      .select('id, fecha_creacion, canal, total, estado, tienda')
      .gte('fecha_creacion', inicioMes.toISOString())
      .limit(5000),
    supabase.from('vw_inventario_valorizado').select('*'),
  ])

  const ventasMes = ((ventas ?? []) as VentaKpi[]).filter((v) => v.estado !== 'anulada')
  const totalVentas = ventasMes.reduce((acc, v) => acc + v.total, 0)
  const ticketPromedio = ventasMes.length > 0 ? totalVentas / ventasMes.length : 0

  const porCanal = new Map<string, number>()
  ventasMes.forEach((v) => porCanal.set(v.canal, (porCanal.get(v.canal) ?? 0) + v.total))

  const ventasRecientes = [...ventasMes]
    .sort((a, b) => b.fecha_creacion.localeCompare(a.fecha_creacion))
    .slice(0, 15)

  const listaInventario = (inventario ?? []) as InventarioTienda[]
  const capitalTotal = listaInventario.reduce((acc, i) => acc + i.capital_inmovilizado, 0)
  const piezasSinMovimiento = listaInventario.reduce((acc, i) => acc + i.piezas_sin_movimiento_60d, 0)

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
      <Suspense fallback={<EsqueletoSeccion alto="h-40" />}>
        <SeccionMargen desde={inicioMes.toISOString()} />
      </Suspense>

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
      <Suspense fallback={<EsqueletoSeccion alto="h-64" />}>
        <SeccionRedComercial />
      </Suspense>

      {/* Semáforos de metas */}
      <Suspense fallback={<EsqueletoSeccion alto="h-32" />}>
        <SeccionSemaforoMetas />
      </Suspense>
    </main>
  )
}
