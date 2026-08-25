'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { tienePermiso } from '@/lib/permisos'

function aNumero(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export async function crearContratacion(formData: FormData) {
  if (!(await tienePermiso('contrataciones', 'crear'))) redirect('/inicio')

  const usuario = await obtenerUsuarioActual()
  const candidatoNombre = String(formData.get('candidato_nombre') ?? '').trim()
  const puesto = String(formData.get('puesto') ?? '').trim()

  if (!candidatoNombre || !puesto) {
    redirect(`/contrataciones/nueva?error=${encodeURIComponent('Nombre del candidato y puesto son obligatorios')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.from('contrataciones').insert({
    candidato_nombre: candidatoNombre,
    candidato_contacto: String(formData.get('candidato_contacto') ?? '').trim() || null,
    puesto,
    rol_sugerido_id: aNumero(formData.get('rol_sugerido_id')),
    salario_propuesto: aNumero(formData.get('salario_propuesto')),
    tienda_id: aNumero(formData.get('tienda_id')),
    solicitado_por: usuario.id,
  })

  revalidatePath('/contrataciones')
  if (error) redirect(`/contrataciones/nueva?error=${encodeURIComponent(error.message)}`)
  redirect(`/contrataciones?ok=${encodeURIComponent('Solicitud creada')}`)
}

export async function decidirContratacion(formData: FormData) {
  if (!(await tienePermiso('contrataciones', 'decidir'))) redirect('/inicio')

  const id = aNumero(formData.get('id'))
  const nuevoEstado = String(formData.get('nuevo_estado') ?? '').trim()
  if (!id || !nuevoEstado) redirect('/contrataciones')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_decidir_contratacion', {
    p_contratacion_id: id,
    p_nuevo_estado: nuevoEstado,
    p_comentario: String(formData.get('comentario') ?? '').trim() || null,
  })

  revalidatePath('/contrataciones')
  if (error) redirect(`/contrataciones?error=${encodeURIComponent(error.message)}`)
  redirect(`/contrataciones?ok=${encodeURIComponent('Solicitud actualizada')}`)
}
