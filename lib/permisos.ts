import { cache } from 'react'
import { obtenerContexto } from '@/lib/contexto'

/**
 * Excepción individual (usuarios_permisos) > permiso por defecto del rol
 * (roles_permisos) > false. Misma regla que public.fn_tiene_permiso, pero
 * resuelta en memoria: los permisos vienen completos en el contexto de
 * sesión (una llamada por request), así que revisar 1 o 10 permisos en una
 * pantalla ya no cuesta viajes a la base.
 */
export const tienePermiso = cache(async (modulo: string, accion: string): Promise<boolean> => {
  const contexto = await obtenerContexto()
  return contexto?.permisos.has(`${modulo}.${accion}`) ?? false
})

export type PermisosExtra = { concedidos: string[]; revocados: string[] }

/**
 * Excepciones individuales del usuario actual, para que la navegación
 * muestre módulos fuera de su rol base cuando se le concedió acceso
 * puntual (o los oculte si se le revocó).
 */
export const obtenerPermisosExtra = cache(async (): Promise<PermisosExtra> => {
  const contexto = await obtenerContexto()
  return { concedidos: contexto?.concedidos ?? [], revocados: contexto?.revocados ?? [] }
})
