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
  if (!(await tienePermiso('inventario', 'ajustar'))) redirect('/inicio')
}

export async function iniciarConteo(formData: FormData) {
  await exigirPermiso()
  const tiendaId = aNumero(formData.get('tienda_id'))
  if (!tiendaId) redirect('/tienda/conteo-fisico')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_iniciar_conteo', { p_tienda_id: tiendaId })

  revalidatePath('/tienda/conteo-fisico')
  if (error) {
    redirect(`/tienda/conteo-fisico?tienda_id=${tiendaId}&error=${encodeURIComponent(error.message)}`)
  }
  redirect(`/tienda/conteo-fisico?tienda_id=${tiendaId}`)
}

export async function marcarContado(formData: FormData) {
  await exigirPermiso()
  const conteoId = aNumero(formData.get('conteo_id'))
  const tiendaId = formData.get('tienda_id')
  const codigo = String(formData.get('codigo') ?? '').trim()
  const productoIdDirecto = aNumero(formData.get('producto_id'))
  if (!conteoId) redirect('/tienda/conteo-fisico')

  const supabase = await createClient()
  let productoId = productoIdDirecto

  if (!productoId && codigo) {
    const { data: producto } = await supabase
      .from('conteo_fisico_detalles')
      .select('producto_id, productos!inner ( codigo )')
      .eq('conteo_id', conteoId)
      .eq('productos.codigo', codigo)
      .maybeSingle()
    productoId = (producto as { producto_id: number } | null)?.producto_id ?? null
  }

  if (!productoId) {
    redirect(
      `/tienda/conteo-fisico?tienda_id=${tiendaId}&error=${encodeURIComponent('Código no encontrado en este conteo')}`,
    )
  }

  const { error } = await supabase.rpc('fn_marcar_pieza_contada', {
    p_conteo_id: conteoId,
    p_producto_id: productoId,
  })

  revalidatePath('/tienda/conteo-fisico')
  if (error) {
    redirect(`/tienda/conteo-fisico?tienda_id=${tiendaId}&error=${encodeURIComponent(error.message)}`)
  }
  redirect(`/tienda/conteo-fisico?tienda_id=${tiendaId}&ok=${encodeURIComponent('Pieza registrada')}`)
}

export async function cerrarConteo(formData: FormData) {
  await exigirPermiso()
  const conteoId = aNumero(formData.get('conteo_id'))
  const tiendaId = formData.get('tienda_id')
  if (!conteoId) redirect('/tienda/conteo-fisico')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_cerrar_conteo', { p_conteo_id: conteoId })

  revalidatePath('/tienda/conteo-fisico')
  if (error) {
    redirect(`/tienda/conteo-fisico?tienda_id=${tiendaId}&error=${encodeURIComponent(error.message)}`)
  }
  redirect(`/tienda/conteo-fisico?tienda_id=${tiendaId}&ok=${encodeURIComponent('Conteo cerrado')}`)
}
