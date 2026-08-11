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

export async function crearMeta(formData: FormData) {
  const usuario = await obtenerUsuarioActual()
  if (!['admin', 'coordinador'].includes(usuario.rol)) redirect('/inicio')

  const ambito = String(formData.get('ambito') ?? '').trim()

  const supabase = await createClient()
  const { error } = await supabase.from('metas').insert({
    ambito,
    usuario_id: ambito === 'vendedor' ? aNumero(formData.get('usuario_id')) : null,
    tienda_id: ambito === 'tienda' ? aNumero(formData.get('tienda_id')) : null,
    periodo_id: aNumero(formData.get('periodo_id')),
    monto_meta: aNumero(formData.get('monto_meta')) ?? 0,
  })

  revalidatePath('/metas')
  if (error) redirect(`/metas?error=${encodeURIComponent(error.message)}`)
  redirect(`/metas?ok=${encodeURIComponent('Meta creada')}`)
}

export async function crearCampana(formData: FormData) {
  const usuario = await obtenerUsuarioActual()
  if (!['admin', 'coordinador'].includes(usuario.rol)) redirect('/inicio')

  const supabase = await createClient()
  const { error } = await supabase.from('campanas').insert({
    nombre: String(formData.get('nombre') ?? '').trim(),
    fecha_inicio: formData.get('fecha_inicio'),
    fecha_fin: formData.get('fecha_fin'),
  })

  revalidatePath('/metas')
  if (error) redirect(`/metas?error=${encodeURIComponent(error.message)}`)
  redirect(`/metas?ok=${encodeURIComponent('Campaña creada')}`)
}

export async function alternarCampana(formData: FormData) {
  const usuario = await obtenerUsuarioActual()
  if (!['admin', 'coordinador'].includes(usuario.rol)) redirect('/inicio')

  const id = aNumero(formData.get('id'))
  const activo = formData.get('activo') === '1'
  if (!id) redirect('/metas')

  const supabase = await createClient()
  const { error } = await supabase.from('campanas').update({ activo: !activo }).eq('id', id)

  revalidatePath('/metas')
  if (error) redirect(`/metas?error=${encodeURIComponent(error.message)}`)
  redirect(`/metas?ok=${encodeURIComponent('Campaña actualizada')}`)
}
