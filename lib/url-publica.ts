import { headers } from 'next/headers'

function esLocal(url: string) {
  return /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(url)
}

/**
 * Dominio con el que se arman los enlaces que se comparten (catálogos,
 * QR, correos). Prioridad:
 *   1. NEXT_PUBLIC_APP_URL, si no apunta a localhost
 *   2. el dominio de la petición actual (x-forwarded-host / host) —
 *      cubre el caso de producción con la variable mal configurada
 *   3. el dominio de producción que expone Vercel
 *   4. NEXT_PUBLIC_APP_URL tal cual (desarrollo local)
 */
export async function obtenerUrlBase(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '')
  if (env && !esLocal(env)) return env

  try {
    const h = await headers()
    const host = h.get('x-forwarded-host') ?? h.get('host')
    if (host) {
      const proto =
        h.get('x-forwarded-proto')?.split(',')[0]?.trim() ??
        (/^(localhost|127\.0\.0\.1)/.test(host) ? 'http' : 'https')
      const desdePeticion = `${proto}://${host}`
      if (!esLocal(desdePeticion) || !process.env.VERCEL_PROJECT_PRODUCTION_URL) return desdePeticion
    }
  } catch {
    // fuera de una petición (no debería pasar en páginas ni acciones)
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  return env ?? 'http://localhost:3000'
}
