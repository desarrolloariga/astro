'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'astro-premios'
const MAX_FOTOS = 6
const MAX_BYTES = 5 * 1024 * 1024

function aEntero(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto)
  return Number.isInteger(n) ? n : null
}

function volver(destino: string, clave: 'ok' | 'error', mensaje: string): never {
  redirect(`${destino}${destino.includes('?') ? '&' : '?'}${clave}=${encodeURIComponent(mensaje)}`)
}

/** Sube las fotos nuevas al bucket público de premios y devuelve sus URLs. */
async function subirFotos(archivos: File[]): Promise<string[]> {
  const admin = createAdminClient()
  const urls: string[] = []
  for (const [i, archivo] of archivos.entries()) {
    if (!archivo.type.startsWith('image/')) throw new Error(`"${archivo.name}" no es una imagen`)
    if (archivo.size > MAX_BYTES) throw new Error(`"${archivo.name}" supera 5 MB`)
    const extension = archivo.name.split('.').pop()?.toLowerCase() || 'jpg'
    const ruta = `premios/${Date.now()}-${i}.${extension}`
    const { error } = await admin.storage.from(BUCKET).upload(ruta, archivo, { contentType: archivo.type })
    if (error) throw new Error(`No se pudo subir "${archivo.name}": ${error.message}`)
    urls.push(admin.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl)
  }
  return urls
}

export async function guardarPremio(formData: FormData) {
  const id = aEntero(formData.get('id'))
  const mantener = formData.getAll('mantener').map(String).filter((u) => u.startsWith('http'))
  const nuevas = formData.getAll('fotos').filter((f): f is File => f instanceof File && f.size > 0)

  if (mantener.length + nuevas.length > MAX_FOTOS) {
    volver('/premiaciones', 'error', `Máximo ${MAX_FOTOS} fotos por premio`)
  }

  let subidas: string[] = []
  try {
    subidas = await subirFotos(nuevas)
  } catch (e) {
    volver('/premiaciones', 'error', (e as Error).message)
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_guardar_premio_canje', {
    p_id: id,
    p_nombre: String(formData.get('nombre') ?? ''),
    p_descripcion: String(formData.get('descripcion') ?? ''),
    p_puntos: aEntero(formData.get('puntos')),
    p_stock: aEntero(formData.get('stock')),
    p_imagenes: [...mantener, ...subidas],
    p_activo: formData.get('activo') === 'si',
  })

  revalidatePath('/premiaciones')
  revalidatePath('/red')
  if (error) volver('/premiaciones', 'error', error.message)
  volver('/premiaciones', 'ok', id ? 'Premio actualizado' : 'Premio creado')
}

export async function atenderCanje(formData: FormData) {
  const canjeId = aEntero(formData.get('canje_id'))
  if (!canjeId) redirect('/premiaciones')
  const entregado = formData.get('accion') === 'entregar'

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_atender_canje', {
    p_canje_id: canjeId,
    p_entregado: entregado,
    p_comentario: String(formData.get('comentario') ?? '').trim() || null,
  })

  revalidatePath('/premiaciones')
  if (error) volver('/premiaciones', 'error', error.message)
  volver('/premiaciones', 'ok', entregado ? 'Canje marcado como entregado' : 'Canje rechazado — se devolvieron los puntos')
}

/** Desde Mi red: canjear un premio con los puntos propios. */
export async function canjearPremio(formData: FormData) {
  const premioId = aEntero(formData.get('premio_id'))
  if (!premioId) redirect('/red')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_canjear_premio', { p_premio_id: premioId })

  revalidatePath('/red')
  revalidatePath('/premiaciones')
  if (error) volver('/red', 'error', error.message)
  volver('/red', 'ok', '¡Canje solicitado! Te avisaremos cuando tu premio sea entregado.')
}
