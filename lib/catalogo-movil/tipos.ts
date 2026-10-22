export type Producto = {
  id: number
  codigo: string
  nombre: string
  descripcion: string | null
  categoria: string | null
  material: string | null
  peso: number | null
  kilataje: string | null
  piedras: string | null
  precio: number
  imagenes: string[]
  modo: 'pieza_unica' | 'por_cantidad'
  /** Unidades disponibles (solo por_cantidad). */
  stock: number | null
  disponible: boolean
  /** Precio anterior cuando la pieza está en oferta. */
  precioAnterior?: number | null
  nuevo?: boolean
}

export type LineaCarrito = {
  producto_id: number
  codigo: string
  nombre: string
  precio: number
  imagen: string | null
  cantidad: number
  segundos: number
  modo: 'pieza_unica' | 'por_cantidad'
  stock: number | null
}

export type Orden = 'rel' | 'asc' | 'desc' | 'new'

export type Filtros = {
  cat: string
  precio: string
  material: string
  kilataje: string
  orden: Orden
}

export type RangoPrecio = { id: string; label: string; min: number | null; max: number | null }

export type Pantalla = 'home' | 'search' | 'favs' | 'detail' | 'cart' | 'checkout' | 'success'

export type InfoCatalogo = {
  token: string
  vendedor: string
  titulo: string
}

export const FILTROS_INICIALES: Filtros = { cat: 'all', precio: 'all', material: 'all', kilataje: 'all', orden: 'rel' }

export const ORDENES: { id: Orden; label: string }[] = [
  { id: 'rel', label: 'Relevancia' },
  { id: 'asc', label: 'Menor precio' },
  { id: 'desc', label: 'Mayor precio' },
  { id: 'new', label: 'Más recientes' },
]
