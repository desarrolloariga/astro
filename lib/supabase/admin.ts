import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase con service_role — SALTA RLS.
 * Uso exclusivo en servidor para operaciones administrativas
 * (crear usuarios de Auth, jobs, conciliaciones). Nunca importar
 * desde componentes de cliente.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      db: { schema: 'public' },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  )
}
