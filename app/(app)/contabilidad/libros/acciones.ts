'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function definirFolioInicial(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_libro_definir_folio_inicial', {
    p_libro: String(formData.get('libro') ?? ''),
    p_folio: Number(formData.get('folio')) || 0,
  })
  revalidatePath('/contabilidad/libros')
  if (error) redirect(`/contabilidad/libros?error=${encodeURIComponent(error.message)}`)
  redirect(`/contabilidad/libros?ok=${encodeURIComponent('Folio inicial definido: desde ahora la foliación continúa sola')}`)
}
