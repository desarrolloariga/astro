import { redirect } from 'next/navigation'
import { Network } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { clasesCampo } from '@/lib/contabilidad-general'
import { Encabezado, EnlaceVolver, Mensajes } from '@/components/contabilidad/comunes'
import { BotonConfirmar } from '@/components/app/boton-confirmar'
import { SABADO_LABORAL, fechaCorta } from '@/lib/rrhh'
import { eliminarFeriado, guardarCatalogo, guardarConfigRrhh, guardarFeriado } from '../acciones'

export const metadata = { title: 'Departamentos y puestos — ASTRO' }

type Dep = { id: number; nombre: string; activo: boolean }
type Area = { id: number; nombre: string; departamento_id: number; activo: boolean }
type Puesto = { id: number; nombre: string; area_id: number | null; descriptor: string | null; salario_minimo: number | null; salario_maximo: number | null; activo: boolean }

export default async function CatalogosRrhhPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const anio = new Date().getFullYear()
  const [puede, { data: d }, { data: a }, { data: p }, { data: conf }, { data: fer }] = await Promise.all([
    tienePermiso('rrhh', 'editar'),
    supabase.from('rrhh_departamentos').select('*').order('nombre'),
    supabase.from('rrhh_areas').select('*').order('nombre'),
    supabase.from('rrhh_puestos').select('*').order('nombre'),
    supabase.from('rrhh_config').select('*').eq('id', 1).maybeSingle(),
    supabase.from('rrhh_feriados').select('id, fecha, nombre, medio_dia').gte('fecha', `${anio}-01-01`).order('fecha'),
  ])
  if (!puede) redirect('/rrhh')
  const deps = (d ?? []) as Dep[]
  const areas = (a ?? []) as Area[]
  const puestos = (p ?? []) as Puesto[]
  const nombreDep = (id: number) => deps.find((x) => x.id === id)?.nombre ?? ''
  const mini = cn(clasesCampo, 'py-1.5 text-xs')

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado icono={Network} titulo="Configuración de RRHH" descripcion="Estructura organizacional (departamentos, áreas y puestos con su descriptor), vacaciones y asuetos.">
        <EnlaceVolver href="/rrhh">← Colaboradores</EnlaceVolver>
      </Encabezado>
      <Mensajes ok={sp.ok} error={sp.error} />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Departamentos</p>
          {deps.map((x) => (
            <form key={x.id} action={guardarCatalogo} className="flex gap-2">
              <input type="hidden" name="tabla" value="rrhh_departamentos" />
              <input type="hidden" name="id" value={x.id} />
              <input name="nombre" defaultValue={x.nombre} className={mini} />
              <select name="activo" defaultValue={x.activo ? 'si' : 'no'} className={cn(mini, 'w-28')}>
                <option value="si">Activo</option>
                <option value="no">Inactivo</option>
              </select>
              <button type="submit" className="rounded-lg border border-border px-2 text-xs font-semibold hover:bg-muted">Guardar</button>
            </form>
          ))}
          <form action={guardarCatalogo} className="flex gap-2 border-t border-border pt-2">
            <input type="hidden" name="tabla" value="rrhh_departamentos" />
            <input name="nombre" required placeholder="Nuevo departamento" className={mini} />
            <button type="submit" className="rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">Agregar</button>
          </form>
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Áreas</p>
          {areas.map((x) => (
            <form key={x.id} action={guardarCatalogo} className="flex gap-2">
              <input type="hidden" name="tabla" value="rrhh_areas" />
              <input type="hidden" name="id" value={x.id} />
              <select name="departamento_id" defaultValue={x.departamento_id} className={cn(mini, 'w-40')}>
                {deps.map((dd) => (
                  <option key={dd.id} value={dd.id}>
                    {dd.nombre}
                  </option>
                ))}
              </select>
              <input name="nombre" defaultValue={x.nombre} className={mini} />
              <select name="activo" defaultValue={x.activo ? 'si' : 'no'} className={cn(mini, 'w-24')}>
                <option value="si">Activa</option>
                <option value="no">Inactiva</option>
              </select>
              <button type="submit" className="rounded-lg border border-border px-2 text-xs font-semibold hover:bg-muted">Guardar</button>
            </form>
          ))}
          <form action={guardarCatalogo} className="flex gap-2 border-t border-border pt-2">
            <input type="hidden" name="tabla" value="rrhh_areas" />
            <select name="departamento_id" required defaultValue="" className={cn(mini, 'w-40')}>
              <option value="" disabled>Departamento…</option>
              {deps.filter((dd) => dd.activo).map((dd) => (
                <option key={dd.id} value={dd.id}>
                  {dd.nombre}
                </option>
              ))}
            </select>
            <input name="nombre" required placeholder="Nueva área" className={mini} />
            <button type="submit" className="rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">Agregar</button>
          </form>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <form action={guardarConfigRrhh} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Vacaciones, días hábiles y planilla</p>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Días de vacaciones por año de servicio
            <input name="dias_vacaciones" inputMode="decimal" defaultValue={conf?.dias_vacaciones ?? 15} className={cn(clasesCampo, 'w-32 text-right')} />
            <span className="font-normal text-muted-foreground">Mínimo de ley: 15 días hábiles (Código de Trabajo, art. 130).</span>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            El sábado
            <select name="sabado_laboral" defaultValue={conf?.sabado_laboral ?? 'no'} className={cn(clasesCampo, 'w-48')}>
              {Object.entries(SABADO_LABORAL).map(([v, e]) => (
                <option key={v} value={v}>
                  {e}
                </option>
              ))}
            </select>
            <span className="font-normal text-muted-foreground">Define cuánto cuenta el sábado al calcular días de vacaciones y permisos.</span>
          </label>
          <p className="mt-1 text-sm font-semibold">Planilla: porcentajes de ley y provisiones</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ['igss_laboral_pct', 'IGSS laboral %'],
                ['igss_patronal_pct', 'IGSS patronal %'],
                ['isr_deduccion_personal', 'Deducción ISR (Q)'],
                ['isr_retencion_servicios_pct', 'Retención ISR servicios %'],
                ['prov_aguinaldo_pct', 'Aguinaldo %'],
                ['prov_bono14_pct', 'Bono 14 %'],
                ['prov_vacaciones_pct', 'Vacaciones %'],
                ['prov_indemnizacion_pct', 'Indemnización %'],
              ] as const
            ).map(([k, e]) => (
              <label key={k} className="flex flex-col gap-1 text-[11px] font-semibold">
                {e}
                <input name={k} inputMode="decimal" defaultValue={conf?.[k] ?? ''} className={cn(mini, 'text-right')} />
              </label>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground">
            Patronal 12.67 % = IGSS 10.67 % + INTECAP 1 % + IRTRA 1 %. Los cambios aplican a las planillas que se calculen o recalculen después.
          </span>
          <button type="submit" className="self-start rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            Guardar
          </button>
        </form>

        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Asuetos desde {anio}</p>
          <p className="text-xs text-muted-foreground">No cuentan como días hábiles. Revisa cada año los traslados que decrete el Congreso y los asuetos locales.</p>
          <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto text-sm">
            {((fer ?? []) as { id: number; fecha: string; nombre: string; medio_dia: boolean }[]).map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-1.5">
                <span>
                  <span className="tabular-nums text-muted-foreground">{fechaCorta(f.fecha)}</span> · {f.nombre}
                  {f.medio_dia && <span className="text-xs text-muted-foreground"> (medio día)</span>}
                </span>
                <form action={eliminarFeriado}>
                  <input type="hidden" name="id" value={f.id} />
                  <BotonConfirmar mensaje={`¿Quitar el asueto "${f.nombre}"?`} className="text-xs text-muted-foreground hover:text-destructive">
                    Quitar
                  </BotonConfirmar>
                </form>
              </li>
            ))}
          </ul>
          <form action={guardarFeriado} className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
            <input name="fecha" type="date" required className={cn(mini, 'w-36')} />
            <input name="nombre" required placeholder="Nombre del asueto" className={cn(mini, 'flex-1')} />
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" name="medio_dia" /> Medio día
            </label>
            <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Agregar</button>
          </form>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Puestos</p>
        {[...puestos, null].map((x) => (
          <form key={x?.id ?? 'nuevo'} action={guardarCatalogo} className={cn('grid grid-cols-2 gap-2 md:grid-cols-6', !x && 'border-t border-border pt-3')}>
            <input type="hidden" name="tabla" value="rrhh_puestos" />
            {x && <input type="hidden" name="id" value={x.id} />}
            <input name="nombre" required defaultValue={x?.nombre ?? ''} placeholder="Nuevo puesto" className={cn(mini, 'md:col-span-2')} />
            <select name="area_id" defaultValue={x?.area_id ?? ''} className={mini}>
              <option value="">Área…</option>
              {areas.map((ar) => (
                <option key={ar.id} value={ar.id}>
                  {nombreDep(ar.departamento_id)} · {ar.nombre}
                </option>
              ))}
            </select>
            <input name="salario_minimo" inputMode="decimal" defaultValue={x?.salario_minimo ?? ''} placeholder="Salario mínimo" className={mini} />
            <input name="salario_maximo" inputMode="decimal" defaultValue={x?.salario_maximo ?? ''} placeholder="Salario máximo" className={mini} />
            <div className="flex gap-2">
              {x && (
                <select name="activo" defaultValue={x.activo ? 'si' : 'no'} className={mini}>
                  <option value="si">Activo</option>
                  <option value="no">Inactivo</option>
                </select>
              )}
              <button type="submit" className={cn('rounded-lg px-3 text-xs font-semibold', x ? 'border border-border hover:bg-muted' : 'bg-primary text-primary-foreground')}>
                {x ? 'Guardar' : 'Agregar'}
              </button>
            </div>
            <textarea name="descriptor" rows={x?.descriptor ? 3 : 1} defaultValue={x?.descriptor ?? ''} placeholder="Descriptor del puesto: objetivo, funciones, requisitos…" className={cn(mini, 'col-span-2 md:col-span-6')} />
          </form>
        ))}
      </section>
    </main>
  )
}
