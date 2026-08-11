/** Utilidades de formato regional (es-GT, GTQ) */

export function formatearPrecio(valor: number, moneda = 'GTQ') {
  return valor.toLocaleString('es-GT', { style: 'currency', currency: moneda })
}

export function formatearFecha(fecha: string | Date) {
  return new Date(fecha).toLocaleDateString('es-GT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Fecha corta para ejes de gráficas ("13 ago") — evita saturar el eje X. */
export function formatearFechaCorta(fecha: string | Date) {
  const valor = typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `${fecha}T00:00:00` : fecha
  return new Date(valor).toLocaleDateString('es-GT', { day: '2-digit', month: 'short' })
}

export function formatearFechaHora(fecha: string | Date) {
  return new Date(fecha).toLocaleString('es-GT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatearNumero(valor: number) {
  return valor.toLocaleString('es-GT')
}
