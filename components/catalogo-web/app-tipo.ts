import type { CategoriaWeb, ConfigCatalogo, Contexto, Cta, LineaWeb, ModoWeb, ProductoWeb } from '@/lib/catalogo-web/tipos'
import type { Sort } from './tokens'

export type Filtros = { mat: string; kil: string; maxPrice: number | null; onlyStock: boolean }
export const FILTROS_VACIOS: Filtros = { mat: 'all', kil: 'all', maxPrice: null, onlyStock: false }

export type Linea = LineaWeb & { p: ProductoWeb | undefined }

export type Overlay =
  | { type: 'news'; index?: number }
  | { type: 'quick'; id: number }
  | { type: 'cart' }
  | null

/** Estado y acciones compartidos por todas las piezas del catálogo web. */
export type AppCatalogo = {
  contexto: Contexto
  vendedor: string | null
  /** El usuario tiene precio de embajador (y por lo tanto ganancia por pieza). */
  conPrecioEmbajador: boolean
  /** Cuenta mayorista: siempre compra para sí con el precio de su política. */
  mayorista: { politica: string; minimo: number } | null
  puedeLink: boolean
  config: ConfigCatalogo
  productos: ProductoWeb[]
  categorias: CategoriaWeb[]
  materiales: string[]
  kilatajes: string[]
  precioMin: number
  precioMax: number

  view: 'home' | 'category'
  mode: ModoWeb
  setMode: (m: ModoWeb) => void
  query: string
  setQuery: (q: string) => void
  cat: string
  setCat: (id: string) => void
  filters: Filtros
  setFilters: (f: Filtros) => void
  sort: Sort
  setSort: (s: Sort) => void
  cols: 3 | 4
  setCols: (n: 3 | 4) => void
  visible: number
  setVisible: (n: number) => void

  favs: number[]
  toggleFav: (id: number) => void

  lines: Linea[]
  cartCount: number
  cartTotal: number
  cartGain: number
  cartBusy: boolean

  goHome: () => void
  goCategory: (id: string) => void
  goOffers: () => void
  clearFilters: () => void

  overlay: Overlay
  setOverlay: (o: Overlay) => void
  closeOverlay: () => void
  openQuick: (id: number) => void
  /** Abre el generador de links actual (sin cambiar su proceso), con la preselección indicada. */
  openLink: (scope?: 'all' | 'cat' | 'sel', valor?: string | number[]) => void
  runCta: (cta: Cta) => void

  addToCart: (id: number, qty: number) => void
  setQty: (id: number, qty: number) => void
  removeLine: (id: number) => void
  checkout: () => void

  unitPrice: (p: ProductoWeb) => number
  gain: (p: ProductoWeb) => number | null
  categoriaNombre: (id: string) => string
  rutaFicha: (id: number) => string
}
