import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { montoContable } from '@/lib/contabilidad-general'
import { SELECT_FINALIZACION, TIPOS_FINALIZACION, dias, fechaCorta } from '@/lib/rrhh'
import { BotonImprimir } from '@/components/app/boton-imprimir'
import { EnlaceVolver } from '@/components/contabilidad/comunes'
import type { Finalizacion } from '../page'

export const metadata = { title: 'Finiquito laboral — ASTRO' }

const q = (v: number | string | null | undefined) => montoContable(v ?? 0)
const fechaLarga = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export default async function FiniquitoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [puedeFinalizar, puedeVer, { data }, { data: empresa }] = await Promise.all([
    tienePermiso('rrhh', 'finalizar'),
    tienePermiso('planilla', 'ver'),
    supabase.from('rrhh_finalizaciones').select(SELECT_FINALIZACION).eq('id', Number(id)).maybeSingle(),
    supabase.from('empresa_contable').select('razon_social, nombre_comercial, nit, direccion').eq('id', 1).maybeSingle(),
  ])
  if (!puedeFinalizar && !puedeVer) redirect('/inicio')
  if (!data) notFound()
  const f = data as unknown as Finalizacion
  const emp = empresa as { razon_social: string; nombre_comercial: string | null; nit: string | null; direccion: string | null } | null
  const nombreEmpresa = emp?.razon_social && emp.razon_social !== 'Por definir' ? emp.razon_social : emp?.nombre_comercial ?? 'ASTRO'
  const nombre = f.colaborador ? `${f.colaborador.nombres} ${f.colaborador.apellidos}` : ''
  const contrato = f.tipo_planilla === 'contrato'
  const ingresos: [string, number][] = (
    [
      [contrato ? `Salario pendiente (${dias(f.dias_salario)} días)` : `Honorarios pendientes (${dias(f.dias_salario)} días)`, f.salario_pendiente],
      ['Bonificación incentiva', f.bonificacion_pendiente],
      [`Vacaciones (${dias(f.dias_vacaciones)} días)`, f.vacaciones_monto],
      [`Aguinaldo proporcional (${f.aguinaldo_dias} días)`, f.aguinaldo_monto],
      [`Bono 14 proporcional (${f.bono14_dias} días)`, f.bono14_monto],
      ['Indemnización', f.indemnizacion_monto],
      [f.otros_pagos_detalle ?? 'Otros pagos', f.otros_pagos],
    ] as [string, number][]
  ).filter(([, v]) => Number(v) > 0)
  const descuentos: [string, number][] = (
    [
      ['IGSS laboral', f.igss_laboral],
      ['ISR', f.isr],
      ...f.aplicadas.map((a) => [a.deduccion?.descripcion ?? 'Deducción', a.monto] as [string, number]),
      [f.otros_descuentos_detalle ?? 'Otros descuentos', f.otros_descuentos],
    ] as [string, number][]
  ).filter(([, v]) => Number(v) > 0)

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 bg-white px-6 py-8 text-sm text-black print:max-w-none print:px-0 print:py-0">
      <div className="flex items-center justify-between print:hidden">
        <EnlaceVolver href={`/rrhh/finalizaciones/${f.id}`}>← Liquidación</EnlaceVolver>
        <BotonImprimir />
      </div>
      {f.estado === 'borrador' && <p className="rounded border border-amber-500 bg-amber-50 px-3 py-2 text-xs print:border-black">Liquidación en borrador: los montos aún pueden cambiar.</p>}

      <header className="text-center">
        <p className="text-base font-bold uppercase">{nombreEmpresa}</p>
        {emp?.nit && <p className="text-xs">NIT {emp.nit}</p>}
        {emp?.direccion && <p className="text-xs">{emp.direccion}</p>}
        <h1 className="mt-4 text-lg font-bold uppercase">Finiquito {contrato ? 'laboral' : 'de contrato de servicios'}</h1>
      </header>

      <p className="leading-relaxed">
        Yo, <span className="font-semibold">{nombre}</span>
        {f.colaborador?.dpi && <>, con Documento Personal de Identificación (DPI) número <span className="font-semibold">{f.colaborador.dpi}</span></>}, hago
        constar que presté mis servicios a {nombreEmpresa}
        {f.colaborador?.puesto && <> en el puesto de {f.colaborador.puesto.nombre}</>} del {fechaLarga(f.fecha_ingreso ?? f.fecha_salida)} al{' '}
        {fechaLarga(f.fecha_salida)}, fecha en que terminó la relación por {TIPOS_FINALIZACION[f.tipo]?.toLowerCase()}, y que en este acto recibo la cantidad
        de <span className="font-semibold">Q{q(f.liquido)}</span> por los conceptos siguientes:
      </p>

      <table className="w-full border-collapse text-xs">
        <tbody>
          <tr className="border-y border-black font-bold uppercase">
            <td className="py-1.5">Ingresos</td>
            <td className="py-1.5 text-right">Q</td>
          </tr>
          {ingresos.map(([e, v]) => (
            <tr key={e} className="border-b border-black/20">
              <td className="py-1">{e}</td>
              <td className="py-1 text-right tabular-nums">{q(v)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-1.5">Total ingresos</td>
            <td className="py-1.5 text-right tabular-nums">{q(f.total_ingresos)}</td>
          </tr>
          {descuentos.length > 0 && (
            <tr className="border-y border-black font-bold uppercase">
              <td className="py-1.5">Descuentos</td>
              <td />
            </tr>
          )}
          {descuentos.map(([e, v]) => (
            <tr key={e} className="border-b border-black/20">
              <td className="py-1">{e}</td>
              <td className="py-1 text-right tabular-nums">−{q(v)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-black text-sm font-bold">
            <td className="py-2">Líquido recibido</td>
            <td className="py-2 text-right tabular-nums">Q{q(f.liquido)}</td>
          </tr>
        </tbody>
      </table>

      <p className="leading-relaxed">
        Con lo recibido declaro que {nombreEmpresa} me ha pagado la totalidad de las prestaciones e indemnizaciones que me corresponden conforme al Código de
        Trabajo y demás leyes laborales, por lo que le otorgo el más amplio y total finiquito, sin tener reclamo alguno presente ni futuro derivado de la
        relación que nos unió.
      </p>
      <p>Guatemala, {fechaLarga(f.fecha_pago ?? f.fecha_salida)}.</p>

      <div className="mt-16 grid grid-cols-2 gap-12 text-center text-xs">
        <div className="border-t border-black pt-1.5">
          <p className="font-semibold">{nombre}</p>
          <p>{f.colaborador?.dpi ? `DPI ${f.colaborador.dpi}` : f.colaborador?.codigo}</p>
        </div>
        <div className="border-t border-black pt-1.5">
          <p className="font-semibold">Por {nombreEmpresa}</p>
          <p>Recursos Humanos</p>
        </div>
      </div>
      <p className="mt-6 text-center text-[11px]">Huella dactilar del colaborador: ______________________</p>
    </main>
  )
}
