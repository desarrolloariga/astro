import 'server-only'
import ExcelJS from 'exceljs'
import { CIFRAS_EN_QUETZALES, ESTILO, type ReporteTabla } from './tabla'

/** Genera un .xlsx con el encabezado de 4 líneas, la tabla y la fila de totales. */
export async function generarExcel(r: ReporteTabla): Promise<Buffer> {
  const libro = new ExcelJS.Workbook()
  libro.creator = 'ASTRO'
  const hoja = libro.addWorksheet(r.titulo.slice(0, 31), {
    pageSetup: { orientation: r.orientacion === 'vertical' ? 'portrait' : 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  const n = r.columnas.length
  const lineas = [r.razonSocial + (r.nit ? ` · NIT ${r.nit}` : ''), r.titulo, r.periodo, CIFRAS_EN_QUETZALES]
  lineas.forEach((texto, i) => {
    const fila = hoja.addRow([texto])
    hoja.mergeCells(fila.number, 1, fila.number, n)
    fila.getCell(1).alignment = { horizontal: 'center' }
    fila.getCell(1).font = { bold: i < 2, size: i === 0 ? 13 : i === 1 ? 12 : 10, italic: i === 3 }
  })
  hoja.addRow([])

  const encabezado = hoja.addRow(r.columnas.map((c) => c.titulo))
  encabezado.eachCell((celda) => {
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2545' } }
    celda.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })
  hoja.views = [{ state: 'frozen', ySplit: encabezado.number }]

  const formato = (tipo?: string) => (tipo === 'monto' ? '#,##0.00' : tipo === 'numero' ? '#,##0.###' : undefined)
  const valor = (v: unknown, tipo?: string) => {
    if (v == null || v === '') return null
    if (tipo === 'monto' || tipo === 'numero') return Number(v)
    if (tipo === 'fecha') {
      const s = String(v).slice(0, 10)
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00Z`) : String(v)
    }
    return Array.isArray(v) ? v.join(', ') : String(v)
  }
  for (const f of r.filas) {
    const fila = hoja.addRow(r.columnas.map((c) => valor(f[c.clave], c.tipo)))
    const estilo = f[ESTILO]
    r.columnas.forEach((c, i) => {
      const celda = fila.getCell(i + 1)
      if (formato(c.tipo)) celda.numFmt = formato(c.tipo) as string
      if (c.tipo === 'fecha') celda.numFmt = 'dd/mm/yyyy'
      if (estilo) celda.font = { bold: true }
      if (estilo === 'titulo') celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
      if (estilo === 'subtotal' || estilo === 'total') celda.border = { top: { style: 'thin' } }
    })
  }
  if (r.totales) {
    const fila = hoja.addRow(r.columnas.map((c) => valor(r.totales?.[c.clave], c.tipo)))
    fila.eachCell((celda, i) => {
      celda.font = { bold: true }
      celda.border = { top: { style: 'thin' }, bottom: { style: 'double' } }
      const c = r.columnas[i - 1]
      if (formato(c?.tipo)) celda.numFmt = formato(c?.tipo) as string
    })
  }
  if (r.nota) {
    hoja.addRow([])
    const fila = hoja.addRow([r.nota])
    hoja.mergeCells(fila.number, 1, fila.number, n)
    fila.getCell(1).font = { italic: true, size: 9 }
  }
  r.columnas.forEach((c, i) => {
    hoja.getColumn(i + 1).width = c.ancho ?? (c.tipo === 'monto' ? 14 : c.tipo === 'fecha' ? 12 : 18)
  })
  return Buffer.from(await libro.xlsx.writeBuffer())
}
