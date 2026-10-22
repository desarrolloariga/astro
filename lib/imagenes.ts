/**
 * Miniaturas de fotos de producto. Al subir una foto se guarda, además del
 * original, una versión de 480 px en `thumbs/` con el mismo nombre (.webp).
 * Las tarjetas piden la miniatura y, si no existe (fotos antiguas), caen al
 * original.
 */
const BUCKET = '/ariga-productos/'

export function miniaturaDe(url: string): string {
  const i = url.indexOf(BUCKET)
  if (i < 0 || url.includes(`${BUCKET}thumbs/`)) return url
  const base = url.slice(0, i + BUCKET.length)
  const ruta = url.slice(i + BUCKET.length).replace(/\.[a-z0-9]+(\?.*)?$/i, '.webp')
  return `${base}thumbs/${ruta}`
}
