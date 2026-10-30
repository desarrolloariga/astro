/** Catálogos y tipos de cuentas por pagar. */

export const TIPOS_DOCUMENTO_CXP: Record<string, { etiqueta: string; ivaCredito: boolean }> = {
  factura: { etiqueta: 'Factura FEL', ivaCredito: true },
  factura_pequeno_contribuyente: { etiqueta: 'Factura de pequeño contribuyente', ivaCredito: false },
  recibo: { etiqueta: 'Recibo', ivaCredito: false },
  otro: { etiqueta: 'Otro documento', ivaCredito: false },
}

export const ESTADOS_PAGO: Record<string, { etiqueta: string; clase: string }> = {
  pendiente: { etiqueta: 'Pendiente', clase: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  parcial: { etiqueta: 'Pago parcial', clase: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  pagada: { etiqueta: 'Liquidada', clase: 'bg-primary/10 text-primary' },
  anulada: { etiqueta: 'Anulada', clase: 'bg-muted text-muted-foreground' },
}

export type FilaCxp = {
  id: number
  correlativo: number
  origen: 'manual' | 'orden_compra'
  orden_compra_id: number | null
  proveedor_id: number | null
  tipo_documento: string
  serie: string | null
  numero: string
  numero_autorizacion: string | null
  fecha_emision: string
  fecha_vencimiento: string | null
  nit: string
  nombre: string
  descripcion: string | null
  total: number
  iva_credito: number
  estado: string
  pagado: number
  saldo: number
  estado_pago: string
  dias_vencida: number | null
}

export type ConsultaCxp = {
  total: number
  totales: { total: number; iva_credito: number; pagado: number; saldo: number; vencido: number }
  filas: FilaCxp[]
}

export type FilaAntiguedadCxp = {
  id: number
  correlativo: number
  serie: string | null
  numero: string
  nit: string
  nombre: string
  fecha_emision: string
  fecha_vencimiento: string | null
  total: number
  saldo: number
  dias_atraso: number
  por_vencer: number
  tramo_1_30: number
  tramo_31_60: number
  tramo_61_90: number
  tramo_90: number
}

export type AntiguedadCxp = {
  corte: string
  filas: FilaAntiguedadCxp[]
  totales: {
    total: number
    saldo: number
    documentos: number
    por_vencer: number
    tramo_1_30: number
    tramo_31_60: number
    tramo_61_90: number
    tramo_90: number
  }
}

export const documentoProveedor = (serie: string | null, numero: string) => (serie ? `${serie}-${numero}` : numero)

/** IVA incluido en un total al 12 %. */
export const ivaIncluido = (total: number) => Math.round((total * 12) / 112 * 100) / 100
