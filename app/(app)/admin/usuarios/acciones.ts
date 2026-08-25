'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tienePermiso } from '@/lib/permisos'

function aNumero(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

async function exigirPermiso(modulo: string, accion: string) {
  if (!(await tienePermiso(modulo, accion))) redirect('/inicio')
}

export async function crearUsuario(formData: FormData) {
  await exigirPermiso('usuarios', 'crear')

  const nombre = String(formData.get('nombre') ?? '').trim()
  const correo = String(formData.get('correo') ?? '').trim().toLowerCase()
  const contrasena = String(formData.get('contrasena') ?? '')
  const rolNombre = String(formData.get('rol_nombre') ?? '').trim()
  const tiendaId = aNumero(formData.get('tienda_id'))
  const superiorId = aNumero(formData.get('superior_id'))

  if (!nombre || !correo || !rolNombre) {
    redirect(`/admin/usuarios?error=${encodeURIComponent('Nombre, correo y rol son obligatorios')}`)
  }
  if (contrasena.length < 8) {
    redirect(`/admin/usuarios?error=${encodeURIComponent('La contraseña temporal debe tener al menos 8 caracteres')}`)
  }

  const admin = createAdminClient()

  const { data: rol } = await admin.from('roles').select('id').eq('nombre', rolNombre).maybeSingle()
  if (!rol) {
    redirect(`/admin/usuarios?error=${encodeURIComponent(`Rol "${rolNombre}" no existe`)}`)
  }

  const { data: nuevoUsuario, error: errorAuth } = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    app_metadata: { app: 'ariga', rol: rolNombre },
    user_metadata: { nombre },
  })

  if (errorAuth || !nuevoUsuario.user) {
    redirect(`/admin/usuarios?error=${encodeURIComponent(errorAuth?.message ?? 'No se pudo crear el usuario')}`)
  }

  // El trigger trg_auth_alta_usuario debería insertar la fila en public.usuarios
  // al detectar app_metadata.app = 'ariga', pero se confirmó (2026-08-25) que no
  // es confiable en este flujo — se asegura aquí explícitamente con upsert
  // idempotente por correo, usando el cliente admin para saltar RLS igual que
  // el trigger.
  const { error: errorUsuario } = await admin.from('usuarios').upsert(
    {
      auth_uid: nuevoUsuario.user.id,
      nombre,
      correo,
      rol_id: rol.id,
      tienda_id: tiendaId,
      superior_id: superiorId,
    },
    { onConflict: 'correo' },
  )

  if (errorUsuario) {
    redirect(`/admin/usuarios?error=${encodeURIComponent(errorUsuario.message)}`)
  }

  revalidatePath('/admin/usuarios')
  redirect(`/admin/usuarios?ok=${encodeURIComponent(`Usuario ${nombre} creado`)}`)
}

export async function actualizarUsuario(formData: FormData) {
  await exigirPermiso('usuarios', 'editar')

  const id = aNumero(formData.get('id'))
  if (!id) redirect('/admin/usuarios')

  const supabase = await createClient()
  const { error } = await supabase
    .from('usuarios')
    .update({
      rol_id: aNumero(formData.get('rol_id')),
      tienda_id: aNumero(formData.get('tienda_id')),
      superior_id: aNumero(formData.get('superior_id')),
    })
    .eq('id', id)

  revalidatePath('/admin/usuarios')
  if (error) redirect(`/admin/usuarios?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/usuarios?ok=${encodeURIComponent('Usuario actualizado')}`)
}

export async function asignarSuperior(formData: FormData) {
  await exigirPermiso('usuarios', 'editar')

  const id = aNumero(formData.get('id'))
  const superiorId = aNumero(formData.get('superior_id'))
  if (!id) redirect('/admin/usuarios/jerarquia')

  const supabase = await createClient()

  if (superiorId != null) {
    if (superiorId === id) {
      redirect(
        `/admin/usuarios/jerarquia?error=${encodeURIComponent('Un usuario no puede ser su propio superior')}`,
      )
    }
    const { data: todos } = await supabase.from('usuarios').select('id, superior_id')
    const superiorDe = new Map((todos ?? []).map((u) => [u.id, u.superior_id as number | null]))
    let cursor: number | null = superiorId
    while (cursor != null) {
      if (cursor === id) {
        redirect(
          `/admin/usuarios/jerarquia?error=${encodeURIComponent('Ese cambio crearía un ciclo en la jerarquía')}`,
        )
      }
      cursor = superiorDe.get(cursor) ?? null
    }
  }

  const { error } = await supabase.from('usuarios').update({ superior_id: superiorId }).eq('id', id)

  revalidatePath('/admin/usuarios/jerarquia')
  revalidatePath('/admin/usuarios')
  if (error) redirect(`/admin/usuarios/jerarquia?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/usuarios/jerarquia?ok=${encodeURIComponent('Jerarquía actualizada')}`)
}

export async function alternarActivoUsuario(formData: FormData) {
  await exigirPermiso('usuarios', 'editar')

  const id = aNumero(formData.get('id'))
  const activo = formData.get('activo') === '1'
  if (!id) redirect('/admin/usuarios')

  const supabase = await createClient()
  const { error } = await supabase.from('usuarios').update({ activo: !activo }).eq('id', id)

  revalidatePath('/admin/usuarios')
  if (error) redirect(`/admin/usuarios?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/usuarios?ok=${encodeURIComponent(activo ? 'Usuario desactivado' : 'Usuario reactivado')}`)
}
