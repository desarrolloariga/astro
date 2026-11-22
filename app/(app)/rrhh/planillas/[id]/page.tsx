import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Download, FileText, Printer, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { hoyGuatemala } from '@/lib/contabilidad'
import { clasesCampo, montoContable } from '@/lib/contabilidad-general'
import { ESTADOS_PLANILLA, FORMAS_PAGO, NOMBRE_TIPO_PLANILLA, dias, fechaCorta, periodoPlanilla } from '@/lib/rrhh'
import { BotonConfirmar } from '@/components/app/boton-confirmar'
import { EnlaceVolver, Mensajes } from '@/components/contabilidad/comunes'
import { accionPlanilla, editarLinea, pagarPlanilla } from '../acciones'

export const metadata = { title: 'Planilla — ASTRO' }

export type LineaPlanilla = {
  id: number
  colaborador_id: number
  nombre: string
  puesto: string | null
  departamento: string | null
  fecha_ingreso: string | null
  tipo_salario: string
  salario_base: number
  salario_promedio: number
  bonificacion_mensual: number
  forma_pago: string | null
  banco: string | null
  tipo_cuenta: string | null
  numero_cuenta: string | null
  dias_manual: number | null
  horas_extra: number
  extras_monto: number
  comisiones: number
  bonos_adicionales: number
  otros_descuentos: number
  otros_descuentos_detalle: string | null
  notas: string | null
  dias_periodo: number
  dias_sin_goce: number
  dias_laborados: number
  salario_devengado: number
  bonificacion_incentiva: number
  otros_bonos: number
  valor_horas_extra: number
  total_devengado: number
  igss_laboral: number
  isr: number
  deducciones: number
  total_descuentos: number
  liquido: number
  igss_patronal: number
  prov_aguinaldo: number
  prov_bono14: number
  prov_vacaciones: number
  prov_indemnizacion: number
}

export type PlanillaDetalle = {
  id: number
  codigo: string
  tipo: string
  anio: number
  mes: number
  quincena: number
  fecha_inicio: string
  fecha_fin: string
  fecha_pago: string | null
  estado: string
  empleados: number
  total_devengado: number
  total_descuentos: number
  total_liquido: number
  total_patronal: number
  total_provisiones: number
  partida_id: number | null
  movimiento_banco_id: number | null
  motivo_anulacion: string | null
  cuenta: { nombre: string } | null
  aprobado: { nombre: string } | null
  pagado: { nombre: string } | null
}

const SELECT_PLANILLA =
  '*, cuenta:cuenta_bancaria_id ( nombre ), aprobado:aprobado_por ( nombre ), pagado:pagado_por ( nombre )'

const q = (v: number | string | null | undefined) => montoContable(v ?? 0)

export default async function PlanillaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const planillaId = Number(id)
  if (!Number.isInteger(planillaId) || planillaId <= 0) notFound()
  const supabase = await createClient()
  const [puedeVer, puedeGestionar, puedeAprobar, puedePagar, { data: pData }, { data: lData }, { data: cuentas }] = await Promise.all([
    tienePermiso('planilla', 'ver'),
    tienePermiso('planilla', 'gestionar'),
    tienePermiso('planilla', 'aprobar'),
    tienePermiso('planilla', 'pagar'),
    supabase.from('planillas').select(SELECT_PLANILLA).eq('id', planillaId).maybeSingle(),
    supabase.from('planilla_lineas').select('*').eq('planilla_id', planillaId).order('nombre'),
    supabase.from('cuentas_bancarias').select('id, nombre').eq('activa', true).order('nombre'),
  ])
  if (!puedeVer) redirect('/inicio')
  if (!pData) notFound()
  const p = pData as unknown as PlanillaDetalle
  const lineas = (lData ?? []) as LineaPlanilla[]
  const contrato = p.tipo === 'contrato'
  const prestacion = p.tipo === 'aguinaldo' || p.tipo === 'bono14'
  const editable = p.estado === 'borrador' && puedeGestionar
  const mini = cn(clasesCampo, 'py-1 text-xs text-right w-24')
  const suma = (k: keyof LineaPlanilla) => lineas.reduce((s, l) => s + Number(l[k] ?? 0), 0)
  const prov = { agui: suma('prov_aguinaldo'), b14: suma('prov_bono14'), vac: suma('prov_vacaciones'), ind: suma('prov_indemnizacion') }
  const columnas = contrato ? 15 : 12

  return (
    <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <EnlaceVolver href="/rrhh/planillas">← Planillas</EnlaceVolver>
        <span className="flex flex-wrap items-center gap-3 text-sm font-semibold">
          <Link href={`/rrhh/planillas/${p.id}/boletas`} className="inline-flex items-center gap-1 text-primary hover:underline">
            <Printer className="h-4 w-4" /> Boletas de pago
          </Link>
          <a href={`/rrhh/planillas/${p.id}/exportar?formato=xlsx`} className="inline-flex items-center gap-1 text-primary hover:underline">
            <Download className="h-4 w-4" /> Excel
          </a>
          <a href={`/rrhh/planillas/${p.id}/exportar?formato=pdf`} target="_blank" className="inline-flex items-center gap-1 text-primary hover:underline">
            <FileText className="h-4 w-4" /> PDF
          </a>
        </span>
      </div>

      <section className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-xs text-muted-foreground">{p.codigo}</p>
          <h1 className="text-2xl font-bold tracking-tight">{NOMBRE_TIPO_PLANILLA[p.tipo]}</h1>
          <p className="text-sm text-muted-foreground first-letter:uppercase">
            {periodoPlanilla(p)} · del {fechaCorta(p.fecha_inicio)} al {fechaCorta(p.fecha_fin)}
            {p.fecha_pago ? ` · pago ${fechaCorta(p.fecha_pago)}` : ''}
          </p>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className={cn('rounded-full px-2 py-0.5 font-semibold', ESTADOS_PLANILLA[p.estado]?.clase)}>{ESTADOS_PLANILLA[p.estado]?.etiqueta}</span>
            {p.aprobado && <span className="text-muted-foreground">Aprobó {p.aprobado.nombre}</span>}
            {p.pagado && <span className="text-muted-foreground">· pagó {p.pagado.nombre}{p.cuenta ? ` desde ${p.cuenta.nombre}` : ''}</span>}
            {p.partida_id && (
              <Link href={`/contabilidad/partidas/${p.partida_id}`} className="font-semibold text-primary hover:underline">
                · Ver partida
              </Link>
            )}
            {p.estado === 'anulada' && p.motivo_anulacion && <span className="text-muted-foreground">· {p.motivo_anulacion}</span>}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-right text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Colaboradores</dt>
            <dd className="font-semibold tabular-nums">{p.empleados}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Devengado</dt>
            <dd className="font-semibold tabular-nums">Q{q(p.total_devengado)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Descuentos</dt>
            <dd className="font-semibold tabular-nums">Q{q(p.total_descuentos)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Líquido a pagar</dt>
            <dd className="text-lg font-bold tabular-nums text-primary">Q{q(p.total_liquido)}</dd>
          </div>
        </dl>
      </section>
      <Mensajes ok={sp.ok} error={sp.error} />

      {/* Acciones según el estado */}
      <section className="flex flex-wrap items-center gap-3">
        {p.estado === 'borrador' && puedeGestionar && (
          <form action={accionPlanilla}>
            <input type="hidden" name="planilla_id" value={p.id} />
            <button type="submit" name="accion" value="recalcular" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
              <RefreshCw className="h-4 w-4" /> Recalcular con salarios y ausencias actuales
            </button>
          </form>
        )}
        {p.estado === 'borrador' && puedeAprobar && (
          <form action={accionPlanilla}>
            <input type="hidden" name="planilla_id" value={p.id} />
            <BotonConfirmar
              name="accion"
              value="aprobar"
              mensaje={`¿Aprobar la planilla ${p.codigo} por Q${q(p.total_liquido)}? Ya no se podrá editar; se genera la partida contable y se rebajan los préstamos.`}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Aprobar planilla
            </BotonConfirmar>
          </form>
        )}
        {p.estado === 'borrador' && puedeGestionar && (
          <form action={accionPlanilla}>
            <input type="hidden" name="planilla_id" value={p.id} />
            <BotonConfirmar name="accion" value="eliminar" mensaje={`¿Eliminar el borrador ${p.codigo}?`} className="text-sm font-semibold text-muted-foreground hover:text-destructive">
              Eliminar borrador
            </BotonConfirmar>
          </form>
        )}
        {p.estado === 'aprobada' && puedePagar && (
          <form action={pagarPlanilla} className="flex flex-wrap items-end gap-2 rounded-xl border border-primary/40 bg-card p-3">
            <input type="hidden" name="planilla_id" value={p.id} />
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Pagar desde
              <select name="cuenta_bancaria_id" required defaultValue="" className={cn(clasesCampo, 'py-1.5 text-xs')}>
                <option value="" disabled>
                  Cuenta bancaria…
                </option>
                {((cuentas ?? []) as { id: number; nombre: string }[]).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Fecha
              <input name="fecha" type="date" defaultValue={p.fecha_pago ?? hoyGuatemala()} className={cn(clasesCampo, 'py-1.5 text-xs')} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Referencia
              <input name="referencia" placeholder="No. de transferencia o lote" className={cn(clasesCampo, 'py-1.5 text-xs')} />
            </label>
            <BotonConfirmar
              mensaje={`¿Registrar el pago de Q${q(p.total_liquido)} en bancos?`}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              Registrar pago
            </BotonConfirmar>
          </form>
        )}
        {p.estado === 'aprobada' && puedeAprobar && (
          <form action={accionPlanilla} className="flex items-center gap-2">
            <input type="hidden" name="planilla_id" value={p.id} />
            <input name="motivo" required placeholder="Motivo de la anulación" className={cn(clasesCampo, 'w-56 py-1.5 text-xs')} />
            <BotonConfirmar
              name="accion"
              value="anular"
              mensaje="¿Anular la planilla? Se revierte la partida y los préstamos recuperan su saldo."
              className="text-sm font-semibold text-destructive hover:underline"
            >
              Anular
            </BotonConfirmar>
          </form>
        )}
        {p.estado === 'pagada' && p.movimiento_banco_id && (
          <p className="text-xs text-muted-foreground">El pago quedó en Bancos. Para corregir la planilla, anula primero ese movimiento bancario.</p>
        )}
      </section>

      {prestacion && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[1000px] text-xs">
            <thead className="border-b border-border bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2">Nombre</th>
                <th className="px-2 py-2">Puesto</th>
                <th className="px-2 py-2">Ingreso</th>
                <th className="px-2 py-2 text-right">Salario promedio</th>
                <th className="px-2 py-2 text-right">Días</th>
                <th className="px-2 py-2 text-right">{p.tipo === 'aguinaldo' ? 'Aguinaldo' : 'Bono 14'}</th>
                <th className="px-2 py-2 text-right">Otros pagos</th>
                <th className="px-2 py-2 text-right">Descuentos</th>
                <th className="px-2 py-2 text-right">Líquido</th>
                <th className="px-2 py-2">Forma de pago</th>
                <th className="px-2 py-2">Cuenta</th>
                <th className="px-2 py-2">Banco</th>
              </tr>
            </thead>
            <tbody>
              {lineas.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    Nadie entra en esta planilla.
                  </td>
                </tr>
              )}
              {lineas.map((l) => [
                <tr key={l.id} className="border-t border-border/60 align-top">
                  <td className="px-2 py-2">
                    <Link href={`/rrhh/${l.colaborador_id}?tab=salario`} className="font-semibold hover:underline">
                      {l.nombre}
                    </Link>
                    {l.notas && <span className="block text-muted-foreground">{l.notas}</span>}
                  </td>
                  <td className="px-2 py-2">{l.puesto ?? '—'}</td>
                  <td className="px-2 py-2 tabular-nums">{fechaCorta(l.fecha_ingreso)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{q(l.salario_promedio)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {dias(l.dias_laborados)}
                    {l.dias_manual != null && <span className="block text-muted-foreground">manual</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{q(l.salario_devengado)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{q(l.bonos_adicionales)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {q(l.otros_descuentos)}
                    {l.otros_descuentos_detalle && <span className="block text-muted-foreground">{l.otros_descuentos_detalle}</span>}
                  </td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{q(l.liquido)}</td>
                  <td className="px-2 py-2">{FORMAS_PAGO[l.forma_pago ?? ''] ?? '—'}</td>
                  <td className="px-2 py-2 font-mono">{l.numero_cuenta ?? '—'}</td>
                  <td className="px-2 py-2">{l.banco ?? '—'}</td>
                </tr>,
                editable && (
                  <tr key={`e${l.id}`} className="bg-muted/20">
                    <td colSpan={12} className="px-2 pb-2">
                      <details>
                        <summary className="cursor-pointer py-1 text-[11px] font-semibold text-primary">Ajustar días, otros pagos y descuentos</summary>
                        <form action={editarLinea} className="flex flex-wrap items-end gap-2 py-1">
                          <input type="hidden" name="planilla_id" value={p.id} />
                          <input type="hidden" name="linea_id" value={l.id} />
                          <label className="flex flex-col gap-0.5 text-[11px] font-semibold">
                            Días (vacío = automático {dias(l.dias_periodo)})
                            <input name="dias_manual" inputMode="decimal" defaultValue={l.dias_manual ?? ''} className={mini} />
                          </label>
                          <label className="flex flex-col gap-0.5 text-[11px] font-semibold">
                            Otros pagos (Q)
                            <input name="bonos_adicionales" inputMode="decimal" defaultValue={Number(l.bonos_adicionales) || ''} className={mini} />
                          </label>
                          <label className="flex flex-col gap-0.5 text-[11px] font-semibold">
                            Descuentos (Q)
                            <input name="otros_descuentos" inputMode="decimal" defaultValue={Number(l.otros_descuentos) || ''} className={mini} />
                          </label>
                          <label className="flex flex-col gap-0.5 text-[11px] font-semibold">
                            Concepto del descuento
                            <input name="otros_descuentos_detalle" defaultValue={l.otros_descuentos_detalle ?? ''} className={cn(clasesCampo, 'w-44 py-1 text-xs')} />
                          </label>
                          <label className="flex flex-col gap-0.5 text-[11px] font-semibold">
                            Nota
                            <input name="notas" defaultValue={l.notas ?? ''} className={cn(clasesCampo, 'w-44 py-1 text-xs')} />
                          </label>
                          <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                            Recalcular línea
                          </button>
                        </form>
                      </details>
                    </td>
                  </tr>
                ),
              ])}
            </tbody>
            {lineas.length > 0 && (
              <tfoot className="border-t-2 border-border font-semibold">
                <tr>
                  <td className="px-2 py-2" colSpan={5}>
                    Totales
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{q(suma('salario_devengado'))}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{q(suma('bonos_adicionales'))}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{q(suma('otros_descuentos'))}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{q(suma('liquido'))}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {!prestacion && (
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[1300px] text-xs">
          <thead className="border-b border-border bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2 py-2">Nombre</th>
              <th className="px-2 py-2">Puesto</th>
              <th className="px-2 py-2">Ingreso</th>
              <th className="px-2 py-2 text-right">Salario base</th>
              {contrato && <th className="px-2 py-2 text-right">Bonif. incentiva</th>}
              <th className="px-2 py-2 text-right">{contrato ? 'Días laborados' : 'Días por servicios'}</th>
              <th className="px-2 py-2 text-right">Extras</th>
              <th className="px-2 py-2 text-right">{contrato ? 'Otros bonos' : 'Otros pagos'}</th>
              {contrato && <th className="px-2 py-2 text-right">IGSS</th>}
              <th className="px-2 py-2 text-right">ISR</th>
              {contrato && <th className="px-2 py-2 text-right">Otros descuentos</th>}
              <th className="px-2 py-2 text-right">Líquido</th>
              <th className="px-2 py-2">Forma de pago</th>
              <th className="px-2 py-2">Cuenta</th>
              <th className="px-2 py-2">Banco</th>
            </tr>
          </thead>
          <tbody>
            {lineas.length === 0 && (
              <tr>
                <td colSpan={columnas} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  Nadie entra en esta planilla: revisa que los colaboradores tengan información salarial y el tipo de planilla correcto.
                </td>
              </tr>
            )}
            {lineas.map((l) => {
              const otrosBonos = Number(l.otros_bonos) + Number(l.comisiones) + Number(l.bonos_adicionales)
              const otrosDesc = Number(l.deducciones) + Number(l.otros_descuentos)
              return [
                <tr key={l.id} className="border-t border-border/60 align-top">
                  <td className="px-2 py-2">
                    <Link href={`/rrhh/${l.colaborador_id}?tab=salario`} className="font-semibold hover:underline">
                      {l.nombre}
                    </Link>
                    {l.notas && <span className="block text-muted-foreground">{l.notas}</span>}
                  </td>
                  <td className="px-2 py-2">{l.puesto ?? '—'}</td>
                  <td className="px-2 py-2 tabular-nums">{fechaCorta(l.fecha_ingreso)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {q(l.salario_devengado)}
                    <span className="block text-muted-foreground">de {q(l.salario_base)}{l.tipo_salario === 'por_dia' ? '/día' : l.tipo_salario === 'por_hora' ? '/hora' : '/mes'}</span>
                  </td>
                  {contrato && <td className="px-2 py-2 text-right tabular-nums">{q(l.bonificacion_incentiva)}</td>}
                  <td className="px-2 py-2 text-right tabular-nums">
                    {dias(l.dias_laborados)}
                    {Number(l.dias_sin_goce) > 0 && <span className="block text-amber-600">−{dias(l.dias_sin_goce)} sin goce</span>}
                    {l.dias_manual != null && <span className="block text-muted-foreground">manual</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {q(l.valor_horas_extra)}
                    {contrato && Number(l.horas_extra) > 0 && <span className="block text-muted-foreground">{dias(l.horas_extra)} h</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {q(otrosBonos)}
                    {Number(l.comisiones) > 0 && <span className="block text-muted-foreground">comisiones {q(l.comisiones)}</span>}
                  </td>
                  {contrato && <td className="px-2 py-2 text-right tabular-nums">{q(l.igss_laboral)}</td>}
                  <td className="px-2 py-2 text-right tabular-nums">{q(l.isr)}</td>
                  {contrato && (
                    <td className="px-2 py-2 text-right tabular-nums">
                      {q(otrosDesc)}
                      {l.otros_descuentos_detalle && <span className="block text-muted-foreground">{l.otros_descuentos_detalle}</span>}
                    </td>
                  )}
                  <td className={cn('px-2 py-2 text-right font-semibold tabular-nums', Number(l.liquido) < 0 && 'text-destructive')}>{q(l.liquido)}</td>
                  <td className="px-2 py-2">{FORMAS_PAGO[l.forma_pago ?? ''] ?? '—'}</td>
                  <td className="px-2 py-2 font-mono">{l.numero_cuenta ?? '—'}</td>
                  <td className="px-2 py-2">{l.banco ?? '—'}</td>
                </tr>,
                editable && (
                  <tr key={`e${l.id}`} className="bg-muted/20">
                    <td colSpan={columnas} className="px-2 pb-2">
                      <details>
                        <summary className="cursor-pointer py-1 text-[11px] font-semibold text-primary">Capturar días, extras, bonos y descuentos</summary>
                        <form action={editarLinea} className="flex flex-wrap items-end gap-2 py-1">
                          <input type="hidden" name="planilla_id" value={p.id} />
                          <input type="hidden" name="linea_id" value={l.id} />
                          <label className="flex flex-col gap-0.5 text-[11px] font-semibold">
                            Días (vacío = automático {dias(Number(l.dias_periodo) - Number(l.dias_sin_goce))})
                            <input name="dias_manual" inputMode="decimal" defaultValue={l.dias_manual ?? ''} className={mini} />
                          </label>
                          {contrato ? (
                            <label className="flex flex-col gap-0.5 text-[11px] font-semibold">
                              Horas extra
                              <input name="horas_extra" inputMode="decimal" defaultValue={Number(l.horas_extra) || ''} className={mini} />
                            </label>
                          ) : (
                            <label className="flex flex-col gap-0.5 text-[11px] font-semibold">
                              Extras (Q)
                              <input name="extras_monto" inputMode="decimal" defaultValue={Number(l.extras_monto) || ''} className={mini} />
                            </label>
                          )}
                          <label className="flex flex-col gap-0.5 text-[11px] font-semibold">
                            Comisiones (Q)
                            <input name="comisiones" inputMode="decimal" defaultValue={Number(l.comisiones) || ''} className={mini} />
                          </label>
                          <label className="flex flex-col gap-0.5 text-[11px] font-semibold">
                            {contrato ? 'Otros bonos (Q)' : 'Otros pagos (Q)'}
                            <input name="bonos_adicionales" inputMode="decimal" defaultValue={Number(l.bonos_adicionales) || ''} className={mini} />
                          </label>
                          <label className="flex flex-col gap-0.5 text-[11px] font-semibold">
                            Otros descuentos (Q)
                            <input name="otros_descuentos" inputMode="decimal" defaultValue={Number(l.otros_descuentos) || ''} className={mini} />
                          </label>
                          <label className="flex flex-col gap-0.5 text-[11px] font-semibold">
                            Concepto del descuento
                            <input name="otros_descuentos_detalle" defaultValue={l.otros_descuentos_detalle ?? ''} className={cn(clasesCampo, 'w-44 py-1 text-xs')} />
                          </label>
                          <label className="flex flex-col gap-0.5 text-[11px] font-semibold">
                            Nota
                            <input name="notas" defaultValue={l.notas ?? ''} className={cn(clasesCampo, 'w-44 py-1 text-xs')} />
                          </label>
                          <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                            Recalcular línea
                          </button>
                          {Number(l.deducciones) > 0 && <span className="text-[11px] text-muted-foreground">Incluye Q{q(l.deducciones)} de préstamos o deducciones autorizadas.</span>}
                        </form>
                      </details>
                    </td>
                  </tr>
                ),
              ]
            })}
          </tbody>
          {lineas.length > 0 && (
            <tfoot className="border-t-2 border-border font-semibold">
              <tr>
                <td className="px-2 py-2" colSpan={3}>
                  Totales
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{q(suma('salario_devengado'))}</td>
                {contrato && <td className="px-2 py-2 text-right tabular-nums">{q(suma('bonificacion_incentiva'))}</td>}
                <td />
                <td className="px-2 py-2 text-right tabular-nums">{q(suma('valor_horas_extra'))}</td>
                <td className="px-2 py-2 text-right tabular-nums">{q(suma('otros_bonos') + suma('comisiones') + suma('bonos_adicionales'))}</td>
                {contrato && <td className="px-2 py-2 text-right tabular-nums">{q(suma('igss_laboral'))}</td>}
                <td className="px-2 py-2 text-right tabular-nums">{q(suma('isr'))}</td>
                {contrato && <td className="px-2 py-2 text-right tabular-nums">{q(suma('deducciones') + suma('otros_descuentos'))}</td>}
                <td className="px-2 py-2 text-right tabular-nums">{q(suma('liquido'))}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      )}

      {contrato && lineas.length > 0 && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { e: 'IGSS patronal (12.67 %)', v: p.total_patronal },
            { e: 'IGSS total a enterar', v: suma('igss_laboral') + Number(p.total_patronal) },
            { e: 'Provisión aguinaldo', v: prov.agui },
            { e: 'Provisión bono 14', v: prov.b14 },
            { e: 'Provisión vacaciones', v: prov.vac },
            { e: 'Provisión indemnización', v: prov.ind },
          ].map((k) => (
            <div key={k.e} className="rounded-xl border border-border bg-card px-3 py-2">
              <p className="text-[11px] text-muted-foreground">{k.e}</p>
              <p className="font-semibold tabular-nums">Q{q(k.v)}</p>
            </div>
          ))}
        </section>
      )}
      <p className="text-xs text-muted-foreground">
        {prestacion
          ? `${p.tipo === 'aguinaldo' ? 'Aguinaldo (Decreto 76-78)' : 'Bono 14 (Decreto 42-92)'}: salario ordinario promedio del período × días laborados ÷ días del período. No paga IGSS ni ISR; la partida rebaja la provisión acumulada en las planillas quincenales.`
          : contrato
          ? 'IGSS 4.83 % sobre salario, extras, comisiones y bonos (la bonificación incentiva no cotiza). ISR proyectado al año con la deducción de Q48,000 y el IGSS, repartido entre las quincenas que faltan. Horas extra al 150 % de la hora ordinaria según la jornada.'
          : 'Otros pagos por servicios: sin IGSS ni prestaciones; retención de ISR del 5 % a quien la tiene marcada en su información salarial.'}
      </p>
    </main>
  )
}
