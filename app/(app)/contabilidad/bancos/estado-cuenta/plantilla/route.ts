import ExcelJS from 'exceljs'
import { tienePermiso } from '@/lib/permisos'

/** Plantilla de estado de cuenta para bancos con formato no reconocido. */
export async function GET() {
  if (!(await tienePermiso('bancos', 'gestionar'))) return new Response('Sin permiso', { status: 403 })
  const libro = new ExcelJS.Workbook()
  const hoja = libro.addWorksheet('Estado de cuenta')
  hoja.addRow(['Fecha', 'Descripción', 'Referencia', 'Débito', 'Crédito', 'Saldo'])
  hoja.getRow(1).font = { bold: true }
  hoja.addRow([new Date(Date.UTC(2026, 9, 1, 12)), 'Depósito de cliente', 'DEP-001', null, 1500, 11500])
  hoja.addRow([new Date(Date.UTC(2026, 9, 2, 12)), 'Cheque 0015', '0015', 400, null, 11100])
  hoja.getColumn(1).numFmt = 'dd/mm/yyyy'
  ;[4, 5, 6].forEach((c) => (hoja.getColumn(c).numFmt = '#,##0.00'))
  hoja.columns.forEach((c, i) => (c.width = [12, 36, 14, 12, 12, 14][i]))
  const contenido = await libro.xlsx.writeBuffer()
  return new Response(new Uint8Array(contenido as ArrayBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla-estado-de-cuenta.xlsx"',
    },
  })
}
