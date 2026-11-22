import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { hoyGuatemala } from '@/lib/contabilidad'
import { clasesCampo } from '@/lib/contabilidad-general'
import { ESTADOS_AUSENCIA, dias, fechaCorta } from '@/lib/rrhh'
import { Encabezado, EnlaceVolver, Mensajes } from '@/components/contabilidad/comunes'
import { AccionesAusencia, SELECT_AUSENCIA, SelectorTipoAusencia, type Ausencia, type TipoAusencia } from '@/components/rrhh/pestana-vacaciones'
import { solicitarAusencia } from '../acciones'

export const metadata = { title: 'Vacaciones y permisos — ASTRO' }

type Fila = Ausencia & { colaborador: { id: number; codigo: string; nombres: string; apellidos: string } | null }

const sumarDias = (f: string, n: number) => {
  const d = new Date(`${f}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export default async function AusenciasPage({ searchParams }: { searchParams: Promise<{ mes?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams
  const hoy = hoyGuatemala()
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? '') ? (sp.mes as string) : hoy.slice(0, 7)
  const inicioMes = `${mes}-01`
  const finMes = sumarDias(sumarDias(inicioMes, 32).slice(0, 7) + '-01', -1)
  const en14 = sumarDias(hoy, 14)
  const sel = `${SELECT_AUSENCIA}, colaborador:colaborador_id ( id, codigo, nombres, apellidos )`
  const supabase = await createClient()
  const [puedeVer, puedeEditar, puedeAutorizar, { data: pend }, { data: prox }, { data: delMes }, { data: tiposData }, { data: colabs }] = await Promise.all([
    tienePermiso('rrhh', 'ver'),
    tienePermiso('rrhh', 'editar'),
    tienePermiso('rrhh', 'autorizar'),
    supabase.from('rrhh_ausencias').select(sel).eq('estado', 'solicitada').order('fecha_inicio'),
    supabase.from('rrhh_ausencias').select(sel).eq('estado', 'aprobada').lte('fecha_inicio', en14).gte('fecha_fin', hoy).order('fecha_inicio'),
    supabase.from('rrhh_ausencias').select(sel).lte('fecha_inicio', finMes).gte('fecha_fin', inicioMes).order('fecha_inicio'),
    supabase.from('rrhh_tipos_ausencia').select('id, nombre, categoria, con_goce, dias_maximos, requiere_documento, referencia_legal').eq('activo', true).order('orden'),
    supabase.from('colaboradores').select('id, codigo, nombres, apellidos').neq('estado', 'baja').order('apellidos'),
  ])
  if (!puedeVer) redirect('/inicio')
  const pendientes = (pend ?? []) as unknown as Fila[]
  const proximas = (prox ?? []) as unknown as Fila[]
  const mesLista = (delMes ?? []) as unknown as Fila[]
  const tipos = (tiposData ?? []) as TipoAusencia[]
  const hoyAusentes = proximas.filter((a) => a.fecha_inicio <= hoy && a.fecha_fin >= hoy)
  const volver = `/rrhh/ausencias${sp.mes ? `?mes=${mes}` : ''}`
  const [anio, m] = mes.split('-').map(Number)
  const nombreMes = new Date(Date.UTC(anio, m - 1, 15)).toLocaleDateString('es-GT', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const mesAnterior = sumarDias(inicioMes, -1).slice(0, 7)
  const mesSiguiente = sumarDias(finMes, 1).slice(0, 7)

  const kpis = [
    { e: 'Por autorizar', v: pendientes.length },
    { e: 'Ausentes hoy', v: hoyAusentes.length },
    { e: 'Ausencias en 14 días', v: proximas.length },
    { e: `Días sin goce en ${nombreMes}`, v: dias(mesLista.filter((a) => a.estado === 'aprobada' && !a.con_goce).reduce((s, a) => s + Number(a.dias), 0)) },
  ]

  const Persona = ({ a }: { a: Fila }) =>
    a.colaborador ? (
      <Link href={`/rrhh/${a.colaborador.id}?tab=vacaciones`} className="font-semibold hover:underline">
        {a.colaborador.nombres} {a.colaborador.apellidos}
      </Link>
    ) : null

  const Renglon = ({ a, acciones = true }: { a: Fila; acciones?: boolean }) => (
    <li className="flex flex-col gap-1.5 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <Persona a={a} />
          <span className="text-muted-foreground">· {a.tipo?.nombre}</span>
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
          {[a.motivo, a.comentario_resolucion].filter(Boolean).join(' · ')}
          {!a.documento_url && a.tipo?.requiere_documento && a.estado !== 'cancelada' && <span className="ml-2 text-amber-600">Falta el respaldo</span>}
        </span>
        {acciones && <AccionesAusencia a={a} volver={volver} puedeAutorizar={puedeAutorizar} puedeEditar={puedeEditar} />}
      </div>
    </li>
  )

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado icono={CalendarDays} titulo="Vacaciones y permisos" descripcion="Solicitudes por autorizar, quién está ausente y el historial del mes. El saldo de cada persona está en su expediente.">
        <EnlaceVolver href="/rrhh">← Colaboradores</EnlaceVolver>
      </Encabezado>
      <Mensajes ok={sp.ok} error={sp.error} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.e} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground first-letter:uppercase">{k.e}</p>
            <p className="text-2xl font-bold tabular-nums">{k.v}</p>
          </div>
        ))}
      </div>

      {puedeEditar && (
        <form action={solicitarAusencia} encType="multipart/form-data" className="grid grid-cols-1 gap-2 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6">
          <input type="hidden" name="volver" value={volver} />
          <p className="text-sm font-semibold sm:col-span-2 lg:col-span-6">Registrar ausencia</p>
          <select name="colaborador_id" required defaultValue="" className={cn(clasesCampo, 'py-1.5 text-xs lg:col-span-2')}>
            <option value="" disabled>
              Colaborador…
            </option>
            {((colabs ?? []) as { id: number; codigo: string; nombres: string; apellidos: string }[]).map((c) => (
              <option key={c.id} value={c.id}>
                {c.apellidos}, {c.nombres} · {c.codigo}
              </option>
            ))}
          </select>
          <SelectorTipoAusencia tipos={tipos} className={cn(clasesCampo, 'py-1.5 text-xs lg:col-span-2')} />
          <input name="fecha_inicio" type="date" required aria-label="Desde" className={cn(clasesCampo, 'py-1.5 text-xs')} />
          <input name="fecha_fin" type="date" aria-label="Hasta" className={cn(clasesCampo, 'py-1.5 text-xs')} />
          <input name="dias" inputMode="decimal" placeholder="Días (se calculan solos)" className={cn(clasesCampo, 'py-1.5 text-xs')} />
          <input name="motivo" placeholder="Motivo" className={cn(clasesCampo, 'py-1.5 text-xs lg:col-span-2')} />
          <input name="documento" type="file" accept="application/pdf,image/*" className="self-center text-xs" />
          <span className="flex flex-col gap-1 text-xs">
            {puedeAutorizar && (
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="aprobar" /> Aprobar de una vez
              </label>
            )}
            <label className="flex items-center gap-1.5">
              <input type="checkbox" name="anticipar" /> Anticipar sin saldo
            </label>
          </span>
          <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            Registrar
          </button>
        </form>
      )}

      <section className="rounded-xl border border-border bg-card">
        <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">Por autorizar ({pendientes.length})</p>
        {pendientes.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">No hay solicitudes pendientes.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {pendientes.map((a) => (
              <Renglon key={a.id} a={a} />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card">
        <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">Ausentes hoy y en los próximos 14 días</p>
        {proximas.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Nadie tiene ausencias aprobadas en ese plazo.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {proximas.map((a) => (
              <Renglon key={a.id} a={a} acciones={false} />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <p className="text-sm font-semibold first-letter:uppercase">Historial de {nombreMes}</p>
          <span className="flex items-center gap-3 text-xs font-semibold">
            <Link href={`/rrhh/ausencias?mes=${mesAnterior}`} className="text-primary hover:underline">
              ← Anterior
            </Link>
            {mes !== hoy.slice(0, 7) && (
              <Link href="/rrhh/ausencias" className="text-primary hover:underline">
                Este mes
              </Link>
            )}
            <Link href={`/rrhh/ausencias?mes=${mesSiguiente}`} className="text-primary hover:underline">
              Siguiente →
            </Link>
          </span>
        </div>
        {mesLista.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Sin ausencias en el mes.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {mesLista.map((a) => (
              <Renglon key={a.id} a={a} acciones={false} />
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
