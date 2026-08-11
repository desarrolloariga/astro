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

export async function responderTicket(formData: FormData) {
  const ticketId = aNumero(formData.get('ticket_id'))
  const mensaje = String(formData.get('mensaje') ?? '').trim()
  if (!ticketId) redirect('/soporte')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_responder_ticket', {
    p_ticket_id: ticketId,
    p_mensaje: mensaje,
  })

  revalidatePath(`/soporte/tickets/${ticketId}`)
  if (error) redirect(`/soporte/tickets/${ticketId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/soporte/tickets/${ticketId}`)
}

export async function actualizarEstadoTicket(formData: FormData) {
  const ticketId = aNumero(formData.get('ticket_id'))
  const estado = String(formData.get('estado') ?? '').trim()
  const asignadoA = aNumero(formData.get('asignado_a'))
  if (!ticketId || !estado) redirect('/soporte')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_actualizar_estado_ticket', {
    p_ticket_id: ticketId,
    p_estado: estado,
    p_asignado_a: asignadoA,
  })

  revalidatePath(`/soporte/tickets/${ticketId}`)
  if (error) redirect(`/soporte/tickets/${ticketId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/soporte/tickets/${ticketId}`)
}
