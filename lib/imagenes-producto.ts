import 'server-only'
import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'

export const BUCKET_PRODUCTOS = 'ariga-productos'
const LADO_MAXIMO = 1600
const LADO_MINIATURA = 480

/**
 * Sube una foto de producto redimensionada (máx. 1600 px, WebP) y su
 * miniatura de 480 px en `thumbs/`. Una foto de celular de 4 MB pasa a
 * ~150 KB, y la tarjeta del catálogo baja solo ~25 KB.
 */
export async function subirFotoProducto(
  admin: SupabaseClient,
  productoId: number,
  orden: number,
  foto: File,
): Promise<{ url?: string; error?: string }> {
  const entrada = Buffer.from(await foto.arrayBuffer())
  let original: Buffer
  let miniatura: Buffer
  try {
    const base = sharp(entrada, { failOn: 'none' }).rotate()
    ;[original, miniatura] = await Promise.all([
      base.clone().resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
      base.clone().resize({ width: LADO_MINIATURA, height: LADO_MINIATURA, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(),
    ])
  } catch {
    return { error: `"${foto.name}" no es una imagen válida` }
  }

  const ruta = `${productoId}/${orden}-${Date.now()}.webp`
  const { error } = await admin.storage.from(BUCKET_PRODUCTOS).upload(ruta, original, { contentType: 'image/webp' })
  if (error) return { error: error.message }
  // La miniatura es mejor esfuerzo: si falla, la tarjeta usa el original.
  await admin.storage.from(BUCKET_PRODUCTOS).upload(`thumbs/${ruta}`, miniatura, { contentType: 'image/webp', upsert: true })
  return { url: admin.storage.from(BUCKET_PRODUCTOS).getPublicUrl(ruta).data.publicUrl }
}
