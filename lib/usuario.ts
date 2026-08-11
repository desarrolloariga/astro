import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type Rol =
  | 'admin'
  | 'coordinador'
  | 'supervisor'
  | 'asesor'
  | 'embajador'
  | 'tienda'
  | 'produccion'
  | 'contabilidad'

export type UsuarioActual = {
  id: number
  nombre: string
  correo: string
  rol: Rol
  tienda_id: number | null
}

/**
 * Usuario ASTRO de la sesión actual (fila de public.usuarios + rol).
 * Redirige a /login si no hay sesión o el usuario no existe en ASTRO
 * (p. ej. credenciales del otro sistema del proyecto compartido).
 */
export async function obtenerUsuarioActual(): Promise<UsuarioActual> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('usuarios')
    .select('id, nombre, correo, tienda_id, roles(nombre)')
    .eq('auth_uid', user.id)
    .eq('activo', true)
    .single()

  if (!data) redirect('/login?error=Tu%20usuario%20no%20tiene%20acceso%20a%20ASTRO')

  const roles = data.roles as unknown as { nombre: string } | null

  return {
    id: data.id,
    nombre: data.nombre,
    correo: data.correo,
    rol: (roles?.nombre ?? 'embajador') as Rol,
    tienda_id: data.tienda_id,
  }
}
