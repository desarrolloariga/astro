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

// Deliberadamente NO usa tienePermiso(): la administración de la
// propia matriz de permisos se protege con rol fijo para no poder
// quedar bloqueada por un error de configuración en el sistema que
// ella misma gestiona.
async function exigirAdmin() {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'admin') redirect('/inicio')
}

export async function alternarRolPermiso(formData: FormData) {
  await exigirAdmin()

  const rolId = aNumero(formData.get('rol_id'))
  const permisoId = aNumero(formData.get('permiso_id'))
  const concedido = formData.get('concedido') === '1'
  if (!rolId || !permisoId) redirect('/admin/permisos')

  const supabase = await createClient()
  const { error } = concedido
    ? await supabase.from('roles_permisos').delete().eq('rol_id', rolId).eq('permiso_id', permisoId)
    : await supabase.from('roles_permisos').insert({ rol_id: rolId, permiso_id: permisoId })

  revalidatePath('/admin/permisos')
  if (error) redirect(`/admin/permisos?error=${encodeURIComponent(error.message)}`)
  redirect('/admin/permisos')
}

export async function otorgarPermisoIndividual(formData: FormData) {
  await exigirAdmin()

  const usuarioId = aNumero(formData.get('usuario_id'))
  const permisoId = aNumero(formData.get('permiso_id'))
  const concedido = formData.get('concedido') === 'true'
  if (!usuarioId || !permisoId) redirect('/admin/permisos')

  const supabase = await createClient()
  const { error } = await supabase
    .from('usuarios_permisos')
    .upsert(
      { usuario_id: usuarioId, permiso_id: permisoId, concedido },
      { onConflict: 'usuario_id,permiso_id' },
    )

  revalidatePath('/admin/permisos')
  if (error) redirect(`/admin/permisos?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/permisos?ok=${encodeURIComponent('Excepción guardada')}`)
}

export async function quitarPermisoIndividual(formData: FormData) {
  await exigirAdmin()

  const id = aNumero(formData.get('id'))
  if (!id) redirect('/admin/permisos')

  const supabase = await createClient()
  const { error } = await supabase.from('usuarios_permisos').delete().eq('id', id)

  revalidatePath('/admin/permisos')
  if (error) redirect(`/admin/permisos?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/permisos?ok=${encodeURIComponent('Excepción eliminada')}`)
}
