'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'

export async function crearTicket(formData: FormData) {
  const asunto = String(formData.get('asunto') ?? '').trim()
  const descripcion = String(formData.get('descripcion') ?? '').trim()
  const categoria = String(formData.get('categoria') ?? '').trim()

  const supabase = await createClient()
  const { data: ticketId, error } = await supabase.rpc('fn_crear_ticket', {
    p_asunto: asunto,
    p_descripcion: descripcion || null,
    p_categoria: categoria || null,
  })

  revalidatePath('/soporte')
  if (error || !ticketId) {
    redirect(`/soporte?error=${encodeURIComponent(error?.message ?? 'No se pudo crear el ticket')}`)
  }
  redirect(`/soporte/tickets/${ticketId}`)
}

export async function crearFaq(formData: FormData) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'admin') redirect('/inicio')

  const supabase = await createClient()
  const { error } = await supabase.from('faqs').insert({
    pregunta: String(formData.get('pregunta') ?? '').trim(),
    respuesta: String(formData.get('respuesta') ?? '').trim(),
    categoria: String(formData.get('categoria') ?? '').trim() || null,
  })

  revalidatePath('/soporte')
  if (error) redirect(`/soporte?error=${encodeURIComponent(error.message)}`)
  redirect(`/soporte?ok=${encodeURIComponent('Pregunta frecuente publicada')}`)
}
