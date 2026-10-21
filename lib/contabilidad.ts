/** Catálogos compartidos del módulo de contabilidad (gastos y estado de resultados). */

export const CATEGORIAS_GASTO: { valor: string; etiqueta: string }[] = [
  { valor: 'nomina', etiqueta: 'Nómina y planilla' },
  { valor: 'alquiler', etiqueta: 'Alquiler' },
  { valor: 'servicios_basicos', etiqueta: 'Servicios (luz, agua, internet)' },
  { valor: 'marketing', etiqueta: 'Marketing y publicidad' },
  { valor: 'envios', etiqueta: 'Envíos y logística' },
  { valor: 'comisiones_bancarias', etiqueta: 'Comisiones bancarias' },
  { valor: 'tecnologia', etiqueta: 'Tecnología y software' },
  { valor: 'mantenimiento', etiqueta: 'Mantenimiento' },
  { valor: 'oficina', etiqueta: 'Oficina y papelería' },
  { valor: 'impuestos_tasas', etiqueta: 'Impuestos y tasas' },
  { valor: 'honorarios', etiqueta: 'Honorarios profesionales' },
  { valor: 'viaticos', etiqueta: 'Viáticos' },
  { valor: 'intereses', etiqueta: 'Intereses' },
  { valor: 'otros', etiqueta: 'Otros' },
]

export const CLASIFICACIONES_GASTO: { valor: string; etiqueta: string; detalle: string }[] = [
  { valor: 'operativo', etiqueta: 'Gasto operativo', detalle: 'Gastos del día a día del negocio' },
  { valor: 'financiero', etiqueta: 'Gasto financiero', detalle: 'Intereses, comisiones de préstamos' },
  { valor: 'otro_ingreso', etiqueta: 'Otro ingreso', detalle: 'Ingresos que no son ventas' },
]

export const METODOS_GASTO: { valor: string; etiqueta: string }[] = [
  { valor: 'transferencia', etiqueta: 'Transferencia' },
  { valor: 'deposito', etiqueta: 'Depósito' },
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta' },
  { valor: 'cheque', etiqueta: 'Cheque' },
]

export const etiquetaCategoria = (v: string) => CATEGORIAS_GASTO.find((c) => c.valor === v)?.etiqueta ?? v

/** Fechas en hora de Guatemala (YYYY-MM-DD). */
export function hoyGuatemala() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date())
}

/** Primer y último día del mes de una fecha YYYY-MM-DD. */
export function rangoMes(fecha: string) {
  const [a, m] = fecha.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const mm = String(m).padStart(2, '0')
  return { desde: `${a}-${mm}-01`, hasta: `${a}-${mm}-${String(ultimo).padStart(2, '0')}` }
}

/** Mismo rango desplazado al período inmediatamente anterior (misma cantidad de días; si es un mes completo, el mes anterior). */
export function rangoAnterior(desde: string, hasta: string) {
  const d = new Date(`${desde}T00:00:00Z`)
  const h = new Date(`${hasta}T00:00:00Z`)
  const esMesCompleto = desde.endsWith('-01') && rangoMes(desde).hasta === hasta
  if (esMesCompleto) {
    const previo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))
    return rangoMes(previo.toISOString().slice(0, 10))
  }
  const dias = Math.round((h.getTime() - d.getTime()) / 86_400_000) + 1
  const finPrevio = new Date(d.getTime() - 86_400_000)
  const inicioPrevio = new Date(finPrevio.getTime() - (dias - 1) * 86_400_000)
  return { desde: inicioPrevio.toISOString().slice(0, 10), hasta: finPrevio.toISOString().slice(0, 10) }
}

/** Origen de un movimiento del libro de bancos. */
export const nombresOrigen: Record<string, string> = {
  cobro_venta: 'Cobro de venta',
  gasto: 'Gasto',
  otro_ingreso: 'Otro ingreso',
  pago_proveedor: 'Pago a proveedor',
  pago_comisiones: 'Pago de comisiones',
  transferencia: 'Transferencia',
  comision_bancaria: 'Comisión bancaria',
  ajuste: 'Ajuste',
  otro: 'Otro',
}
