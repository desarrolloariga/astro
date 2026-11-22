import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { montoContable } from '@/lib/contabilidad-general'
import { CATEGORIAS_ASIGNACION, dias, fechaCorta } from '@/lib/rrhh'
import { BotonImprimir } from '@/components/app/boton-imprimir'
import { EnlaceVolver } from '@/components/contabilidad/comunes'
import { SELECT_ASIGNACION, type Asignacion } from '@/components/rrhh/pestana-equipo'

export const metadata = { title: 'Responsiva de equipo — ASTRO' }

const fechaLarga = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export default async function ResponsivaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const colaboradorId = Number(id)
  if (!Number.isInteger(colaboradorId) || colaboradorId <= 0) notFound()
  const supabase = await createClient()
  const [puede, { data: c }, { data }, { data: empresa }] = await Promise.all([
    tienePermiso('rrhh', 'ver'),
    supabase.from('colaboradores').select('id, codigo, nombres, apellidos, dpi, puesto:puesto_id ( nombre ), sucursal:tienda_id ( nombre )').eq('id', colaboradorId).maybeSingle(),
    supabase.from('colaborador_asignaciones').select(SELECT_ASIGNACION).eq('colaborador_id', colaboradorId).eq('estado', 'asignado').order('fecha_entrega'),
    supabase.from('empresa_contable').select('razon_social, nombre_comercial, nit, direccion').eq('id', 1).maybeSingle(),
  ])
  if (!puede) redirect('/inicio')
  if (!c) notFound()
  const col = c as unknown as { id: number; codigo: string; nombres: string; apellidos: string; dpi: string | null; puesto: { nombre: string } | null; sucursal: { nombre: string } | null }
  const lista = (data ?? []) as unknown as Asignacion[]
  const emp = empresa as { razon_social: string; nombre_comercial: string | null; nit: string | null; direccion: string | null } | null
  const nombreEmpresa = emp?.razon_social && emp.razon_social !== 'Por definir' ? emp.razon_social : emp?.nombre_comercial ?? 'ASTRO'
  const total = lista.reduce((s, a) => s + Number(a.valor ?? 0), 0)
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' })

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 bg-white px-6 py-8 text-sm text-black print:max-w-none print:px-0 print:py-0">
      <div className="flex items-center justify-between print:hidden">
        <EnlaceVolver href={`/rrhh/${col.id}?tab=equipo`}>← Uniformes y equipo</EnlaceVolver>
        <BotonImprimir />
      </div>

      <header className="text-center">
        <p className="text-base font-bold uppercase">{nombreEmpresa}</p>
        {emp?.nit && <p className="text-xs">NIT {emp.nit}</p>}
        {emp?.direccion && <p className="text-xs">{emp.direccion}</p>}
        <h1 className="mt-4 text-lg font-bold uppercase">Carta de responsiva de uniformes y equipo de trabajo</h1>
      </header>

      <p className="leading-relaxed">
        Yo, <span className="font-semibold">{col.nombres} {col.apellidos}</span>
        {col.dpi && <>, con Documento Personal de Identificación (DPI) número <span className="font-semibold">{col.dpi}</span></>}, colaborador(a) con
        código {col.codigo}
        {col.puesto && <> en el puesto de {col.puesto.nombre}</>}
        {col.sucursal && <>, asignado(a) a {col.sucursal.nombre}</>}, hago constar que recibí de {nombreEmpresa} los bienes que se detallan a continuación,
        en buen estado y para uso exclusivo de mis labores:
      </p>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-y border-black text-left">
            <th className="py-1.5 pr-2">Fecha</th>
            <th className="py-1.5 pr-2">Artículo</th>
            <th className="py-1.5 pr-2 text-right">Cant.</th>
            <th className="py-1.5 pr-2">Talla / serie</th>
            <th className="py-1.5 text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          {lista.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-center">
                No tiene uniformes ni equipo asignado.
              </td>
            </tr>
          )}
          {lista.map((a) => (
            <tr key={a.id} className="border-b border-black/30 align-top">
              <td className="py-1.5 pr-2">{fechaCorta(a.fecha_entrega)}</td>
              <td className="py-1.5 pr-2">
                <span className="font-semibold">{a.descripcion}</span>
                <span className="block text-[11px]">
                  {[CATEGORIAS_ASIGNACION[a.categoria], a.marca_modelo, a.activo && `Activo ${a.activo.codigo}`, a.notas].filter(Boolean).join(' · ')}
                </span>
              </td>
              <td className="py-1.5 pr-2 text-right">{dias(a.cantidad)}</td>
              <td className="py-1.5 pr-2">{[a.talla && `Talla ${a.talla}`, a.numero_serie].filter(Boolean).join(' · ') || '—'}</td>
              <td className="py-1.5 text-right">{a.valor ? `Q${montoContable(a.valor)}` : '—'}</td>
            </tr>
          ))}
        </tbody>
        {total > 0 && (
          <tfoot>
            <tr className="border-t border-black font-semibold">
              <td colSpan={4} className="py-1.5 text-right">
                Valor total
              </td>
              <td className="py-1.5 text-right">Q{montoContable(total)}</td>
            </tr>
          </tfoot>
        )}
      </table>

      <p className="leading-relaxed">
        Me comprometo a cuidarlos, a usarlos únicamente para fines laborales y a devolverlos en el mismo estado, salvo el desgaste normal por su uso,
        cuando la empresa lo solicite o al finalizar la relación laboral. En caso de pérdida o daño por negligencia, acepto responder por su valor conforme
        a la ley y al Reglamento Interior de Trabajo.
      </p>
      <p>Guatemala, {fechaLarga(hoy)}.</p>

      <div className="mt-16 grid grid-cols-2 gap-12 text-center text-xs">
        <div className="border-t border-black pt-1.5">
          <p className="font-semibold">
            {col.nombres} {col.apellidos}
          </p>
          <p>Recibe · {col.dpi ? `DPI ${col.dpi}` : col.codigo}</p>
        </div>
        <div className="border-t border-black pt-1.5">
          <p className="font-semibold">Recursos Humanos</p>
          <p>Entrega · {nombreEmpresa}</p>
        </div>
      </div>
    </main>
  )
}
