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

async function exigirAdmin() {
  if (!(await tienePermiso('academia', 'editar'))) redirect('/inicio')
  return obtenerUsuarioActual()
}

export async function crearCurso(formData: FormData) {
  const usuario = await exigirAdmin()

  const supabase = await createClient()
  const { error } = await supabase.from('cursos').insert({
    titulo: String(formData.get('titulo') ?? '').trim(),
    descripcion: String(formData.get('descripcion') ?? '').trim() || null,
    portada_url: String(formData.get('portada_url') ?? '').trim() || null,
    otorga_puntos: formData.get('otorga_puntos') === 'on',
    creado_por: usuario.id,
  })

  revalidatePath('/admin/academia')
  if (error) redirect(`/admin/academia?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/academia?ok=${encodeURIComponent('Curso creado')}`)
}

export async function alternarCurso(formData: FormData) {
  await exigirAdmin()
  const id = aNumero(formData.get('id'))
  const activo = formData.get('activo') === '1'
  if (!id) redirect('/admin/academia')

  const supabase = await createClient()
  const { error } = await supabase.from('cursos').update({ activo: !activo }).eq('id', id)

  revalidatePath('/admin/academia')
  if (error) redirect(`/admin/academia?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/academia?ok=${encodeURIComponent('Curso actualizado')}`)
}

export async function crearContenido(formData: FormData) {
  await exigirAdmin()

  const tipo = String(formData.get('tipo') ?? '').trim()
  const supabase = await createClient()
  const { error } = await supabase.from('curso_contenidos').insert({
    curso_id: aNumero(formData.get('curso_id')),
    tipo,
    titulo: String(formData.get('titulo') ?? '').trim(),
    url: tipo !== 'texto' ? String(formData.get('url') ?? '').trim() || null : null,
    contenido: tipo === 'texto' ? String(formData.get('contenido') ?? '').trim() || null : null,
    orden: aNumero(formData.get('orden')) ?? 0,
  })

  revalidatePath('/admin/academia')
  if (error) redirect(`/admin/academia?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/academia?ok=${encodeURIComponent('Contenido agregado')}`)
}

export async function crearEvaluacion(formData: FormData) {
  await exigirAdmin()

  const supabase = await createClient()
  const { error } = await supabase.from('evaluaciones').insert({
    curso_id: aNumero(formData.get('curso_id')),
    puntaje_aprobacion: aNumero(formData.get('puntaje_aprobacion')) ?? 70,
    intentos_maximos: aNumero(formData.get('intentos_maximos')) ?? 3,
  })

  revalidatePath('/admin/academia')
  if (error) redirect(`/admin/academia?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/academia?ok=${encodeURIComponent('Evaluación creada')}`)
}

export async function crearPregunta(formData: FormData) {
  await exigirAdmin()

  const opciones = String(formData.get('opciones') ?? '')
    .split('\n')
    .map((o) => o.trim())
    .filter(Boolean)

  if (opciones.length < 2) {
    redirect(`/admin/academia?error=${encodeURIComponent('Ingresa al menos dos opciones (una por línea)')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.from('evaluacion_preguntas').insert({
    evaluacion_id: aNumero(formData.get('evaluacion_id')),
    texto: String(formData.get('texto') ?? '').trim(),
    opciones,
    respuesta_correcta: aNumero(formData.get('respuesta_correcta')) ?? 0,
    orden: aNumero(formData.get('orden')) ?? 0,
  })

  revalidatePath('/admin/academia')
  if (error) redirect(`/admin/academia?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/academia?ok=${encodeURIComponent('Pregunta agregada')}`)
}
