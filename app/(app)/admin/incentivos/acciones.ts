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
  if (!(await tienePermiso('incentivos', 'editar'))) redirect('/inicio')
}

export async function crearReglaPuntaje(formData: FormData) {
  await exigirAdmin()

  const condicionesTexto = String(formData.get('condiciones') ?? '').trim()
  let condiciones: object = {}
  if (condicionesTexto) {
    try {
      condiciones = JSON.parse(condicionesTexto)
    } catch {
      redirect(`/admin/incentivos?error=${encodeURIComponent('Las condiciones deben ser JSON válido')}`)
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('reglas_puntaje').insert({
    nombre: String(formData.get('nombre') ?? '').trim(),
    tipo: String(formData.get('tipo') ?? '').trim(),
    valor: aNumero(formData.get('valor')) ?? 0,
    multiplicador: aNumero(formData.get('multiplicador')) ?? 1,
    condiciones,
    vigencia_inicio: formData.get('vigencia_inicio') || null,
    vigencia_fin: formData.get('vigencia_fin') || null,
  })

  revalidatePath('/admin/incentivos')
  if (error) redirect(`/admin/incentivos?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/incentivos?ok=${encodeURIComponent('Regla de puntaje creada')}`)
}

export async function alternarReglaPuntaje(formData: FormData) {
  await exigirAdmin()
  const id = aNumero(formData.get('id'))
  const activo = formData.get('activo') === '1'
  if (!id) redirect('/admin/incentivos')

  const supabase = await createClient()
  const { error } = await supabase.from('reglas_puntaje').update({ activo: !activo }).eq('id', id)

  revalidatePath('/admin/incentivos')
  if (error) redirect(`/admin/incentivos?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/incentivos?ok=${encodeURIComponent('Regla actualizada')}`)
}

export async function crearTope(formData: FormData) {
  await exigirAdmin()

  const ambito = String(formData.get('ambito') ?? '').trim()
  const supabase = await createClient()
  const { error } = await supabase.from('topes_venta').insert({
    ambito,
    rol_id: ambito === 'rol' ? aNumero(formData.get('rol_id')) : null,
    usuario_id: ambito === 'individual' ? aNumero(formData.get('usuario_id')) : null,
    monto_tope: aNumero(formData.get('monto_tope')) ?? 0,
  })

  revalidatePath('/admin/incentivos')
  if (error) redirect(`/admin/incentivos?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/incentivos?ok=${encodeURIComponent('Tope de venta creado')}`)
}

export async function crearEscala(formData: FormData) {
  await exigirAdmin()

  const supabase = await createClient()
  const { error } = await supabase.from('escalas_descuento').insert({
    tope_id: aNumero(formData.get('tope_id')),
    desde_monto: aNumero(formData.get('desde_monto')) ?? 0,
    porcentaje_descuento: aNumero(formData.get('porcentaje_descuento')) ?? 0,
  })

  revalidatePath('/admin/incentivos')
  if (error) redirect(`/admin/incentivos?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/incentivos?ok=${encodeURIComponent('Escala de descuento creada')}`)
}
