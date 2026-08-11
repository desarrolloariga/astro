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

async function exigirAdmin() {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'admin') redirect('/inicio')
}

export async function crearReglaComision(formData: FormData) {
  await exigirAdmin()

  const condicionesTexto = String(formData.get('condiciones') ?? '').trim()
  let condiciones: object = {}
  if (condicionesTexto) {
    try {
      condiciones = JSON.parse(condicionesTexto)
    } catch {
      redirect(`/admin/comisiones?error=${encodeURIComponent('Las condiciones deben ser JSON válido')}`)
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('reglas_comision').insert({
    nombre: String(formData.get('nombre') ?? '').trim(),
    tipo: String(formData.get('tipo') ?? '').trim(),
    rol_id: aNumero(formData.get('rol_id')),
    porcentaje: aNumero(formData.get('porcentaje')),
    monto_fijo: aNumero(formData.get('monto_fijo')),
    condiciones,
  })

  revalidatePath('/admin/comisiones')
  if (error) redirect(`/admin/comisiones?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/comisiones?ok=${encodeURIComponent('Regla de comisión creada')}`)
}

export async function alternarReglaComision(formData: FormData) {
  await exigirAdmin()
  const id = aNumero(formData.get('id'))
  const activo = formData.get('activo') === '1'
  if (!id) redirect('/admin/comisiones')

  const supabase = await createClient()
  const { error } = await supabase.from('reglas_comision').update({ activo: !activo }).eq('id', id)

  revalidatePath('/admin/comisiones')
  if (error) redirect(`/admin/comisiones?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/comisiones?ok=${encodeURIComponent('Regla actualizada')}`)
}

export async function cerrarPeriodo(formData: FormData) {
  await exigirAdmin()
  const periodoId = aNumero(formData.get('periodo_id'))
  if (!periodoId) redirect('/admin/comisiones')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_cerrar_periodo', { p_periodo_id: periodoId })

  revalidatePath('/admin/comisiones')
  if (error) redirect(`/admin/comisiones?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/comisiones?ok=${encodeURIComponent('Período cerrado y liquidaciones generadas')}`)
}

export async function aprobarLiquidacion(formData: FormData) {
  await exigirAdmin()
  const id = aNumero(formData.get('id'))
  if (!id) redirect('/admin/comisiones')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_aprobar_liquidacion', { p_liquidacion_id: id })

  revalidatePath('/admin/comisiones')
  if (error) redirect(`/admin/comisiones?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/comisiones?ok=${encodeURIComponent('Liquidación aprobada')}`)
}

export async function pagarLiquidacion(formData: FormData) {
  await exigirAdmin()
  const id = aNumero(formData.get('id'))
  if (!id) redirect('/admin/comisiones')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_pagar_liquidacion', { p_liquidacion_id: id })

  revalidatePath('/admin/comisiones')
  if (error) redirect(`/admin/comisiones?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/comisiones?ok=${encodeURIComponent('Liquidación marcada como pagada')}`)
}
