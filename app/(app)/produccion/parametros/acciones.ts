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

export async function actualizarParametrosArticulo(formData: FormData) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'produccion' && usuario.rol !== 'admin') {
    redirect('/inicio')
  }

  const productoId = aNumero(formData.get('producto_id'))
  if (!productoId) redirect('/produccion/parametros')

  const puntoReorden = aNumero(formData.get('punto_reorden'))
  const diasSinVenta = aNumero(formData.get('dias_sin_venta_descuento'))

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_actualizar_parametros_articulo', {
    p_producto_id: productoId,
    p_punto_reorden: puntoReorden,
    p_dias_sin_venta_descuento: diasSinVenta,
  })

  revalidatePath('/produccion/parametros')
  if (error) redirect(`/produccion/parametros?error=${encodeURIComponent(error.message)}`)
  redirect(`/produccion/parametros?ok=${encodeURIComponent('Parámetros actualizados')}`)
}
