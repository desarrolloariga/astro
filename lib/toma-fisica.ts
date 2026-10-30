/** Estados de la toma física de inventario. */
export const ESTADOS_TOMA: Record<string, { etiqueta: string; clase: string }> = {
  en_conteo: { etiqueta: 'En conteo', clase: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  en_revision: { etiqueta: 'En revisión', clase: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  aprobada: { etiqueta: 'Aprobada', clase: 'bg-primary/10 text-primary' },
  cancelada: { etiqueta: 'Cancelada', clase: 'bg-muted text-muted-foreground' },
}

export type LineaToma = {
  id: number
  producto_id: number
  codigo: string
  nombre: string
  modo_inventario: string | null
  categoria: string | null
  peso_gramos: number | null
  cantidad_sistema: number | null
  cantidad_actual: number | null
  cantidad_contada: number | null
  agregada: boolean
  comentario: string | null
  costo_unitario: number | null
  contado_por: string | null
  fecha_conteo: string | null
}
