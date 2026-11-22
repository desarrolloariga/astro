import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { CheckCircle2, Circle, FileText, Printer, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { hoyGuatemala } from '@/lib/contabilidad'
import { clasesCampo, montoContable } from '@/lib/contabilidad-general'
import { ESTADOS_FINALIZACION, SELECT_FINALIZACION, TIPOS_FINALIZACION, dias, fechaCorta } from '@/lib/rrhh'
import { BotonConfirmar } from '@/components/app/boton-confirmar'
import { EnlaceVolver, Mensajes } from '@/components/contabilidad/comunes'
import { accionFinalizacion, editarFinalizacion, pagarFinalizacion } from '../acciones'

export const metadata = { title: 'Liquidación laboral — ASTRO' }

export type Finalizacion = {
  id: number
  colaborador_id: number
  estado: string
  tipo: string
  fecha_salida: string
  motivo: string | null
  aplica_indemnizacion: boolean
  incluir_salario: boolean
  entrevista_fecha: string | null
  entrevista_por: string | null
  entrevista_motivo: string | null
  entrevista_comentarios: string | null
  recontratable: boolean | null
  tipo_planilla: string | null
  fecha_ingreso: string | null
  salario_base: number
  bonificacion_mensual: number
  salario_promedio: number
  salario_promedio_ordinario: number
  dias_salario_manual: number | null
  dias_vacaciones_manual: number | null
  otros_pagos: number
  otros_pagos_detalle: string | null
  otros_descuentos: number
  otros_descuentos_detalle: string | null
  notas: string | null
  salario_desde: string | null
  dias_salario: number
  salario_pendiente: number
  bonificacion_pendiente: number
  dias_vacaciones: number
  vacaciones_monto: number
  aguinaldo_desde: string | null
  aguinaldo_dias: number
  aguinaldo_monto: number
  bono14_desde: string | null
  bono14_dias: number
  bono14_monto: number
  anios_servicio: number
  indemnizacion_monto: number
  total_ingresos: number
  igss_laboral: number
  isr: number
  prestamos: number
  total_descuentos: number
  liquido: number
  partida_id: number | null
  movimiento_banco_id: number | null
  fecha_pago: string | null
  motivo_anulacion: string | null
  colaborador: {
    codigo: string
    nombres: string
    apellidos: string
    dpi: string | null
    puesto: { nombre: string } | null
    departamento: { nombre: string } | null
  } | null
  aplicadas: { monto: number; deduccion: { descripcion: string; tipo: string } | null }[]
  aprobado: { nombre: string } | null
  pagado: { nombre: string } | null
  cuenta: { nombre: string } | null
}


const q = (v: number | string | null | undefined) => montoContable(v ?? 0)

function Fila({ e, detalle, v, negativo }: { e: string; detalle?: string; v: number; negativo?: boolean }) {
  return (
    <tr className="border-t border-border/60">
      <td className="px-4 py-2">
        {e}
        {detalle && <span className="block text-xs text-muted-foreground">{detalle}</span>}
      </td>
      <td className={cn('px-4 py-2 text-right tabular-nums', negativo && Number(v) > 0 && 'text-destructive')}>
        {negativo && Number(v) > 0 ? '−' : ''}
        {q(v)}
      </td>
    </tr>
  )
}

export default async function FinalizacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const finId = Number(id)
  if (!Number.isInteger(finId) || finId <= 0) notFound()
  const supabase = await createClient()
  const [puedeFinalizar, puedeVerPlanilla, puedeAprobar, puedePagar, { data }, { data: cuentas }] = await Promise.all([
    tienePermiso('rrhh', 'finalizar'),
    tienePermiso('planilla', 'ver'),
    tienePermiso('planilla', 'aprobar'),
    tienePermiso('planilla', 'pagar'),
    supabase.from('rrhh_finalizaciones').select(SELECT_FINALIZACION).eq('id', finId).maybeSingle(),
    supabase.from('cuentas_bancarias').select('id, nombre').eq('activa', true).order('nombre'),
  ])
  if (!puedeFinalizar && !puedeVerPlanilla) redirect('/inicio')
  if (!data) notFound()
  const f = data as unknown as Finalizacion
  const [{ data: equipo }, { data: tiposDoc }, { data: docs }] = await Promise.all([
    supabase.from('colaborador_asignaciones').select('id, descripcion').eq('colaborador_id', f.colaborador_id).eq('estado', 'asignado'),
    supabase.from('rrhh_tipos_documento').select('id, nombre, obligatorio').eq('etapa', 'finalizacion').eq('activo', true).order('orden'),
    supabase.from('colaborador_documentos').select('tipo_documento_id').eq('colaborador_id', f.colaborador_id).eq('etapa', 'finalizacion'),
  ])
  const pendientesEquipo = (equipo ?? []) as { id: number; descripcion: string }[]
  const subidos = new Set(((docs ?? []) as { tipo_documento_id: number | null }[]).map((d) => d.tipo_documento_id))
  const contrato = f.tipo_planilla === 'contrato'
  const editable = f.estado === 'borrador' && puedeFinalizar
  const nombre = f.colaborador ? `${f.colaborador.nombres} ${f.colaborador.apellidos}` : ''
  const diario = Number(f.salario_promedio) / 30

  const checklist = [
    { e: 'Uniformes y equipo devueltos', listo: pendientesEquipo.length === 0, nota: pendientesEquipo.length ? `${pendientesEquipo.length} pendiente(s)` : undefined, href: `/rrhh/${f.colaborador_id}?tab=equipo` },
    ...((tiposDoc ?? []) as { id: number; nombre: string; obligatorio: boolean }[]).map((t) => ({
      e: t.nombre,
      listo: subidos.has(t.id),
      nota: t.obligatorio ? undefined : 'si aplica',
      href: `/rrhh/${f.colaborador_id}?tab=documentos`,
    })),
    { e: 'Entrevista de salida', listo: Boolean(f.entrevista_fecha || f.entrevista_comentarios), nota: undefined, href: undefined },
    { e: 'Liquidación aprobada', listo: ['aprobada', 'pagada'].includes(f.estado), nota: undefined, href: undefined },
    { e: 'Liquidación pagada', listo: f.estado === 'pagada', nota: f.fecha_pago ? fechaCorta(f.fecha_pago) : undefined, href: undefined },
  ]

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <EnlaceVolver href={`/rrhh/${f.colaborador_id}?tab=finalizacion`}>← Expediente</EnlaceVolver>
        <span className="flex flex-wrap items-center gap-3 text-sm font-semibold">
          <Link href={`/rrhh/finalizaciones/${f.id}/finiquito`} className="inline-flex items-center gap-1 text-primary hover:underline">
            <Printer className="h-4 w-4" /> Finiquito
          </Link>
          <Link href={`/rrhh/${f.colaborador_id}/constancia`} className="inline-flex items-center gap-1 text-primary hover:underline">
            <FileText className="h-4 w-4" /> Constancia laboral
          </Link>
        </span>
      </div>

      <section className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-xs text-muted-foreground">{f.colaborador?.codigo}</p>
          <h1 className="text-2xl font-bold tracking-tight">Finalización de {nombre}</h1>
          <p className="text-sm text-muted-foreground">
            {[f.colaborador?.puesto?.nombre, f.colaborador?.departamento?.nombre].filter(Boolean).join(' · ')}
            {' · '}
            {TIPOS_FINALIZACION[f.tipo]} · salida {fechaCorta(f.fecha_salida)} · ingreso {fechaCorta(f.fecha_ingreso)} ({dias(f.anios_servicio)} años)
          </p>
          {f.motivo && <p className="text-sm">{f.motivo}</p>}
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className={cn('rounded-full px-2 py-0.5 font-semibold', ESTADOS_FINALIZACION[f.estado]?.clase)}>{ESTADOS_FINALIZACION[f.estado]?.etiqueta}</span>
            {f.aprobado && <span className="text-muted-foreground">Aprobó {f.aprobado.nombre}</span>}
            {f.pagado && <span className="text-muted-foreground">· pagó {f.pagado.nombre}{f.cuenta ? ` desde ${f.cuenta.nombre}` : ''}</span>}
            {f.partida_id && (
              <Link href={`/contabilidad/partidas/${f.partida_id}`} className="font-semibold text-primary hover:underline">
                · Ver partida
              </Link>
            )}
            {f.estado === 'anulada' && f.motivo_anulacion && <span className="text-muted-foreground">· {f.motivo_anulacion}</span>}
          </span>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Líquido a recibir</p>
          <p className="text-3xl font-bold tabular-nums text-primary">Q{q(f.liquido)}</p>
        </div>
      </section>
      <Mensajes ok={sp.ok} error={sp.error} />

      <section className="flex flex-wrap items-center gap-3">
        {editable && (
          <form action={accionFinalizacion}>
            <input type="hidden" name="finalizacion_id" value={f.id} />
            <button type="submit" name="accion" value="recalcular" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
              <RefreshCw className="h-4 w-4" /> Recalcular
            </button>
          </form>
        )}
        {f.estado === 'borrador' && puedeAprobar && (
          <form action={accionFinalizacion}>
            <input type="hidden" name="finalizacion_id" value={f.id} />
            <BotonConfirmar
              name="accion"
              value="aprobar"
              mensaje={`¿Aprobar la liquidación de ${nombre} por Q${q(f.liquido)}? El colaborador queda de baja al ${fechaCorta(f.fecha_salida)}.`}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Aprobar liquidación
            </BotonConfirmar>
          </form>
        )}
        {editable && (
          <form action={accionFinalizacion}>
            <input type="hidden" name="finalizacion_id" value={f.id} />
            <input type="hidden" name="colaborador_id" value={f.colaborador_id} />
            <BotonConfirmar name="accion" value="eliminar" mensaje="¿Eliminar este borrador de liquidación?" className="text-sm font-semibold text-muted-foreground hover:text-destructive">
              Eliminar borrador
            </BotonConfirmar>
          </form>
        )}
        {f.estado === 'aprobada' && puedePagar && f.liquido > 0 && (
          <form action={pagarFinalizacion} className="flex flex-wrap items-end gap-2 rounded-xl border border-primary/40 bg-card p-3">
            <input type="hidden" name="finalizacion_id" value={f.id} />
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
              <input name="fecha" type="date" defaultValue={hoyGuatemala()} className={cn(clasesCampo, 'py-1.5 text-xs')} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Referencia
              <input name="referencia" placeholder="Cheque o transferencia" className={cn(clasesCampo, 'py-1.5 text-xs')} />
            </label>
            <BotonConfirmar mensaje={`¿Registrar el pago de Q${q(f.liquido)} en bancos?`} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
              Registrar pago
            </BotonConfirmar>
          </form>
        )}
        {f.estado === 'aprobada' && puedeAprobar && (
          <form action={accionFinalizacion} className="flex items-center gap-2">
            <input type="hidden" name="finalizacion_id" value={f.id} />
            <input name="motivo" required placeholder="Motivo de la anulación" className={cn(clasesCampo, 'w-56 py-1.5 text-xs')} />
            <BotonConfirmar
              name="accion"
              value="anular"
              mensaje="¿Anular la liquidación? Se revierte la partida, los préstamos recuperan su saldo y el colaborador vuelve a su estado anterior."
              className="text-sm font-semibold text-destructive hover:underline"
            >
              Anular
            </BotonConfirmar>
          </form>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="overflow-hidden rounded-xl border border-border bg-card lg:col-span-2">
          <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">Liquidación</p>
          <table className="w-full text-sm">
            <tbody>
              <tr className="bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
                <td className="px-4 py-1.5" colSpan={2}>
                  Ingresos
                </td>
              </tr>
              <Fila
                e={contrato ? 'Salario pendiente' : 'Honorarios pendientes'}
                detalle={
                  f.incluir_salario
                    ? `${dias(f.dias_salario)} días${f.salario_desde ? ` del ${fechaCorta(f.salario_desde)} al ${fechaCorta(f.fecha_salida)}` : ''} · base Q${q(f.salario_base)}${f.dias_salario_manual != null ? ' · días manuales' : ''}`
                    : 'Se paga en la planilla quincenal'
                }
                v={f.salario_pendiente}
              />
              {contrato && <Fila e="Bonificación incentiva" detalle={`${dias(f.dias_salario)} días de Q${q(f.bonificacion_mensual)} mensuales`} v={f.bonificacion_pendiente} />}
              {contrato && (
                <Fila
                  e="Vacaciones pendientes"
                  detalle={`${dias(f.dias_vacaciones)} días × Q${q(diario)} diarios${f.dias_vacaciones_manual != null ? ' · días manuales' : ''}`}
                  v={f.vacaciones_monto}
                />
              )}
              {contrato && (
                <Fila
                  e="Aguinaldo proporcional"
                  detalle={`${f.aguinaldo_dias} días desde ${fechaCorta(f.aguinaldo_desde)} × Q${q(f.salario_promedio_ordinario)} / 365 (Decreto 76-78)`}
                  v={f.aguinaldo_monto}
                />
              )}
              {contrato && (
                <Fila
                  e="Bono 14 proporcional"
                  detalle={`${f.bono14_dias} días desde ${fechaCorta(f.bono14_desde)} × Q${q(f.salario_promedio_ordinario)} / 365 (Decreto 42-92)`}
                  v={f.bono14_monto}
                />
              )}
              {contrato && (
                <Fila
                  e="Indemnización"
                  detalle={
                    f.aplica_indemnizacion
                      ? `${dias(f.anios_servicio)} años × Q${q(f.salario_promedio)} × 7/6 (promedio de 6 meses + aguinaldo y bono 14; art. 82 del Código de Trabajo)`
                      : 'No aplica para este tipo de salida'
                  }
                  v={f.indemnizacion_monto}
                />
              )}
              {Number(f.otros_pagos) > 0 && <Fila e="Otros pagos" detalle={f.otros_pagos_detalle ?? undefined} v={f.otros_pagos} />}
              <tr className="border-t border-border font-semibold">
                <td className="px-4 py-2">Total ingresos</td>
                <td className="px-4 py-2 text-right tabular-nums">{q(f.total_ingresos)}</td>
              </tr>
              <tr className="bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
                <td className="px-4 py-1.5" colSpan={2}>
                  Descuentos
                </td>
              </tr>
              {contrato && <Fila e="IGSS laboral" detalle="4.83 % sobre salario pendiente y vacaciones" v={f.igss_laboral} negativo />}
              <Fila e={contrato ? 'ISR (ajuste final del año)' : 'Retención de ISR'} v={f.isr} negativo />
              {f.aplicadas.map((a, i) => (
                <Fila key={i} e={a.deduccion?.descripcion ?? 'Deducción'} detalle="Saldo pendiente" v={a.monto} negativo />
              ))}
              {Number(f.otros_descuentos) > 0 && <Fila e="Otros descuentos" detalle={f.otros_descuentos_detalle ?? undefined} v={f.otros_descuentos} negativo />}
              <tr className="border-t border-border font-semibold">
                <td className="px-4 py-2">Total descuentos</td>
                <td className="px-4 py-2 text-right tabular-nums">−{q(f.total_descuentos)}</td>
              </tr>
              <tr className="border-t-2 border-border text-base font-bold">
                <td className="px-4 py-3">Líquido a recibir</td>
                <td className="px-4 py-3 text-right tabular-nums text-primary">Q{q(f.liquido)}</td>
              </tr>
            </tbody>
          </table>
          {contrato && (
            <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
              Salario promedio de los últimos 6 meses (ordinario y extraordinario): Q{q(f.salario_promedio)} · ordinario de los últimos 12 meses: Q
              {q(f.salario_promedio_ordinario)}. Se toman de las planillas aprobadas; sin planillas, el salario vigente.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Estado final</p>
          <ul className="flex flex-col gap-1.5 text-sm">
            {checklist.map((c) => (
              <li key={c.e} className="flex items-start gap-2">
                {c.listo ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
                <span>
                  {c.href && !c.listo ? (
                    <Link href={c.href} className="hover:underline">
                      {c.e}
                    </Link>
                  ) : (
                    c.e
                  )}
                  {c.nota && <span className="text-xs text-muted-foreground"> · {c.nota}</span>}
                </span>
              </li>
            ))}
          </ul>
          {f.recontratable != null && (
            <p className="mt-2 text-xs">
              Recontratable: <span className="font-semibold">{f.recontratable ? 'sí' : 'no'}</span>
            </p>
          )}
        </section>
      </div>

      {editable && (
        <form action={editarFinalizacion} className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="finalizacion_id" value={f.id} />
          <p className="text-sm font-semibold sm:col-span-2 lg:col-span-4">Datos de la salida y ajustes</p>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Tipo de salida
            <select name="tipo" defaultValue={f.tipo} className={clasesCampo}>
              {Object.entries(TIPOS_FINALIZACION).map(([v, e]) => (
                <option key={v} value={v}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Fecha de salida
            <input name="fecha_salida" type="date" defaultValue={f.fecha_salida} className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
            Motivo
            <input name="motivo" defaultValue={f.motivo ?? ''} className={clasesCampo} />
          </label>
          <div className="flex flex-col justify-center gap-1.5 text-xs sm:col-span-2">
            {contrato && (
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="aplica_indemnizacion" defaultChecked={f.aplica_indemnizacion} /> Pagar indemnización (despido sin causa justificada o acuerdo)
              </label>
            )}
            <label className="flex items-center gap-1.5">
              <input type="checkbox" name="incluir_salario" defaultChecked={f.incluir_salario} /> Incluir el salario pendiente (si no, lo paga la planilla quincenal)
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Días de salario (vacío = automático)
            <input name="dias_salario_manual" inputMode="decimal" defaultValue={f.dias_salario_manual ?? ''} className={cn(clasesCampo, 'text-right')} />
          </label>
          {contrato && (
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Días de vacaciones (vacío = automático)
              <input name="dias_vacaciones_manual" inputMode="decimal" defaultValue={f.dias_vacaciones_manual ?? ''} className={cn(clasesCampo, 'text-right')} />
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Otros pagos (Q)
            <input name="otros_pagos" inputMode="decimal" defaultValue={Number(f.otros_pagos) || ''} className={cn(clasesCampo, 'text-right')} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Concepto de otros pagos
            <input name="otros_pagos_detalle" defaultValue={f.otros_pagos_detalle ?? ''} className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Otros descuentos (Q)
            <input name="otros_descuentos" inputMode="decimal" defaultValue={Number(f.otros_descuentos) || ''} className={cn(clasesCampo, 'text-right')} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Concepto del descuento
            <input name="otros_descuentos_detalle" defaultValue={f.otros_descuentos_detalle ?? ''} placeholder="Ej. equipo extraviado" className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
            Notas
            <input name="notas" defaultValue={f.notas ?? ''} className={clasesCampo} />
          </label>

          <p className="mt-2 text-sm font-semibold sm:col-span-2 lg:col-span-4">Entrevista de salida</p>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Fecha
            <input name="entrevista_fecha" type="date" defaultValue={f.entrevista_fecha ?? ''} className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Realizada por
            <input name="entrevista_por" defaultValue={f.entrevista_por ?? ''} className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Motivo principal de la salida
            <input name="entrevista_motivo" defaultValue={f.entrevista_motivo ?? ''} placeholder="Salario, ambiente, crecimiento…" className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            ¿Se puede recontratar?
            <select name="recontratable" defaultValue={f.recontratable == null ? '' : String(f.recontratable)} className={clasesCampo}>
              <option value="">Sin definir</option>
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2 lg:col-span-4">
            Comentarios
            <textarea name="entrevista_comentarios" rows={3} defaultValue={f.entrevista_comentarios ?? ''} className={clasesCampo} />
          </label>
          <div className="sm:col-span-2 lg:col-span-4">
            <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Guardar y recalcular
            </button>
          </div>
        </form>
      )}

      {!editable && (f.entrevista_fecha || f.entrevista_comentarios || f.entrevista_motivo) && (
        <section className="rounded-xl border border-border bg-card p-4 text-sm">
          <p className="mb-2 font-semibold">Entrevista de salida</p>
          <p className="text-xs text-muted-foreground">
            {[f.entrevista_fecha && fechaCorta(f.entrevista_fecha), f.entrevista_por && `por ${f.entrevista_por}`, f.entrevista_motivo].filter(Boolean).join(' · ')}
          </p>
          {f.entrevista_comentarios && <p className="mt-2 whitespace-pre-line">{f.entrevista_comentarios}</p>}
        </section>
      )}
    </main>
  )
}
