import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export type ItemCarrito = {
  producto_id: number
  codigo: string
  nombre: string
  precio_venta: number | null
  imagen_principal: string | null
  segundos_restantes: number
  cantidad: number
  modo_inventario: 'pieza_unica' | 'por_cantidad'
  stock_disponible: number | null
}

export function nombreCookieCarrito(token: string) {
  return `ariga_carrito_${token}`
}

/** Lee el carrito del cliente (por cookie) para un link público dado. */
export async function obtenerCarrito(token: string) {
  const cookieStore = await cookies()
  const carritoToken = cookieStore.get(nombreCookieCarrito(token))?.value

  if (!carritoToken) {
    return { carritoToken: null as string | null, items: [] as ItemCarrito[] }
  }

  const supabase = await createClient()
  const { data } = await supabase.rpc('fn_ver_carrito', { p_carrito_token: carritoToken })
  return { carritoToken, items: (data ?? []) as ItemCarrito[] }
}
