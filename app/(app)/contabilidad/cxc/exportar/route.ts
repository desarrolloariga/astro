import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { hoyGuatemala, rangoMes } from '@/lib/contabilidad'
import { esFecha, textoAlCorte, textoPeriodo } from '@/lib/contabilidad-general'
import { ESTADOS_COBRO, METODOS_COBRO, documentoFel, type Antiguedad, type ConsultaCxc } from '@/lib/cxc'
import { cargarEmpresa, type ReporteTabla } from '@/lib/reportes/tabla'
import { responderReporte } from '@/lib/reportes/respuesta'

/** Descarga de reportes de cuentas por cobrar: ?reporte=facturas|antiguedad&formato=xlsx|pdf */
export async function GET(request: Request) {
  if (!(await tienePermiso('contabilidad', 'ver'))) return new Response('Sin permiso', { status: 403 })
  const p = new URL(request.url).searchParams
  const formato = p.get('formato') === 'pdf' ? 'pdf' : 'xlsx'
  const hoy = hoyGuatemala()
  const supabase = await createClient()
  const empresa = await cargarEmpresa(supabase)

  if (p.get('reporte') === 'antiguedad') {
    const corte = esFecha(p.get('corte') ?? undefined) ? (p.get('corte') as string) : hoy
    const { data, error } = await supabase.rpc('fn_cxc_antiguedad', { p_corte: corte })
    if (error) return new Response(error.message, { status: 400 })
    const a = data as Antiguedad
    const reporte: ReporteTabla = {
      ...empresa,
      titulo: 'Antigüedad de saldos de cuentas por cobrar',
      periodo: textoAlCorte(corte),
      nombreArchivo: `antiguedad-cxc-${corte}`,
      columnas: [
        { titulo: 'Correlativo', clave: 'correlativo', ancho: 8, tipo: 'numero' },
        { titulo: 'Serie-Número FEL', clave: 'fel', ancho: 16 },
        { titulo: 'Venta', clave: 'venta_id', ancho: 7, tipo: 'numero' },
        { titulo: 'Fecha', clave: 'fecha_doc', ancho: 9, tipo: 'fecha' },
        { titulo: 'NIT', clave: 'nit', ancho: 10 },
        { titulo: 'Cliente', clave: 'cliente', ancho: 20 },
        { titulo: 'Monto', clave: 'total', ancho: 11, tipo: 'monto' },
        { titulo: 'Saldo', clave: 'saldo', ancho: 11, tipo: 'monto' },
        { titulo: 'Días', clave: 'dias', ancho: 6, tipo: 'numero' },
        { titulo: '0–30', clave: 'tramo_0_30', ancho: 11, tipo: 'monto' },
        { titulo: '31–60', clave: 'tramo_31_60', ancho: 11, tipo: 'monto' },
        { titulo: '61–90', clave: 'tramo_61_90', ancho: 11, tipo: 'monto' },
        { titulo: '+90', clave: 'tramo_90', ancho: 11, tipo: 'monto' },
      ],
      filas: a.filas.map((f) => ({ ...f, fel: documentoFel(f.serie, f.numero) || 'Sin factura', fecha_doc: f.fecha_factura ?? f.fecha })),
      totales: { cliente: `Total (${a.totales.documentos} documentos)`, ...a.totales },
      nota: 'Días contados desde la fecha de la factura (o de la venta si aún no tiene factura) hasta la fecha de corte.',
    }
    return responderReporte(reporte, formato)
  }

  const mes = rangoMes(hoy)
  const desde = esFecha(p.get('desde') ?? undefined) ? (p.get('desde') as string) : mes.desde
  const hasta = esFecha(p.get('hasta') ?? undefined) ? (p.get('hasta') as string) : mes.hasta
  const { data, error } = await supabase.rpc('fn_cxc_consulta', {
    p_desde: desde,
    p_hasta: hasta,
    p_estado: p.get('estado') || null,
    p_metodo: p.get('metodo') || null,
    p_factura: p.get('factura') || null,
    p_buscar: p.get('q') || null,
    p_offset: 0,
    p_limit: 5000,
  })
  if (error) return new Response(error.message, { status: 400 })
  const c = data as ConsultaCxc
  const reporte: ReporteTabla = {
    ...empresa,
    titulo: 'Facturas y cobros de ventas',
    periodo: textoPeriodo(desde, hasta),
    nombreArchivo: `cxc-facturas-${desde}-${hasta}`,
    columnas: [
      { titulo: 'Correlativo', clave: 'correlativo', ancho: 8, tipo: 'numero' },
      { titulo: 'Serie-Número FEL', clave: 'fel', ancho: 16 },
      { titulo: 'Fecha factura', clave: 'fecha_factura', ancho: 9, tipo: 'fecha' },
      { titulo: 'Venta', clave: 'venta_id', ancho: 7, tipo: 'numero' },
      { titulo: 'Fecha venta', clave: 'fecha', ancho: 9, tipo: 'fecha' },
      { titulo: 'NIT', clave: 'nit', ancho: 10 },
      { titulo: 'Cliente', clave: 'cliente', ancho: 18 },
      { titulo: 'Forma de pago', clave: 'formas', ancho: 16 },
      { titulo: 'Estado', clave: 'estado', ancho: 10 },
      { titulo: 'Monto', clave: 'total', ancho: 11, tipo: 'monto' },
      { titulo: 'En tránsito', clave: 'en_transito', ancho: 11, tipo: 'monto' },
      { titulo: 'Saldo', clave: 'saldo', ancho: 11, tipo: 'monto' },
    ],
    filas: c.filas.map((f) => ({
      ...f,
      fel: documentoFel(f.serie, f.numero) || 'Sin factura',
      formas: f.metodos.map((m) => METODOS_COBRO[m] ?? m).join(', '),
      estado: ESTADOS_COBRO[f.estado_cobro]?.etiqueta ?? f.estado_cobro,
    })),
    totales: { cliente: `Total (${c.total} ventas)`, total: c.totales.total, en_transito: c.totales.en_transito, saldo: c.totales.saldo },
    nota: 'Liquidada: el dinero está en bancos. En tránsito: cobro confirmado aún no depositado o liquidado. Pendiente: con saldo por cobrar. Las ventas anuladas no suman.',
  }
  return responderReporte(reporte, formato)
}
