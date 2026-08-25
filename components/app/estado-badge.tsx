import { cn } from '@/lib/utils'

export type ConfigEstado = Record<string, { etiqueta: string; clases: string }>

export function EstadoBadge({ estado, config }: { estado: string; config: ConfigEstado }) {
  const info = config[estado] ?? { etiqueta: estado, clases: 'bg-muted text-muted-foreground' }
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold',
        info.clases,
      )}
    >
      {info.etiqueta}
    </span>
  )
}

export const estadosSeparado: ConfigEstado = {
  activo: { etiqueta: 'Activo', clases: 'bg-primary/10 text-primary' },
  convertido: { etiqueta: 'Convertido en venta', clases: 'bg-secondary text-secondary-foreground' },
  liberado: { etiqueta: 'Liberado', clases: 'bg-muted text-muted-foreground' },
  vencido: { etiqueta: 'Vencido', clases: 'bg-destructive/10 text-destructive' },
}

export const estadosVenta: ConfigEstado = {
  registrada: { etiqueta: 'Registrada', clases: 'bg-accent text-accent-foreground' },
  pagada: { etiqueta: 'Pagada', clases: 'bg-primary/10 text-primary' },
  anulada: { etiqueta: 'Anulada', clases: 'bg-destructive/10 text-destructive' },
}

export const estadosPago: ConfigEstado = {
  pendiente: { etiqueta: 'Pago pendiente', clases: 'bg-accent text-accent-foreground' },
  confirmado: { etiqueta: 'Pago confirmado', clases: 'bg-primary/10 text-primary' },
  rechazado: { etiqueta: 'Pago rechazado', clases: 'bg-destructive/10 text-destructive' },
}

export const estadosPedido: ConfigEstado = {
  en_espera: { etiqueta: 'En espera de pago', clases: 'bg-accent text-accent-foreground' },
  listo_para_despacho: { etiqueta: 'Listo para despacho', clases: 'bg-brand-deep-muted/40 text-brand-deep' },
  despachado: { etiqueta: 'Despachado', clases: 'bg-secondary text-secondary-foreground' },
  entregado: { etiqueta: 'Entregado', clases: 'bg-primary/10 text-primary' },
}

export const estadosComprobante: ConfigEstado = {
  pendiente: { etiqueta: 'Pendiente de revisión', clases: 'bg-accent text-accent-foreground' },
  aprobado: { etiqueta: 'Aprobado', clases: 'bg-primary/10 text-primary' },
  rechazado: { etiqueta: 'Rechazado', clases: 'bg-destructive/10 text-destructive' },
}

export const estadosSolicitudReposicion: ConfigEstado = {
  pendiente: { etiqueta: 'Pendiente', clases: 'bg-accent text-accent-foreground' },
  en_proceso: { etiqueta: 'En proceso', clases: 'bg-brand-deep-muted/40 text-brand-deep' },
  atendida: { etiqueta: 'Atendida', clases: 'bg-primary/10 text-primary' },
  rechazada: { etiqueta: 'Rechazada', clases: 'bg-destructive/10 text-destructive' },
}

export const estadosCompra: ConfigEstado = {
  borrador: { etiqueta: 'Borrador', clases: 'bg-muted text-muted-foreground' },
  autorizada: { etiqueta: 'Autorizada', clases: 'bg-accent text-accent-foreground' },
  recibida_parcial: { etiqueta: 'Recepción parcial', clases: 'bg-accent text-accent-foreground' },
  recibida_total: { etiqueta: 'Recepción total', clases: 'bg-primary/10 text-primary' },
  facturada: { etiqueta: 'Facturada', clases: 'bg-primary/10 text-primary' },
  pagada: { etiqueta: 'Pagada', clases: 'bg-secondary text-secondary-foreground' },
  cancelada: { etiqueta: 'Cancelada', clases: 'bg-destructive/10 text-destructive' },
}

export const estadosImportacion: ConfigEstado = {
  borrador: { etiqueta: 'Borrador', clases: 'bg-muted text-muted-foreground' },
  autorizada: { etiqueta: 'Autorizada', clases: 'bg-accent text-accent-foreground' },
  en_transito: { etiqueta: 'En tránsito', clases: 'bg-accent text-accent-foreground' },
  recibida_parcial: { etiqueta: 'Recepción parcial', clases: 'bg-accent text-accent-foreground' },
  recibida_total: { etiqueta: 'Recepción total', clases: 'bg-brand-deep-muted/40 text-brand-deep' },
  nacionalizada: { etiqueta: 'Nacionalizada', clases: 'bg-primary/10 text-primary' },
  facturada: { etiqueta: 'Facturada', clases: 'bg-primary/10 text-primary' },
  pagada: { etiqueta: 'Pagada', clases: 'bg-secondary text-secondary-foreground' },
  cancelada: { etiqueta: 'Cancelada', clases: 'bg-destructive/10 text-destructive' },
}

export const estadosContratacion: ConfigEstado = {
  solicitada: { etiqueta: 'Solicitada', clases: 'bg-accent text-accent-foreground' },
  en_evaluacion: { etiqueta: 'En evaluación', clases: 'bg-brand-deep-muted/40 text-brand-deep' },
  aprobada: { etiqueta: 'Aprobada', clases: 'bg-primary/10 text-primary' },
  rechazada: { etiqueta: 'Rechazada', clases: 'bg-destructive/10 text-destructive' },
  contratada: { etiqueta: 'Contratada', clases: 'bg-secondary text-secondary-foreground' },
  cancelada: { etiqueta: 'Cancelada', clases: 'bg-destructive/10 text-destructive' },
}
