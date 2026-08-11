import type { NextRequest } from 'next/server'
import { actualizarSesion } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return actualizarSesion(request)
}

export const config = {
  matcher: [
    /*
     * Todas las rutas excepto estáticos e imágenes:
     * - _next/static, _next/image, favicon, archivos de public/
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
