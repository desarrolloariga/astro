import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Rol } from '@/lib/usuario'

/**
 * Contexto de la sesión en UNA sola llamada a la base (fn_contexto_sesion):
 * usuario, rol, todos sus permisos efectivos, excepciones individuales,
 * unidades del carrito y saldo de Billetera. Memorizado por request: el
 * layout, la página y las acciones comparten la misma respuesta, y
 * `tienePermiso()` se resuelve en memoria en vez de ir a la base por cada
 * permiso que revisa una pantalla.
 */
export type ContextoSesion = {
  usuario: { id: number; nombre: string; correo: string; tienda_id: number | null; rol: Rol }
  permisos: Set<string>
  concedidos: string[]
  revocados: string[]
  carritoUnidades: number
  saldoBolsa: number
}

type Respuesta = {
  usuario: { id: number; nombre: string; correo: string; tienda_id: number | null; rol: string }
  permisos: string[]
  concedidos: string[]
  revocados: string[]
  carrito_unidades: number
  saldo_bolsa: number
}

/** Hay un JWT válido en las cookies (se verifica localmente, sin red). */
export const haySesion = cache(async (): Promise<boolean> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  return Boolean(data?.claims?.sub)
})

export const obtenerContexto = cache(async (): Promise<ContextoSesion | null> => {
  if (!(await haySesion())) return null
  const supabase = await createClient()
  const { data } = await supabase.rpc('fn_contexto_sesion')
  if (!data || typeof data !== 'object') return null
  const r = data as Respuesta
  return {
    usuario: { ...r.usuario, rol: (r.usuario.rol || 'embajador') as Rol },
    permisos: new Set(Array.isArray(r.permisos) ? r.permisos : []),
    concedidos: Array.isArray(r.concedidos) ? r.concedidos : [],
    revocados: Array.isArray(r.revocados) ? r.revocados : [],
    carritoUnidades: Number(r.carrito_unidades ?? 0),
    saldoBolsa: Number(r.saldo_bolsa ?? 0),
  }
})
