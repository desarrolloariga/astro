import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, Settings2, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { clasesCampo } from '@/lib/contabilidad-general'
import { ESTADOS_COLABORADOR, antiguedad, fechaCorta } from '@/lib/rrhh'
import { urlsFirmadas } from '@/lib/rrhh-servidor'
import { Encabezado, Mensajes } from '@/components/contabilidad/comunes'

export const metadata = { title: 'Colaboradores — ASTRO' }

type Fila = {
  id: number
  codigo: string
  nombres: string
  apellidos: string
  dpi: string | null
  telefono: string | null
  foto_url: string | null
  estado: string
  fecha_ingreso: string | null
  fin_periodo_prueba: string | null
  tipo_planilla: string
  departamento: { nombre: string } | null
  puesto: { nombre: string } | null
  sucursal: { nombre: string } | null
}

export default async function ColaboradoresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; departamento?: string; ok?: string; error?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  let consulta = supabase
    .from('colaboradores')
    .select(
      'id, codigo, nombres, apellidos, dpi, telefono, foto_url, estado, fecha_ingreso, fin_periodo_prueba, tipo_planilla, departamento:departamento_id ( nombre ), puesto:puesto_id ( nombre ), sucursal:tienda_id ( nombre )',
    )
    .order('apellidos')
    .limit(500)
  if (sp.estado) consulta = consulta.eq('estado', sp.estado)
  else consulta = consulta.neq('estado', 'baja')
  if (Number(sp.departamento)) consulta = consulta.eq('departamento_id', Number(sp.departamento))
  const q = (sp.q ?? '').trim().replace(/[,()%]/g, '')
  if (q) consulta = consulta.or(`nombres.ilike.%${q}%,apellidos.ilike.%${q}%,codigo.ilike.%${q}%,dpi.ilike.%${q}%`)

  const [puedeVer, puedeEditar, { data }, { data: deps }, { data: resumen }] = await Promise.all([
    tienePermiso('rrhh', 'ver'),
    tienePermiso('rrhh', 'editar'),
    consulta,
    supabase.from('rrhh_departamentos').select('id, nombre').order('nombre'),
    supabase.from('colaboradores').select('estado, fin_periodo_prueba'),
  ])
  if (!puedeVer) redirect('/inicio')
  const filas = (data ?? []) as unknown as Fila[]
  const fotos = await urlsFirmadas(filas.map((f) => f.foto_url))
  const todos = (resumen ?? []) as { estado: string; fin_periodo_prueba: string | null }[]
  const hoy = new Date().toISOString().slice(0, 10)
  const en15 = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)
  const kpis = [
    { e: 'Colaboradores activos', v: todos.filter((c) => c.estado === 'activo' || c.estado === 'periodo_prueba').length },
    { e: 'En período de prueba', v: todos.filter((c) => c.estado === 'periodo_prueba').length },
    {
      e: 'Prueba vence en 15 días',
      v: todos.filter((c) => c.estado === 'periodo_prueba' && c.fin_periodo_prueba && c.fin_periodo_prueba >= hoy && c.fin_periodo_prueba <= en15).length,
    },
    { e: 'Bajas', v: todos.filter((c) => c.estado === 'baja').length },
  ]

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado icono={Users} titulo="Colaboradores" descripcion="Expediente de cada colaborador: datos personales, puesto, salario, documentos y, más adelante, vacaciones, planilla y finalización.">
        {puedeEditar && (
          <Link href="/rrhh/catalogos" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            <Settings2 className="h-4 w-4" /> Departamentos y puestos
          </Link>
        )}
        {puedeEditar && (
          <Link href="/rrhh/nuevo" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Nuevo colaborador
          </Link>
        )}
      </Encabezado>
      <Mensajes ok={sp.ok} error={sp.error} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.e} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{k.e}</p>
            <p className="text-2xl font-bold tabular-nums">{k.v}</p>
          </div>
        ))}
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-semibold">
          Buscar
          <input name="q" defaultValue={sp.q ?? ''} placeholder="Nombre, código o DPI" className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Departamento
          <select name="departamento" defaultValue={sp.departamento ?? ''} className={clasesCampo}>
            <option value="">Todos</option>
            {((deps ?? []) as { id: number; nombre: string }[]).map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Estado
          <select name="estado" defaultValue={sp.estado ?? ''} className={clasesCampo}>
            <option value="">Vigentes</option>
            {Object.entries(ESTADOS_COLABORADOR).map(([v, e]) => (
              <option key={v} value={v}>
                {e.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          Filtrar
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Colaborador</th>
              <th className="px-3 py-2">Puesto</th>
              <th className="px-3 py-2">Departamento / sucursal</th>
              <th className="px-3 py-2">Ingreso</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                  {q || sp.estado || sp.departamento ? 'Nadie coincide con el filtro.' : 'Aún no hay colaboradores. Crea el primero.'}
                </td>
              </tr>
            )}
            {filas.map((f) => (
              <tr key={f.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                <td className="px-3 py-2">
                  <Link href={`/rrhh/${f.id}`} className="flex items-center gap-3">
                    {f.foto_url && fotos.get(f.foto_url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fotos.get(f.foto_url)} alt="" className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                        {f.nombres[0]}
                        {f.apellidos[0]}
                      </span>
                    )}
                    <span>
                      <span className="font-semibold text-foreground hover:underline">
                        {f.apellidos}, {f.nombres}
                      </span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {f.codigo}
                        {f.tipo_planilla === 'servicios' ? ' · servicios' : ''}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2">{f.puesto?.nombre ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{[f.departamento?.nombre, f.sucursal?.nombre].filter(Boolean).join(' · ') || '—'}</td>
                <td className="px-3 py-2 text-xs">
                  {fechaCorta(f.fecha_ingreso)}
                  {f.fecha_ingreso && <span className="block text-muted-foreground">{antiguedad(f.fecha_ingreso)}</span>}
                </td>
                <td className="px-3 py-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', ESTADOS_COLABORADOR[f.estado]?.clase)}>
                    {ESTADOS_COLABORADOR[f.estado]?.etiqueta ?? f.estado}
                  </span>
                  {f.estado === 'periodo_prueba' && f.fin_periodo_prueba && (
                    <span className="block text-xs text-muted-foreground">hasta {fechaCorta(f.fin_periodo_prueba)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
