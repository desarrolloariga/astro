import { Fragment } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearPrecio } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { hoyGuatemala, nombresOrigen, rangoMes } from '@/lib/contabilidad'

export const metadata = { title: 'Flujo de caja — ASTRO' }

type Flujo = {
  saldo_inicial: number
  meses: { mes: string; origenes: Record<string, number> }[]
  cuentas: { id: number; nombre: string; tipo: string; saldo_inicial: number; saldo_final: number }[]
  cobros_confirmados: number
  cobros_en_bancos: number
}

const ENTRADAS = ['cobro_venta', 'otro_ingreso', 'ajuste', 'otro']
const SALIDAS = ['pago_proveedor', 'gasto', 'pago_comisiones', 'comision_bancaria', 'ajuste', 'otro']

export default async function FlujoCajaPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  if (!(await tienePermiso('bancos', 'gestionar'))) redirect('/inicio')
  const sp = await searchParams
  const hoy = hoyGuatemala()
  const valida = (f?: string) => (f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null)
  const seisMeses = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 6, 1)).toISOString().slice(0, 10)
  const desde = valida(sp.desde) ?? seisMeses
  const hasta = valida(sp.hasta) ?? rangoMes(hoy).hasta

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_flujo_caja', { p_desde: desde, p_hasta: hasta })
  if (error || !data) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{error?.message ?? 'No se pudo calcular'}</p>
      </main>
    )
  }
  const f = data as Flujo

  const valor = (mes: Flujo['meses'][number] | undefined, clave: string) => Number(mes?.origenes?.[clave] ?? 0)
  const meses = f.meses
  const totalEntradas = (m?: Flujo['meses'][number]) => ENTRADAS.reduce((a, o) => a + valor(m, `ingreso:${o}`), 0)
  const totalSalidas = (m?: Flujo['meses'][number]) => SALIDAS.reduce((a, o) => a + valor(m, `egreso:${o}`), 0)
  const suma = (fn: (m: Flujo['meses'][number]) => number) => meses.reduce((a, m) => a + fn(m), 0)

  // Saldo acumulado al cierre de cada mes.
  const saldosCierre: number[] = []
  meses.reduce((saldo, m) => {
    const s = saldo + totalEntradas(m) - totalSalidas(m)
    saldosCierre.push(s)
    return s
  }, Number(f.saldo_inicial))

  const nombreMes = (mm: string) =>
    new Intl.DateTimeFormat('es-GT', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${mm}-01T00:00:00Z`))
  const filasEntradas = ENTRADAS.filter((o) => meses.some((m) => valor(m, `ingreso:${o}`) !== 0))
  const filasSalidas = SALIDAS.filter((o) => meses.some((m) => valor(m, `egreso:${o}`) !== 0))
  const sinRegistrar = Number(f.cobros_confirmados) - Number(f.cobros_en_bancos)
  const año = hoy.slice(0, 4)

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <TrendingUp className="h-5 w-5 text-primary" />
            Flujo de caja
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dinero que realmente entró y salió de las cuentas (libro de bancos). Las transferencias entre cuentas no cuentan.
          </p>
        </div>
        <Link href="/contabilidad/bancos" className="text-sm font-semibold text-primary hover:underline">
          Ir a Bancos →
        </Link>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Desde
          <input type="date" name="desde" defaultValue={desde} className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Hasta
          <input type="date" name="hasta" defaultValue={hasta} className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Ver
        </button>
        <div className="flex gap-2">
          <Link href={`/contabilidad/flujo-caja?desde=${año}-01-01&hasta=${hoy}`} className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:border-primary">
            Año en curso
          </Link>
          <Link href="/contabilidad/flujo-caja" className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:border-primary">
            Últimos 6 meses
          </Link>
        </div>
      </form>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { k: 'Saldo inicial', v: Number(f.saldo_inicial) },
          { k: 'Entradas', v: suma(totalEntradas), c: 'text-emerald-700' },
          { k: 'Salidas', v: suma(totalSalidas) },
          { k: 'Saldo final', v: saldosCierre.at(-1) ?? Number(f.saldo_inicial) },
        ].map((t) => (
          <div key={t.k} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.k}</p>
            <p className={cn('mt-1 text-lg font-bold text-foreground', t.c)}>{formatearPrecio(t.v)}</p>
          </div>
        ))}
      </section>

      {Math.abs(sinRegistrar) >= 0.01 ? (
        <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Cobros de ventas aprobados en el rango: {formatearPrecio(Number(f.cobros_confirmados))}; registrados en bancos:{' '}
          {formatearPrecio(Number(f.cobros_en_bancos))}. Diferencia {formatearPrecio(sinRegistrar)} — regístralos en Bancos → pendientes.
        </p>
      ) : (
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> Todos los cobros de ventas aprobados del rango están registrados en bancos.
        </p>
      )}

      {meses.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card py-10 text-center text-sm text-muted-foreground">
          Sin movimientos de bancos en este rango.
        </p>
      ) : (
        <section className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm" style={{ minWidth: 260 + meses.length * 120 }}>
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Concepto</th>
                {meses.map((m) => (
                  <th key={m.mes} className="px-4 py-2.5 text-right font-semibold capitalize">
                    {nombreMes(m.mes)}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {[
                { titulo: 'Entradas', tipo: 'ingreso', filas: filasEntradas, total: totalEntradas },
                { titulo: 'Salidas', tipo: 'egreso', filas: filasSalidas, total: totalSalidas },
              ].map((g) => (
                <Fragment key={g.titulo}>
                  <tr className="border-b border-border bg-secondary/20">
                    <td colSpan={meses.length + 2} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {g.titulo}
                    </td>
                  </tr>
                  {g.filas.map((o) => (
                    <tr key={`${g.tipo}-${o}`} className="border-b border-border">
                      <td className="px-4 py-1.5 pl-6 text-foreground">{nombresOrigen[o] ?? o}</td>
                      {meses.map((m) => (
                        <td key={m.mes} className="px-4 py-1.5 text-right text-foreground">
                          {valor(m, `${g.tipo}:${o}`) ? formatearPrecio(valor(m, `${g.tipo}:${o}`)) : '—'}
                        </td>
                      ))}
                      <td className="px-4 py-1.5 text-right font-semibold">{formatearPrecio(suma((m) => valor(m, `${g.tipo}:${o}`)))}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-border font-semibold">
                    <td className="px-4 py-2 text-foreground">Total {g.titulo.toLowerCase()}</td>
                    {meses.map((m) => (
                      <td key={m.mes} className={cn('px-4 py-2 text-right', g.tipo === 'ingreso' ? 'text-emerald-700' : 'text-foreground')}>
                        {formatearPrecio(g.total(m))}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right">{formatearPrecio(suma(g.total))}</td>
                  </tr>
                </Fragment>
              ))}
              <tr className="border-b border-border bg-primary/5 font-bold">
                <td className="px-4 py-2 text-foreground">Flujo neto</td>
                {meses.map((m) => {
                  const n = totalEntradas(m) - totalSalidas(m)
                  return (
                    <td key={m.mes} className={cn('px-4 py-2 text-right', n < 0 ? 'text-destructive' : 'text-foreground')}>
                      {formatearPrecio(n)}
                    </td>
                  )
                })}
                <td className="px-4 py-2 text-right">{formatearPrecio(suma(totalEntradas) - suma(totalSalidas))}</td>
              </tr>
              <tr className="font-semibold">
                <td className="px-4 py-2 text-foreground">Saldo al cierre</td>
                {saldosCierre.map((s, i) => (
                  <td key={meses[i].mes} className="px-4 py-2 text-right text-foreground">
                    {formatearPrecio(s)}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {f.cuentas.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-bold text-foreground">Saldos por cuenta</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {f.cuentas.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2 text-sm">
                <span className="text-foreground">{c.nombre}</span>
                <span className="text-right">
                  <span className="block font-bold text-foreground">{formatearPrecio(Number(c.saldo_final))}</span>
                  <span className="text-[11px] text-muted-foreground">inicio {formatearPrecio(Number(c.saldo_inicial))}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
