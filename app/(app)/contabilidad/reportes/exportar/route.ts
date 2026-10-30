import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { hoyGuatemala, rangoMes } from '@/lib/contabilidad'
import { esFecha } from '@/lib/contabilidad-general'
import { REPORTES, construirReporte, type ClaveReporte } from '@/lib/reportes/contables'
import { responderReporte } from '@/lib/reportes/respuesta'

/** Reportes y libros (vista previa) en Excel o PDF: ?reporte=…&desde&hasta&nivel&formato=xlsx|pdf */
export async function GET(request: Request) {
  if (!(await tienePermiso('contabilidad', 'ver'))) return new Response('Sin permiso', { status: 403 })
  const p = new URL(request.url).searchParams
  const clave = p.get('reporte') as ClaveReporte
  if (!REPORTES[clave]) return new Response('Reporte desconocido', { status: 400 })
  const mes = rangoMes(hoyGuatemala())
  const desde = esFecha(p.get('desde') ?? undefined) ? (p.get('desde') as string) : mes.desde
  const hasta = esFecha(p.get('hasta') ?? undefined) ? (p.get('hasta') as string) : mes.hasta
  const supabase = await createClient()
  try {
    const reporte = await construirReporte(supabase, clave, { desde, hasta, nivel: Number(p.get('nivel')) || undefined })
    if (REPORTES[clave].libro) reporte.marca = 'VISTA PREVIA'
    return responderReporte(reporte, p.get('formato') === 'pdf' ? 'pdf' : 'xlsx')
  } catch (e) {
    return new Response(e instanceof Error ? e.message : 'Error al generar el reporte', { status: 400 })
  }
}
