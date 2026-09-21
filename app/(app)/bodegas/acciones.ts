'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { tienePermiso } from '@/lib/permisos'

function aNumero(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// tiendas.editar (RLS de la tabla) es admin-only — coordinador/
// producción no tienen ese permiso directo, así que este módulo usa
// el cliente de servicio tras validar inventario.transferir (el
// mismo círculo que ya puede crear traslados entre bodegas).
async function exigirAcceso() {
  if (!(await tienePermiso('inventario', 'transferir'))) redirect('/inicio')
}

export async function crearBodega(formData: FormData) {
  await exigirAcceso()

  const nombre = String(formData.get('nombre') ?? '').trim()
  if (!nombre) redirect(`/bodegas?error=${encodeURIComponent('El nombre es obligatorio')}`)

  const admin = createAdminClient()
  const { error } = await admin.from('tiendas').insert({
    nombre,
    tipo: 'cedi',
    direccion: String(formData.get('direccion') ?? '').trim() || null,
    telefono: String(formData.get('telefono') ?? '').trim() || null,
    pais_id: aNumero(formData.get('pais_id')),
  })

  revalidatePath('/bodegas')
  if (error) redirect(`/bodegas?error=${encodeURIComponent(error.message)}`)
  redirect(`/bodegas?ok=${encodeURIComponent('Bodega creada')}`)
}

export async function actualizarBodega(formData: FormData) {
  await exigirAcceso()

  const id = aNumero(formData.get('id'))
  if (!id) redirect('/bodegas')

  const admin = createAdminClient()
  const { error } = await admin
    .from('tiendas')
    .update({
      nombre: String(formData.get('nombre') ?? '').trim(),
      direccion: String(formData.get('direccion') ?? '').trim() || null,
      telefono: String(formData.get('telefono') ?? '').trim() || null,
    })
    .eq('id', id)
    .eq('tipo', 'cedi')

  revalidatePath('/bodegas')
  if (error) redirect(`/bodegas?error=${encodeURIComponent(error.message)}`)
  redirect(`/bodegas?ok=${encodeURIComponent('Bodega actualizada')}`)
}

export async function alternarActivoBodega(formData: FormData) {
  await exigirAcceso()

  const id = aNumero(formData.get('id'))
  const activo = formData.get('activo') === '1'
  if (!id) redirect('/bodegas')

  const admin = createAdminClient()
  const { error } = await admin.from('tiendas').update({ activo: !activo }).eq('id', id).eq('tipo', 'cedi')

  revalidatePath('/bodegas')
  if (error) redirect(`/bodegas?error=${encodeURIComponent(error.message)}`)
  redirect(`/bodegas?ok=${encodeURIComponent(activo ? 'Bodega dada de baja' : 'Bodega reactivada')}`)
}
