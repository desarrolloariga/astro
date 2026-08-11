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

export async function marcarVisto(formData: FormData) {
  const cursoId = aNumero(formData.get('curso_id'))
  const contenidoId = aNumero(formData.get('contenido_id'))
  if (!cursoId || !contenidoId) redirect('/academia')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_marcar_contenido_visto', {
    p_curso_id: cursoId,
    p_contenido_id: contenidoId,
  })

  revalidatePath(`/academia/${cursoId}`)
  revalidatePath('/academia')
  if (error) {
    redirect(`/academia/${cursoId}?error=${encodeURIComponent(error.message)}`)
  }
  redirect(`/academia/${cursoId}`)
}
