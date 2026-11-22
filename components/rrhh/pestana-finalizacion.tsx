import Link from 'next/link'
import { FileText, UserMinus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { hoyGuatemala } from '@/lib/contabilidad'
import { clasesCampo, montoContable } from '@/lib/contabilidad-general'
import { ESTADOS_FINALIZACION, TIPOS_FINALIZACION, fechaCorta } from '@/lib/rrhh'
import { crearFinalizacion } from '@/app/(app)/rrhh/finalizaciones/acciones'

export async function PestanaFinalizacion({
  colaborador,
  puedeFinalizar,
  puedeVerLiquidacion,
}: {
  colaborador: { id: number; estado: string; fecha_ingreso: string | null; tipo_planilla: string }
  puedeFinalizar: boolean
  puedeVerLiquidacion: boolean
}) {
  const supabase = await createClient()
  const [{ data }, { count: equipo }] = await Promise.all([
    puedeVerLiquidacion || puedeFinalizar
      ? supabase
          .from('rrhh_finalizaciones')
          .select('id, estado, tipo, fecha_salida, liquido, motivo, motivo_anulacion')
          .eq('colaborador_id', colaborador.id)
          .order('fecha_creacion', { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from('colaborador_asignaciones').select('id', { count: 'exact', head: true }).eq('colaborador_id', colaborador.id).eq('estado', 'asignado'),
  ])
  const lista = (data ?? []) as { id: number; estado: string; tipo: string; fecha_salida: string; liquido: number; motivo: string | null; motivo_anulacion: string | null }[]
  const vigente = lista.find((f) => f.estado !== 'anulada')

  return (
    <>
      <div className="flex flex-wrap items-center gap-4 text-sm font-semibold">
        <Link href={`/rrhh/${colaborador.id}/constancia`} className="inline-flex items-center gap-1 text-primary hover:underline">
          <FileText className="h-4 w-4" /> Constancia laboral
        </Link>
        <Link href={`/rrhh/${colaborador.id}?tab=documentos`} className="text-primary hover:underline">
          Documentos de finalización
        </Link>
      </div>

      {vigente ? (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold">
              {TIPOS_FINALIZACION[vigente.tipo]} · salida {fechaCorta(vigente.fecha_salida)}
            </p>
            {vigente.motivo && <p className="text-xs text-muted-foreground">{vigente.motivo}</p>}
            <span className={cn('self-start rounded-full px-2 py-0.5 text-xs font-semibold', ESTADOS_FINALIZACION[vigente.estado]?.clase)}>
              {ESTADOS_FINALIZACION[vigente.estado]?.etiqueta}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-right">
              <span className="block text-xs text-muted-foreground">Líquido</span>
              <span className="text-xl font-bold tabular-nums">Q{montoContable(vigente.liquido)}</span>
            </span>
            <Link href={`/rrhh/finalizaciones/${vigente.id}`} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Ver liquidación
            </Link>
          </div>
        </section>
      ) : colaborador.estado === 'baja' ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          El colaborador está de baja sin liquidación registrada en el sistema.
        </p>
      ) : puedeFinalizar ? (
        <form action={crearFinalizacion} className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="colaborador_id" value={colaborador.id} />
          <p className="flex items-center gap-2 text-sm font-semibold sm:col-span-2 lg:col-span-4">
            <UserMinus className="h-4 w-4 text-primary" /> Finalizar la relación laboral
          </p>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Tipo de salida
            <select name="tipo" defaultValue="renuncia" className={clasesCampo}>
              {Object.entries(TIPOS_FINALIZACION).map(([v, e]) => (
                <option key={v} value={v}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Fecha de salida (último día laborado)
            <input name="fecha_salida" type="date" required defaultValue={hoyGuatemala()} min={colaborador.fecha_ingreso ?? undefined} className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
            Motivo
            <input name="motivo" className={clasesCampo} />
          </label>
          <div className="flex items-center justify-between gap-3 sm:col-span-2 lg:col-span-4">
            <p className="text-xs text-muted-foreground">
              Se calcula la liquidación en borrador
              {colaborador.tipo_planilla === 'contrato' ? ' (salario pendiente, vacaciones, aguinaldo y bono 14 proporcionales e indemnización si aplica)' : ' (honorarios pendientes)'}.
              El colaborador queda de baja cuando se aprueba.
              {equipo ? ` Tiene ${equipo} artículo(s) de uniforme o equipo por devolver.` : ''}
            </p>
            <button type="submit" className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Calcular liquidación
            </button>
          </div>
        </form>
      ) : (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">No hay una finalización registrada.</p>
      )}

      {lista.filter((f) => f.estado === 'anulada').length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4 text-sm">
          <p className="mb-2 font-semibold">Finalizaciones anuladas</p>
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {lista
              .filter((f) => f.estado === 'anulada')
              .map((f) => (
                <li key={f.id}>
                  <Link href={`/rrhh/finalizaciones/${f.id}`} className="hover:underline">
                    {TIPOS_FINALIZACION[f.tipo]} · {fechaCorta(f.fecha_salida)}
                  </Link>
                  {f.motivo_anulacion ? ` · ${f.motivo_anulacion}` : ''}
                </li>
              ))}
          </ul>
        </section>
      )}
    </>
  )
}
