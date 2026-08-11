import { createBrowserClient } from '@supabase/ssr'

/**
 * Cliente Supabase para componentes de cliente ("use client").
 * Opera sobre el esquema `public` y con la sesión del usuario (RLS aplica).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: 'public' } },
  )
}
