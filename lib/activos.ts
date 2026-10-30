/** Tipos y catálogos de activos fijos. */

export const TIPOS_BAJA: Record<string, string> = {
  desecho: 'Desecho (sin valor)',
  venta: 'Venta',
  donacion: 'Donación',
  perdida: 'Pérdida o robo',
}

export type FilaActivo = {
  id: number
  codigo: string
  descripcion: string
  marca: string | null
  modelo: string | null
  serie: string | null
  estado: 'activo' | 'baja'
  fecha_adquisicion: string
  fecha_baja: string | null
  tipo_baja: string | null
  tipo: string
  ubicacion: string | null
  responsable: string | null
  centro_costo: string | null
  costo: number
  acumulada: number
  valor_libros: number
  vida_util_meses: number
  factura_proveedor_id: number | null
}

export type ConsultaActivos = {
  hasta: string
  filas: FilaActivo[]
  totales: { activos: number; costo: number; acumulada: number; valor_libros: number }
}

export type TipoActivo = {
  id: number
  prefijo: string
  nombre: string
  vida_util_meses: number
  porcentaje_anual: number
  cuenta_activo_id: number
  cuenta_depreciacion_id: number
  cuenta_gasto_id: number
  centro_costo_id: number | null
  activo: boolean
}
