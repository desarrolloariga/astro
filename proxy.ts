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
     * - /astro: logotipos, íconos y fuentes de la marca (públicos)
     */
    '/((?!_next/static|_next/image|favicon.ico|astro/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|otf|woff2?|ttf)$).*)',
  ],
}
