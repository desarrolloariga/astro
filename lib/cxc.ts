/** Catálogos y tipos de cuentas por cobrar. */

export const ESTADOS_COBRO: Record<string, { etiqueta: string; clase: string; detalle: string }> = {
  liquidada: { etiqueta: 'Liquidada', clase: 'bg-primary/10 text-primary', detalle: 'Cobrada y el dinero ya está en bancos' },
  en_transito: {
    etiqueta: 'En tránsito',
    clase: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    detalle: 'Cobro confirmado que aún no está depositado o liquidado en bancos',
  },
  pendiente: { etiqueta: 'Pendiente', clase: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', detalle: 'Con saldo por cobrar' },
  anulada: { etiqueta: 'Anulada', clase: 'bg-muted text-muted-foreground', detalle: 'Venta anulada' },
}

export const METODOS_COBRO: Record<string, string> = {
  tarjeta: 'Tarjeta / pasarela',
  transferencia: 'Transferencia',
  deposito: 'Depósito',
  canje: 'Canje Billetera ASTRO',
}

export type FilaCxc = {
  venta_id: number
  fecha: string
  canal: string
  estado_venta: string
  cliente: string
  pedido_id: number | null
  factura_id: number | null
  correlativo: number | null
  serie: string | null
  numero: string | null
  fecha_factura: string | null
  nit: string
  total: number
  cobrado: number
  en_bancos: number
  en_transito: number
  saldo: number
  metodos: string[]
  estado_cobro: string
}

export type ConsultaCxc = {
  total: number
  totales: { total: number; cobrado: number; en_transito: number; saldo: number }
  filas: FilaCxc[]
}

export type FilaAntiguedad = {
  venta_id: number
  fecha: string
  cliente: string
  nit: string
  correlativo: number | null
  serie: string | null
  numero: string | null
  fecha_factura: string | null
  total: number
  saldo: number
  dias: number
  tramo_0_30: number
  tramo_31_60: number
  tramo_61_90: number
  tramo_90: number
}

export type Antiguedad = {
  corte: string
  filas: FilaAntiguedad[]
  totales: { total: number; saldo: number; tramo_0_30: number; tramo_31_60: number; tramo_61_90: number; tramo_90: number; documentos: number }
}

export const documentoFel = (serie: string | null, numero: string | null) => (serie && numero ? `${serie}-${numero}` : '')
