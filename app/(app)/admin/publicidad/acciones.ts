'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { tienePermiso } from '@/lib/permisos'

async function exigirPermiso() {
  if (!(await tienePermiso('publicidad', 'editar'))) redirect('/inicio')
}

export async function crearPublicidad(formData: FormData) {
  await exigirPermiso()
  const usuario = await obtenerUsuarioActual()

  const titulo = String(formData.get('titulo') ?? '').trim()
  const cuerpo = String(formData.get('cuerpo') ?? '').trim()
  const imagenUrl = String(formData.get('imagen_url') ?? '').trim()
  const urlDestino = String(formData.get('url_destino') ?? '').trim()
  const publicoObjetivo = String(formData.get('publico_objetivo') ?? 'embajador').trim()
  const fechaFin = String(formData.get('fecha_fin') ?? '').trim()

  if (!titulo) {
    redirect(`/admin/publicidad?error=${encodeURIComponent('El título es obligatorio')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.from('publicidad_interna').insert({
    titulo,
    cuerpo: cuerpo || null,
    imagen_url: imagenUrl || null,
    url_destino: urlDestino || null,
    publico_objetivo: publicoObjetivo,
    fecha_fin: fechaFin || null,
    creado_por: usuario.id,
  })

  revalidatePath('/admin/publicidad')
  if (error) redirect(`/admin/publicidad?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/publicidad?ok=${encodeURIComponent('Publicidad creada')}`)
}

export async function alternarPublicidad(formData: FormData) {
  await exigirPermiso()

  const id = Number(formData.get('id'))
  const activo = formData.get('activo') === '1'
  if (!id) redirect('/admin/publicidad')

  const supabase = await createClient()
  const { error } = await supabase.from('publicidad_interna').update({ activo: !activo }).eq('id', id)

  revalidatePath('/admin/publicidad')
  if (error) redirect(`/admin/publicidad?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/publicidad?ok=${encodeURIComponent(activo ? 'Publicidad desactivada' : 'Publicidad activada')}`)
}
