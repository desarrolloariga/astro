'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'

function aNumero(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

async function exigirAcceso() {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'produccion' && usuario.rol !== 'admin') {
    redirect('/inicio')
  }
}

/** Edita nombre/descripción/referencia de proveedor de un artículo ya publicado — nunca costo ni precio. */
export async function actualizarFichaCedi(formData: FormData) {
  await exigirAcceso()

  const productoId = aNumero(formData.get('producto_id'))
  if (!productoId) redirect('/existencias')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_actualizar_ficha_cedi', {
    p_producto_id: productoId,
    p_nombre: String(formData.get('nombre') ?? '').trim(),
    p_descripcion: String(formData.get('descripcion') ?? '').trim() || null,
    p_referencia_proveedor: String(formData.get('referencia_proveedor') ?? '').trim() || null,
  })

  revalidatePath(`/existencias/${productoId}/editar`)
  revalidatePath('/existencias')
  if (error) redirect(`/existencias/${productoId}/editar?error=${encodeURIComponent(error.message)}`)
  redirect(`/existencias/${productoId}/editar?ok=${encodeURIComponent('Ficha actualizada')}`)
}
