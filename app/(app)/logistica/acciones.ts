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

export async function crearSolicitud(formData: FormData) {
  if (!(await tienePermiso('logistica', 'solicitar'))) {
    redirect('/logistica?error=No%20tienes%20permiso%20para%20solicitar%20reposición')
  }

  const categoriaId = aNumero(formData.get('categoria_id'))
  const materialId = aNumero(formData.get('material_id'))
  const descripcion = String(formData.get('descripcion') ?? '').trim()
  const cantidadSugerida = aNumero(formData.get('cantidad_sugerida'))

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_crear_solicitud_reposicion', {
    p_categoria_id: categoriaId,
    p_material_id: materialId,
    p_descripcion: descripcion || null,
    p_cantidad_sugerida: cantidadSugerida,
  })

  revalidatePath('/logistica')
  if (error) redirect(`/logistica?error=${encodeURIComponent(error.message)}`)
  redirect(`/logistica?ok=${encodeURIComponent('Solicitud enviada a producción')}`)
}

export async function resolverSolicitud(formData: FormData) {
  if (!(await tienePermiso('logistica', 'gestionar'))) {
    redirect('/logistica?error=No%20tienes%20permiso%20para%20resolver%20solicitudes')
  }

  const solicitudId = aNumero(formData.get('solicitud_id'))
  const estado = String(formData.get('estado') ?? '').trim()
  const comentario = String(formData.get('comentario') ?? '').trim()

  if (!solicitudId || !['en_proceso', 'atendida', 'rechazada'].includes(estado)) {
    redirect('/logistica?error=Datos%20inválidos')
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_resolver_solicitud_reposicion', {
    p_solicitud_id: solicitudId,
    p_estado: estado,
    p_comentario: comentario || null,
  })

  revalidatePath('/logistica')
  if (error) redirect(`/logistica?error=${encodeURIComponent(error.message)}`)
  redirect(`/logistica?ok=${encodeURIComponent('Solicitud actualizada')}`)
}
