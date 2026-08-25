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

async function exigirPermiso() {
  if (!(await tienePermiso('proveedores', 'editar'))) redirect('/inicio')
}

export async function crearProveedor(formData: FormData) {
  await exigirPermiso()

  const supabase = await createClient()
  const { error } = await supabase.from('proveedores').insert({
    nombre: String(formData.get('nombre') ?? '').trim(),
    tipo: formData.get('tipo') === 'importado' ? 'importado' : 'local',
    pais_id: aNumero(formData.get('pais_id')),
    contacto_nombre: String(formData.get('contacto_nombre') ?? '').trim() || null,
    contacto_telefono: String(formData.get('contacto_telefono') ?? '').trim() || null,
    contacto_correo: String(formData.get('contacto_correo') ?? '').trim() || null,
    nit: String(formData.get('nit') ?? '').trim() || null,
    direccion: String(formData.get('direccion') ?? '').trim() || null,
  })

  revalidatePath('/admin/proveedores')
  if (error) redirect(`/admin/proveedores?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/proveedores?ok=${encodeURIComponent('Proveedor creado')}`)
}

export async function actualizarProveedor(formData: FormData) {
  await exigirPermiso()

  const id = aNumero(formData.get('id'))
  if (!id) redirect('/admin/proveedores')

  const supabase = await createClient()
  const { error } = await supabase
    .from('proveedores')
    .update({
      nombre: String(formData.get('nombre') ?? '').trim(),
      tipo: formData.get('tipo') === 'importado' ? 'importado' : 'local',
      pais_id: aNumero(formData.get('pais_id')),
      contacto_nombre: String(formData.get('contacto_nombre') ?? '').trim() || null,
      contacto_telefono: String(formData.get('contacto_telefono') ?? '').trim() || null,
      contacto_correo: String(formData.get('contacto_correo') ?? '').trim() || null,
      nit: String(formData.get('nit') ?? '').trim() || null,
      direccion: String(formData.get('direccion') ?? '').trim() || null,
    })
    .eq('id', id)

  revalidatePath('/admin/proveedores')
  if (error) redirect(`/admin/proveedores?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/proveedores?ok=${encodeURIComponent('Proveedor actualizado')}`)
}

export async function alternarActivoProveedor(formData: FormData) {
  await exigirPermiso()

  const id = aNumero(formData.get('id'))
  const activo = formData.get('activo') === '1'
  if (!id) redirect('/admin/proveedores')

  const supabase = await createClient()
  const { error } = await supabase.from('proveedores').update({ activo: !activo }).eq('id', id)

  revalidatePath('/admin/proveedores')
  if (error) redirect(`/admin/proveedores?error=${encodeURIComponent(error.message)}`)
  redirect(
    `/admin/proveedores?ok=${encodeURIComponent(activo ? 'Proveedor dado de baja' : 'Proveedor reactivado')}`,
  )
}
