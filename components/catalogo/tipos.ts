export type PiezaCatalogo = {
  id: number
  codigo: string
  nombre: string
  descripcion?: string | null
  categoria: string | null
  material: string | null
  peso_gramos: number | null
  kilataje: string | null
  piedras?: string | null
  precio_venta: number | null
  imagen_principal: string | null
  estado?: string
  tienda?: string | null
  moneda_id?: number | null
  imagenes?: { url: string; orden: number }[] | null
  modo_inventario?: 'pieza_unica' | 'por_cantidad'
  stock_disponible?: number | null
}
