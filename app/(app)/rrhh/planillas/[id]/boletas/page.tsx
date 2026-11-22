import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { montoContable } from '@/lib/contabilidad-general'
import { FORMAS_PAGO, dias, fechaCorta, periodoPlanilla } from '@/lib/rrhh'
import { BotonImprimir } from '@/components/app/boton-imprimir'
import { EnlaceVolver } from '@/components/contabilidad/comunes'
import type { LineaPlanilla } from '../page'

export const metadata = { title: 'Boletas de pago — ASTRO' }

type Linea = LineaPlanilla & {
  colaborador: { codigo: string; dpi: string | null; afiliacion_igss: string | null } | null
  aplicadas: { monto: number; deduccion: { descripcion: string; tipo: string; saldo: number | null } | null }[]
}

const q = (v: number | string | null | undefined) => montoContable(v ?? 0)

function Renglon({ e, v, nota }: { e: string; v: number; nota?: string }) {
  if (!v) return null
  return (
    <div className="flex justify-between gap-2">
      <span>
        {e}
        {nota && <span className="text-[10px] text-black/60"> {nota}</span>}
      </span>
      <span className="tabular-nums">{q(v)}</span>
    </div>
  )
}

export default async function BoletasPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ linea?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const supabase = await createClient()
  let consulta = supabase
    .from('planilla_lineas')
    .select('*, colaborador:colaborador_id ( codigo, dpi, afiliacion_igss ), aplicadas:planilla_linea_deducciones ( monto, deduccion:deduccion_id ( descripcion, tipo, saldo ) )')
    .eq('planilla_id', Number(id))
    .gt('total_devengado', 0)
    .order('nombre')
  if (Number(sp.linea)) consulta = consulta.eq('id', Number(sp.linea))
  const [puede, { data: p }, { data: l }, { data: empresa }] = await Promise.all([
    tienePermiso('planilla', 'ver'),
    supabase.from('planillas').select('*').eq('id', Number(id)).maybeSingle(),
    consulta,
    supabase.from('empresa_contable').select('razon_social, nombre_comercial, nit').eq('id', 1).maybeSingle(),
  ])
  if (!puede) redirect('/inicio')
  if (!p) notFound()
  const lineas = (l ?? []) as unknown as Linea[]
  const emp = empresa as { razon_social: string; nombre_comercial: string | null; nit: string | null } | null
  const nombreEmpresa = emp?.razon_social && emp.razon_social !== 'Por definir' ? emp.razon_social : emp?.nombre_comercial ?? 'ASTRO'
  const contrato = p.tipo === 'contrato'

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 bg-white px-6 py-6 text-xs text-black print:max-w-none print:px-0 print:py-0">
      <div className="flex items-center justify-between print:hidden">
        <EnlaceVolver href={`/rrhh/planillas/${p.id}`}>← Planilla {p.codigo}</EnlaceVolver>
        <BotonImprimir>Imprimir {lineas.length} boleta{lineas.length === 1 ? '' : 's'}</BotonImprimir>
      </div>
      {p.estado === 'borrador' && <p className="rounded border border-amber-500 bg-amber-50 px-3 py-2 print:border-black">Planilla en borrador: los montos aún pueden cambiar.</p>}
      {lineas.map((x) => (
        <article key={x.id} className="break-inside-avoid border border-black p-4 [&:nth-of-type(2n)]:print:break-after-page">
          <header className="flex items-start justify-between gap-3 border-b border-black pb-2">
            <div>
              <p className="text-sm font-bold uppercase">{nombreEmpresa}</p>
              {emp?.nit && <p>NIT {emp.nit}</p>}
            </div>
            <div className="text-right">
              <p className="font-bold uppercase">{p.tipo === 'servicios' ? 'Constancia de pago por servicios' : 'Boleta de pago'}</p>
              <p className="first-letter:uppercase">{periodoPlanilla(p)}</p>
              <p>
                Del {fechaCorta(p.fecha_inicio)} al {fechaCorta(p.fecha_fin)} · {p.codigo}
              </p>
            </div>
          </header>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 border-b border-black py-2">
            <p>
              <span className="font-semibold">{x.nombre}</span> · {x.colaborador?.codigo}
            </p>
            <p className="text-right">{[x.puesto, x.departamento].filter(Boolean).join(' · ')}</p>
            <p>
              {x.colaborador?.dpi ? `DPI ${x.colaborador.dpi}` : ''}
              {contrato && x.colaborador?.afiliacion_igss ? ` · IGSS ${x.colaborador.afiliacion_igss}` : ''}
            </p>
            <p className="text-right">
              Ingreso {fechaCorta(x.fecha_ingreso)} · {dias(x.dias_laborados)} días{Number(x.dias_sin_goce) > 0 ? ` (${dias(x.dias_sin_goce)} sin goce)` : ''}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-6 py-2">
            <div className="flex flex-col gap-0.5">
              <p className="font-bold uppercase">Ingresos</p>
              <Renglon e={p.tipo === 'aguinaldo' ? 'Aguinaldo' : p.tipo === 'bono14' ? 'Bono 14' : contrato ? 'Salario ordinario' : 'Honorarios'} v={Number(x.salario_devengado)} />
              <Renglon e="Bonificación incentiva" v={Number(x.bonificacion_incentiva)} nota="(Decreto 37-2001)" />
              <Renglon e="Horas extra" v={Number(x.valor_horas_extra)} nota={Number(x.horas_extra) > 0 ? `(${dias(x.horas_extra)} h)` : undefined} />
              <Renglon e="Comisiones" v={Number(x.comisiones)} />
              <Renglon e={contrato ? 'Otros bonos' : 'Otros pagos'} v={Number(x.otros_bonos) + Number(x.bonos_adicionales)} />
              <div className="mt-1 flex justify-between border-t border-black pt-1 font-semibold">
                <span>Total ingresos</span>
                <span className="tabular-nums">{q(x.total_devengado)}</span>
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="font-bold uppercase">Descuentos</p>
              <Renglon e="IGSS laboral (4.83 %)" v={Number(x.igss_laboral)} />
              <Renglon e={contrato ? 'ISR' : 'Retención de ISR'} v={Number(x.isr)} />
              {x.aplicadas.map((a, i) => (
                <Renglon key={i} e={a.deduccion?.descripcion ?? 'Deducción'} v={Number(a.monto)} />
              ))}
              <Renglon e={x.otros_descuentos_detalle ?? 'Otros descuentos'} v={Number(x.otros_descuentos)} />
              <div className="mt-1 flex justify-between border-t border-black pt-1 font-semibold">
                <span>Total descuentos</span>
                <span className="tabular-nums">{q(x.total_descuentos)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-end justify-between gap-4 border-t border-black pt-2">
            <p>
              {FORMAS_PAGO[x.forma_pago ?? ''] ?? ''}
              {x.banco ? ` · ${x.banco}` : ''}
              {x.numero_cuenta ? ` · cuenta ${x.numero_cuenta}` : ''}
            </p>
            <p className="text-sm font-bold">Líquido a recibir: Q{q(x.liquido)}</p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-10 text-center">
            <p className="border-t border-black pt-1">Recibí conforme · {x.nombre}</p>
            <p className="border-t border-black pt-1">Recursos Humanos</p>
          </div>
        </article>
      ))}
    </main>
  )
}
