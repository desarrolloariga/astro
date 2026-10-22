import type { PiezaCatalogo } from '@/components/catalogo/tipos'
import type { ProductoWeb } from '@/lib/catalogo-web/tipos'
import type { ItemCarrito } from '@/lib/publico/carrito'
import { formatearPrecio } from '@/lib/formato'
import type { LineaCarrito, Producto, RangoPrecio } from './tipos'

/** Pieza de fn_catalogo_por_token → producto de la app móvil. */
export function adaptarProducto(p: PiezaCatalogo): Producto {
  const imagenes = (p.imagenes ?? [])
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map((i) => i.url)
  if (imagenes.length === 0 && p.imagen_principal) imagenes.push(p.imagen_principal)
  const modo = p.modo_inventario ?? 'pieza_unica'
  const stock = modo === 'por_cantidad' ? (p.stock_disponible ?? 0) : null
  return {
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    descripcion: p.descripcion ?? null,
    categoria: p.categoria,
    material: p.material,
    peso: p.peso_gramos,
    // "0" o vacío no es un kilataje real (piezas sin metal precioso).
    kilataje: p.kilataje && p.kilataje.trim() !== '0' ? p.kilataje.trim() : null,
    piedras: p.piedras ?? null,
    precio: Number(p.precio_venta ?? 0),
    imagenes,
    modo,
    stock,
    disponible: p.precio_venta != null && (modo === 'pieza_unica' || (stock ?? 0) > 0),
  }
}

/** Producto del catálogo web → producto de la app móvil (misma carga para las dos vistas). */
export function adaptarDesdeWeb(p: ProductoWeb): Producto {
  return {
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    descripcion: p.descripcion,
    categoria: p.categoria,
    material: p.material,
    peso: p.peso,
    kilataje: p.kilataje,
    piedras: p.piedras,
    precio: p.pub,
    imagenes: p.imagenes,
    modo: p.modo,
    stock: p.modo === 'por_cantidad' ? p.stock : null,
    disponible: p.stock > 0,
    precioAnterior: p.was,
    nuevo: p.isNew,
  }
}

/** Línea de fn_ver_carrito → línea de la app móvil. */
export function adaptarLinea(i: ItemCarrito): LineaCarrito {
  return {
    producto_id: i.producto_id,
    codigo: i.codigo,
    nombre: i.nombre,
    precio: Number(i.precio_venta ?? 0),
    imagen: i.imagen_principal,
    cantidad: i.cantidad,
    segundos: i.segundos_restantes,
    modo: i.modo_inventario,
    stock: i.stock_disponible,
  }
}

/** Redondea a un número "bonito" para los cortes de precio. */
function redondear(n: number) {
  if (n <= 0) return 0
  const paso = 10 ** Math.max(1, Math.floor(Math.log10(n)) - 1) * 5
  return Math.max(paso, Math.round(n / paso) * paso)
}

/**
 * Rangos de precio calculados con las piezas del enlace (tercios), para
 * que siempre repartan el catálogo real en lugar de cortes fijos.
 */
export function calcularRangosPrecio(productos: Producto[]): RangoPrecio[] {
  const todos: RangoPrecio = { id: 'all', label: 'Cualquier precio', min: null, max: null }
  const precios = productos.map((p) => p.precio).filter((n) => n > 0).sort((a, b) => a - b)
  if (precios.length < 3) return [todos]
  const c1 = redondear(precios[Math.floor(precios.length / 3)])
  const c2 = redondear(precios[Math.floor((precios.length * 2) / 3)])
  if (c2 <= c1) {
    return [
      todos,
      { id: 'low', label: `Hasta ${formatearPrecio(c1)}`, min: null, max: c1 },
      { id: 'high', label: `Más de ${formatearPrecio(c1)}`, min: c1, max: null },
    ]
  }
  return [
    todos,
    { id: 'low', label: `Hasta ${formatearPrecio(c1)}`, min: null, max: c1 },
    { id: 'mid', label: `${formatearPrecio(c1)} – ${formatearPrecio(c2)}`, min: c1, max: c2 },
    { id: 'high', label: `Más de ${formatearPrecio(c2)}`, min: c2, max: null },
  ]
}

/** Valores distintos de un campo, ordenados. */
export function valoresUnicos(productos: Producto[], campo: 'categoria' | 'material' | 'kilataje') {
  const conteo = new Map<string, number>()
  for (const p of productos) {
    const v = p[campo]?.trim()
    if (v) conteo.set(v, (conteo.get(v) ?? 0) + 1)
  }
  return [...conteo.entries()]
    .map(([valor, total]) => ({ valor, total }))
    .sort((a, b) => a.valor.localeCompare(b.valor, 'es'))
}
