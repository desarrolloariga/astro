import type { Filtros, Producto, RangoPrecio } from './tipos'

/** Minúsculas y sin tildes, para buscar "anillo" = "Anillo" y "cadena" = "cadéna". */
export const norm = (t: string | null | undefined) =>
  String(t ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

export function filtrarProductos(productos: Producto[], f: Filtros, q: string, rangos: RangoPrecio[]) {
  const nq = norm(q).trim()
  const rango = rangos.find((r) => r.id === f.precio) ?? rangos[0]
  const lista = productos.filter((p) => {
    if (f.cat !== 'all' && p.categoria !== f.cat) return false
    if (f.material !== 'all' && p.material !== f.material) return false
    if (f.kilataje !== 'all' && p.kilataje !== f.kilataje) return false
    if (rango?.min != null && p.precio < rango.min) return false
    if (rango?.max != null && p.precio > rango.max) return false
    if (nq && !norm(`${p.nombre} ${p.codigo} ${p.categoria ?? ''} ${p.material ?? ''} ${p.kilataje ?? ''} ${p.descripcion ?? ''}`).includes(nq))
      return false
    return true
  })
  if (f.orden === 'asc') lista.sort((a, b) => a.precio - b.precio)
  if (f.orden === 'desc') lista.sort((a, b) => b.precio - a.precio)
  if (f.orden === 'new') lista.sort((a, b) => b.id - a.id)
  return lista
}
