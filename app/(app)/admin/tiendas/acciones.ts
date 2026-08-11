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

async function exigirAdmin() {
  if (!(await tienePermiso('tiendas', 'editar'))) redirect('/inicio')
}

export async function crearTienda(formData: FormData) {
  await exigirAdmin()

  const supabase = await createClient()
  const { error } = await supabase.from('tiendas').insert({
    nombre: String(formData.get('nombre') ?? '').trim(),
    tipo: String(formData.get('tipo') ?? '').trim(),
    direccion: String(formData.get('direccion') ?? '').trim() || null,
    telefono: String(formData.get('telefono') ?? '').trim() || null,
    pais_id: aNumero(formData.get('pais_id')),
  })

  revalidatePath('/admin/tiendas')
  if (error) redirect(`/admin/tiendas?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/tiendas?ok=${encodeURIComponent('Tienda creada')}`)
}

export async function actualizarTienda(formData: FormData) {
  await exigirAdmin()

  const id = aNumero(formData.get('id'))
  if (!id) redirect('/admin/tiendas')

  const supabase = await createClient()
  const { error } = await supabase
    .from('tiendas')
    .update({
      nombre: String(formData.get('nombre') ?? '').trim(),
      tipo: String(formData.get('tipo') ?? '').trim(),
      direccion: String(formData.get('direccion') ?? '').trim() || null,
      telefono: String(formData.get('telefono') ?? '').trim() || null,
    })
    .eq('id', id)

  revalidatePath('/admin/tiendas')
  if (error) redirect(`/admin/tiendas?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/tiendas?ok=${encodeURIComponent('Tienda actualizada')}`)
}

export async function alternarActivoTienda(formData: FormData) {
  await exigirAdmin()

  const id = aNumero(formData.get('id'))
  const activo = formData.get('activo') === '1'
  if (!id) redirect('/admin/tiendas')

  const supabase = await createClient()
  const { error } = await supabase.from('tiendas').update({ activo: !activo }).eq('id', id)

  revalidatePath('/admin/tiendas')
  if (error) redirect(`/admin/tiendas?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/tiendas?ok=${encodeURIComponent(activo ? 'Tienda dada de baja' : 'Tienda reactivada')}`)
}
