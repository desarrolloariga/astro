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
  if (!(await tienePermiso('precios', 'editar'))) redirect('/inicio')
}

export async function actualizarParametroPrecio(formData: FormData) {
  await exigirPermiso()

  const id = aNumero(formData.get('id'))
  const valorPct = aNumero(formData.get('valor_pct'))
  if (!id || valorPct == null) redirect('/admin/precios')

  const supabase = await createClient()
  const { error } = await supabase
    .from('parametros_precio')
    .update({
      valor_pct: valorPct,
      motivo: String(formData.get('motivo') ?? '').trim() || null,
    })
    .eq('id', id)

  revalidatePath('/admin/precios')
  if (error) redirect(`/admin/precios?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/precios?ok=${encodeURIComponent('Factor actualizado')}`)
}

export async function crearExcepcionParametroPrecio(formData: FormData) {
  await exigirPermiso()

  const clave = String(formData.get('clave') ?? '').trim()
  const categoriaId = aNumero(formData.get('categoria_id'))
  const productoId = aNumero(formData.get('producto_id'))
  const valorPct = aNumero(formData.get('valor_pct'))

  if (!clave || valorPct == null) {
    redirect(`/admin/precios?error=${encodeURIComponent('Clave y valor son obligatorios')}`)
  }
  if (!categoriaId && !productoId) {
    redirect(
      `/admin/precios?error=${encodeURIComponent('Una excepción necesita categoría o pieza específica')}`,
    )
  }

  const supabase = await createClient()
  const { error } = await supabase.from('parametros_precio').insert({
    clave,
    categoria_id: categoriaId,
    producto_id: productoId,
    valor_pct: valorPct,
    motivo: String(formData.get('motivo') ?? '').trim() || null,
  })

  revalidatePath('/admin/precios')
  if (error) redirect(`/admin/precios?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/precios?ok=${encodeURIComponent('Excepción creada')}`)
}

export async function desactivarParametroPrecio(formData: FormData) {
  await exigirPermiso()

  const id = aNumero(formData.get('id'))
  if (!id) redirect('/admin/precios')

  const supabase = await createClient()
  const { error } = await supabase.from('parametros_precio').update({ activo: false }).eq('id', id)

  revalidatePath('/admin/precios')
  if (error) redirect(`/admin/precios?error=${encodeURIComponent(error.message)}`)
  redirect(`/admin/precios?ok=${encodeURIComponent('Excepción desactivada')}`)
}
