import 'server-only'
import ExcelJS from 'exceljs'
import Papa from 'papaparse'

/** Línea normalizada del estado de cuenta: monto positivo = crédito (entra), negativo = débito (sale). */
export type LineaEstado = {
  fila: number
  fecha: string
  descripcion: string | null
  referencia: string | null
  monto: number
  saldo: number | null
}

export type ResultadoLectura = {
  lineas: LineaEstado[]
  advertencias: string[]
  columnas: Record<string, string>
}

const sinAcentos = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const SINONIMOS: Record<string, string[]> = {
  fecha: ['fecha', 'fecha operacion', 'fecha de operacion', 'fecha movimiento', 'fecha valor', 'fecha transaccion', 'dia'],
  descripcion: ['descripcion', 'concepto', 'detalle', 'descripcion movimiento', 'movimiento', 'transaccion', 'glosa', 'nombre'],
  referencia: ['referencia', 'documento', 'no documento', 'num documento', 'numero documento', 'no referencia', 'numero', 'doc', 'cheque', 'no cheque', 'autorizacion'],
  debito: ['debito', 'debitos', 'cargo', 'cargos', 'retiro', 'retiros', 'debe', 'salida', 'salidas'],
  credito: ['credito', 'creditos', 'abono', 'abonos', 'deposito', 'depositos', 'haber', 'entrada', 'entradas'],
  monto: ['monto', 'importe', 'valor', 'cantidad'],
  saldo: ['saldo', 'saldo disponible', 'saldo contable', 'saldo final'],
}

function columnaDe(encabezado: string): string | null {
  const h = sinAcentos(encabezado)
  if (!h) return null
  for (const [clave, lista] of Object.entries(SINONIMOS)) {
    if (lista.some((s) => h === s)) return clave
  }
  for (const [clave, lista] of Object.entries(SINONIMOS)) {
    if (lista.some((s) => h.startsWith(s + ' ') || h.endsWith(' ' + s))) return clave
  }
  return null
}

/** Número desde celda: 1,234.56 · (1,234.56) · -1234.5 · Q1,234.56 · 1.234,56 */
export function aNumero(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let t = String(v).trim()
  if (!t) return null
  const negativo = /^\(.*\)$/.test(t) || /^-/.test(t) || /-$/.test(t)
  t = t.replace(/[()QqUSD$\s-]/g, '')
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.')
  else t = t.replace(/,/g, '')
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return negativo ? -n : n
}

/** Fecha ISO desde celda: Date de Excel, número serial, dd/mm/aaaa, dd-mm-aa, aaaa-mm-dd. */
export function aFecha(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000)
    return aFecha(d)
  }
  const t = String(v).trim()
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (m) {
    const anio = m[3].length === 2 ? `20${m[3]}` : m[3]
    const dia = Number(m[1])
    const mes = Number(m[2])
    const d = new Date(Date.UTC(Number(anio), mes - 1, dia))
    if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
    return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  }
  return null
}

function valorCelda(c: ExcelJS.CellValue): unknown {
  if (c && typeof c === 'object' && !(c instanceof Date)) {
    if ('result' in c) return (c as { result: unknown }).result
    if ('richText' in c) return (c as { richText: { text: string }[] }).richText.map((r) => r.text).join('')
    if ('text' in c) return (c as { text: string }).text
  }
  return c
}

async function leerFilas(nombre: string, contenido: ArrayBuffer): Promise<unknown[][]> {
  if (/\.(csv|txt)$/i.test(nombre)) {
    const texto = new TextDecoder('utf-8').decode(contenido).replace(/^﻿/, '')
    const r = Papa.parse<string[]>(texto, { skipEmptyLines: true, delimiter: '' })
    return r.data
  }
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(contenido)
  const hoja = libro.worksheets[0]
  if (!hoja) return []
  const filas: unknown[][] = []
  hoja.eachRow({ includeEmpty: false }, (fila) => {
    const valores = (fila.values as ExcelJS.CellValue[]).slice(1).map(valorCelda)
    filas.push(valores)
  })
  return filas
}

/** Lee un estado de cuenta en Excel (.xlsx) o CSV y lo normaliza. */
export async function leerEstadoCuenta(nombre: string, contenido: ArrayBuffer): Promise<ResultadoLectura> {
  const filas = await leerFilas(nombre, contenido)
  const advertencias: string[] = []
  // Encabezado: la primera fila (de las 20 primeras) que reconozca fecha y algún monto.
  let iEnc = -1
  let mapa: Record<number, string> = {}
  for (let i = 0; i < Math.min(filas.length, 20); i++) {
    const m: Record<number, string> = {}
    filas[i].forEach((v, j) => {
      const c = typeof v === 'string' ? columnaDe(v) : null
      if (c && !Object.values(m).includes(c)) m[j] = c
    })
    const tiene = Object.values(m)
    if (tiene.includes('fecha') && (tiene.includes('monto') || tiene.includes('debito') || tiene.includes('credito'))) {
      iEnc = i
      mapa = m
      break
    }
  }
  if (iEnc < 0) {
    throw new Error('No se encontró el encabezado: el archivo debe tener columnas Fecha y Débito/Crédito (o Monto). Usa la plantilla si tu banco usa otros nombres.')
  }
  const col = (clave: string) => Number(Object.entries(mapa).find(([, v]) => v === clave)?.[0] ?? -1)
  const [cF, cD, cR, cDeb, cCred, cMon, cSal] = ['fecha', 'descripcion', 'referencia', 'debito', 'credito', 'monto', 'saldo'].map(col)

  const lineas: LineaEstado[] = []
  for (let i = iEnc + 1; i < filas.length; i++) {
    const f = filas[i]
    const fecha = aFecha(f[cF])
    let monto: number | null = null
    if (cDeb >= 0 || cCred >= 0) {
      const deb = cDeb >= 0 ? aNumero(f[cDeb]) ?? 0 : 0
      const cred = cCred >= 0 ? aNumero(f[cCred]) ?? 0 : 0
      monto = Math.round((Math.abs(cred) - Math.abs(deb)) * 100) / 100
    } else if (cMon >= 0) {
      monto = aNumero(f[cMon])
    }
    if (!fecha) {
      if (monto) advertencias.push(`Fila ${i + 1}: fecha no reconocida, se omitió`)
      continue
    }
    if (!monto) continue
    const texto = (c: number) => (c >= 0 && f[c] != null && String(f[c]).trim() ? String(f[c]).trim() : null)
    lineas.push({
      fila: i + 1,
      fecha,
      descripcion: texto(cD),
      referencia: texto(cR),
      monto: Math.round(monto * 100) / 100,
      saldo: cSal >= 0 ? aNumero(f[cSal]) : null,
    })
  }
  const columnas = Object.fromEntries(Object.entries(mapa).map(([j, c]) => [c, String(filas[iEnc][Number(j)])]))
  return { lineas, advertencias, columnas }
}
