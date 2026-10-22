import type { ReactNode } from 'react'

/** Configuración de una serie: etiqueta y color (variable CSS o color). */
export type ChartConfig = Record<string, { label?: ReactNode; color?: string }>

export const formatearValorGrafico = (
  valor: number,
  formato: 'numero' | 'precio',
  sufijo: string,
  fmtNumero: (n: number) => string,
  fmtPrecio: (n: number) => string,
) => (formato === 'precio' ? fmtPrecio(valor) : fmtNumero(valor)) + sufijo
