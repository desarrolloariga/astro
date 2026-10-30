'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const txt = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

function volver(clave: 'ok' | 'error', mensaje: string): never {
  redirect(`/contabilidad/pendientes?${clave}=${encodeURIComponent(mensaje)}`)
}

export async function reintentarPendientes(formData: FormData) {
  const id = Number(txt(formData, 'id')) || null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_ctb_reintentar_pendientes', { p_id: id })
  if (error) volver('error', error.message)
  const r = data as { resueltos: number; pendientes: number }
  revalidatePath('/contabilidad/pendientes')
  revalidatePath('/contabilidad/partidas')
  if (r.pendientes > 0 && r.resueltos === 0) volver('error', 'Sigue sin poder contabilizarse: revisa el mensaje')
  volver('ok', `${r.resueltos} contabilizada(s)${r.pendientes ? ` · ${r.pendientes} siguen pendientes` : ''}`)
}

export async function descartarPendiente(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_ctb_descartar_pendiente', {
    p_id: Number(txt(formData, 'id')),
    p_motivo: txt(formData, 'motivo'),
  })
  if (error) volver('error', error.message)
  revalidatePath('/contabilidad/pendientes')
  volver('ok', 'Pendiente descartado')
}
