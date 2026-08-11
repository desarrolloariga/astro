import { EstadoBadge, type ConfigEstado } from './estado-badge'

const estados: ConfigEstado = {
  en_produccion: { etiqueta: 'En producción', clases: 'bg-muted text-muted-foreground' },
  disponible_cedi: { etiqueta: 'Disponible CEDI', clases: 'bg-primary/10 text-primary' },
  en_transito: { etiqueta: 'En tránsito', clases: 'bg-accent text-accent-foreground' },
  disponible_tienda: { etiqueta: 'Disponible en tienda', clases: 'bg-primary/10 text-primary' },
  separada: { etiqueta: 'Separada', clases: 'bg-brand-deep-muted/40 text-brand-deep' },
  vendida: { etiqueta: 'Vendida', clases: 'bg-secondary text-secondary-foreground' },
  entregada: { etiqueta: 'Entregada', clases: 'bg-secondary text-secondary-foreground' },
  devuelta: { etiqueta: 'Devuelta', clases: 'bg-destructive/10 text-destructive' },
  baja: { etiqueta: 'Baja', clases: 'bg-destructive/10 text-destructive' },
}

export function EstadoPieza({ estado }: { estado: string }) {
  return <EstadoBadge estado={estado} config={estados} />
}
