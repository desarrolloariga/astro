import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarCheck, KeyRound, Lock, LockOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { formatearFechaHora } from '@/lib/formato'
import { hoyGuatemala } from '@/lib/contabilidad'
import { MESES, clasesCampo, montoContable } from '@/lib/contabilidad-general'
import { BotonConfirmar } from '@/components/app/boton-confirmar'
import { CamposAutorizacion, Encabezado, Mensajes } from '@/components/contabilidad/comunes'
import { cerrarMes, generarCierreAnual, guardarPin, reabrirMes } from './acciones'

export const metadata = { title: 'Cierre de mes — ASTRO' }

type Periodo = {
  anio: number
  mes: number
  estado: 'abierto' | 'cerrado'
  fecha_cierre: string | null
  fecha_reapertura: string | null
  notas: string | null
  cerrador: { nombre: string } | null
}

type Resumen = { mes: number; contabilizadas: number; borradores: number; total_debe: number; total_haber: number }

export default async function PeriodosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; anio?: string }>
}) {
  const sp = await searchParams
  const hoy = hoyGuatemala()
  const anioActual = Number(hoy.slice(0, 4))
  const anio = Number(sp.anio) >= 2000 && Number(sp.anio) <= 2100 ? Number(sp.anio) : anioActual

  const supabase = await createClient()
  const [
    puedeVer,
    puedeCerrar,
    puedeAutorizar,
    puedeRegistrar,
    { data: periodosData },
    { data: ultimoData },
    { data: resumenData },
    { data: tienePin },
    { data: autorizacionesData },
  ] = await Promise.all([
    tienePermiso('contabilidad', 'ver'),
    tienePermiso('contabilidad', 'cerrar_periodo'),
    tienePermiso('contabilidad', 'autorizar_cierre'),
    tienePermiso('contabilidad', 'registrar'),
    supabase
      .from('periodos_contables')
      .select('anio, mes, estado, fecha_cierre, fecha_reapertura, notas, cerrador:cerrado_por ( nombre )')
      .eq('anio', anio),
    supabase
      .from('periodos_contables')
      .select('anio, mes')
      .eq('estado', 'cerrado')
      .order('anio', { ascending: false })
      .order('mes', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.rpc('fn_resumen_periodos_contables', { p_anio: anio }),
    supabase.rpc('fn_tengo_pin_contable'),
    supabase
      .from('autorizaciones_cierre')
      .select('id, anio, mes, accion, motivo, partida_id, fecha_uso, usuario:usuario_id ( nombre )')
      .eq('anio', anio)
      .not('fecha_uso', 'is', null)
      .order('fecha_uso', { ascending: false })
      .limit(50),
  ])
  if (!puedeVer) redirect('/inicio')

  const periodos = new Map(((periodosData ?? []) as unknown as Periodo[]).map((p) => [p.mes, p]))
  const resumen = new Map(((resumenData ?? []) as Resumen[]).map((r) => [r.mes, r]))
  const ultimo = ultimoData as { anio: number; mes: number } | null
  const indiceUltimo = ultimo ? ultimo.anio * 12 + ultimo.mes : null
  const indiceHoy = anioActual * 12 + Number(hoy.slice(5, 7))
  const autorizaciones = (autorizacionesData ?? []) as unknown as {
    id: number
    mes: number
    accion: string
    motivo: string
    partida_id: number | null
    fecha_uso: string
    usuario: { nombre: string } | null
  }[]

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={CalendarCheck}
        titulo="Cierre de mes"
        descripcion="Un mes cerrado no admite partidas nuevas, cambios ni eliminaciones con fecha en ese mes o antes. Los meses se cierran en orden y solo se reabre el último cerrado. Cualquier excepción pide PIN contable y motivo, y queda registrada."
      >
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/contabilidad/periodos?anio=${anio - 1}`} className="rounded-lg border border-border px-2.5 py-1.5 hover:bg-muted">
            ←
          </Link>
          <span className="w-14 text-center font-semibold">{anio}</span>
          <Link href={`/contabilidad/periodos?anio=${anio + 1}`} className="rounded-lg border border-border px-2.5 py-1.5 hover:bg-muted">
            →
          </Link>
        </div>
      </Encabezado>

      <Mensajes ok={sp.ok} error={sp.error} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MESES.map((nombre, i) => {
          const mes = i + 1
          const indice = anio * 12 + mes
          const periodo = periodos.get(mes)
          const r = resumen.get(mes)
          const cerrado = periodo?.estado === 'cerrado'
          const esSiguiente = indiceUltimo == null ? indice <= indiceHoy : indice === indiceUltimo + 1
          const esUltimoCerrado = indiceUltimo === indice
          const borradores = r?.borradores ?? 0
          const cuadra = Number(r?.total_debe ?? 0) === Number(r?.total_haber ?? 0)
          return (
            <div
              key={mes}
              className={cn(
                'flex flex-col gap-2 rounded-xl border bg-card p-4',
                cerrado ? 'border-primary/40 bg-primary/5' : 'border-border',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">{nombre}</span>
                <span
                  className={cn(
                    'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                    cerrado ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {cerrado ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
                  {cerrado ? 'Cerrado' : 'Abierto'}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                <dt className="text-muted-foreground">Contabilizadas</dt>
                <dd className="text-right tabular-nums">{r?.contabilizadas ?? 0}</dd>
                <dt className="text-muted-foreground">Borradores</dt>
                <dd className={cn('text-right tabular-nums', borradores > 0 && 'font-semibold text-amber-700 dark:text-amber-300')}>
                  {borradores}
                </dd>
                <dt className="text-muted-foreground">Movimiento</dt>
                <dd className="text-right tabular-nums">Q {montoContable(r?.total_debe ?? 0)}</dd>
                <dt className="text-muted-foreground">Debe = Haber</dt>
                <dd className={cn('text-right font-semibold', cuadra ? 'text-primary' : 'text-destructive')}>{cuadra ? 'Sí' : 'No'}</dd>
              </dl>
              {cerrado && periodo?.fecha_cierre && (
                <p className="text-[11px] text-muted-foreground">
                  Cerrado {formatearFechaHora(periodo.fecha_cierre)} por {periodo.cerrador?.nombre ?? '—'}
                </p>
              )}
              {periodo?.notas && <p className="text-[11px] text-muted-foreground">{periodo.notas}</p>}

              {!cerrado && esSiguiente && puedeCerrar && (
                <form action={cerrarMes} className="mt-1 flex flex-col gap-2">
                  <input type="hidden" name="anio" value={anio} />
                  <input type="hidden" name="mes" value={mes} />
                  <input name="notas" placeholder="Notas del cierre (opcional)" className={cn(clasesCampo, 'py-1.5 text-xs')} />
                  <BotonConfirmar
                    mensaje={`¿Cerrar ${nombre} ${anio}? No se podrán registrar ni cambiar partidas con fecha hasta el fin de ese mes sin PIN contable.`}
                    disabled={borradores > 0}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    {borradores > 0 ? 'Resuelve los borradores para cerrar' : `Cerrar ${nombre.toLowerCase()}`}
                  </BotonConfirmar>
                </form>
              )}
              {cerrado && esUltimoCerrado && puedeCerrar && puedeAutorizar && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs font-semibold text-primary">Reabrir este mes</summary>
                  <form action={reabrirMes} className="mt-2 flex flex-col gap-2">
                    <input type="hidden" name="anio" value={anio} />
                    <input type="hidden" name="mes" value={mes} />
                    <CamposAutorizacion mensaje="Reabrir un mes cerrado requiere tu PIN contable y el motivo." />
                    <button type="submit" className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                      Reabrir {nombre.toLowerCase()}
                    </button>
                  </form>
                </details>
              )}
            </div>
          )
        })}
      </div>

      {puedeCerrar && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span>
            <span className="font-semibold">Partida de cierre del ejercicio {anio}</span>
            <span className="block text-xs text-muted-foreground">
              Traslada al 31/12 los saldos de ingresos, costos y gastos a «Resultado del ejercicio». Se genera en borrador para revisarla;
              genérala antes de cerrar diciembre.
            </span>
          </span>
          <form action={generarCierreAnual}>
            <input type="hidden" name="anio" value={anio} />
            <BotonConfirmar
              mensaje={`¿Generar la partida de cierre de ${anio}?`}
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
            >
              Generar partida de cierre {anio}
            </BotonConfirmar>
          </form>
        </section>
      )}

      {puedeRegistrar && (
        <details className="rounded-xl border border-border bg-card" open={!tienePin && puedeAutorizar}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground">
            <KeyRound className="h-4 w-4 text-primary" />
            {tienePin ? 'Cambiar mi PIN contable' : 'Crear mi PIN contable'}
          </summary>
          <form action={guardarPin} className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-4">
            <input type="hidden" name="anio" value={anio} />
            <p className="text-xs text-muted-foreground sm:col-span-4">
              El PIN (6 a 8 dígitos) autoriza cambios en meses cerrados. Es personal: tras 5 intentos fallidos se bloquea 15
              minutos.
            </p>
            {tienePin && (
              <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
                PIN actual
                <input name="pin_actual" type="password" inputMode="numeric" autoComplete="off" required className={clasesCampo} />
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
              PIN nuevo
              <input
                name="pin_nuevo"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                pattern="[0-9]{6,8}"
                required
                className={clasesCampo}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
              Confirmar PIN nuevo
              <input
                name="pin_confirmar"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                pattern="[0-9]{6,8}"
                required
                className={clasesCampo}
              />
            </label>
            <div className="flex items-end">
              <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                Guardar PIN
              </button>
            </div>
          </form>
        </details>
      )}

      <div className="rounded-xl border border-border bg-card">
        <p className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">Autorizaciones en meses cerrados ({anio})</p>
        {autorizaciones.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sin autorizaciones registradas este año.</p>
        ) : (
          <ul className="divide-y divide-border/60 text-sm">
            {autorizaciones.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
                <span className="text-xs text-muted-foreground">{formatearFechaHora(a.fecha_uso)}</span>
                <span className="font-medium">{a.usuario?.nombre ?? 'Usuario'}</span>
                <span className="text-xs">
                  {a.accion === 'reabrir_periodo' ? 'Reabrió' : 'Partida en'} {MESES[a.mes - 1]}
                </span>
                <span className="text-xs text-muted-foreground">“{a.motivo}”</span>
                {a.partida_id && (
                  <Link href={`/contabilidad/partidas/${a.partida_id}`} className="text-xs font-semibold text-primary hover:underline">
                    Ver partida
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
