/** Filtros, facetas, orden y paginación compartidos por el catálogo interno y el público. */

export const TAMANO_PAGINA = 24

export type OrdenCatalogo = 'recientes' | 'precio_asc' | 'precio_desc'

export const OPCIONES_ORDEN: { valor: OrdenCatalogo; etiqueta: string }[] = [
  { valor: 'recientes', etiqueta: 'Más recientes' },
  { valor: 'precio_asc', etiqueta: 'Precio: menor a mayor' },
  { valor: 'precio_desc', etiqueta: 'Precio: mayor a menor' },
]

export type FiltrosCatalogo = {
  buscar: string
  categoria: string
  material: string
  precioMax: number | null
  kilataje: string
  orden: OrdenCatalogo
  pagina: number
}

type SearchParamsCatalogo = Record<string, string | string[] | undefined>

function unoSolo(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] : valor
}

export function parsearFiltros(searchParams: SearchParamsCatalogo): FiltrosCatalogo {
  const precioMaxRaw = unoSolo(searchParams.precio_max)
  const precioMax = precioMaxRaw ? Number(precioMaxRaw) : null
  const paginaRaw = Number(unoSolo(searchParams.pagina) ?? '1')
  const ordenRaw = unoSolo(searchParams.orden)

  return {
    buscar: (unoSolo(searchParams.buscar) ?? '').trim(),
    categoria: (unoSolo(searchParams.categoria) ?? '').trim(),
    material: (unoSolo(searchParams.material) ?? '').trim(),
    precioMax: precioMax != null && Number.isFinite(precioMax) ? precioMax : null,
    kilataje: (unoSolo(searchParams.kilataje) ?? '').trim(),
    orden: ordenRaw === 'precio_asc' || ordenRaw === 'precio_desc' ? ordenRaw : 'recientes',
    pagina: Number.isFinite(paginaRaw) && paginaRaw > 0 ? Math.floor(paginaRaw) : 1,
  }
}

export function construirQueryString(
  filtros: FiltrosCatalogo,
  overrides: Partial<FiltrosCatalogo> = {},
) {
  const f = { ...filtros, ...overrides }
  const params = new URLSearchParams()
  if (f.buscar) params.set('buscar', f.buscar)
  if (f.categoria) params.set('categoria', f.categoria)
  if (f.material) params.set('material', f.material)
  if (f.precioMax != null) params.set('precio_max', String(f.precioMax))
  if (f.kilataje) params.set('kilataje', f.kilataje)
  if (f.orden !== 'recientes') params.set('orden', f.orden)
  if (f.pagina > 1) params.set('pagina', String(f.pagina))
  return params.toString()
}

type PiezaFaceta = {
  categoria?: string | null
  material?: string | null
  kilataje?: string | null
  precio_venta?: number | null
}

export type OpcionesFacetas = {
  categorias: string[]
  materiales: string[]
  kilatajes: string[]
  precioMin: number
  precioMax: number
}

function valoresUnicos(piezas: PiezaFaceta[], campo: 'categoria' | 'material' | 'kilataje') {
  const vistos = new Map<string, string>()
  for (const p of piezas) {
    const valor = p[campo]?.trim()
    if (valor) {
      const clave = valor.toLowerCase()
      if (!vistos.has(clave)) vistos.set(clave, valor)
    }
  }
  return Array.from(vistos.values()).sort((a, b) => a.localeCompare(b, 'es'))
}

/** Deriva categorías, materiales, kilatajes y rango de precio a partir de un arreglo de piezas. */
export function calcularOpcionesFacetas(piezas: PiezaFaceta[]): OpcionesFacetas {
  let precioMin = Infinity
  let precioMax = 0

  for (const p of piezas) {
    if (p.precio_venta != null) {
      if (p.precio_venta < precioMin) precioMin = p.precio_venta
      if (p.precio_venta > precioMax) precioMax = p.precio_venta
    }
  }

  if (!Number.isFinite(precioMin)) precioMin = 0
  if (precioMax <= precioMin) precioMax = precioMin + 1

  return {
    categorias: valoresUnicos(piezas, 'categoria'),
    materiales: valoresUnicos(piezas, 'material'),
    kilatajes: valoresUnicos(piezas, 'kilataje'),
    precioMin: Math.floor(precioMin),
    precioMax: Math.ceil(precioMax),
  }
}

type PiezaFiltrable = PiezaFaceta & { id: number; nombre: string; codigo: string }

/** Filtra + ordena en memoria (usado solo por el catálogo público sobre el arreglo del RPC). */
export function aplicarFiltrosPiezas<T extends PiezaFiltrable>(
  piezas: T[],
  filtros: FiltrosCatalogo,
): T[] {
  const buscar = filtros.buscar.toLowerCase()
  const kilatajeFiltro = filtros.kilataje.trim().toLowerCase()

  const filtradas = piezas.filter((p) => {
    if (buscar && !`${p.nombre} ${p.codigo}`.toLowerCase().includes(buscar)) return false
    if (filtros.categoria && p.categoria?.trim() !== filtros.categoria) return false
    if (filtros.material && p.material?.trim() !== filtros.material) return false
    if (kilatajeFiltro && (p.kilataje?.trim().toLowerCase() ?? '') !== kilatajeFiltro) return false
    if (filtros.precioMax != null && p.precio_venta != null && p.precio_venta > filtros.precioMax) {
      return false
    }
    return true
  })

  return ordenarPiezas(filtradas, filtros.orden)
}

function ordenarPiezas<T extends { id: number; precio_venta?: number | null }>(
  piezas: T[],
  orden: OrdenCatalogo,
): T[] {
  const copia = [...piezas]
  if (orden === 'precio_asc') {
    copia.sort((a, b) => (a.precio_venta ?? Infinity) - (b.precio_venta ?? Infinity) || b.id - a.id)
  } else if (orden === 'precio_desc') {
    copia.sort((a, b) => (b.precio_venta ?? -Infinity) - (a.precio_venta ?? -Infinity) || b.id - a.id)
  } else {
    copia.sort((a, b) => b.id - a.id)
  }
  return copia
}

export function paginar<T>(items: T[], pagina: number, tamano = TAMANO_PAGINA) {
  const totalPaginas = Math.max(1, Math.ceil(items.length / tamano))
  const paginaActual = Math.min(Math.max(1, pagina), totalPaginas)
  const inicio = (paginaActual - 1) * tamano
  return {
    items: items.slice(inicio, inicio + tamano),
    paginaActual,
    totalPaginas,
    total: items.length,
  }
}
