import { ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { hoyGuatemala } from '@/lib/contabilidad'
import { clasesCampo, montoContable } from '@/lib/contabilidad-general'
import { ESTADOS_COLABORADOR, TIPOS_CONTRATO, TIPOS_MOVIMIENTO, fechaCorta } from '@/lib/rrhh'
import { cargarCatalogosRrhh } from '@/lib/rrhh-servidor'
import { registrarMovimiento } from '@/app/(app)/rrhh/acciones'

type Nombre = { nombre: string } | null
type Movimiento = {
  id: number
  tipo: string
  fecha_efectiva: string
  motivo: string | null
  responsable: string | null
  contrato_anterior: string | null
  contrato_nuevo: string | null
  estado_anterior: string | null
  estado_nuevo: string | null
  fecha_creacion: string
  puesto_anterior: Nombre
  puesto_nuevo: Nombre
  departamento_anterior: Nombre
  departamento_nuevo: Nombre
  area_anterior: Nombre
  area_nueva: Nombre
  tienda_anterior: Nombre
  tienda_nueva: Nombre
  jefe_anterior: { nombres: string; apellidos: string } | null
  jefe_nuevo: { nombres: string; apellidos: string } | null
  registrado: Nombre
}
type Evento = { fecha: string; orden: string; titulo: string; cambios: [string, string, string][]; detalle: string; salarial?: boolean }

const persona = (p: { nombres: string; apellidos: string } | null) => (p ? `${p.nombres} ${p.apellidos}` : '—')

export async function PestanaMovimientos({
  colaborador,
  puedeEditar,
  puedeSalarios,
}: {
  colaborador: { id: number; estado: string }
  puedeEditar: boolean
  puedeSalarios: boolean
}) {
  const supabase = await createClient()
  const [{ data: movs }, { data: sal }, cat] = await Promise.all([
    supabase
      .from('colaborador_movimientos')
      .select(
        `id, tipo, fecha_efectiva, motivo, responsable, contrato_anterior, contrato_nuevo, estado_anterior, estado_nuevo, fecha_creacion,
         puesto_anterior:puesto_anterior_id ( nombre ), puesto_nuevo:puesto_nuevo_id ( nombre ),
         departamento_anterior:departamento_anterior_id ( nombre ), departamento_nuevo:departamento_nuevo_id ( nombre ),
         area_anterior:area_anterior_id ( nombre ), area_nueva:area_nueva_id ( nombre ),
         tienda_anterior:tienda_anterior_id ( nombre ), tienda_nueva:tienda_nueva_id ( nombre ),
         jefe_anterior:jefe_anterior_id ( nombres, apellidos ), jefe_nuevo:jefe_nuevo_id ( nombres, apellidos ),
         registrado:registrado_por ( nombre )`,
      )
      .eq('colaborador_id', colaborador.id),
    puedeSalarios
      ? supabase
          .from('colaborador_salario_historial')
          .select('id, fecha_efectiva, tipo, salario_anterior, salario_nuevo, bonificacion_anterior, bonificacion_nueva, motivo, autorizado_por, fecha_creacion')
          .eq('colaborador_id', colaborador.id)
      : Promise.resolve({ data: [] }),
    puedeEditar ? cargarCatalogosRrhh(supabase) : Promise.resolve(null),
  ])

  const eventos: Evento[] = [
    ...((movs ?? []) as unknown as Movimiento[]).map((m) => {
      const cambios: [string, string, string][] = []
      if (m.puesto_anterior || m.puesto_nuevo) cambios.push(['Puesto', m.puesto_anterior?.nombre ?? '—', m.puesto_nuevo?.nombre ?? '—'])
      if (m.departamento_anterior || m.departamento_nuevo)
        cambios.push(['Departamento', m.departamento_anterior?.nombre ?? '—', m.departamento_nuevo?.nombre ?? '—'])
      if (m.area_anterior || m.area_nueva) cambios.push(['Área', m.area_anterior?.nombre ?? '—', m.area_nueva?.nombre ?? '—'])
      if (m.tienda_anterior || m.tienda_nueva) cambios.push(['Sucursal', m.tienda_anterior?.nombre ?? '—', m.tienda_nueva?.nombre ?? '—'])
      if (m.jefe_anterior || m.jefe_nuevo) cambios.push(['Jefe inmediato', persona(m.jefe_anterior), persona(m.jefe_nuevo)])
      if (m.contrato_anterior || m.contrato_nuevo)
        cambios.push(['Contrato', TIPOS_CONTRATO[m.contrato_anterior ?? ''] ?? '—', TIPOS_CONTRATO[m.contrato_nuevo ?? ''] ?? '—'])
      if (m.estado_anterior || m.estado_nuevo)
        cambios.push(['Estado', ESTADOS_COLABORADOR[m.estado_anterior ?? '']?.etiqueta ?? '—', ESTADOS_COLABORADOR[m.estado_nuevo ?? '']?.etiqueta ?? '—'])
      return {
        fecha: m.fecha_efectiva,
        orden: m.fecha_creacion,
        titulo: TIPOS_MOVIMIENTO[m.tipo] ?? m.tipo,
        cambios,
        detalle: [m.motivo, m.responsable && `autorizó ${m.responsable}`, m.registrado && `registró ${m.registrado.nombre}`].filter(Boolean).join(' · '),
      }
    }),
    ...((sal ?? []) as {
      fecha_efectiva: string
      tipo: string
      salario_anterior: number | null
      salario_nuevo: number
      bonificacion_anterior: number | null
      bonificacion_nueva: number | null
      motivo: string | null
      autorizado_por: string | null
      fecha_creacion: string
    }[]).map((h) => ({
      fecha: h.fecha_efectiva,
      orden: h.fecha_creacion,
      titulo: h.tipo === 'alta' ? 'Salario inicial' : h.tipo === 'aumento' ? 'Aumento salarial' : h.tipo === 'disminucion' ? 'Disminución salarial' : 'Modificación salarial',
      cambios: [
        ['Salario base', h.salario_anterior != null ? `Q${montoContable(h.salario_anterior)}` : '—', `Q${montoContable(h.salario_nuevo)}`],
        ...(h.bonificacion_anterior != null && Number(h.bonificacion_anterior) !== Number(h.bonificacion_nueva)
          ? [['Bonificación incentiva', `Q${montoContable(h.bonificacion_anterior)}`, `Q${montoContable(h.bonificacion_nueva ?? 0)}`] as [string, string, string]]
          : []),
      ] as [string, string, string][],
      detalle: [h.motivo, h.autorizado_por && `autorizó ${h.autorizado_por}`].filter(Boolean).join(' · '),
      salarial: true,
    })),
  ].sort((a, b) => (b.fecha + b.orden).localeCompare(a.fecha + a.orden))

  const sinCambio = <option value="">Sin cambio</option>

  return (
    <>
      {puedeEditar && cat && colaborador.estado !== 'baja' && (
        <form action={registrarMovimiento} className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="colaborador_id" value={colaborador.id} />
          <p className="text-sm font-semibold sm:col-span-2 lg:col-span-4">Registrar movimiento laboral</p>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Tipo de movimiento
            <select name="tipo" defaultValue="ascenso" className={clasesCampo}>
              {Object.entries(TIPOS_MOVIMIENTO).map(([v, e]) => (
                <option key={v} value={v}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Fecha efectiva
            <input name="fecha_efectiva" type="date" defaultValue={hoyGuatemala()} className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Nuevo puesto
            <select name="puesto_id" defaultValue="" className={clasesCampo}>
              {sinCambio}
              {cat.puestos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Nuevo departamento
            <select name="departamento_id" defaultValue="" className={clasesCampo}>
              {sinCambio}
              {cat.departamentos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Nueva área
            <select name="area_id" defaultValue="" className={clasesCampo}>
              {sinCambio}
              <option value="ninguno">Sin área</option>
              {cat.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {cat.departamentos.find((d) => d.id === a.departamento_id)?.nombre} · {a.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Nueva sucursal
            <select name="tienda_id" defaultValue="" className={clasesCampo}>
              {sinCambio}
              {cat.tiendas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Nuevo jefe inmediato
            <select name="jefe_id" defaultValue="" className={clasesCampo}>
              {sinCambio}
              <option value="ninguno">Sin jefe inmediato</option>
              {cat.jefes
                .filter((j) => j.id !== colaborador.id)
                .map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.nombre}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Nuevo tipo de contrato
            <select name="tipo_contrato" defaultValue="" className={clasesCampo}>
              {sinCambio}
              {Object.entries(TIPOS_CONTRATO).map(([v, e]) => (
                <option key={v} value={v}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Nuevo estado
            <select name="estado" defaultValue="" className={clasesCampo}>
              {sinCambio}
              {Object.entries(ESTADOS_COLABORADOR)
                .filter(([v]) => v !== 'baja')
                .map(([v, e]) => (
                  <option key={v} value={v}>
                    {e.etiqueta}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
            Motivo
            <input name="motivo" required placeholder="Ej. promoción por desempeño, apertura de tienda…" className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Responsable que autoriza
            <input name="responsable" className={clasesCampo} />
          </label>
          <div className="flex items-end">
            <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Registrar movimiento
            </button>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
            El expediente se actualiza con lo nuevo. Los cambios de salario se registran en Información salarial; los cambios hechos al editar el expediente también quedan en este historial.
          </p>
        </form>
      )}

      <section className="rounded-xl border border-border bg-card">
        <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">Historial laboral</p>
        {eventos.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Sin movimientos registrados.</p>
        ) : (
          <ol className="divide-y divide-border/60">
            {eventos.map((e, i) => (
              <li key={i} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:gap-4">
                <span className="w-24 shrink-0 text-xs text-muted-foreground">{fechaCorta(e.fecha)}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className={cn('font-semibold', e.salarial && 'text-primary')}>{e.titulo}</span>
                  {e.cambios.map(([campo, antes, despues]) => (
                    <span key={campo} className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground">{campo}:</span>
                      <span>{antes}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-semibold">{despues}</span>
                    </span>
                  ))}
                  {e.detalle && <span className="text-xs text-muted-foreground">{e.detalle}</span>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  )
}
