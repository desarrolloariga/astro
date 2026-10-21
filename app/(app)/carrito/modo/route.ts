import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_MODO_COMPRA } from '@/lib/modo-compra'

/**
 * Cambia "Comprar para mí / Para un cliente" y vuelve a la página de
 * origen con una navegación completa. Es un enlace normal (GET) y no una
 * acción de servidor, para que funcione aunque la página se haya abierto
 * antes de un despliegue nuevo y siempre se vuelva a pintar con el modo
 * elegido.
 */
export function GET(request: NextRequest) {
  const modo = request.nextUrl.searchParams.get('modo') === 'cliente' ? 'cliente' : 'mi'
  const volver = request.nextUrl.searchParams.get('volver') ?? ''
  const destino = volver.startsWith('/') && !volver.startsWith('//') ? volver : '/catalogo'

  const respuesta = NextResponse.redirect(new URL(destino, request.nextUrl.origin), 303)
  respuesta.cookies.set(COOKIE_MODO_COMPRA, modo, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  respuesta.headers.set('Cache-Control', 'no-store')
  return respuesta
}
