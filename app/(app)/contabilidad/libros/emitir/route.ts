import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { esFecha } from '@/lib/contabilidad-general'
import { REPORTES, construirReporte, type ClaveReporte } from '@/lib/reportes/contables'
import { contarPaginas, generarPdf } from '@/lib/reportes/pdf'

function volver(request: Request, mensaje: string, clave: 'ok' | 'error' = 'error') {
  return Response.redirect(new URL(`/contabilidad/libros?${clave}=${encodeURIComponent(mensaje)}`, request.url), 303)
}

/**
 * Emisión oficial de un libro: genera el PDF foliado desde el siguiente folio,
 * registra la emisión (y los folios usados) y entrega el PDF.
 */
export async function POST(request: Request) {
  if (!(await tienePermiso('contabilidad', 'registrar'))) return volver(request, 'No tienes permiso para emitir libros oficiales')
  const f = await request.formData()
  const clave = String(f.get('reporte') ?? '') as ClaveReporte
  const desde = String(f.get('desde') ?? '')
  const hasta = String(f.get('hasta') ?? '')
  const def = REPORTES[clave]
  if (!def?.libro) return volver(request, 'Libro desconocido')
  if (!esFecha(hasta) || (!def.corte && (!esFecha(desde) || desde > hasta))) return volver(request, 'Rango de fechas no válido')
  const inicio = def.corte ? hasta : desde

  const supabase = await createClient()
  const { data: folio } = await supabase.rpc('fn_libro_siguiente_folio', { p_libro: def.libro })
  if (!folio) return volver(request, `Primero define el folio inicial del ${def.titulo.toLowerCase()}`)
  try {
    const reporte = await construirReporte(supabase, clave, { desde: inicio, hasta })
    reporte.folioInicial = folio as number
    const pdf = await generarPdf(reporte)
    const paginas = contarPaginas(pdf)
    const { error } = await supabase.rpc('fn_libro_registrar_emision', {
      p_libro: def.libro,
      p_desde: inicio,
      p_hasta: hasta,
      p_folio_desde: folio as number,
      p_paginas: paginas,
    })
    if (error) return volver(request, error.message)
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${reporte.nombreArchivo}-folios-${folio}-${(folio as number) + paginas - 1}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return volver(request, e instanceof Error ? e.message : 'No se pudo generar el libro')
  }
}
