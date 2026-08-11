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
