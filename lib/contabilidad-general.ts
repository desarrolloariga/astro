/** Catálogos y utilidades de la contabilidad general (partida doble). */

export type TipoCuenta = 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'costo' | 'gasto'

export const TIPOS_CUENTA: { valor: TipoCuenta; etiqueta: string; digito: string }[] = [
  { valor: 'activo', etiqueta: 'Activo', digito: '1' },
  { valor: 'pasivo', etiqueta: 'Pasivo', digito: '2' },
  { valor: 'patrimonio', etiqueta: 'Patrimonio', digito: '3' },
  { valor: 'ingreso', etiqueta: 'Ingreso', digito: '4' },
  { valor: 'costo', etiqueta: 'Costo', digito: '5' },
  { valor: 'gasto', etiqueta: 'Gasto', digito: '6' },
]

export const etiquetaTipoCuenta = (t: string) => TIPOS_CUENTA.find((x) => x.valor === t)?.etiqueta ?? t

export const TIPOS_PARTIDA: Record<string, string> = {
  apertura: 'Apertura',
  manual: 'Manual',
  ajuste: 'Ajuste',
  automatica: 'Automática',
  reversion: 'Reversión',
  cierre: 'Cierre',
}

export const ESTADOS_PARTIDA: Record<string, string> = {
  borrador: 'Borrador',
  contabilizada: 'Contabilizada',
  anulada: 'Anulada',
}

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export type CuentaDetalle = {
  id: number
  codigo: string
  nombre: string
  tipo: TipoCuenta
  exige_centro_costo: boolean
}

export type CentroCosto = { id: number; codigo: string; nombre: string }

/** Monto contable: 2 decimales con separador de miles, sin símbolo (Q va en el encabezado). */
export function montoContable(valor: number | string | null | undefined) {
  const n = Number(valor ?? 0)
  return n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Redondeo a centavos para comparar Debe y Haber sin errores de coma flotante. */
export const centavos = (n: number) => Math.round(n * 100)

/** Número de partida visible: 2026-000123. */
export const numeroPartida = (anio: number, numero: number | null) =>
  numero == null ? 'Borrador' : `${anio}-${String(numero).padStart(6, '0')}`

/** Ancho de cada segmento según el nivel (máscara 9.99.99.999). */
const ANCHO_SEGMENTO = [1, 2, 2, 3]

/** Siguiente código libre para una subcuenta de `padre` (ej. 1.01.03 → 1.01.03.004). */
export function siguienteCodigo(padre: string, codigosHijos: string[]) {
  const nivelHijo = padre.split('.').length + 1
  const ancho = ANCHO_SEGMENTO[nivelHijo - 1] ?? 3
  const usados = codigosHijos.map((c) => Number(c.split('.').pop())).filter(Number.isFinite)
  const siguiente = (usados.length ? Math.max(...usados) : 0) + 1
  return `${padre}.${String(siguiente).padStart(ancho, '0')}`
}

/** Último día del mes. */
export function finDeMes(anio: number, mes: number) {
  return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10)
}

export const esFecha = (v: string | undefined): v is string => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '')

export const clasesCampo =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'

/** Período en formato SAT: "Del 01 al 31 de Octubre de 2026". */
export function textoPeriodo(desde: string, hasta: string) {
  const [a1, m1, d1] = desde.split('-')
  const [a2, m2, d2] = hasta.split('-')
  const mes = (m: string) => MESES[Number(m) - 1]
  if (a1 === a2 && m1 === m2) return `Del ${d1} al ${d2} de ${mes(m2)} de ${a2}`
  if (a1 === a2) return `Del ${d1} de ${mes(m1)} al ${d2} de ${mes(m2)} de ${a2}`
  return `Del ${d1} de ${mes(m1)} de ${a1} al ${d2} de ${mes(m2)} de ${a2}`
}

/** "Al 31 de Octubre de 2026" para reportes a una fecha. */
export function textoAlCorte(hasta: string) {
  const [a, m, d] = hasta.split('-')
  return `Al ${d} de ${MESES[Number(m) - 1]} de ${a}`
}

/** Nombre visible de cada origen de partida automática. */
export const ORIGENES_CONTABLES: Record<string, string> = {
  venta: 'Venta',
  venta_costo: 'Costo de venta',
  pago: 'Cobro',
  bolsa: 'Billetera ASTRO',
  gasto: 'Gasto',
  banco: 'Movimiento bancario',
  compra: 'Orden de compra',
  metal: 'Recepción de oro y plata',
  liquidacion: 'Liquidación de comisiones',
  canje: 'Premio entregado',
  saldo_banco: 'Saldo inicial de cuenta bancaria',
  toma: 'Toma física',
  factura_proveedor: 'Factura de proveedor',
  depreciacion: 'Depreciación de activos fijos',
  baja_activo: 'Baja de activo fijo',
  cierre: 'Cierre del ejercicio',
  apertura: 'Apertura',
  reversion: 'Reversión',
}
