import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { CheckCircle2, Circle, FileText, Lock, Pencil, Upload, UserRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { hoyGuatemala } from '@/lib/contabilidad'
import { clasesCampo, montoContable } from '@/lib/contabilidad-general'
import {
  BANCOS_GT,
  ESTADOS_CIVILES,
  ESTADOS_COLABORADOR,
  ETAPAS_DOCUMENTO,
  FORMAS_PAGO,
  GENEROS,
  JORNADAS,
  LICENCIAS,
  MODALIDADES,
  TIPOS_CONTRATO,
  TIPOS_DEDUCCION,
  TIPOS_PLANILLA,
  TIPOS_SALARIO,
  antiguedad,
  dias,
  edad,
  fechaCorta,
  periodoPlanilla,
  type Colaborador,
} from '@/lib/rrhh'
import { urlsFirmadas } from '@/lib/rrhh-servidor'
import { BotonConfirmar } from '@/components/app/boton-confirmar'
import { EnlaceVolver, Mensajes } from '@/components/contabilidad/comunes'
import { PestanaEquipo } from '@/components/rrhh/pestana-equipo'
import { PestanaFinalizacion } from '@/components/rrhh/pestana-finalizacion'
import { PestanaMovimientos } from '@/components/rrhh/pestana-movimientos'
import { PestanaVacaciones } from '@/components/rrhh/pestana-vacaciones'
import { eliminarDocumento, guardarDeduccion, guardarSalario, subirDocumento } from '../acciones'

export const metadata = { title: 'Expediente del colaborador — ASTRO' }

type Ficha = Colaborador & {
  departamento: { nombre: string } | null
  area: { nombre: string } | null
  puesto: { nombre: string; descriptor: string | null } | null
  jefe: { id: number; nombres: string; apellidos: string } | null
  sucursal: { nombre: string } | null
  centro: { codigo: string; nombre: string } | null
  usuario: { nombre: string; correo: string } | null
}
type Salario = {
  salario_base: number
  tipo_salario: string
  bonificacion_incentiva: number
  otras_bonificaciones: number
  otras_bonificaciones_detalle: string | null
  comisiones: boolean
  horas_extra: boolean
  forma_pago: string
  banco: string | null
  tipo_cuenta: string | null
  numero_cuenta: string | null
  aplica_igss: boolean
  aplica_isr: boolean
}
type TipoDoc = { id: number; etapa: string; nombre: string; obligatorio: boolean; orden: number }
type Documento = {
  id: number
  tipo_documento_id: number | null
  etapa: string
  nombre: string
  archivo_url: string
  fecha_documento: string | null
  fecha_vencimiento: string | null
  notas: string | null
  fecha_creacion: string
}

const PESTANAS = [
  { v: 'expediente', e: 'Expediente' },
  { v: 'salario', e: 'Información salarial' },
  { v: 'movimientos', e: 'Movimientos' },
  { v: 'vacaciones', e: 'Vacaciones y permisos' },
  { v: 'equipo', e: 'Uniformes y equipo' },
  { v: 'documentos', e: 'Documentos' },
  { v: 'finalizacion', e: 'Finalización' },
]

function Dato({ e, v }: { e: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{e}</dt>
      <dd className="text-sm text-foreground">{v || '—'}</dd>
    </div>
  )
}

export default async function ExpedientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; ok?: string; error?: string }>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const colaboradorId = Number(id)
  if (!Number.isInteger(colaboradorId) || colaboradorId <= 0) notFound()
  const supabase = await createClient()
  const [puedeVer, puedeEditar, puedeSalarios, puedeAutorizar, puedeFinalizar, puedeVerPlanilla, { data }, { data: tiposData }, { data: docsData }] = await Promise.all([
    tienePermiso('rrhh', 'ver'),
    tienePermiso('rrhh', 'editar'),
    tienePermiso('rrhh', 'salarios'),
    tienePermiso('rrhh', 'autorizar'),
    tienePermiso('rrhh', 'finalizar'),
    tienePermiso('planilla', 'ver'),
    supabase
      .from('colaboradores')
      .select(
        `*, departamento:departamento_id ( nombre ), area:area_id ( nombre ), puesto:puesto_id ( nombre, descriptor ),
         jefe:jefe_id ( id, nombres, apellidos ), sucursal:tienda_id ( nombre ), centro:centro_costo_id ( codigo, nombre ),
         usuario:usuario_id ( nombre, correo )`,
      )
      .eq('id', colaboradorId)
      .maybeSingle(),
    supabase.from('rrhh_tipos_documento').select('id, etapa, nombre, obligatorio, orden').eq('activo', true).order('orden'),
    supabase.from('colaborador_documentos').select('*').eq('colaborador_id', colaboradorId).order('fecha_creacion', { ascending: false }),
  ])
  if (!puedeVer && !data) redirect('/inicio')
  if (!data) notFound()
  const c = data as unknown as Ficha
  const tab = PESTANAS.some((p) => p.v === sp.tab) && (sp.tab !== 'salario' || puedeSalarios) ? (sp.tab as string) : 'expediente'

  const [salarioRes, historialRes, deduccionesRes, nominasRes] =
    puedeSalarios && tab === 'salario'
      ? await Promise.all([
          supabase.from('colaborador_salarios').select('*').eq('colaborador_id', colaboradorId).maybeSingle(),
          supabase.from('colaborador_salario_historial').select('*').eq('colaborador_id', colaboradorId).order('fecha_efectiva', { ascending: false }),
          supabase.from('colaborador_deducciones').select('*').eq('colaborador_id', colaboradorId).order('fecha_creacion', { ascending: false }),
          supabase
            .from('planilla_lineas')
            .select('id, dias_laborados, valor_horas_extra, comisiones, total_devengado, igss_laboral, isr, total_descuentos, liquido, planilla:planilla_id!inner ( id, codigo, tipo, anio, mes, quincena, estado )')
            .eq('colaborador_id', colaboradorId)
            .in('planilla.estado', ['aprobada', 'pagada'])
            .order('id', { ascending: false })
            .limit(48),
        ])
      : [{ data: null }, { data: [] }, { data: [] }, { data: [] }]
  const nominas = (nominasRes.data ?? []) as unknown as {
    id: number
    dias_laborados: number
    valor_horas_extra: number
    comisiones: number
    total_devengado: number
    igss_laboral: number
    isr: number
    total_descuentos: number
    liquido: number
    planilla: { id: number; codigo: string; tipo: string; anio: number; mes: number; quincena: number; estado: string }
  }[]
  const salario = salarioRes.data as Salario | null
  const historial = (historialRes.data ?? []) as {
    id: number
    fecha_efectiva: string
    tipo: string
    salario_anterior: number | null
    salario_nuevo: number
    motivo: string | null
    autorizado_por: string | null
  }[]
  const deducciones = (deduccionesRes.data ?? []) as {
    id: number
    tipo: string
    descripcion: string
    monto_total: number | null
    cuota: number
    saldo: number | null
    fecha_inicio: string
    activa: boolean
  }[]
  const tipos = (tiposData ?? []) as TipoDoc[]
  const documentos = (docsData ?? []) as Documento[]
  const urls = await urlsFirmadas([c.foto_url, ...(tab === 'documentos' ? documentos.map((d) => d.archivo_url) : [])])
  const foto = c.foto_url ? urls.get(c.foto_url) : undefined
  const anios = edad(c.fecha_nacimiento)
  const obligatorios = tipos.filter((t) => t.obligatorio && t.etapa !== 'finalizacion')
  const completos = obligatorios.filter((t) => documentos.some((d) => d.tipo_documento_id === t.id)).length

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <EnlaceVolver href="/rrhh">← Colaboradores</EnlaceVolver>
        <span className="flex flex-wrap items-center gap-3">
          <Link href={`/rrhh/${c.id}/constancia`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            <FileText className="h-4 w-4" /> Constancia laboral
          </Link>
          {puedeEditar && (
            <Link href={`/rrhh/${c.id}/editar`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
              <Pencil className="h-4 w-4" /> Editar expediente
            </Link>
          )}
        </span>
      </div>

      <section className="flex flex-wrap items-center gap-5 rounded-xl border border-border bg-card p-5">
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt={`Fotografía de ${c.nombres}`} className="h-24 w-24 rounded-2xl object-cover" />
        ) : (
          <span className="flex h-24 w-24 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <UserRound className="h-10 w-10" />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-mono text-xs text-muted-foreground">{c.codigo}</p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {c.nombres} {c.apellidos}
          </h1>
          <p className="text-sm text-muted-foreground">
            {[c.puesto?.nombre, c.departamento?.nombre, c.sucursal?.nombre].filter(Boolean).join(' · ') || 'Sin puesto asignado'}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className={cn('rounded-full px-2 py-0.5 font-semibold', ESTADOS_COLABORADOR[c.estado]?.clase)}>{ESTADOS_COLABORADOR[c.estado]?.etiqueta}</span>
            {c.fecha_ingreso && <span className="text-muted-foreground">Ingreso {fechaCorta(c.fecha_ingreso)} · {antiguedad(c.fecha_ingreso, c.fecha_baja)}</span>}
            {anios != null && <span className="text-muted-foreground">· {anios} años</span>}
            <span className="text-muted-foreground">· {TIPOS_PLANILLA[c.tipo_planilla]}</span>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>
            Documentos obligatorios: <span className="font-semibold text-foreground">{completos} de {obligatorios.length}</span>
          </p>
          {c.usuario && <p>Usuario del sistema: {c.usuario.nombre}</p>}
        </div>
      </section>

      <nav className="flex gap-1 overflow-x-auto border-b border-border">
        {PESTANAS.filter((p) => p.v !== 'salario' || puedeSalarios).map((p) => (
          <Link
            key={p.v}
            href={`/rrhh/${c.id}?tab=${p.v}`}
            className={cn(
              '-mb-px flex items-center gap-1 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold',
              tab === p.v ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {p.v === 'salario' && <Lock className="h-3.5 w-3.5" />}
            {p.e}
          </Link>
        ))}
      </nav>
      <Mensajes ok={sp.ok} error={sp.error} />

      {tab === 'expediente' && (
        <>
          <section className="rounded-xl border border-border bg-card p-4">
            <p className="mb-3 text-sm font-semibold">Datos personales</p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
              <Dato e="DPI" v={c.dpi && <span className="font-mono">{c.dpi}</span>} />
              <Dato e="Emisión" v={c.dpi_lugar_emision} />
              <Dato e="NIT" v={c.nit && <span className="font-mono">{c.nit}</span>} />
              <Dato e="Fecha de nacimiento" v={c.fecha_nacimiento ? `${fechaCorta(c.fecha_nacimiento)} (${anios} años)` : null} />
              <Dato e="Género" v={c.genero ? GENEROS[c.genero] : null} />
              <Dato e="Estado civil" v={c.estado_civil ? ESTADOS_CIVILES[c.estado_civil] : null} />
              <Dato e="Hijos" v={c.hijos != null ? String(c.hijos) : null} />
              <Dato e="Nacionalidad" v={c.nacionalidad} />
              <Dato e="Dirección" v={c.direccion} />
              <Dato e="Departamento y municipio" v={[c.municipio, c.departamento_geo].filter(Boolean).join(', ')} />
              <Dato e="Teléfono" v={c.telefono} />
              <Dato e="Correo personal" v={c.correo_personal} />
              <Dato e="Licencia de conducir" v={c.licencia_tipo ? `${LICENCIAS[c.licencia_tipo]} ${c.licencia_numero ?? ''}${c.licencia_vence ? ` · vence ${fechaCorta(c.licencia_vence)}` : ''}` : 'No'} />
              <Dato e="Título de estudios" v={c.titulo_estudios} />
              <Dato e="Contacto de emergencia" v={[c.emergencia_nombre, c.emergencia_parentesco].filter(Boolean).join(' · ')} />
              <Dato e="Teléfono de emergencia" v={c.emergencia_telefono} />
            </dl>
          </section>
          <section className="rounded-xl border border-border bg-card p-4">
            <p className="mb-3 text-sm font-semibold">Información de ingreso</p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
              <Dato e="Fecha de ingreso" v={fechaCorta(c.fecha_ingreso)} />
              <Dato e="Departamento" v={c.departamento?.nombre} />
              <Dato e="Área" v={c.area?.nombre} />
              <Dato e="Puesto" v={c.puesto?.nombre} />
              <Dato e="Jefe inmediato" v={c.jefe && <Link href={`/rrhh/${c.jefe.id}`} className="text-primary hover:underline">{c.jefe.nombres} {c.jefe.apellidos}</Link>} />
              <Dato e="Sucursal o ubicación" v={c.sucursal?.nombre} />
              <Dato e="Área de trabajo" v={c.area_trabajo} />
              <Dato e="Tipo de contrato" v={c.tipo_contrato ? TIPOS_CONTRATO[c.tipo_contrato] : null} />
              <Dato e="Jornada" v={c.jornada ? JORNADAS[c.jornada] : null} />
              <Dato e="Horario" v={c.horario} />
              <Dato e="Modalidad" v={c.modalidad ? MODALIDADES[c.modalidad] : null} />
              <Dato e="Período de prueba" v={c.fin_periodo_prueba ? `Hasta ${fechaCorta(c.fin_periodo_prueba)}` : null} />
              <Dato e="Afiliación IGSS" v={c.afiliacion_igss} />
              <Dato e="Centro de costo" v={c.centro ? `${c.centro.codigo} · ${c.centro.nombre}` : null} />
              <Dato e="Usuario del sistema" v={c.usuario ? `${c.usuario.nombre} (${c.usuario.correo})` : 'No usa el sistema'} />
            </dl>
            {c.puesto?.descriptor && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-xs font-semibold text-primary">Descriptor del puesto</summary>
                <p className="mt-2 whitespace-pre-line text-muted-foreground">{c.puesto.descriptor}</p>
              </details>
            )}
            {c.notas && <p className="mt-3 whitespace-pre-line text-xs text-muted-foreground">{c.notas}</p>}
          </section>
        </>
      )}

      {tab === 'salario' && puedeSalarios && (
        <>
          <form action={guardarSalario} className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="colaborador_id" value={c.id} />
            <p className="flex items-center gap-2 text-sm font-semibold sm:col-span-2 lg:col-span-4">
              <Lock className="h-4 w-4 text-primary" /> Información salarial (acceso restringido)
            </p>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Salario base mensual
              <input name="salario_base" inputMode="decimal" required defaultValue={salario?.salario_base ?? ''} className={cn(clasesCampo, 'text-right')} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Tipo de salario
              <select name="tipo_salario" defaultValue={salario?.tipo_salario ?? 'mensual'} className={clasesCampo}>
                {Object.entries(TIPOS_SALARIO).map(([v, e]) => (
                  <option key={v} value={v}>
                    {e}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Bonificación incentiva (mensual)
              <input name="bonificacion_incentiva" inputMode="decimal" defaultValue={salario?.bonificacion_incentiva ?? 250} className={cn(clasesCampo, 'text-right')} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Otras bonificaciones (mensual)
              <input name="otras_bonificaciones" inputMode="decimal" defaultValue={salario?.otras_bonificaciones ?? 0} className={cn(clasesCampo, 'text-right')} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
              Detalle de otras bonificaciones
              <input name="otras_bonificaciones_detalle" defaultValue={salario?.otras_bonificaciones_detalle ?? ''} className={clasesCampo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Forma de pago
              <select name="forma_pago" defaultValue={salario?.forma_pago ?? 'transferencia'} className={clasesCampo}>
                {Object.entries(FORMAS_PAGO).map(([v, e]) => (
                  <option key={v} value={v}>
                    {e}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Banco
              <select name="banco" defaultValue={salario?.banco ?? ''} className={clasesCampo}>
                <option value="">—</option>
                {BANCOS_GT.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Tipo de cuenta
              <select name="tipo_cuenta" defaultValue={salario?.tipo_cuenta ?? ''} className={clasesCampo}>
                <option value="">—</option>
                <option value="monetaria">Monetaria</option>
                <option value="ahorro">Ahorro</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Número de cuenta
              <input name="numero_cuenta" defaultValue={salario?.numero_cuenta ?? ''} className={cn(clasesCampo, 'font-mono')} />
            </label>
            <div className="flex flex-wrap items-center gap-4 text-xs sm:col-span-2">
              <label className="flex items-center gap-1.5"><input type="checkbox" name="aplica_igss" defaultChecked={salario?.aplica_igss ?? true} /> Cotiza IGSS</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" name="aplica_isr" defaultChecked={salario?.aplica_isr ?? true} /> Retención de ISR</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" name="horas_extra" defaultChecked={salario?.horas_extra ?? true} /> Puede tener horas extra</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" name="comisiones" defaultChecked={salario?.comisiones ?? false} /> Gana comisiones</label>
            </div>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Vigente desde
              <input name="fecha_efectiva" type="date" defaultValue={salario ? hoyGuatemala() : c.fecha_ingreso ?? hoyGuatemala()} className={clasesCampo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Motivo del cambio (si cambia el salario)
              <input name="motivo" placeholder="Ej. evaluación anual" className={clasesCampo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Autorizado por
              <input name="autorizado_por" className={clasesCampo} />
            </label>
            <div className="flex items-end">
              <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                Guardar información salarial
              </button>
            </div>
          </form>

          <section className="rounded-xl border border-border bg-card">
            <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">Historial de aumentos y modificaciones salariales</p>
            {historial.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">Sin registros todavía.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {historial.map((h) => (
                    <tr key={h.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2 text-xs">{fechaCorta(h.fecha_efectiva)}</td>
                      <td className="px-2 py-2 text-xs capitalize">{h.tipo}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {h.salario_anterior != null ? `Q${montoContable(h.salario_anterior)} → ` : ''}Q{montoContable(h.salario_nuevo)}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {h.motivo}
                        {h.autorizado_por ? ` · autorizó ${h.autorizado_por}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold">Deducciones autorizadas</p>
            {deducciones.length > 0 && (
              <ul className="divide-y divide-border/60 text-sm">
                {deducciones.map((d) => (
                  <li key={d.id} className={cn('flex flex-wrap items-center justify-between gap-2 py-2', !d.activa && 'opacity-50')}>
                    <span>
                      {TIPOS_DEDUCCION[d.tipo]} · {d.descripcion}
                      <span className="block text-xs text-muted-foreground">
                        Desde {fechaCorta(d.fecha_inicio)}
                        {d.monto_total ? ` · total Q${montoContable(d.monto_total)} · saldo Q${montoContable(d.saldo ?? 0)}` : ' · sin monto total (recurrente)'}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-semibold tabular-nums">Q{montoContable(d.cuota)} por quincena</span>
                      <form action={guardarDeduccion}>
                        <input type="hidden" name="colaborador_id" value={c.id} />
                        <input type="hidden" name="deduccion_id" value={d.id} />
                        <input type="hidden" name="tipo" value={d.tipo} />
                        <input type="hidden" name="descripcion" value={d.descripcion} />
                        <input type="hidden" name="cuota" value={d.cuota} />
                        <input type="hidden" name="activa" value={d.activa ? 'no' : 'si'} />
                        <button type="submit" className="text-xs font-semibold text-muted-foreground hover:text-foreground">
                          {d.activa ? 'Suspender' : 'Reactivar'}
                        </button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <form action={guardarDeduccion} className="grid grid-cols-2 gap-2 border-t border-border pt-3 md:grid-cols-6">
              <input type="hidden" name="colaborador_id" value={c.id} />
              <select name="tipo" defaultValue="prestamo" className={cn(clasesCampo, 'py-1.5 text-xs')}>
                {Object.entries(TIPOS_DEDUCCION).map(([v, e]) => (
                  <option key={v} value={v}>
                    {e}
                  </option>
                ))}
              </select>
              <input name="descripcion" required placeholder="Descripción" className={cn(clasesCampo, 'py-1.5 text-xs md:col-span-2')} />
              <input name="monto_total" inputMode="decimal" placeholder="Monto total (opcional)" className={cn(clasesCampo, 'py-1.5 text-xs')} />
              <input name="cuota" inputMode="decimal" required placeholder="Cuota por quincena" className={cn(clasesCampo, 'py-1.5 text-xs')} />
              <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                Agregar deducción
              </button>
            </form>
          </section>
          <section className="overflow-x-auto rounded-xl border border-border bg-card">
            <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">Historial de nóminas</p>
            {nominas.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">Aún no tiene planillas aprobadas.</p>
            ) : (
              <table className="w-full min-w-[720px] text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Planilla</th>
                    <th className="px-2 py-2 text-right">Días</th>
                    <th className="px-2 py-2 text-right">Extras</th>
                    <th className="px-2 py-2 text-right">Comisiones</th>
                    <th className="px-2 py-2 text-right">Devengado</th>
                    <th className="px-2 py-2 text-right">IGSS</th>
                    <th className="px-2 py-2 text-right">ISR</th>
                    <th className="px-2 py-2 text-right">Descuentos</th>
                    <th className="px-4 py-2 text-right">Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {nominas.map((n) => (
                    <tr key={n.id} className="border-t border-border/60">
                      <td className="px-4 py-1.5">
                        <Link href={`/rrhh/planillas/${n.planilla.id}/boletas?linea=${n.id}`} className="font-mono font-semibold text-primary hover:underline">
                          {n.planilla.codigo}
                        </Link>
                        <span className="ml-2 text-muted-foreground">{periodoPlanilla(n.planilla)}</span>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{dias(n.dias_laborados)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{montoContable(n.valor_horas_extra)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{montoContable(n.comisiones)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{montoContable(n.total_devengado)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{montoContable(n.igss_laboral)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{montoContable(n.isr)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{montoContable(n.total_descuentos)}</td>
                      <td className="px-4 py-1.5 text-right font-semibold tabular-nums">{montoContable(n.liquido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {tab === 'movimientos' && <PestanaMovimientos colaborador={c} puedeEditar={puedeEditar} puedeSalarios={puedeSalarios} />}
      {tab === 'vacaciones' && <PestanaVacaciones colaborador={c} puedeEditar={puedeEditar} puedeAutorizar={puedeAutorizar} />}
      {tab === 'equipo' && <PestanaEquipo colaborador={c} puedeEditar={puedeEditar} />}
      {tab === 'finalizacion' && <PestanaFinalizacion colaborador={c} puedeFinalizar={puedeFinalizar} puedeVerLiquidacion={puedeVerPlanilla} />}

      {tab === 'documentos' && (
        <>
          {(['inicio', 'durante', 'finalizacion'] as const).map((etapa) => {
            const tiposEtapa = tipos.filter((t) => t.etapa === etapa)
            const otros = documentos.filter((d) => d.etapa === etapa && !d.tipo_documento_id)
            return (
              <section key={etapa} className="rounded-xl border border-border bg-card">
                <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">{ETAPAS_DOCUMENTO[etapa]}</p>
                <ul className="divide-y divide-border/60 text-sm">
                  {tiposEtapa.map((t) => {
                    const docs = documentos.filter((d) => d.tipo_documento_id === t.id)
                    return (
                      <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                        <span className="flex items-center gap-2">
                          {docs.length ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className={cn('h-4 w-4', t.obligatorio ? 'text-amber-500' : 'text-muted-foreground/50')} />}
                          {t.nombre}
                          {!t.obligatorio && <span className="text-xs text-muted-foreground">(si aplica)</span>}
                        </span>
                        <span className="flex flex-wrap items-center gap-3 text-xs">
                          {docs.map((d) => (
                            <span key={d.id} className="flex items-center gap-2">
                              <a href={urls.get(d.archivo_url)} target="_blank" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                                <FileText className="h-3.5 w-3.5" /> Ver
                              </a>
                              {d.fecha_vencimiento && <span className="text-muted-foreground">vence {fechaCorta(d.fecha_vencimiento)}</span>}
                              {puedeEditar && (
                                <form action={eliminarDocumento}>
                                  <input type="hidden" name="colaborador_id" value={c.id} />
                                  <input type="hidden" name="documento_id" value={d.id} />
                                  <BotonConfirmar mensaje={`¿Eliminar "${d.nombre}" del expediente?`} className="text-muted-foreground hover:text-destructive">
                                    Quitar
                                  </BotonConfirmar>
                                </form>
                              )}
                            </span>
                          ))}
                        </span>
                      </li>
                    )
                  })}
                  {otros.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary" /> {d.nombre}
                        {d.notas && <span className="text-xs text-muted-foreground">· {d.notas}</span>}
                      </span>
                      <span className="flex items-center gap-3 text-xs">
                        <a href={urls.get(d.archivo_url)} target="_blank" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                          <FileText className="h-3.5 w-3.5" /> Ver
                        </a>
                        {puedeEditar && (
                          <form action={eliminarDocumento}>
                            <input type="hidden" name="colaborador_id" value={c.id} />
                            <input type="hidden" name="documento_id" value={d.id} />
                            <BotonConfirmar mensaje={`¿Eliminar "${d.nombre}" del expediente?`} className="text-muted-foreground hover:text-destructive">
                              Quitar
                            </BotonConfirmar>
                          </form>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
          {puedeEditar && (
            <form action={subirDocumento} encType="multipart/form-data" className="grid grid-cols-1 gap-2 rounded-xl border border-dashed border-primary/40 bg-card p-4 sm:grid-cols-2 lg:grid-cols-6">
              <input type="hidden" name="colaborador_id" value={c.id} />
              <p className="flex items-center gap-2 text-sm font-semibold sm:col-span-2 lg:col-span-6">
                <Upload className="h-4 w-4 text-primary" /> Agregar documento
              </p>
              <select name="tipo_documento_id" defaultValue="" className={cn(clasesCampo, 'py-1.5 text-xs lg:col-span-2')}>
                <option value="">Otro documento…</option>
                {(['inicio', 'durante', 'finalizacion'] as const).map((etapa) => (
                  <optgroup key={etapa} label={ETAPAS_DOCUMENTO[etapa]}>
                    {tipos
                      .filter((t) => t.etapa === etapa)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nombre}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <input name="nombre" placeholder="Nombre (si es otro documento)" className={cn(clasesCampo, 'py-1.5 text-xs')} />
              <select name="etapa" defaultValue="durante" className={cn(clasesCampo, 'py-1.5 text-xs')}>
                {Object.entries(ETAPAS_DOCUMENTO).map(([v, e]) => (
                  <option key={v} value={v}>
                    {e}
                  </option>
                ))}
              </select>
              <label className="flex flex-col gap-0.5 text-[11px] font-semibold text-muted-foreground">
                Vence (opcional)
                <input name="fecha_vencimiento" type="date" className={cn(clasesCampo, 'py-1 text-xs')} />
              </label>
              <input name="archivo" type="file" required accept="application/pdf,image/*" className="self-center text-xs" />
              <input name="notas" placeholder="Notas" className={cn(clasesCampo, 'py-1.5 text-xs lg:col-span-5')} />
              <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                Subir
              </button>
            </form>
          )}
        </>
      )}
    </main>
  )
}
