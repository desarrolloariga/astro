import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { textoAlCorte } from '@/lib/contabilidad-general'
import { cargarEmpresa, type ReporteTabla } from '@/lib/reportes/tabla'
import { responderReporte } from '@/lib/reportes/respuesta'

type Item = { fecha: string; descripcion: string | null; referencia: string | null; monto: number }

/** Reporte de conciliación bancaria en Excel o PDF. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await tienePermiso('bancos', 'gestionar'))) return new Response('Sin permiso', { status: 403 })
  const { id } = await params
  const formato = new URL(request.url).searchParams.get('formato') === 'pdf' ? 'pdf' : 'xlsx'
  const supabase = await createClient()
  const [{ data, error }, empresa] = await Promise.all([
    supabase.rpc('fn_banco_reporte_conciliacion', { p_estado_id: Number(id) }),
    cargarEmpresa(supabase),
  ])
  if (error || !data) return new Response(error?.message ?? 'No existe', { status: 400 })
  const r = data as {
    cuenta: { nombre: string; banco: string | null; numero: string | null; moneda: string }
    hasta: string
    saldo_banco: number
    depositos_transito: number
    lista_transito: Item[]
    pagos_circulacion: number
    lista_circulacion: Item[]
    no_registradas: number
    lista_no_registradas: Item[]
    saldo_conciliado: number
    saldo_libros: number
    diferencia: number
  }
  const detalle = (lista: Item[], signo: number) =>
    lista.map((i) => ({ concepto: `    ${i.descripcion ?? ''}`, fecha: i.fecha, referencia: i.referencia, detalle: signo * Number(i.monto) }))
  const filas = [
    { concepto: 'Saldo según estado de cuenta del banco', total: r.saldo_banco },
    { concepto: '(+) Depósitos en tránsito', total: r.depositos_transito },
    ...detalle(r.lista_transito, 1),
    { concepto: '(−) Pagos y cheques en circulación', total: -r.pagos_circulacion },
    ...detalle(r.lista_circulacion, -1),
    { concepto: '(±) Partidas del banco aún no registradas en libros', total: -r.no_registradas },
    ...detalle(r.lista_no_registradas, -1),
    { concepto: 'Saldo conciliado', total: r.saldo_conciliado },
    { concepto: 'Saldo según libro de bancos', total: r.saldo_libros },
  ]
  const reporte: ReporteTabla = {
    ...empresa,
    titulo: `Conciliación bancaria · ${r.cuenta.nombre}${r.cuenta.numero ? ` (${r.cuenta.numero})` : ''}${r.cuenta.moneda === 'USD' ? ' · en dólares' : ''}`,
    periodo: textoAlCorte(r.hasta),
    nombreArchivo: `conciliacion-${r.cuenta.nombre.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${r.hasta}`,
    orientacion: 'vertical',
    columnas: [
      { titulo: 'Concepto', clave: 'concepto', ancho: 40 },
      { titulo: 'Fecha', clave: 'fecha', ancho: 10, tipo: 'fecha' },
      { titulo: 'Referencia', clave: 'referencia', ancho: 12 },
      { titulo: 'Detalle', clave: 'detalle', ancho: 12, tipo: 'monto' },
      { titulo: 'Total', clave: 'total', ancho: 12, tipo: 'monto' },
    ],
    filas,
    totales: { concepto: Number(r.diferencia) === 0 ? 'Diferencia: cuadra' : 'Diferencia', total: r.diferencia },
  }
  return responderReporte(reporte, formato)
}
