import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { textoPeriodo } from '@/lib/contabilidad-general'
import { FORMAS_PAGO, NOMBRE_TIPO_PLANILLA, periodoPlanilla } from '@/lib/rrhh'
import { cargarEmpresa, type Columna, type ReporteTabla } from '@/lib/reportes/tabla'
import { responderReporte } from '@/lib/reportes/respuesta'
import type { LineaPlanilla } from '../page'

/** Planilla en Excel o PDF con las columnas del formato de RRHH: ?formato=xlsx|pdf */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await tienePermiso('planilla', 'ver'))) return new Response('Sin permiso', { status: 403 })
  const { id } = await params
  const formato = new URL(request.url).searchParams.get('formato') === 'pdf' ? 'pdf' : 'xlsx'
  const supabase = await createClient()
  const [empresa, { data: p }, { data: l }] = await Promise.all([
    cargarEmpresa(supabase),
    supabase.from('planillas').select('*').eq('id', Number(id)).maybeSingle(),
    supabase.from('planilla_lineas').select('*').eq('planilla_id', Number(id)).order('nombre'),
  ])
  if (!p) return new Response('No existe la planilla', { status: 404 })
  const contrato = p.tipo === 'contrato'
  const lineas = (l ?? []) as LineaPlanilla[]
  const filas = lineas.map((x) => ({
    nombre: x.nombre,
    puesto: x.puesto,
    ingreso: x.fecha_ingreso,
    salario: x.salario_devengado,
    bonificacion: x.bonificacion_incentiva,
    dias: x.dias_laborados,
    extras: x.valor_horas_extra,
    otros: Number(x.otros_bonos) + Number(x.comisiones) + Number(x.bonos_adicionales),
    igss: x.igss_laboral,
    isr: x.isr,
    descuentos: Number(x.deducciones) + Number(x.otros_descuentos),
    liquido: x.liquido,
    forma: FORMAS_PAGO[x.forma_pago ?? ''] ?? '',
    cuenta: x.numero_cuenta,
    banco: x.banco,
  }))
  const suma = (k: keyof (typeof filas)[number]) => filas.reduce((s, f) => s + Number(f[k] ?? 0), 0)
  if (p.tipo === 'aguinaldo' || p.tipo === 'bono14') {
    const filasP = lineas.map((x) => ({
      nombre: x.nombre,
      puesto: x.puesto,
      ingreso: x.fecha_ingreso,
      promedio: x.salario_promedio,
      dias: x.dias_laborados,
      monto: x.salario_devengado,
      otros: x.bonos_adicionales,
      descuentos: x.otros_descuentos,
      liquido: x.liquido,
      forma: FORMAS_PAGO[x.forma_pago ?? ''] ?? '',
      cuenta: x.numero_cuenta,
      banco: x.banco,
    }))
    const sumaP = (k: keyof (typeof filasP)[number]) => filasP.reduce((s, f) => s + Number(f[k] ?? 0), 0)
    return responderReporte(
      {
        ...empresa,
        titulo: `${NOMBRE_TIPO_PLANILLA[p.tipo]} ${p.codigo}`,
        periodo: textoPeriodo(p.fecha_inicio, p.fecha_fin),
        nombreArchivo: `planilla-${p.codigo}`,
        orientacion: 'horizontal',
        columnas: [
          { titulo: 'Nombre', clave: 'nombre', ancho: 22 },
          { titulo: 'Puesto', clave: 'puesto', ancho: 14 },
          { titulo: 'Ingreso', clave: 'ingreso', ancho: 9, tipo: 'fecha' },
          { titulo: 'Salario promedio', clave: 'promedio', ancho: 11, tipo: 'monto' },
          { titulo: 'Días', clave: 'dias', ancho: 6, tipo: 'numero' },
          { titulo: p.tipo === 'aguinaldo' ? 'Aguinaldo' : 'Bono 14', clave: 'monto', ancho: 11, tipo: 'monto' },
          { titulo: 'Otros pagos', clave: 'otros', ancho: 10, tipo: 'monto' },
          { titulo: 'Descuentos', clave: 'descuentos', ancho: 10, tipo: 'monto' },
          { titulo: 'Líquido', clave: 'liquido', ancho: 11, tipo: 'monto' },
          { titulo: 'Forma de pago', clave: 'forma', ancho: 11 },
          { titulo: 'Cuenta', clave: 'cuenta', ancho: 13 },
          { titulo: 'Banco', clave: 'banco', ancho: 13 },
        ],
        filas: filasP,
        totales: { nombre: `Total (${filasP.length} colaboradores)`, monto: sumaP('monto'), otros: sumaP('otros'), descuentos: sumaP('descuentos'), liquido: sumaP('liquido') },
        nota: `${p.tipo === 'aguinaldo' ? 'Decreto 76-78' : 'Decreto 42-92'}: salario ordinario promedio × días laborados ÷ días del período. Exento de IGSS e ISR. Estado: ${p.estado}.`,
      },
      formato,
    )
  }
  const columnas: Columna[] = [
    { titulo: 'Nombre', clave: 'nombre', ancho: 22 },
    { titulo: 'Puesto', clave: 'puesto', ancho: 14 },
    { titulo: 'Ingreso', clave: 'ingreso', ancho: 9, tipo: 'fecha' },
    { titulo: 'Salario base', clave: 'salario', ancho: 11, tipo: 'monto' },
    ...(contrato ? [{ titulo: 'Bonif. incentiva', clave: 'bonificacion', ancho: 10, tipo: 'monto' } as Columna] : []),
    { titulo: contrato ? 'Días laborados' : 'Días por servicios', clave: 'dias', ancho: 7, tipo: 'numero' },
    { titulo: 'Extras', clave: 'extras', ancho: 10, tipo: 'monto' },
    { titulo: contrato ? 'Otros bonos' : 'Otros pagos', clave: 'otros', ancho: 10, tipo: 'monto' },
    ...(contrato ? [{ titulo: 'IGSS', clave: 'igss', ancho: 9, tipo: 'monto' } as Columna] : []),
    { titulo: 'ISR', clave: 'isr', ancho: 9, tipo: 'monto' },
    ...(contrato ? [{ titulo: 'Otros descuentos', clave: 'descuentos', ancho: 10, tipo: 'monto' } as Columna] : []),
    { titulo: 'Líquido', clave: 'liquido', ancho: 11, tipo: 'monto' },
    { titulo: 'Forma de pago', clave: 'forma', ancho: 11 },
    { titulo: 'Cuenta', clave: 'cuenta', ancho: 13 },
    { titulo: 'Banco', clave: 'banco', ancho: 13 },
  ]
  const reporte: ReporteTabla = {
    ...empresa,
    titulo: `${contrato ? 'Planilla por contrato laboral' : 'Planilla por otros pagos'} ${p.codigo}`,
    periodo: `${textoPeriodo(p.fecha_inicio, p.fecha_fin)} (${periodoPlanilla(p)})`,
    nombreArchivo: `planilla-${p.codigo}`,
    orientacion: 'horizontal',
    columnas,
    filas,
    totales: {
      nombre: `Total (${filas.length} colaboradores)`,
      salario: suma('salario'),
      bonificacion: suma('bonificacion'),
      extras: suma('extras'),
      otros: suma('otros'),
      igss: suma('igss'),
      isr: suma('isr'),
      descuentos: suma('descuentos'),
      liquido: suma('liquido'),
    },
    nota: contrato
      ? `Cuota patronal IGSS: Q${Number(p.total_patronal).toFixed(2)}. Provisiones de prestaciones: Q${Number(p.total_provisiones).toFixed(2)}. Estado: ${p.estado}.`
      : `Estado: ${p.estado}.`,
  }
  return responderReporte(reporte, formato)
}
