'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function aNumero(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function leerJson<T>(valor: FormDataEntryValue | null): T | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  try {
    return JSON.parse(texto) as T
  } catch {
    return null
  }
}

/** Catálogo completo con la vigencia por defecto (botón rápido). */
export async function crearLinkCatalogo() {
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_crear_link_venta', {
    p_tipo: 'catalogo',
    p_producto_ids: null,
  })

  revalidatePath('/links')
  if (error) {
    redirect(`/links?error=${encodeURIComponent(error.message)}`)
  }
  redirect(`/links?ok=${encodeURIComponent('Enlace de catálogo generado')}`)
}

/** Catálogo completo, parcial (por filtros) o por productos, desde /catalogo/generar-link. */
export async function crearLinkPersonalizado(formData: FormData) {
  const tipo = String(formData.get('tipo') ?? '')
  if (!['catalogo', 'filtrado', 'subconjunto'].includes(tipo)) redirect('/catalogo/generar-link')

  const filtros = tipo === 'filtrado' ? leerJson<Record<string, unknown>>(formData.get('filtros')) : null
  const ids = tipo === 'subconjunto' ? leerJson<unknown[]>(formData.get('producto_ids')) : null
  const productoIds = Array.isArray(ids) ? ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : null

  const supabase = await createClient()
  const { data: token, error } = await supabase.rpc('fn_crear_link_venta', {
    p_tipo: tipo,
    p_producto_ids: productoIds && productoIds.length > 0 ? productoIds : null,
    p_nombre: String(formData.get('nombre') ?? '').trim() || null,
    p_filtros: filtros,
    p_dias_vigencia: aNumero(formData.get('dias')),
  })

  revalidatePath('/links')
  if (error || !token) {
    redirect(`/catalogo/generar-link?error=${encodeURIComponent(error?.message ?? 'No se pudo generar el enlace')}`)
  }
  redirect(`/links?nuevo=${encodeURIComponent(String(token))}`)
}

export async function desactivarLink(formData: FormData) {
  const linkId = aNumero(formData.get('link_id'))
  if (!linkId) redirect('/links')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_desactivar_link_venta', { p_link_id: linkId })

  revalidatePath('/links')
  if (error) {
    redirect(`/links?error=${encodeURIComponent(error.message)}`)
  }
  redirect(`/links?ok=${encodeURIComponent('Enlace desactivado — ya no abre para tus clientes')}`)
}

export async function fijarComisionLink(formData: FormData) {
  const linkId = aNumero(formData.get('link_id'))
  const pct = aNumero(formData.get('pct'))
  if (!linkId) redirect('/links')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_fijar_comision_link', {
    p_link_id: linkId,
    p_pct: pct,
  })

  revalidatePath('/links')
  if (error) {
    redirect(`/links?error=${encodeURIComponent(error.message)}`)
  }
  redirect(`/links?ok=${encodeURIComponent('Comisión actualizada')}`)
}
