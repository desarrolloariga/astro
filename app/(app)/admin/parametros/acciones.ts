'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'

function aNumero(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export async function actualizarParametro(formData: FormData) {
  if (!(await tienePermiso('parametros', 'editar'))) redirect('/inicio')

  const id = aNumero(formData.get('id'))
  const valor = String(formData.get('valor') ?? '').trim()
  if (!id) redirect('/admin/parametros')

  const supabase = await createClient()
  const { error } = await supabase.from('parametros').update({ valor }).eq('id', id)

  revalidatePath('/admin/parametros')
  if (error) redirect(`/admin/parametros?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/parametros?ok=${encodeURIComponent('Parámetro actualizado')}`)
}
