'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'

const NIVELES_VALIDOS = ['introduccion', 'socio_comercial', 'importacion', 'descuento']

export async function cambiarNivelGanancia(formData: FormData) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'produccion' && usuario.rol !== 'admin') {
    redirect('/inicio')
  }

  const productoId = String(formData.get('producto_id') ?? '').trim()
  const nivelGanancia = String(formData.get('nivel_ganancia') ?? '').trim()

  if (!productoId) redirect('/produccion')
  if (!NIVELES_VALIDOS.includes(nivelGanancia)) {
    redirect(`/produccion/${productoId}/costos?error=${encodeURIComponent('Nivel de ganancia inválido')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_cambiar_nivel_ganancia_producto', {
    p_producto_id: Number(productoId),
    p_nivel_ganancia: nivelGanancia,
    p_motivo: 'cambio_nivel_ganancia',
  })

  revalidatePath(`/produccion/${productoId}/costos`)
  revalidatePath('/produccion')
  if (error) {
    redirect(`/produccion/${productoId}/costos?error=${encodeURIComponent(error.message)}`)
  }
  redirect(`/produccion/${productoId}/costos?ok=${encodeURIComponent('Nivel de ganancia actualizado')}`)
}
