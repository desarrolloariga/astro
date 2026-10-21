import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, ArrowLeft, CheckCircle2, Scale } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearFecha, formatearFechaHora, formatearPrecio } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { hoyGuatemala, nombresOrigen, rangoMes } from '@/lib/contabilidad'
import { SaldoBancoInput } from '@/components/app/saldo-banco-input'
import { BotonConfirmar } from '@/components/app/boton-confirmar'
import { cerrarConciliacion, guardarConciliados } from '../acciones'

export const metadata = { title: 'Conciliación bancaria — ASTRO' }

type Movimiento = {
  id: number
  fecha: string
  tipo: string
  origen: string
  monto: number
  descripcion: string
  referencia: string | null
  conciliado: boolean
  conciliacion_id: number | null
}

type Resumen = {
  saldo_inicial: number
  ingresos: number
  egresos: number
  saldo_final: number
  conciliados: number
  pendientes: number
  neto_pendiente: number
}

export default async function ConciliacionPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; cuenta?: string; mes?: string }>
}) {
  if (!(await tienePermiso('bancos', 'gestionar'))) redirect('/inicio')
  const { ok, error, cuenta, mes } = await searchParams
  const supabase = await createClient()

  const { data: cuentasData } = await supabase.from('cuentas_bancarias').select('id, nombre, tipo').eq('activa', true).order('nombre')
  const cuentas = (cuentasData ?? []) as { id: number; nombre: string; tipo: string }[]
  const hoy = hoyGuatemala()
  const mesActual = /^\d{4}-\d{2}$/.test(mes ?? '') ? (mes as string) : hoy.slice(0, 7)
  const { desde, hasta } = rangoMes(`${mesActual}-01`)
  const cuentaId = Number(cuenta) || cuentas[0]?.id || null
  const rutaActual = `/contabilidad/bancos/conciliacion?mes=${mesActual}${cuentaId ? `&cuenta=${cuentaId}` : ''}`

  const encabezado = (
    <>
      <Link href="/contabilidad/bancos" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Bancos
      </Link>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <Scale className="h-5 w-5 text-primary" />
          Conciliación bancaria
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Marca los movimientos que aparecen en el estado de cuenta del banco y compara el saldo del banco con el de libros.
        </p>
      </div>
    </>
  )

  if (!cuentaId) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
        {encabezado}
        <p className="rounded-xl border border-dashed border-border bg-card py-10 text-center text-sm text-muted-foreground">
          Primero crea una cuenta en Bancos.
        </p>
      </main>
    )
  }

  const [{ data: movData }, { data: resumenData }, { data: historialData }] = await Promise.all([
    supabase
      .from('movimientos_banco')
      .select('id, fecha, tipo, origen, monto, descripcion, referencia, conciliado, conciliacion_id')
      .eq('cuenta_id', cuentaId)
      .eq('anulado', false)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha')
      .order('id'),
    supabase.rpc('fn_resumen_conciliacion', { p_cuenta_id: cuentaId, p_desde: desde, p_hasta: hasta }),
    supabase
      .from('conciliaciones_bancarias')
      .select('id, desde, hasta, saldo_banco, saldo_libros, diferencia, notas, fecha_creacion, cerrador:cerrada_por ( nombre )')
      .eq('cuenta_id', cuentaId)
      .order('hasta', { ascending: false })
      .limit(12),
  ])
  const movimientos = (movData ?? []) as Movimiento[]
  const r = (resumenData ?? { saldo_inicial: 0, ingresos: 0, egresos: 0, saldo_final: 0, conciliados: 0, pendientes: 0, neto_pendiente: 0 }) as Resumen
  const historial = (historialData ?? []) as unknown as {
    id: number
    desde: string
    hasta: string
    saldo_banco: number
    saldo_libros: number
    diferencia: number
    notas: string | null
    fecha_creacion: string
    cerrador: { nombre: string } | null
  }[]

  const [a, m] = mesActual.split('-').map(Number)
  const nombreMes = new Intl.DateTimeFormat('es-GT', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, 1)))

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      {encabezado}

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

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Cuenta
          <select name="cuenta" defaultValue={cuentaId} className="rounded-lg border border-input bg-background px-3 py-2 text-sm">
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Mes
          <input type="month" name="mes" defaultValue={mesActual} className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          Ver
        </button>
      </form>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { k: 'Saldo en libros al inicio', v: r.saldo_inicial },
          { k: '+ Entradas del mes', v: r.ingresos },
          { k: '− Salidas del mes', v: r.egresos },
          { k: '= Saldo en libros al cierre', v: r.saldo_final },
        ].map((t) => (
          <div key={t.k} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.k}</p>
            <p className="mt-1 text-lg font-bold text-foreground">{formatearPrecio(Number(t.v))}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold capitalize text-foreground">Movimientos de {nombreMes}</h2>
          <p className="text-xs text-muted-foreground">
            {r.conciliados} conciliados · {r.pendientes} sin conciliar ({formatearPrecio(Number(r.neto_pendiente))} netos en tránsito)
          </p>
        </div>
        {movimientos.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sin movimientos en este mes.</p>
        ) : (
          <form action={guardarConciliados} className="flex flex-col gap-3">
            <input type="hidden" name="volver" value={rutaActual} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-2 font-semibold">En el banco</th>
                    <th className="py-2 pr-3 font-semibold">Fecha</th>
                    <th className="py-2 pr-3 font-semibold">Movimiento</th>
                    <th className="py-2 pr-3 text-right font-semibold">Entrada</th>
                    <th className="py-2 text-right font-semibold">Salida</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((mv) => {
                    const cerrado = mv.conciliacion_id != null
                    return (
                      <tr key={mv.id} className={cn('border-b border-border last:border-0', mv.conciliado && 'bg-emerald-600/5')}>
                        <td className="py-2 pr-2">
                          {!cerrado && <input type="hidden" name="mostrado" value={mv.id} />}
                          <input
                            type="checkbox"
                            name="conciliado"
                            value={mv.id}
                            defaultChecked={mv.conciliado}
                            disabled={cerrado}
                            className="h-4 w-4"
                            title={cerrado ? 'Ya incluido en una conciliación cerrada' : 'Aparece en el estado de cuenta'}
                          />
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{formatearFecha(`${mv.fecha}T12:00:00`)}</td>
                        <td className="py-2 pr-3">
                          <p className="text-foreground">{mv.descripcion}</p>
                          <p className="text-xs text-muted-foreground">
                            {nombresOrigen[mv.origen] ?? mv.origen}
                            {mv.referencia && ` · ref. ${mv.referencia}`}
                            {cerrado && ' · conciliación cerrada'}
                          </p>
                        </td>
                        <td className="py-2 pr-3 text-right font-semibold text-emerald-700">{mv.tipo === 'ingreso' ? formatearPrecio(Number(mv.monto)) : ''}</td>
                        <td className="py-2 text-right font-semibold text-foreground">{mv.tipo === 'egreso' ? formatearPrecio(Number(mv.monto)) : ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <button type="submit" className="w-fit rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-secondary">
              Guardar marcas
            </button>
          </form>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <h2 className="text-sm font-bold text-foreground">Cerrar la conciliación del mes</h2>
        <p className="text-xs text-muted-foreground">
          Escribe el saldo final que muestra el estado de cuenta del banco al {formatearFecha(`${hasta}T12:00:00`)}. Se compara contra
          el saldo en libros ({formatearPrecio(Number(r.saldo_final))}); los movimientos marcados quedan amarrados a esta conciliación.
          Si hay diferencia, revisa movimientos sin registrar (comisiones bancarias, depósitos no identificados) antes de cerrar.
        </p>
        <form action={cerrarConciliacion} className="flex flex-col gap-3">
          <input type="hidden" name="volver" value={rutaActual} />
          <input type="hidden" name="cuenta_id" value={cuentaId} />
          <input type="hidden" name="desde" value={desde} />
          <input type="hidden" name="hasta" value={hasta} />
          <SaldoBancoInput saldoLibros={Number(r.saldo_final)} />
          <input name="notas" placeholder="Notas (opcional): explicación de diferencias" className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          <BotonConfirmar
            mensaje="¿Cerrar la conciliación de este mes? Quedará guardada en el historial."
            className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Cerrar conciliación
          </BotonConfirmar>
        </form>
      </section>

      {historial.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-bold text-foreground">Historial de conciliaciones</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Período</th>
                  <th className="py-2 pr-3 text-right font-semibold">Banco</th>
                  <th className="py-2 pr-3 text-right font-semibold">Libros</th>
                  <th className="py-2 pr-3 text-right font-semibold">Diferencia</th>
                  <th className="py-2 font-semibold">Cerrada</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h.id} className="border-b border-border last:border-0 align-top">
                    <td className="py-2 pr-3 text-foreground">
                      {h.desde} → {h.hasta}
                      {h.notas && <span className="block text-xs text-muted-foreground">{h.notas}</span>}
                    </td>
                    <td className="py-2 pr-3 text-right">{formatearPrecio(Number(h.saldo_banco))}</td>
                    <td className="py-2 pr-3 text-right">{formatearPrecio(Number(h.saldo_libros))}</td>
                    <td className={cn('py-2 pr-3 text-right font-semibold', Number(h.diferencia) === 0 ? 'text-emerald-700' : 'text-destructive')}>
                      {formatearPrecio(Number(h.diferencia))}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {formatearFechaHora(h.fecha_creacion)}
                      {h.cerrador && ` · ${h.cerrador.nombre}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  )
}
