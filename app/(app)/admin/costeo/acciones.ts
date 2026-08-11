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

async function exigirPermiso() {
  if (!(await tienePermiso('costeo', 'editar'))) redirect('/inicio')
}

export async function crearPoliticaMargen(formData: FormData) {
  await exigirPermiso()

  const margenPct = aNumero(formData.get('margen_pct'))
  const origen = String(formData.get('origen') ?? '').trim()
  if (margenPct == null || !['local', 'importado'].includes(origen)) {
    redirect(`/admin/costeo?error=${encodeURIComponent('Origen y % de margen son obligatorios')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.from('politicas_margen').insert({
    categoria_id: aNumero(formData.get('categoria_id')),
    origen,
    margen_pct: margenPct,
  })

  revalidatePath('/admin/costeo')
  if (error) redirect(`/admin/costeo?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/costeo?ok=${encodeURIComponent('Política de margen creada')}`)
}

export async function alternarPoliticaMargen(formData: FormData) {
  await exigirPermiso()
  const id = aNumero(formData.get('id'))
  const activo = formData.get('activo') === '1'
  if (!id) redirect('/admin/costeo')

  const supabase = await createClient()
  const { error } = await supabase.from('politicas_margen').update({ activo: !activo }).eq('id', id)

  revalidatePath('/admin/costeo')
  if (error) redirect(`/admin/costeo?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/costeo?ok=${encodeURIComponent('Política actualizada')}`)
}

export async function actualizarParametroCosteo(formData: FormData) {
  await exigirPermiso()
  const id = aNumero(formData.get('id'))
  const valor = String(formData.get('valor') ?? '').trim()
  if (!id) redirect('/admin/costeo')

  const supabase = await createClient()
  const { error } = await supabase.from('parametros').update({ valor }).eq('id', id)

  revalidatePath('/admin/costeo')
  if (error) redirect(`/admin/costeo?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/costeo?ok=${encodeURIComponent('Parámetro actualizado')}`)
}
