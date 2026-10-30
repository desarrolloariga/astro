import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { hoyGuatemala } from '@/lib/contabilidad'
import { esFecha, textoAlCorte, textoPeriodo } from '@/lib/contabilidad-general'
import { ESTADOS_PAGO, TIPOS_DOCUMENTO_CXP, documentoProveedor, type AntiguedadCxp, type ConsultaCxp } from '@/lib/cxp'
import { cargarEmpresa, type ReporteTabla } from '@/lib/reportes/tabla'
import { responderReporte } from '@/lib/reportes/respuesta'

/** Reportes de cuentas por pagar: ?reporte=documentos|antiguedad&formato=xlsx|pdf */
export async function GET(request: Request) {
  if (!(await tienePermiso('contabilidad', 'ver'))) return new Response('Sin permiso', { status: 403 })
  const p = new URL(request.url).searchParams
  const formato = p.get('formato') === 'pdf' ? 'pdf' : 'xlsx'
  const hoy = hoyGuatemala()
  const supabase = await createClient()
  const empresa = await cargarEmpresa(supabase)

  if (p.get('reporte') === 'antiguedad') {
    const corte = esFecha(p.get('corte') ?? undefined) ? (p.get('corte') as string) : hoy
    const { data, error } = await supabase.rpc('fn_cxp_antiguedad', { p_corte: corte })
    if (error) return new Response(error.message, { status: 400 })
    const a = data as AntiguedadCxp
    const reporte: ReporteTabla = {
      ...empresa,
      titulo: 'Cartera de cuentas por pagar por días de atraso',
      periodo: textoAlCorte(corte),
      nombreArchivo: `cartera-cxp-${corte}`,
      columnas: [
        { titulo: 'Correlativo', clave: 'correlativo', ancho: 8, tipo: 'numero' },
        { titulo: 'Documento', clave: 'documento', ancho: 14 },
        { titulo: 'NIT', clave: 'nit', ancho: 10 },
        { titulo: 'Proveedor', clave: 'nombre', ancho: 20 },
        { titulo: 'Emisión', clave: 'fecha_emision', ancho: 9, tipo: 'fecha' },
        { titulo: 'Vence', clave: 'fecha_vencimiento', ancho: 9, tipo: 'fecha' },
        { titulo: 'Saldo', clave: 'saldo', ancho: 11, tipo: 'monto' },
        { titulo: 'Atraso', clave: 'dias_atraso', ancho: 6, tipo: 'numero' },
        { titulo: 'Por vencer', clave: 'por_vencer', ancho: 11, tipo: 'monto' },
        { titulo: '1–30', clave: 'tramo_1_30', ancho: 11, tipo: 'monto' },
        { titulo: '31–60', clave: 'tramo_31_60', ancho: 11, tipo: 'monto' },
        { titulo: '61–90', clave: 'tramo_61_90', ancho: 11, tipo: 'monto' },
        { titulo: '+90', clave: 'tramo_90', ancho: 11, tipo: 'monto' },
      ],
      filas: a.filas.map((f) => ({ ...f, documento: documentoProveedor(f.serie, f.numero) })),
      totales: { nombre: `Total (${a.totales.documentos} documentos)`, ...a.totales },
      nota: 'Días de atraso contados desde el vencimiento (o la emisión si el documento no tiene vencimiento) hasta la fecha de corte.',
    }
    return responderReporte(reporte, formato)
  }

  const desde = esFecha(p.get('desde') ?? undefined) ? (p.get('desde') as string) : `${hoy.slice(0, 4)}-01-01`
  const hasta = esFecha(p.get('hasta') ?? undefined) ? (p.get('hasta') as string) : hoy
  const { data, error } = await supabase.rpc('fn_cxp_consulta', {
    p_desde: desde,
    p_hasta: hasta,
    p_estado: p.get('estado') || null,
    p_proveedor_id: Number(p.get('proveedor')) || null,
    p_buscar: p.get('q') || null,
    p_offset: 0,
    p_limit: 5000,
  })
  if (error) return new Response(error.message, { status: 400 })
  const c = data as ConsultaCxp
  const reporte: ReporteTabla = {
    ...empresa,
    titulo: 'Documentos de cuentas por pagar',
    periodo: textoPeriodo(desde, hasta),
    nombreArchivo: `cxp-documentos-${desde}-${hasta}`,
    columnas: [
      { titulo: 'Correlativo', clave: 'correlativo', ancho: 8, tipo: 'numero' },
      { titulo: 'Tipo', clave: 'tipo', ancho: 12 },
      { titulo: 'Documento', clave: 'documento', ancho: 13 },
      { titulo: 'Emisión', clave: 'fecha_emision', ancho: 9, tipo: 'fecha' },
      { titulo: 'Vence', clave: 'fecha_vencimiento', ancho: 9, tipo: 'fecha' },
      { titulo: 'NIT', clave: 'nit', ancho: 10 },
      { titulo: 'Proveedor', clave: 'nombre', ancho: 18 },
      { titulo: 'Estado', clave: 'estado_texto', ancho: 10 },
      { titulo: 'Total', clave: 'total', ancho: 11, tipo: 'monto' },
      { titulo: 'IVA crédito', clave: 'iva_credito', ancho: 10, tipo: 'monto' },
      { titulo: 'Pagado', clave: 'pagado', ancho: 11, tipo: 'monto' },
      { titulo: 'Saldo', clave: 'saldo', ancho: 11, tipo: 'monto' },
    ],
    filas: c.filas.map((f) => ({
      ...f,
      tipo: TIPOS_DOCUMENTO_CXP[f.tipo_documento]?.etiqueta ?? f.tipo_documento,
      documento: documentoProveedor(f.serie, f.numero),
      estado_texto: ESTADOS_PAGO[f.estado_pago]?.etiqueta ?? f.estado_pago,
    })),
    totales: {
      nombre: `Total (${c.total} documentos)`,
      total: c.totales.total,
      iva_credito: c.totales.iva_credito,
      pagado: c.totales.pagado,
      saldo: c.totales.saldo,
    },
    nota: 'Liquidada: pagada por completo. Los documentos anulados no suman.',
  }
  return responderReporte(reporte, formato)
}
