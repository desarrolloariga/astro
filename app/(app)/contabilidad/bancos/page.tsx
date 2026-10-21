import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, ArrowLeftRight, CheckCircle2, Clock, Landmark, Plus, Scale, TrendingUp, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearFecha, formatearPrecio } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { hoyGuatemala, nombresOrigen, rangoMes } from '@/lib/contabilidad'
import { BotonConfirmar } from '@/components/app/boton-confirmar'
import { anularMovimiento, guardarCuenta, movimientoManual, registrarPendiente, transferencia } from './acciones'

export const metadata = { title: 'Bancos — ASTRO' }

const clasesCampo =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'
const clasesMini = 'rounded-md border border-input bg-background px-2 py-1 text-xs'

type Cuenta = {
  id: number
  nombre: string
  banco: string | null
  numero: string | null
  tipo: string
  saldo_inicial: number
  fecha_saldo_inicial: string
  activa: boolean
}

type Movimiento = {
  id: number
  cuenta_id: number
  fecha: string
  tipo: string
  origen: string
  monto: number
  descripcion: string
  referencia: string | null
  conciliado: boolean
  anulado: boolean
  motivo_anulacion: string | null
}

type Pendientes = {
  cobros: { pago_id: number; venta_id: number; metodo: string; monto: number; referencia: string | null; fecha: string; banco_origen: string | null }[]
  gastos: { gasto_id: number; fecha: string; descripcion: string; monto: number; clasificacion: string; metodo_pago: string | null }[]
  compras: { orden_id: number; proveedor: string | null; total: number; factura: string | null; fecha: string }[]
  liquidaciones: { liquidacion_id: number; usuario: string; total: number; periodo: string }[]
}


function SelectorCuenta({ cuentas, name = 'cuenta_id' }: { cuentas: Cuenta[]; name?: string }) {
  return (
    <select name={name} required defaultValue="" className={clasesMini}>
      <option value="" disabled>
        Cuenta…
      </option>
      {cuentas.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nombre}
        </option>
      ))}
    </select>
  )
}

export default async function BancosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; cuenta?: string; mes?: string }>
}) {
  if (!(await tienePermiso('bancos', 'gestionar'))) redirect('/inicio')
  const { ok, error, cuenta, mes } = await searchParams
  const hoy = hoyGuatemala()
  const mesActual = /^\d{4}-\d{2}$/.test(mes ?? '') ? (mes as string) : hoy.slice(0, 7)
  const { desde, hasta } = rangoMes(`${mesActual}-01`)
  const cuentaFiltro = Number(cuenta) || null
  const rutaActual = `/contabilidad/bancos?mes=${mesActual}${cuentaFiltro ? `&cuenta=${cuentaFiltro}` : ''}`

  const supabase = await createClient()
  let consultaMov = supabase
    .from('movimientos_banco')
    .select('id, cuenta_id, fecha, tipo, origen, monto, descripcion, referencia, conciliado, anulado, motivo_anulacion')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })
    .order('id', { ascending: false })
  if (cuentaFiltro) consultaMov = consultaMov.eq('cuenta_id', cuentaFiltro)

  const [{ data: cuentasData }, { data: saldosData }, { data: pendData }, { data: movData }] = await Promise.all([
    supabase.from('cuentas_bancarias').select('id, nombre, banco, numero, tipo, saldo_inicial, fecha_saldo_inicial, activa').order('nombre'),
    supabase.rpc('fn_flujo_caja', { p_desde: hoy, p_hasta: hoy }),
    supabase.rpc('fn_bancos_pendientes'),
    consultaMov,
  ])
  const cuentas = (cuentasData ?? []) as Cuenta[]
  const activas = cuentas.filter((c) => c.activa)
  const saldos = new Map(
    (((saldosData as { cuentas?: { id: number; saldo_final: number }[] } | null)?.cuentas) ?? []).map((c) => [c.id, Number(c.saldo_final)]),
  )
  const pend = (pendData ?? { cobros: [], gastos: [], compras: [], liquidaciones: [] }) as Pendientes
  const movimientos = (movData ?? []) as Movimiento[]
  const nombreCuenta = new Map(cuentas.map((c) => [c.id, c.nombre]))
  const totalPendientes = pend.cobros.length + pend.gastos.length + pend.compras.length + pend.liquidaciones.length
  const saldoTotal = activas.reduce((a, c) => a + (saldos.get(c.id) ?? 0), 0)

  const [a, m] = mesActual.split('-').map(Number)
  const mesPrevio = new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7)
  const mesSiguiente = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 7)
  const nombreMes = new Intl.DateTimeFormat('es-GT', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, 1)))
  const enlaceMes = (mm: string) => `/contabilidad/bancos?mes=${mm}${cuentaFiltro ? `&cuenta=${cuentaFiltro}` : ''}`

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Landmark className="h-5 w-5 text-primary" />
            Bancos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Libro de bancos: cada entrada y salida real de dinero, por cuenta. Base para la conciliación y el flujo de caja.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/contabilidad/bancos/conciliacion" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-secondary">
            <Scale className="h-4 w-4 text-primary" /> Conciliación
          </Link>
          <Link href="/contabilidad/flujo-caja" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-secondary">
            <TrendingUp className="h-4 w-4 text-primary" /> Flujo de caja
          </Link>
        </div>
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

      {/* Cuentas */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Cuentas</h2>
          <span className="text-sm text-muted-foreground">
            Saldo total en libros hoy: <span className="font-bold text-foreground">{formatearPrecio(saldoTotal)}</span>
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cuentas.map((c) => (
            <div key={c.id} className={cn('flex flex-col gap-1 rounded-xl border bg-card p-4', c.activa ? 'border-border' : 'border-dashed opacity-60')}>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                {c.tipo === 'caja' ? <Wallet className="h-4 w-4 text-primary" /> : <Landmark className="h-4 w-4 text-primary" />}
                {c.nombre}
              </p>
              <p className="text-xs text-muted-foreground">{[c.banco, c.numero, c.tipo].filter(Boolean).join(' · ')}</p>
              <p className="mt-1 text-lg font-bold text-foreground">{formatearPrecio(saldos.get(c.id) ?? Number(c.saldo_inicial))}</p>
              <details>
                <summary className="cursor-pointer list-none text-xs font-semibold text-primary">Editar</summary>
                <FormularioCuenta cuenta={c} volver={rutaActual} />
              </details>
            </div>
          ))}
          <details className="rounded-xl border border-dashed border-primary/40 bg-card p-4" open={cuentas.length === 0}>
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-primary">
              <Plus className="h-4 w-4" /> Nueva cuenta
            </summary>
            <FormularioCuenta volver={rutaActual} />
          </details>
        </div>
      </section>

      {/* Pendientes */}
      <section className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Clock className="h-4 w-4 text-amber-600" />
          Dinero movido sin registrar en bancos
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-800">{totalPendientes}</span>
        </h2>
        {totalPendientes === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">Todo está registrado.</p>
        ) : activas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Crea al menos una cuenta para registrar estos movimientos.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {[
              {
                titulo: 'Cobros de ventas aprobados',
                filas: pend.cobros.map((c) => ({
                  tipo: 'cobro', id: c.pago_id, fecha: c.fecha, monto: Number(c.monto), signo: 1,
                  texto: `Venta #${c.venta_id} · ${c.metodo}${c.referencia ? ` · ref. ${c.referencia}` : ''}${c.banco_origen ? ` · desde ${c.banco_origen}` : ''}`,
                })),
              },
              {
                titulo: 'Gastos y otros ingresos',
                filas: pend.gastos.map((g) => ({
                  tipo: 'gasto', id: g.gasto_id, fecha: g.fecha, monto: Number(g.monto), signo: g.clasificacion === 'otro_ingreso' ? 1 : -1,
                  texto: `${g.descripcion}${g.metodo_pago ? ` · ${g.metodo_pago}` : ''}`,
                })),
              },
              {
                titulo: 'Órdenes de compra pagadas',
                filas: pend.compras.map((o) => ({
                  tipo: 'compra', id: o.orden_id, fecha: o.fecha, monto: Number(o.total), signo: -1,
                  texto: `OC #${o.orden_id}${o.proveedor ? ` · ${o.proveedor}` : ''}${o.factura ? ` · factura ${o.factura}` : ''}`,
                })),
              },
              {
                titulo: 'Comisiones pagadas',
                filas: pend.liquidaciones.map((l) => ({
                  tipo: 'liquidacion', id: l.liquidacion_id, fecha: hoy, monto: Number(l.total), signo: -1,
                  texto: `${l.usuario} · ${l.periodo}`,
                })),
              },
            ]
              .filter((g) => g.filas.length > 0)
              .map((g) => (
                <div key={g.titulo} className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.titulo}</p>
                  {g.filas.map((f) => (
                    <form key={`${f.tipo}-${f.id}`} action={registrarPendiente} className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-sm">
                      <input type="hidden" name="tipo" value={f.tipo} />
                      <input type="hidden" name="id" value={f.id} />
                      <input type="hidden" name="volver" value={rutaActual} />
                      <span className="min-w-0 flex-1 truncate text-foreground">{f.texto}</span>
                      <span className={cn('font-semibold', f.signo > 0 ? 'text-emerald-700' : 'text-foreground')}>
                        {f.signo > 0 ? '+' : '−'}
                        {formatearPrecio(f.monto)}
                      </span>
                      <SelectorCuenta cuentas={activas} />
                      <input type="date" name="fecha" defaultValue={f.fecha} className={clasesMini} />
                      <button type="submit" className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
                        Registrar
                      </button>
                    </form>
                  ))}
                </div>
              ))}
          </div>
        )}
      </section>

      {/* Movimientos manuales */}
      {activas.length > 0 && (
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <details className="rounded-xl border border-border bg-card p-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-primary">
              <Plus className="h-4 w-4" /> Movimiento manual (comisión bancaria, ajuste, otro)
            </summary>
            <form action={movimientoManual} className="mt-3 grid grid-cols-2 gap-2">
              <input type="hidden" name="volver" value={rutaActual} />
              <SelectorCuenta cuentas={activas} />
              <input type="date" name="fecha" defaultValue={hoy} required className={clasesMini} />
              <select name="tipo" defaultValue="egreso" className={clasesMini}>
                <option value="egreso">Egreso (sale dinero)</option>
                <option value="ingreso">Ingreso (entra dinero)</option>
              </select>
              <select name="origen" defaultValue="comision_bancaria" className={clasesMini}>
                <option value="comision_bancaria">Comisión bancaria</option>
                <option value="ajuste">Ajuste</option>
                <option value="otro">Otro</option>
              </select>
              <input name="monto" type="number" step="0.01" min="0.01" required placeholder="Monto" className={clasesMini} />
              <input name="referencia" placeholder="Referencia" className={clasesMini} />
              <input name="descripcion" required placeholder="Descripción" className={cn(clasesMini, 'col-span-2')} />
              <button type="submit" className="col-span-2 rounded-md bg-primary py-1.5 text-xs font-semibold text-primary-foreground">
                Registrar movimiento
              </button>
            </form>
          </details>
          <details className="rounded-xl border border-border bg-card p-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-primary">
              <ArrowLeftRight className="h-4 w-4" /> Transferencia entre cuentas
            </summary>
            <form action={transferencia} className="mt-3 grid grid-cols-2 gap-2">
              <input type="hidden" name="volver" value={rutaActual} />
              <SelectorCuenta cuentas={activas} name="cuenta_origen" />
              <SelectorCuenta cuentas={activas} name="cuenta_destino" />
              <input type="date" name="fecha" defaultValue={hoy} required className={clasesMini} />
              <input name="monto" type="number" step="0.01" min="0.01" required placeholder="Monto" className={clasesMini} />
              <input name="descripcion" placeholder="Descripción (opcional)" className={cn(clasesMini, 'col-span-2')} />
              <button type="submit" className="col-span-2 rounded-md bg-primary py-1.5 text-xs font-semibold text-primary-foreground">
                Registrar transferencia
              </button>
            </form>
          </details>
        </section>
      )}

      {/* Libro de bancos */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Libro de bancos</h2>
          <div className="flex flex-wrap items-center gap-2">
            <form method="get" className="flex items-center gap-2">
              <input type="hidden" name="mes" value={mesActual} />
              <select name="cuenta" defaultValue={cuentaFiltro ?? ''} className={clasesMini}>
                <option value="">Todas las cuentas</option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <button type="submit" className="rounded-md border border-border px-2 py-1 text-xs font-semibold">
                Filtrar
              </button>
            </form>
            <Link href={enlaceMes(mesPrevio)} className="rounded-md border border-border px-2 py-1 text-xs">←</Link>
            <span className="min-w-32 text-center text-xs font-semibold capitalize">{nombreMes}</span>
            <Link href={enlaceMes(mesSiguiente)} className="rounded-md border border-border px-2 py-1 text-xs">→</Link>
          </div>
        </div>
        {movimientos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card py-10 text-center text-sm text-muted-foreground">Sin movimientos en este mes.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Fecha</th>
                  <th className="px-3 py-2 font-semibold">Movimiento</th>
                  <th className="px-3 py-2 font-semibold">Cuenta</th>
                  <th className="px-3 py-2 text-right font-semibold">Entrada</th>
                  <th className="px-3 py-2 text-right font-semibold">Salida</th>
                  <th className="px-3 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {movimientos.map((mv) => (
                  <tr key={mv.id} className={cn('border-b border-border align-top last:border-0', mv.anulado && 'opacity-50')}>
                    <td className="px-3 py-2 text-muted-foreground">{formatearFecha(`${mv.fecha}T12:00:00`)}</td>
                    <td className="px-3 py-2">
                      <p className={cn('text-foreground', mv.anulado && 'line-through')}>{mv.descripcion}</p>
                      <p className="text-xs text-muted-foreground">
                        {nombresOrigen[mv.origen] ?? mv.origen}
                        {mv.referencia && ` · ref. ${mv.referencia}`}
                        {mv.conciliado && ' · ✓ conciliado'}
                        {mv.anulado && ` · anulado: ${mv.motivo_anulacion}`}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{nombreCuenta.get(mv.cuenta_id)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-700">{mv.tipo === 'ingreso' ? formatearPrecio(Number(mv.monto)) : ''}</td>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">{mv.tipo === 'egreso' ? formatearPrecio(Number(mv.monto)) : ''}</td>
                    <td className="px-3 py-2 text-right">
                      {!mv.anulado && !mv.conciliado && (
                        <details>
                          <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-destructive">Anular</summary>
                          <form action={anularMovimiento} className="mt-1 flex items-center gap-1">
                            <input type="hidden" name="movimiento_id" value={mv.id} />
                            <input type="hidden" name="volver" value={rutaActual} />
                            <input name="motivo" required placeholder="Motivo" className="w-24 rounded-md border border-input bg-background px-2 py-1 text-xs" />
                            <BotonConfirmar mensaje="¿Anular este movimiento?" className="rounded-md bg-destructive px-2 py-1 text-xs font-semibold text-white">
                              Anular
                            </BotonConfirmar>
                          </form>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

function FormularioCuenta({ cuenta, volver }: { cuenta?: Cuenta; volver: string }) {
  return (
    <form action={guardarCuenta} className="mt-3 flex flex-col gap-2">
      {cuenta && <input type="hidden" name="id" value={cuenta.id} />}
      <input type="hidden" name="volver" value={volver} />
      <input name="nombre" required defaultValue={cuenta?.nombre} placeholder="Nombre (ej. Banrural monetaria)" className={clasesCampo} />
      <div className="grid grid-cols-2 gap-2">
        <input name="banco" defaultValue={cuenta?.banco ?? ''} placeholder="Banco" className={clasesCampo} />
        <input name="numero" defaultValue={cuenta?.numero ?? ''} placeholder="No. de cuenta" className={clasesCampo} />
      </div>
      <select name="tipo" defaultValue={cuenta?.tipo ?? 'monetaria'} className={clasesCampo}>
        <option value="monetaria">Monetaria</option>
        <option value="ahorro">Ahorro</option>
        <option value="caja">Caja (efectivo)</option>
      </select>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
          Saldo inicial (Q)
          <input name="saldo_inicial" type="number" step="0.01" defaultValue={cuenta?.saldo_inicial ?? 0} className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
          A la fecha
          <input name="fecha_saldo_inicial" type="date" defaultValue={cuenta?.fecha_saldo_inicial ?? hoyGuatemala()} className={clasesCampo} />
        </label>
      </div>
      {cuenta && (
        <select name="activa" defaultValue={cuenta.activa ? 'si' : 'no'} className={clasesCampo}>
          <option value="si">Activa</option>
          <option value="no">Inactiva</option>
        </select>
      )}
      <button type="submit" className="rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
        {cuenta ? 'Guardar' : 'Crear cuenta'}
      </button>
    </form>
  )
}
