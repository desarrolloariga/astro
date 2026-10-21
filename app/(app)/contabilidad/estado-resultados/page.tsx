import { Fragment } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Landmark, LineChart, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearNumero, formatearPrecio } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { etiquetaCategoria, hoyGuatemala, rangoAnterior, rangoMes } from '@/lib/contabilidad'

export const metadata = { title: 'Estado de resultados — ASTRO' }

type ER = {
  desde: string
  hasta: string
  num_ventas: number
  lineas_sin_costo: number
  ventas_brutas: number
  descuentos: number
  ventas_netas: number
  iva: number
  ingresos_sin_iva: number
  cmv: number
  utilidad_bruta: number
  comisiones_bolsa: number
  comisiones_red: number
  premios: number
  ingresos_envio?: number
  costo_envios?: number
  gastos_operativos: number
  gastos_por_categoria: { categoria: string; monto: number }[]
  utilidad_operativa: number
  gastos_financieros: number
  otros_ingresos: number
  utilidad_neta: number
  cuadre_cobros: { ventas_pagadas: number; cobrado_dinero: number; cobrado_bolsa: number; diferencia: number; por_cobrar: number }
  cuadre_bolsa: {
    saldo_inicial: number
    abonos: number
    redenciones: number
    reversos: number
    ajustes: number
    saldo_final: number
    saldo_actual_total: number
  }
}

type Fila = {
  etiqueta: string
  clave?: keyof ER
  valor?: (e: ER) => number
  signo?: -1 | 1
  tipo?: 'total' | 'resultado' | 'detalle'
  nota?: string
}

const FILAS: Fila[] = [
  { etiqueta: 'Ventas brutas', clave: 'ventas_brutas' },
  { etiqueta: 'Descuentos por desempeño', clave: 'descuentos', signo: -1 },
  { etiqueta: 'Ventas netas', clave: 'ventas_netas', tipo: 'total' },
  { etiqueta: 'IVA incluido en el precio', clave: 'iva', signo: -1, nota: 'se traslada a SAT; no es ingreso' },
  { etiqueta: 'Ingresos sin IVA', clave: 'ingresos_sin_iva', tipo: 'total' },
  { etiqueta: 'Costo de mercancía vendida', clave: 'cmv', signo: -1 },
  { etiqueta: 'UTILIDAD BRUTA', clave: 'utilidad_bruta', tipo: 'resultado' },
  { etiqueta: 'Comisiones de embajadores (Billetera ASTRO)', clave: 'comisiones_bolsa', signo: -1 },
  { etiqueta: 'Comisiones de red y bonos', clave: 'comisiones_red', signo: -1 },
  { etiqueta: 'Premios entregados', clave: 'premios', signo: -1 },
  { etiqueta: 'Ingresos por envío cobrado', clave: 'ingresos_envio', signo: 1 },
  { etiqueta: 'Costo de envíos', clave: 'costo_envios', signo: -1, nota: 'costo real de enviar cada pedido, aunque haya sido gratis' },
  { etiqueta: 'Gastos operativos', clave: 'gastos_operativos', signo: -1 },
  { etiqueta: 'UTILIDAD OPERATIVA', clave: 'utilidad_operativa', tipo: 'resultado' },
  { etiqueta: 'Gastos financieros', clave: 'gastos_financieros', signo: -1 },
  { etiqueta: 'Otros ingresos', clave: 'otros_ingresos', signo: 1 },
  { etiqueta: 'UTILIDAD NETA', clave: 'utilidad_neta', tipo: 'resultado' },
]

const num = (e: ER, f: Fila) => Number((f.clave ? e[f.clave] : f.valor?.(e)) ?? 0)
const pct = (parte: number, base: number) => (base !== 0 ? `${formatearNumero(Math.round((parte / base) * 1000) / 10)}%` : '—')

function Monto({ valor, signo }: { valor: number; signo?: -1 | 1 }) {
  const texto = formatearPrecio(Math.abs(valor))
  return <>{signo === -1 && valor !== 0 ? `(${texto})` : valor < 0 ? `−${texto}` : texto}</>
}

function Verificacion({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <p className={cn('flex items-start gap-1.5 text-xs font-medium', ok ? 'text-emerald-700' : 'text-destructive')}>
      {ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      {texto}
    </p>
  )
}

export default async function EstadoResultadosPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  if (!(await tienePermiso('estado_resultados', 'ver'))) redirect('/inicio')
  const sp = await searchParams
  const hoy = hoyGuatemala()
  const valida = (f?: string) => (f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null)
  const mes = rangoMes(hoy)
  const desde = valida(sp.desde) ?? mes.desde
  const hasta = valida(sp.hasta) ?? mes.hasta
  const anterior = rangoAnterior(desde, hasta)

  const supabase = await createClient()
  const [{ data: actualData, error }, { data: previoData }] = await Promise.all([
    supabase.rpc('fn_estado_resultados', { p_desde: desde, p_hasta: hasta }),
    supabase.rpc('fn_estado_resultados', { p_desde: anterior.desde, p_hasta: anterior.hasta }),
  ])
  if (error || !actualData) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{error?.message ?? 'No se pudo calcular'}</p>
      </main>
    )
  }
  const e = actualData as ER
  const p = (previoData ?? null) as ER | null

  const mesPrevio = rangoMes(new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10))
  const presets = [
    { etiqueta: 'Este mes', ...mes },
    { etiqueta: 'Mes anterior', ...mesPrevio },
    { etiqueta: 'Año en curso', desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy },
  ]
  const cc = e.cuadre_cobros
  const cb = e.cuadre_bolsa
  const cuadraCobros = Math.abs(cc.diferencia) < 0.01

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <LineChart className="h-5 w-5 text-primary" />
            Estado de resultados
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ventas por fecha de venta (no anuladas), ingresos sin IVA. Comparado con el período anterior.
          </p>
        </div>
        <Link href={`/contabilidad/gastos?mes=${desde.slice(0, 7)}`} className="text-sm font-semibold text-primary hover:underline">
          Registrar gastos →
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
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
          Ver
        </button>
        <div className="flex flex-wrap gap-2">
          {presets.map((pr) => (
            <Link
              key={pr.etiqueta}
              href={`/contabilidad/estado-resultados?desde=${pr.desde}&hasta=${pr.hasta}`}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold',
                pr.desde === desde && pr.hasta === hasta ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary',
              )}
            >
              {pr.etiqueta}
            </Link>
          ))}
        </div>
      </form>

      {e.lineas_sin_costo > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {e.lineas_sin_costo} línea{e.lineas_sin_costo !== 1 ? 's' : ''} vendida{e.lineas_sin_costo !== 1 ? 's' : ''} sin costo registrado: el costo de
          mercancía puede estar subestimado. Revisa el costo de esas piezas.
        </p>
      )}

      <section className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-semibold">Concepto</th>
              <th className="px-4 py-2.5 text-right font-semibold">
                {desde} → {hasta}
              </th>
              <th className="px-4 py-2.5 text-right font-semibold">% ventas netas</th>
              <th className="px-4 py-2.5 text-right font-semibold">
                Anterior
                <span className="block text-[10px] font-normal normal-case">
                  {anterior.desde} → {anterior.hasta}
                </span>
              </th>
              <th className="px-4 py-2.5 text-right font-semibold">Variación</th>
            </tr>
          </thead>
          <tbody>
            {FILAS.map((f) => {
              const actual = num(e, f)
              const previo = p ? num(p, f) : 0
              const variacion = previo !== 0 ? ((actual - previo) / Math.abs(previo)) * 100 : null
              return (
                <Fragment key={f.etiqueta}>
                  <tr
                    className={cn(
                      'border-b border-border',
                      f.tipo === 'total' && 'bg-secondary/30 font-semibold',
                      f.tipo === 'resultado' && 'bg-primary/5 font-bold',
                    )}
                  >
                    <td className="px-4 py-2 text-foreground">
                      {f.etiqueta}
                      {f.nota && <span className="block text-[11px] font-normal text-muted-foreground">{f.nota}</span>}
                    </td>
                    <td className={cn('px-4 py-2 text-right', f.tipo === 'resultado' && actual < 0 ? 'text-destructive' : 'text-foreground')}>
                      <Monto valor={actual} signo={f.signo} />
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">{pct(actual, e.ventas_netas)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {p ? <Monto valor={previo} signo={f.signo} /> : '—'}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-2 text-right text-xs',
                        variacion == null ? 'text-muted-foreground' : (variacion >= 0) === (f.signo !== -1) ? 'text-emerald-700' : 'text-destructive',
                      )}
                    >
                      {variacion == null ? '—' : `${variacion >= 0 ? '+' : ''}${formatearNumero(Math.round(variacion * 10) / 10)}%`}
                    </td>
                  </tr>
                  {f.clave === 'gastos_operativos' &&
                    e.gastos_por_categoria.map((g) => (
                      <tr key={`cat-${g.categoria}`} className="border-b border-border text-xs">
                        <td className="py-1.5 pl-8 pr-4 text-muted-foreground">{etiquetaCategoria(g.categoria)}</td>
                        <td className="px-4 py-1.5 text-right text-muted-foreground">({formatearPrecio(Number(g.monto))})</td>
                        <td className="px-4 py-1.5 text-right text-muted-foreground">{pct(Number(g.monto), e.ventas_netas)}</td>
                        <td colSpan={2} />
                      </tr>
                    ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { k: 'Ventas', v: formatearNumero(e.num_ventas) },
          { k: 'Margen bruto', v: pct(e.utilidad_bruta, e.ingresos_sin_iva) },
          { k: 'Margen operativo', v: pct(e.utilidad_operativa, e.ingresos_sin_iva) },
          { k: 'Margen neto', v: pct(e.utilidad_neta, e.ingresos_sin_iva) },
        ].map((t) => (
          <div key={t.k} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.k}</p>
            <p className="mt-1 text-lg font-bold text-foreground">{t.v}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Landmark className="h-4 w-4 text-primary" />
            Cuadre de cobros del período
          </h2>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Ventas pagadas</dt>
            <dd className="text-right font-semibold text-foreground">{formatearPrecio(cc.ventas_pagadas)}</dd>
            <dt className="text-muted-foreground">Cobrado en dinero (transferencia, depósito, tarjeta)</dt>
            <dd className="text-right text-foreground">{formatearPrecio(cc.cobrado_dinero)}</dd>
            <dt className="text-muted-foreground">Pagado con Billetera ASTRO (sin entrada de dinero)</dt>
            <dd className="text-right text-foreground">{formatearPrecio(cc.cobrado_bolsa)}</dd>
            <dt className="border-t border-border pt-1.5 font-semibold text-foreground">Diferencia</dt>
            <dd className={cn('border-t border-border pt-1.5 text-right font-bold', cuadraCobros ? 'text-emerald-700' : 'text-destructive')}>
              {formatearPrecio(cc.diferencia)}
            </dd>
            <dt className="text-muted-foreground">Ventas aún por cobrar</dt>
            <dd className="text-right text-amber-700">{formatearPrecio(cc.por_cobrar)}</dd>
          </dl>
          <Verificacion
            ok={cuadraCobros}
            texto={cuadraCobros ? 'Ventas pagadas = dinero cobrado + Billetera redimida' : 'Hay ventas pagadas cuyo cobro no cuadra: revisa sus pagos'}
          />
          <p className="text-xs text-muted-foreground">
            El dinero cobrado es lo que debe verse en los bancos: regístralo y concílialo en{' '}
            <Link href="/contabilidad/bancos" className="font-semibold text-primary hover:underline">
              Bancos
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Wallet className="h-4 w-4 text-primary" />
            Cuadre de Billetera ASTRO (deuda con embajadores)
          </h2>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Saldo al inicio</dt>
            <dd className="text-right text-foreground">{formatearPrecio(cb.saldo_inicial)}</dd>
            <dt className="text-muted-foreground">+ Comisiones abonadas</dt>
            <dd className="text-right text-foreground">{formatearPrecio(cb.abonos)}</dd>
            <dt className="text-muted-foreground">− Redimido en compras</dt>
            <dd className="text-right text-foreground">{formatearPrecio(Math.abs(cb.redenciones))}</dd>
            <dt className="text-muted-foreground">± Reversos y ajustes</dt>
            <dd className="text-right text-foreground">{formatearPrecio(cb.reversos + cb.ajustes)}</dd>
            <dt className="border-t border-border pt-1.5 font-semibold text-foreground">Saldo al cierre</dt>
            <dd className="border-t border-border pt-1.5 text-right font-bold text-foreground">{formatearPrecio(cb.saldo_final)}</dd>
          </dl>
          <p className="text-xs text-muted-foreground">
            La Billetera ASTRO es una deuda de la empresa que se paga en producto: crece con las comisiones abonadas (al aprobarse cada
            pago) y baja cuando el embajador compra con ella. Saldo total hoy de todos los embajadores:{' '}
            <span className="font-semibold text-foreground">{formatearPrecio(cb.saldo_actual_total)}</span>.
          </p>
          <p className="text-xs text-muted-foreground">
            Diferencia esperada con la línea &quot;Comisiones de embajadores&quot;: allí cuenta la comisión de las ventas del
            período aunque su pago aún no se apruebe; la Billetera solo se abona al aprobarse.
          </p>
        </div>
      </section>
    </main>
  )
}
