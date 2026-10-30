import 'server-only'
import { generarExcel } from './excel'
import { generarPdf } from './pdf'
import type { ReporteTabla } from './tabla'

/** Respuesta HTTP de descarga del reporte en Excel o PDF. */
export async function responderReporte(r: ReporteTabla, formato: string) {
  const pdf = formato === 'pdf'
  const contenido = pdf ? await generarPdf(r) : await generarExcel(r)
  return new Response(new Uint8Array(contenido), {
    headers: {
      'Content-Type': pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `${pdf ? 'inline' : 'attachment'}; filename="${r.nombreArchivo}.${pdf ? 'pdf' : 'xlsx'}"`,
      'Cache-Control': 'no-store',
    },
  })
}
