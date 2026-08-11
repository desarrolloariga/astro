/** Filtros y paginación server-side de la bandeja de solicitudes de reposición. */

export const TAMANO_PAGINA_SOLICITUDES = 20

export type FiltrosSolicitudes = {
  estado: string
  pagina: number
}

type SearchParamsSolicitudes = Record<string, string | string[] | undefined>

function unoSolo(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] : valor
}

export function parsearFiltrosSolicitudes(searchParams: SearchParamsSolicitudes): FiltrosSolicitudes {
  const paginaRaw = Number(unoSolo(searchParams.pagina) ?? '1')
  return {
    estado: (unoSolo(searchParams.estado) ?? '').trim(),
    pagina: Number.isFinite(paginaRaw) && paginaRaw > 0 ? Math.floor(paginaRaw) : 1,
  }
}

export function construirQueryStringSolicitudes(
  filtros: FiltrosSolicitudes,
  overrides: Partial<FiltrosSolicitudes> = {},
) {
  const f = { ...filtros, ...overrides }
  const params = new URLSearchParams()
  if (f.estado) params.set('estado', f.estado)
  if (f.pagina > 1) params.set('pagina', String(f.pagina))
  return params.toString()
}

export function calcularRangoSolicitudes(pagina: number, tamano = TAMANO_PAGINA_SOLICITUDES) {
  const desde = (pagina - 1) * tamano
  return { desde, hasta: desde + tamano - 1 }
}

export function calcularTotalPaginasSolicitudes(total: number, tamano = TAMANO_PAGINA_SOLICITUDES) {
  return Math.max(1, Math.ceil(total / tamano))
}
