import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Banknote } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { hoyGuatemala } from '@/lib/contabilidad'
import { clasesCampo, montoContable } from '@/lib/contabilidad-general'
import { ESTADOS_PLANILLA, MESES_NOMBRE, NOMBRE_TIPO_PLANILLA, TIPOS_PLANILLA_GENERAR, fechaCorta, periodoPlanilla } from '@/lib/rrhh'
import { Encabezado, Mensajes } from '@/components/contabilidad/comunes'
import { generarPlanilla } from './acciones'

export const metadata = { title: 'Planillas — ASTRO' }

type Planilla = {
  id: number
  codigo: string
  tipo: string
  anio: number
  mes: number
  quincena: number
  fecha_pago: string | null
  estado: string
  empleados: number
  total_devengado: number
  total_descuentos: number
  total_liquido: number
  total_patronal: number
}

export default async function PlanillasPage({ searchParams }: { searchParams: Promise<{ anio?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams
  const hoy = hoyGuatemala()
  const anioActual = Number(hoy.slice(0, 4))
  const anio = Number(sp.anio) || anioActual
  const supabase = await createClient()
  const [puedeVer, puedeGestionar, { data }] = await Promise.all([
    tienePermiso('planilla', 'ver'),
    tienePermiso('planilla', 'gestionar'),
    supabase
      .from('planillas')
      .select('id, codigo, tipo, anio, mes, quincena, fecha_pago, estado, empleados, total_devengado, total_descuentos, total_liquido, total_patronal')
      .eq('anio', anio)
      .order('mes', { ascending: false })
      .order('quincena', { ascending: false })
      .order('tipo'),
  ])
  if (!puedeVer) redirect('/inicio')
  const lista = (data ?? []) as Planilla[]
  const vigentes = lista.filter((p) => p.estado !== 'anulada')
  const mesHoy = Number(hoy.slice(5, 7))
  const quincenaHoy = Number(hoy.slice(8, 10)) <= 15 ? 1 : 2
  const kpis = [
    { e: `Pagado en ${anio}`, v: `Q${montoContable(vigentes.filter((p) => p.estado === 'pagada').reduce((s, p) => s + Number(p.total_liquido), 0))}` },
    { e: 'Aprobadas por pagar', v: `Q${montoContable(vigentes.filter((p) => p.estado === 'aprobada').reduce((s, p) => s + Number(p.total_liquido), 0))}` },
    { e: 'En borrador', v: vigentes.filter((p) => p.estado === 'borrador').length },
    { e: `Cuota patronal ${anio}`, v: `Q${montoContable(vigentes.filter((p) => p.estado !== 'borrador').reduce((s, p) => s + Number(p.total_patronal), 0))}` },
  ]

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={Banknote}
        titulo="Planillas"
        descripcion="Planilla quincenal por contrato laboral y por otros pagos (servicios): IGSS, ISR, deducciones, boletas, partida contable y pago por bancos."
      />
      <Mensajes ok={sp.ok} error={sp.error} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.e} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{k.e}</p>
            <p className="text-xl font-bold tabular-nums">{k.v}</p>
          </div>
        ))}
      </div>

      {puedeGestionar && (
        <form action={generarPlanilla} className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
          <p className="w-full text-sm font-semibold">Generar planilla</p>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Tipo
            <select name="tipo" defaultValue="contrato" className={clasesCampo}>
              {Object.entries(TIPOS_PLANILLA_GENERAR).map(([v, e]) => (
                <option key={v} value={v}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Año
            <input name="anio" type="number" defaultValue={anioActual} className={cn(clasesCampo, 'w-24')} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Mes
            <select name="mes" defaultValue={mesHoy} className={clasesCampo}>
              {MESES_NOMBRE.map((m, i) => (
                <option key={m} value={i + 1} className="capitalize">
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Quincena
            <select name="quincena" defaultValue={quincenaHoy} className={clasesCampo}>
              <option value={1}>1.ª (del 1 al 15)</option>
              <option value={2}>2.ª (del 16 a fin de mes)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Fecha de pago
            <input name="fecha_pago" type="date" className={clasesCampo} />
          </label>
          <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Generar
          </button>
          <p className="w-full text-xs text-muted-foreground">
            Entran los colaboradores del tipo de planilla elegido que tienen información salarial y están vigentes en el período (no los suspendidos ni quien ya tiene liquidación). En aguinaldo y bono 14 no se usan el mes ni la quincena: se toma el período de ley del año elegido.
          </p>
        </form>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Planillas de {anio}</p>
        <span className="flex gap-3 text-xs font-semibold">
          <Link href={`/rrhh/planillas?anio=${anio - 1}`} className="text-primary hover:underline">
            ← {anio - 1}
          </Link>
          {anio < anioActual && (
            <Link href={`/rrhh/planillas?anio=${anio + 1}`} className="text-primary hover:underline">
              {anio + 1} →
            </Link>
          )}
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Planilla</th>
              <th className="px-3 py-2">Período</th>
              <th className="px-3 py-2 text-right">Personas</th>
              <th className="px-3 py-2 text-right">Devengado</th>
              <th className="px-3 py-2 text-right">Descuentos</th>
              <th className="px-3 py-2 text-right">Líquido</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                  No hay planillas en {anio}.
                </td>
              </tr>
            )}
            {lista.map((p) => (
              <tr key={p.id} className={cn('border-b border-border/60 last:border-0 hover:bg-muted/30', p.estado === 'anulada' && 'opacity-60')}>
                <td className="px-3 py-2">
                  <Link href={`/rrhh/planillas/${p.id}`} className="font-mono font-semibold text-primary hover:underline">
                    {p.codigo}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{NOMBRE_TIPO_PLANILLA[p.tipo]}</span>
                </td>
                <td className="px-3 py-2 text-xs">
                  {periodoPlanilla(p)}
                  {p.fecha_pago && <span className="block text-muted-foreground">Pago {fechaCorta(p.fecha_pago)}</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{p.empleados}</td>
                <td className="px-3 py-2 text-right tabular-nums">{montoContable(p.total_devengado)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{montoContable(p.total_descuentos)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{montoContable(p.total_liquido)}</td>
                <td className="px-3 py-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', ESTADOS_PLANILLA[p.estado]?.clase)}>{ESTADOS_PLANILLA[p.estado]?.etiqueta}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
