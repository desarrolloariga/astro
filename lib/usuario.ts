import { cache } from 'react'
import { redirect } from 'next/navigation'
import { haySesion, obtenerContexto } from '@/lib/contexto'

export type Rol =
  | 'admin'
  | 'coordinador'
  | 'supervisor'
  | 'asesor'
  | 'embajador'
  | 'tienda'
  | 'produccion'
  | 'contabilidad'
  | 'logistica'
  | 'mayorista'

export type UsuarioActual = {
  id: number
  nombre: string
  correo: string
  rol: Rol
  tienda_id: number | null
}

/**
 * Usuario ASTRO de la sesión actual. Sale del contexto de sesión (una sola
 * llamada por request, compartida con permisos y carrito). Redirige a
 * /login si no hay sesión o el usuario no existe en ASTRO.
 */
export const obtenerUsuarioActual = cache(async (): Promise<UsuarioActual> => {
  const contexto = await obtenerContexto()
  if (contexto) return contexto.usuario
  if (!(await haySesion())) redirect('/login')
  redirect('/login?error=Tu%20usuario%20no%20tiene%20acceso%20a%20ASTRO')
})
