import { FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { clasesCampo } from '@/lib/contabilidad-general'
import { CATEGORIAS_AUSENCIA, ESTADOS_AUSENCIA, dias, fechaCorta } from '@/lib/rrhh'
import { urlsFirmadas } from '@/lib/rrhh-servidor'
import { adjuntarDocumentoAusencia, ajustarVacaciones, cancelarAusencia, resolverAusencia, solicitarAusencia } from '@/app/(app)/rrhh/acciones'

export type TipoAusencia = {
  id: number
  nombre: string
  categoria: string
  con_goce: boolean
  dias_maximos: number | null
  requiere_documento: boolean
  referencia_legal: string | null
}
export type Ausencia = {
  id: number
  colaborador_id: number
  fecha_inicio: string
  fecha_fin: string
  dias: number
  con_goce: boolean
  motivo: string | null
  estado: string
  documento_url: string | null
  fecha_solicitud: string
  comentario_resolucion: string | null
  fecha_resolucion: string | null
  tipo: { nombre: string; categoria: string; requiere_documento: boolean } | null
  resuelto: { nombre: string } | null
}
type Saldo = {
  disponibles: number
  acumulado: number
  proporcional: number
  gozados: number
  programados: number
  solicitados: number
}
type Periodo = { periodo: number; desde: string | null; hasta: string | null; completo: boolean; ganados: number; gozados: number; pendientes: number }

export const SELECT_AUSENCIA =
  'id, colaborador_id, fecha_inicio, fecha_fin, dias, con_goce, motivo, estado, documento_url, fecha_solicitud, comentario_resolucion, fecha_resolucion, tipo:tipo_ausencia_id ( nombre, categoria, requiere_documento ), resuelto:resuelto_por ( nombre )'

/** Selector de tipo de ausencia agrupado por categoría. */
export function SelectorTipoAusencia({ tipos, className }: { tipos: TipoAusencia[]; className?: string }) {
  return (
    <select name="tipo_ausencia_id" required defaultValue={tipos.find((t) => t.categoria === 'vacaciones')?.id ?? ''} className={className}>
      {Object.entries(CATEGORIAS_AUSENCIA).map(([cat, etiqueta]) => (
        <optgroup key={cat} label={etiqueta}>
          {tipos
            .filter((t) => t.categoria === cat)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
                {t.dias_maximos ? ` (hasta ${dias(t.dias_maximos)} días)` : ''}
                {t.con_goce ? '' : ' · sin goce'}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  )
}

/** Acciones sobre una ausencia: autorizar/rechazar, cancelar y adjuntar respaldo. */
export function AccionesAusencia({
  a,
  volver,
  puedeAutorizar,
  puedeEditar,
}: {
  a: Ausencia
  volver: string
  puedeAutorizar: boolean
  puedeEditar: boolean
}) {
  const mini = cn(clasesCampo, 'py-1 text-xs')
  return (
    <div className="flex flex-wrap items-center gap-2">
      {a.estado === 'solicitada' && puedeAutorizar && (
        <form action={resolverAusencia} className="flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="ausencia_id" value={a.id} />
          <input type="hidden" name="volver" value={volver} />
          <input name="comentario" placeholder="Comentario (obligatorio si rechazas)" className={cn(mini, 'w-56')} />
          <button type="submit" name="decision" value="aprobar" className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
            Aprobar
          </button>
          <button type="submit" name="decision" value="rechazar" className="rounded-lg border border-destructive/40 px-2.5 py-1 text-xs font-semibold text-destructive">
            Rechazar
          </button>
        </form>
      )}
      {(a.estado === 'solicitada' ? puedeEditar || puedeAutorizar : a.estado === 'aprobada' && puedeAutorizar) && (
        <form action={cancelarAusencia}>
          <input type="hidden" name="ausencia_id" value={a.id} />
          <input type="hidden" name="volver" value={volver} />
          <button type="submit" className="text-xs font-semibold text-muted-foreground hover:text-destructive">
            Cancelar
          </button>
        </form>
      )}
      {puedeEditar && !a.documento_url && ['solicitada', 'aprobada'].includes(a.estado) && (
        <form action={adjuntarDocumentoAusencia} encType="multipart/form-data" className="flex items-center gap-1.5">
          <input type="hidden" name="ausencia_id" value={a.id} />
          <input type="hidden" name="colaborador_id" value={a.colaborador_id} />
          <input type="hidden" name="volver" value={volver} />
          <input name="documento" type="file" required accept="application/pdf,image/*" className="w-44 text-[11px]" />
          <button type="submit" className="text-xs font-semibold text-primary hover:underline">
            Adjuntar
          </button>
        </form>
      )}
    </div>
  )
}

export async function PestanaVacaciones({
  colaborador,
  puedeEditar,
  puedeAutorizar,
}: {
  colaborador: { id: number; estado: string; fecha_ingreso: string | null }
  puedeEditar: boolean
  puedeAutorizar: boolean
}) {
  const supabase = await createClient()
  const [{ data: saldoData }, { data: perData }, { data: ausData }, { data: tiposData }, { data: ajData }, { data: conf }] = await Promise.all([
    supabase.rpc('fn_rrhh_saldo_vacaciones', { p_colaborador_id: colaborador.id }),
    supabase.rpc('fn_rrhh_vacaciones_periodos', { p_colaborador_id: colaborador.id }),
    supabase.from('rrhh_ausencias').select(SELECT_AUSENCIA).eq('colaborador_id', colaborador.id).order('fecha_inicio', { ascending: false }),
    supabase.from('rrhh_tipos_ausencia').select('id, nombre, categoria, con_goce, dias_maximos, requiere_documento, referencia_legal').eq('activo', true).order('orden'),
    supabase.from('rrhh_vacaciones_ajustes').select('id, fecha, dias, motivo, registrado:registrado_por ( nombre )').eq('colaborador_id', colaborador.id).order('fecha', { ascending: false }),
    supabase.from('rrhh_config').select('dias_vacaciones, sabado_laboral').eq('id', 1).maybeSingle(),
  ])
  const saldo = (saldoData ?? {}) as Partial<Saldo>
  const periodos = (perData ?? []) as Periodo[]
  const ausencias = (ausData ?? []) as unknown as Ausencia[]
  const tipos = (tiposData ?? []) as TipoAusencia[]
  const ajustes = (ajData ?? []) as unknown as { id: number; fecha: string; dias: number; motivo: string; registrado: { nombre: string } | null }[]
  const urls = await urlsFirmadas(ausencias.map((a) => a.documento_url))
  const volver = `/rrhh/${colaborador.id}?tab=vacaciones`
  const mini = cn(clasesCampo, 'py-1.5 text-xs')

  const tarjetas = [
    { e: 'Disponibles para gozar', v: saldo.disponibles, nota: 'Períodos completos − gozados', destacar: true },
    { e: 'Acumulado a hoy', v: saldo.acumulado, nota: `Incluye ${dias(saldo.proporcional)} proporcionales` },
    { e: 'Gozados', v: saldo.gozados, nota: 'Aprobados ya iniciados' },
    { e: 'Programados', v: saldo.programados, nota: 'Aprobados a futuro' },
    { e: 'Por autorizar', v: saldo.solicitados, nota: 'Solicitudes pendientes' },
  ]

  return (
    <>
      {!colaborador.fecha_ingreso ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          Registra la fecha de ingreso en el expediente para calcular las vacaciones.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {tarjetas.map((t) => (
            <div key={t.e} className={cn('rounded-xl border bg-card px-4 py-3', t.destacar ? 'border-primary/40' : 'border-border')}>
              <p className="text-xs text-muted-foreground">{t.e}</p>
              <p className={cn('text-2xl font-bold tabular-nums', t.destacar && 'text-primary', Number(t.v) < 0 && 'text-destructive')}>{dias(t.v)}</p>
              <p className="text-[11px] text-muted-foreground">{t.nota}</p>
            </div>
          ))}
        </div>
      )}

      {periodos.length > 0 && (
        <section className="overflow-x-auto rounded-xl border border-border bg-card">
          <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">
            Vacaciones por período <span className="font-normal text-muted-foreground">· {dias(conf?.dias_vacaciones ?? 15)} días hábiles por año de servicio</span>
          </p>
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Período</th>
                <th className="px-2 py-2 text-right">Ganados</th>
                <th className="px-2 py-2 text-right">Gozados</th>
                <th className="px-4 py-2 text-right">Pendientes</th>
              </tr>
            </thead>
            <tbody>
              {periodos.map((p) => (
                <tr key={p.periodo} className="border-t border-border/60">
                  <td className="px-4 py-2 text-xs">
                    {p.periodo === 0 ? 'Ajustes a favor' : `${fechaCorta(p.desde)} al ${fechaCorta(p.hasta)}`}
                    {p.periodo > 0 && !p.completo && <span className="ml-1 text-muted-foreground">(en curso, proporcional)</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{dias(p.ganados)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{dias(p.gozados)}</td>
                  <td className={cn('px-4 py-2 text-right font-semibold tabular-nums', Number(p.pendientes) < 0 && 'text-destructive')}>{dias(p.pendientes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {puedeEditar && colaborador.estado !== 'baja' && (
        <form action={solicitarAusencia} encType="multipart/form-data" className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="colaborador_id" value={colaborador.id} />
          <input type="hidden" name="volver" value={volver} />
          <p className="text-sm font-semibold sm:col-span-2 lg:col-span-4">Nueva solicitud de vacaciones, permiso o licencia</p>
          <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
            Tipo
            <SelectorTipoAusencia tipos={tipos} className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Desde
            <input name="fecha_inicio" type="date" required className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Hasta
            <input name="fecha_fin" type="date" className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Días hábiles
            <input name="dias" inputMode="decimal" placeholder="Se calculan solos" className={cn(clasesCampo, 'text-right')} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
            Motivo
            <input name="motivo" className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Respaldo (constancia, certificado…)
            <input name="documento" type="file" accept="application/pdf,image/*" className="text-xs" />
          </label>
          <div className="flex flex-col justify-end gap-1.5 text-xs">
            {puedeAutorizar && (
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="aprobar" /> Aprobar de una vez
              </label>
            )}
            <label className="flex items-center gap-1.5">
              <input type="checkbox" name="anticipar" /> Anticipar vacaciones sin saldo
            </label>
          </div>
          <div className="flex items-center justify-between gap-3 sm:col-span-2 lg:col-span-4">
            <p className="text-xs text-muted-foreground">
              Los días hábiles excluyen domingos y asuetos; el sábado {conf?.sabado_laboral === 'completo' ? 'cuenta completo' : conf?.sabado_laboral === 'medio' ? 'cuenta medio día' : 'no cuenta'}.
              Solo las vacaciones descuentan del saldo.
            </p>
            <button type="submit" className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Registrar
            </button>
          </div>
        </form>
      )}

      <section className="rounded-xl border border-border bg-card">
        <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">Historial de ausencias</p>
        {ausencias.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Sin vacaciones, permisos ni licencias registrados.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {ausencias.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{a.tipo?.nombre}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', ESTADOS_AUSENCIA[a.estado]?.clase)}>{ESTADOS_AUSENCIA[a.estado]?.etiqueta}</span>
                    {!a.con_goce && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Sin goce</span>}
                  </span>
                  <span className="text-xs tabular-nums">
                    {fechaCorta(a.fecha_inicio)}
                    {a.fecha_fin !== a.fecha_inicio ? ` al ${fechaCorta(a.fecha_fin)}` : ''} · <span className="font-semibold">{dias(a.dias)} días</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {[a.motivo, a.resuelto && `${a.estado === 'aprobada' ? 'Aprobó' : a.estado === 'rechazada' ? 'Rechazó' : 'Canceló'} ${a.resuelto.nombre}`, a.comentario_resolucion]
                      .filter(Boolean)
                      .join(' · ')}
                    {a.documento_url && (
                      <a href={urls.get(a.documento_url)} target="_blank" className="ml-2 inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                        <FileText className="h-3.5 w-3.5" /> Respaldo
                      </a>
                    )}
                    {!a.documento_url && a.tipo?.requiere_documento && a.estado !== 'cancelada' && <span className="ml-2 text-amber-600">Falta el respaldo</span>}
                  </span>
                  <AccionesAusencia a={a} volver={volver} puedeAutorizar={puedeAutorizar} puedeEditar={puedeEditar} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(puedeAutorizar || ajustes.length > 0) && (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Ajustes al saldo de vacaciones</p>
          <p className="text-xs text-muted-foreground">
            Para cargar el saldo de quien ya trabajaba antes del sistema (resta los días que ya gozó) o para dar días adicionales.
          </p>
          {ajustes.length > 0 && (
            <ul className="divide-y divide-border/60 text-sm">
              {ajustes.map((j) => (
                <li key={j.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                  <span>
                    {fechaCorta(j.fecha)} · {j.motivo}
                    {j.registrado && <span className="text-xs text-muted-foreground"> · {j.registrado.nombre}</span>}
                  </span>
                  <span className={cn('font-semibold tabular-nums', Number(j.dias) < 0 ? 'text-destructive' : 'text-primary')}>
                    {Number(j.dias) > 0 ? '+' : ''}
                    {dias(j.dias)} días
                  </span>
                </li>
              ))}
            </ul>
          )}
          {puedeAutorizar && (
            <form action={ajustarVacaciones} className="grid grid-cols-2 gap-2 border-t border-border pt-3 md:grid-cols-6">
              <input type="hidden" name="colaborador_id" value={colaborador.id} />
              <select name="sentido" defaultValue="restar" className={mini}>
                <option value="restar">Restar días (ya gozados)</option>
                <option value="sumar">Sumar días</option>
              </select>
              <input name="dias" inputMode="decimal" required placeholder="Días" className={cn(mini, 'text-right')} />
              <input name="fecha" type="date" className={mini} />
              <input name="motivo" required placeholder="Motivo del ajuste" className={cn(mini, 'md:col-span-2')} />
              <button type="submit" className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                Ajustar saldo
              </button>
            </form>
          )}
        </section>
      )}
    </>
  )
}
