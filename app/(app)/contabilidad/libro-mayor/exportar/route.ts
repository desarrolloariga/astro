import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { hoyGuatemala, rangoMes } from '@/lib/contabilidad'
import { esFecha, numeroPartida, textoPeriodo } from '@/lib/contabilidad-general'
import { cargarEmpresa, type Columna, type ReporteTabla } from '@/lib/reportes/tabla'
import { responderReporte } from '@/lib/reportes/respuesta'

type Mov = {
  anio: number
  numero: number
  fecha: string
  partida: string
  codigo?: string
  cuenta?: string
  centro_costo?: string | null
  descripcion?: string | null
  debe: number
  haber: number
  saldo: number
}

/**
 * Libro mayor en Excel (o PDF) con una fila por movimiento y la cuenta en cada fila, listo para
 * integraciones: ?cuenta=ID (una cuenta; si es Madre, sus subcuentas) o sin cuenta (todas) &desde&hasta&cc&formato=xlsx|pdf
 */
export async function GET(request: Request) {
  if (!(await tienePermiso('contabilidad', 'ver'))) return new Response('Sin permiso', { status: 403 })
  const p = new URL(request.url).searchParams
  const mes = rangoMes(hoyGuatemala())
  const desde = esFecha(p.get('desde') ?? undefined) ? (p.get('desde') as string) : mes.desde
  const hasta = esFecha(p.get('hasta') ?? undefined) ? (p.get('hasta') as string) : mes.hasta
  const cuentaId = Number(p.get('cuenta')) || null
  const cc = Number(p.get('cc')) || null
  const formato = p.get('formato') === 'pdf' ? 'pdf' : 'xlsx'
  const supabase = await createClient()
  const empresa = await cargarEmpresa(supabase)
  const filas: Record<string, unknown>[] = []
  let titulo = 'Libro mayor'

  if (cuentaId) {
    const { data, error } = await supabase.rpc('fn_libro_mayor', { p_cuenta_id: cuentaId, p_desde: desde, p_hasta: hasta, p_centro_costo_id: cc })
    if (error) return new Response(error.message, { status: 400 })
    const m = data as { cuenta: { codigo: string; nombre: string; naturaleza: string }; saldo_anterior: number; movimientos: Mov[] }
    const s = m.cuenta.naturaleza === 'acreedora' ? -1 : 1
    titulo = `Libro mayor · ${m.cuenta.codigo} ${m.cuenta.nombre}`
    filas.push({ codigo: m.cuenta.codigo, cuenta: m.cuenta.nombre, concepto: 'Saldo anterior', saldo: s * Number(m.saldo_anterior) })
    for (const x of m.movimientos) {
      filas.push({
        codigo: x.codigo ?? m.cuenta.codigo,
        cuenta: x.cuenta ?? m.cuenta.nombre,
        fecha: x.fecha,
        partida: numeroPartida(x.anio, x.numero),
        concepto: [x.partida, x.descripcion].filter(Boolean).join(' · '),
        centro_costo: x.centro_costo ?? '',
        debe: Number(x.debe) || null,
        haber: Number(x.haber) || null,
        saldo: s * Number(x.saldo),
      })
    }
  } else {
    const { data, error } = await supabase.rpc('fn_libro_mayor_general', { p_desde: desde, p_hasta: hasta })
    if (error) return new Response(error.message, { status: 400 })
    const cuentas = (data ?? []) as { cuenta: { codigo: string; nombre: string; naturaleza: string }; saldo_anterior: number; movimientos: Mov[] }[]
    for (const c of cuentas) {
      const s = c.cuenta.naturaleza === 'acreedora' ? -1 : 1
      filas.push({ codigo: c.cuenta.codigo, cuenta: c.cuenta.nombre, concepto: 'Saldo anterior', saldo: s * Number(c.saldo_anterior) })
      for (const x of c.movimientos) {
        filas.push({
          codigo: c.cuenta.codigo,
          cuenta: c.cuenta.nombre,
          fecha: x.fecha,
          partida: numeroPartida(x.anio, x.numero),
          concepto: [x.partida, x.descripcion].filter(Boolean).join(' · '),
          centro_costo: x.centro_costo ?? '',
          debe: Number(x.debe) || null,
          haber: Number(x.haber) || null,
          saldo: s * Number(x.saldo),
        })
      }
    }
  }

  const columnas: Columna[] = [
    { titulo: 'Código', clave: 'codigo', ancho: 11 },
    { titulo: 'Cuenta', clave: 'cuenta', ancho: 24 },
    { titulo: 'Fecha', clave: 'fecha', ancho: 9, tipo: 'fecha' },
    { titulo: 'Partida', clave: 'partida', ancho: 10 },
    { titulo: 'Concepto', clave: 'concepto', ancho: 36 },
    { titulo: 'C. costo', clave: 'centro_costo', ancho: 8 },
    { titulo: 'Debe', clave: 'debe', ancho: 12, tipo: 'monto' },
    { titulo: 'Haber', clave: 'haber', ancho: 12, tipo: 'monto' },
    { titulo: 'Saldo', clave: 'saldo', ancho: 12, tipo: 'monto' },
  ]
  const reporte: ReporteTabla = {
    ...empresa,
    titulo,
    periodo: textoPeriodo(desde, hasta),
    nombreArchivo: `libro-mayor-${cuentaId ? `cuenta-${cuentaId}-` : ''}${desde}-${hasta}`,
    orientacion: 'horizontal',
    columnas,
    filas,
    nota: 'Una fila por movimiento con el código de cuenta en cada fila. Saldos en la naturaleza de cada cuenta (deudora o acreedora).',
  }
  return responderReporte(reporte, formato)
}
