/** Filtros y paginación server-side compartidos por las páginas de Inventario. */

export const TAMANO_PAGINA_INVENTARIO = 25

export type FiltrosInventario = {
  buscar: string
  categoriaId: number | null
  materialId: number | null
  estado: string
  tiendaId: number | null
  pagina: number
}

type SearchParamsInventario = Record<string, string | string[] | undefined>

function unoSolo(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] : valor
}

function aNumeroONull(valor: string | undefined): number | null {
  const texto = (valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto)
  return Number.isFinite(n) ? n : null
}

export function parsearFiltrosInventario(searchParams: SearchParamsInventario): FiltrosInventario {
  const paginaRaw = Number(unoSolo(searchParams.pagina) ?? '1')
  return {
    buscar: (unoSolo(searchParams.buscar) ?? '').trim(),
    categoriaId: aNumeroONull(unoSolo(searchParams.categoria_id)),
    materialId: aNumeroONull(unoSolo(searchParams.material_id)),
    estado: (unoSolo(searchParams.estado) ?? '').trim(),
    tiendaId: aNumeroONull(unoSolo(searchParams.tienda_id)),
    pagina: Number.isFinite(paginaRaw) && paginaRaw > 0 ? Math.floor(paginaRaw) : 1,
  }
}

export function construirQueryStringInventario(
  filtros: FiltrosInventario,
  overrides: Partial<FiltrosInventario> = {},
) {
  const f = { ...filtros, ...overrides }
  const params = new URLSearchParams()
  if (f.buscar) params.set('buscar', f.buscar)
  if (f.categoriaId != null) params.set('categoria_id', String(f.categoriaId))
  if (f.materialId != null) params.set('material_id', String(f.materialId))
  if (f.estado) params.set('estado', f.estado)
  if (f.tiendaId != null) params.set('tienda_id', String(f.tiendaId))
  if (f.pagina > 1) params.set('pagina', String(f.pagina))
  return params.toString()
}

export function calcularRango(pagina: number, tamano = TAMANO_PAGINA_INVENTARIO) {
  const desde = (pagina - 1) * tamano
  return { desde, hasta: desde + tamano - 1 }
}

export function calcularTotalPaginas(total: number, tamano = TAMANO_PAGINA_INVENTARIO) {
  return Math.max(1, Math.ceil(total / tamano))
}

export type Delta = { valor: number; direccion: 'up' | 'down' | 'flat' }

/**
 * Compara el valor de hoy contra el snapshot de ayer. `null` cuando no hay
 * snapshot previo (aún no corrió el cron, o es la primera vez) — nunca se
 * inventa un "0%" cuando en realidad no hay con qué comparar.
 */
export function calcularDelta(hoy: number, ayer: number | null): Delta | null {
  if (ayer == null) return null
  if (ayer === 0) return hoy === 0 ? { valor: 0, direccion: 'flat' } : null
  const cambio = ((hoy - ayer) / ayer) * 100
  const direccion = cambio > 0.05 ? 'up' : cambio < -0.05 ? 'down' : 'flat'
  return { valor: cambio, direccion }
}
