'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function aNumero(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export async function enviarEvaluacion(formData: FormData) {
  const cursoId = aNumero(formData.get('curso_id'))
  const evaluacionId = aNumero(formData.get('evaluacion_id'))
  const preguntaIds = String(formData.get('pregunta_ids') ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number)

  if (!cursoId || !evaluacionId) redirect('/academia')

  const respuestas: Record<string, number> = {}
  for (const preguntaId of preguntaIds) {
    const valor = formData.get(`pregunta_${preguntaId}`)
    if (valor !== null) respuestas[preguntaId] = Number(valor)
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .rpc('fn_enviar_evaluacion', { p_evaluacion_id: evaluacionId, p_respuestas: respuestas })
    .single()

  if (error || !data) {
    redirect(`/academia/${cursoId}/evaluacion?error=${encodeURIComponent(error?.message ?? 'No se pudo enviar la evaluación')}`)
  }

  const resultado = data as { puntaje: number; aprobado: boolean; intentos_restantes: number }
  redirect(
    `/academia/${cursoId}/evaluacion?resultado=1&puntaje=${resultado.puntaje}&aprobado=${resultado.aprobado ? '1' : '0'}&restantes=${resultado.intentos_restantes}`,
  )
}
