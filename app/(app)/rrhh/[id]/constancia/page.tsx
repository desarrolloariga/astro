import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { montoContable } from '@/lib/contabilidad-general'
import { TIPOS_CONTRATO } from '@/lib/rrhh'
import { BotonImprimir } from '@/components/app/boton-imprimir'
import { EnlaceVolver } from '@/components/contabilidad/comunes'

export const metadata = { title: 'Constancia laboral — ASTRO' }

const fechaLarga = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export default async function ConstanciaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ salario?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const supabase = await createClient()
  const [puedeVer, puedeSalarios, { data }, { data: empresa }] = await Promise.all([
    tienePermiso('rrhh', 'ver'),
    tienePermiso('rrhh', 'salarios'),
    supabase
      .from('colaboradores')
      .select('id, codigo, nombres, apellidos, dpi, fecha_ingreso, fecha_baja, estado, tipo_contrato, tipo_planilla, puesto:puesto_id ( nombre ), departamento:departamento_id ( nombre )')
      .eq('id', Number(id))
      .maybeSingle(),
    supabase.from('empresa_contable').select('razon_social, nombre_comercial, nit, direccion').eq('id', 1).maybeSingle(),
  ])
  if (!puedeVer) redirect('/inicio')
  if (!data) notFound()
  const c = data as unknown as {
    id: number
    codigo: string
    nombres: string
    apellidos: string
    dpi: string | null
    fecha_ingreso: string | null
    fecha_baja: string | null
    estado: string
    tipo_contrato: string | null
    tipo_planilla: string
    puesto: { nombre: string } | null
    departamento: { nombre: string } | null
  }
  const conSalario = sp.salario === '1' && puedeSalarios
  const { data: sal } = conSalario
    ? await supabase.from('colaborador_salarios').select('salario_base, tipo_salario, bonificacion_incentiva').eq('colaborador_id', c.id).maybeSingle()
    : { data: null }
  const emp = empresa as { razon_social: string; nombre_comercial: string | null; nit: string | null; direccion: string | null } | null
  const nombreEmpresa = emp?.razon_social && emp.razon_social !== 'Por definir' ? emp.razon_social : emp?.nombre_comercial ?? 'ASTRO'
  const baja = c.estado === 'baja'
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' })
  const s = sal as { salario_base: number; tipo_salario: string; bonificacion_incentiva: number } | null

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 bg-white px-6 py-8 text-sm text-black print:max-w-none print:px-0 print:py-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <EnlaceVolver href={`/rrhh/${c.id}`}>← Expediente</EnlaceVolver>
        <span className="flex items-center gap-4">
          {puedeSalarios && (
            <Link href={`/rrhh/${c.id}/constancia${conSalario ? '' : '?salario=1'}`} className="text-sm font-semibold text-primary hover:underline">
              {conSalario ? 'Sin salario' : 'Incluir salario'}
            </Link>
          )}
          <BotonImprimir />
        </span>
      </div>

      <header className="text-center">
        <p className="text-base font-bold uppercase">{nombreEmpresa}</p>
        {emp?.nit && <p className="text-xs">NIT {emp.nit}</p>}
        {emp?.direccion && <p className="text-xs">{emp.direccion}</p>}
      </header>
      <p className="text-right">Guatemala, {fechaLarga(hoy)}</p>
      <h1 className="text-center text-lg font-bold uppercase">Constancia laboral</h1>
      <p>A quien interese:</p>
      <p className="leading-relaxed">
        Por este medio hacemos constar que <span className="font-semibold">{c.nombres} {c.apellidos}</span>
        {c.dpi && <>, con Documento Personal de Identificación (DPI) número {c.dpi}</>},{' '}
        {baja ? 'laboró' : 'labora'} en {nombreEmpresa}
        {c.puesto && <> en el puesto de {c.puesto.nombre}</>}
        {c.departamento && <>, en el departamento de {c.departamento.nombre}</>}
        {c.fecha_ingreso && <>, {baja ? 'del' : 'desde el'} {fechaLarga(c.fecha_ingreso)}</>}
        {baja && c.fecha_baja && <> al {fechaLarga(c.fecha_baja)}</>}
        {c.tipo_contrato && <>, con contrato {TIPOS_CONTRATO[c.tipo_contrato]?.toLowerCase()}</>}.
        {s && (
          <>
            {' '}
            {baja ? 'Su último salario fue de' : 'Devenga un salario'} {s.tipo_salario === 'por_dia' ? 'diario' : s.tipo_salario === 'por_hora' ? 'por hora' : 'mensual'} de{' '}
            <span className="font-semibold">Q{montoContable(s.salario_base)}</span>
            {Number(s.bonificacion_incentiva) > 0 && <> más bonificación incentiva de Q{montoContable(s.bonificacion_incentiva)}</>}.
          </>
        )}
      </p>
      <p className="leading-relaxed">Se extiende la presente a solicitud del interesado para los usos que le convengan.</p>

      <div className="mt-20 flex justify-center text-center text-xs">
        <div className="w-64 border-t border-black pt-1.5">
          <p className="font-semibold">Recursos Humanos</p>
          <p>{nombreEmpresa}</p>
        </div>
      </div>
    </main>
  )
}
