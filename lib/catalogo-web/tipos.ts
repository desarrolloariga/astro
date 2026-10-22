/** Tipos del catálogo web (backoffice y enlace público en computador). */

export type Contexto = 'backoffice' | 'publico'
export type Audiencia = 'todos' | 'backoffice' | 'publico'
export type CtaTipo = 'todo' | 'categoria' | 'ofertas' | 'generar_link' | 'url'

export type NombreIcono =
  | 'perfume' | 'bottle' | 'gem' | 'ring' | 'shirt' | 'headphones' | 'watch' | 'bag' | 'tag' | 'link'
  | 'pulse' | 'sparkle' | 'copy' | 'check' | 'search' | 'close' | 'back' | 'next' | 'arrowRight'
  | 'arrowLeft' | 'bell' | 'cart' | 'user' | 'users' | 'eye' | 'heart' | 'plus' | 'minus' | 'trash'
  | 'gift' | 'grid4' | 'grid9' | 'message' | 'mail' | 'qr' | 'bolt' | 'truck' | 'shield' | 'star'

export type Cta = { texto: string | null; tipo: CtaTipo; valor: string | null }

export type BannerWeb = {
  id: number
  etiqueta: string | null
  titulo: string
  texto: string | null
  cta: Cta
  imagen: string | null
  colorFondo: string
  colorEtiqueta: string
}

export type NovedadWeb = {
  id: number
  etiqueta: string | null
  titulo: string
  texto: string | null
  cta: Cta
  imagen: string | null
  colorFondo: string
}

export type PromoLateral = {
  etiqueta: string
  titulo: string
  cta_texto: string
  cta_tipo: CtaTipo
  cta_valor: string | null
  color_fondo: string
  color_boton: string
  imagen_url: string | null
  icono: NombreIcono
  audiencia: Audiencia
}

export type Beneficio = { icono: NombreIcono; titulo: string; texto: string; audiencia: Audiencia }

export type ConfigGeneral = { marca: string; subtitulo: string; dias_nuevo: number; popup_novedades: boolean }
export type ConfigOferta = { activa: boolean; titulo: string; subtitulo: string; fecha_fin: string | null }
export type ConfigBanda = { activa: boolean; titulo: string; texto: string; cta_texto: string }
export type ConfigPie = {
  descripcion: string
  columnas: { titulo: string; enlaces: string[] }[]
  telefono: string
  correo: string
  direccion: string
}

export type ConfigCatalogo = {
  general: ConfigGeneral
  anuncios: string[]
  banners: BannerWeb[]
  novedades: NovedadWeb[]
  promos: PromoLateral[]
  beneficios: Beneficio[]
  oferta: ConfigOferta
  banda: ConfigBanda
  pie: ConfigPie
}

export type CategoriaWeb = {
  /** Slug para la URL. */
  id: string
  nombre: string
  total: number
  imagen: string | null
  color: string | null
  icono: NombreIcono
}

export type ProductoWeb = {
  id: number
  codigo: string
  nombre: string
  descripcion: string | null
  categoria: string
  catId: string
  material: string | null
  kilataje: string | null
  piedras: string | null
  peso: number | null
  /** Precio público vigente (con descuento si lo hay). */
  pub: number
  /** Precio embajador; null si el usuario no es embajador o en el enlace público. */
  emb: number | null
  /** Precio anterior cuando la pieza está en oferta. */
  was: number | null
  isNew: boolean
  modo: 'pieza_unica' | 'por_cantidad'
  /** Unidades disponibles: por_cantidad = stock real; pieza única = 1 (0 si está en tránsito). */
  stock: number
  proximamente: boolean
  imagenes: string[]
  /** Recencia (ms desde epoch) para "Más recientes". */
  fecha: number
  vendidos: number
}

export type LineaWeb = {
  producto_id: number
  nombre: string
  precio: number
  imagen: string | null
  cantidad: number
  modo: 'pieza_unica' | 'por_cantidad'
  stock: number | null
}

export type ResultadoCarritoWeb = { ok: boolean; error?: string; items: LineaWeb[] }

export type ModoWeb = 'mi' | 'cliente'
