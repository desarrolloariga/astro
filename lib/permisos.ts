import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Excepción individual (usuarios_permisos) > permiso por defecto
 * del rol (roles_permisos) > false. Espejo de public.fn_tiene_permiso.
 *
 * Memorizado por request: si el layout y la página preguntan por el
 * mismo permiso, se consulta una sola vez.
 */
export const tienePermiso = cache(async (modulo: string, accion: string): Promise<boolean> => {
  const supabase = await createClient()
  const { data } = await supabase.rpc('fn_tiene_permiso', { p_modulo: modulo, p_accion: accion })
  return data === true
})

export type PermisosExtra = { concedidos: string[]; revocados: string[] }

/**
 * Excepciones individuales del usuario actual, para que la
 * navegación muestre módulos fuera de su rol base cuando se le
 * concedió acceso puntual (o los oculte si se le revocó).
 */
export const obtenerPermisosExtra = cache(async (): Promise<PermisosExtra> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('usuarios_permisos')
    .select('concedido, permisos ( modulo, accion )')

  const concedidos: string[] = []
  const revocados: string[] = []

  for (const fila of (data ?? []) as unknown as {
    concedido: boolean
    permisos: { modulo: string; accion: string } | null
  }[]) {
    if (!fila.permisos) continue
    const clave = `${fila.permisos.modulo}.${fila.permisos.accion}`
    ;(fila.concedido ? concedidos : revocados).push(clave)
  }

  return { concedidos, revocados }
})
