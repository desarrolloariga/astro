import 'server-only'
import type { createClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

/** Definición de un reporte tabular con el encabezado obligatorio de 4 líneas (SAT). */
export type Columna = {
  titulo: string
  clave: string
  ancho?: number
  tipo?: 'texto' | 'monto' | 'numero' | 'fecha'
  alinear?: 'izquierda' | 'derecha' | 'centro'
}

export type ReporteTabla = {
  /** Línea 1: razón social de la empresa. */
  razonSocial: string
  nit?: string
  /** Línea 2: nombre del reporte. */
  titulo: string
  /** Línea 3: "Del 01 al 31 de Octubre de 2026" o "Al 31 de Octubre de 2026". */
  periodo: string
  columnas: Columna[]
  filas: Record<string, unknown>[]
  totales?: Record<string, unknown>
  /** Texto al pie (notas). */
  nota?: string
  orientacion?: 'vertical' | 'horizontal'
  nombreArchivo: string
  /** Libros oficiales: cada página lleva su folio, desde este número. */
  folioInicial?: number
  /** Texto de marca en cada página (ej. VISTA PREVIA). */
  marca?: string
}

/** Fila con estilo especial: encabezado de grupo, subtotal o total. */
export type EstiloFila = 'titulo' | 'subtotal' | 'total'
export const ESTILO = '_estilo'


/** Línea 4 obligatoria. */
export const CIFRAS_EN_QUETZALES = 'Cifras expresadas en Quetzales'

export async function cargarEmpresa(supabase: SupabaseClient) {
  const { data } = await supabase.from('empresa_contable').select('razon_social, nit').eq('id', 1).maybeSingle()
  const e = data as { razon_social: string; nit: string } | null
  return { razonSocial: e?.razon_social ?? 'ASTRO', nit: e?.nit ?? '' }
}

export function formatoCelda(valor: unknown, tipo: Columna['tipo']): string {
  if (valor == null || valor === '') return ''
  if (tipo === 'monto') return Number(valor).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (tipo === 'numero') return Number(valor).toLocaleString('es-GT', { maximumFractionDigits: 3 })
  if (tipo === 'fecha') {
    const s = String(valor).slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : String(valor)
  }
  return String(valor)
}
