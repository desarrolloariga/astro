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

async function exigirAcceso() {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'produccion' && usuario.rol !== 'admin') {
    redirect('/inicio')
  }
}

/** Suma cantidad a un solo artículo desde el listado de Existencias. */
export async function sumarInventarioUnitario(formData: FormData) {
  await exigirAcceso()

  const productoId = aNumero(formData.get('producto_id'))
  const cantidad = aNumero(formData.get('cantidad'))
  if (!productoId || cantidad == null || cantidad <= 0) {
    redirect(`/existencias?error=${encodeURIComponent('Indica una cantidad válida (mayor a 0)')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_sumar_inventario_producto', {
    p_producto_id: productoId,
    p_cantidad: cantidad,
    p_motivo: 'ajuste_existencias',
  })

  revalidatePath('/existencias')
  if (error) redirect(`/existencias?error=${encodeURIComponent(error.message)}`)
  redirect(`/existencias?ok=${encodeURIComponent('Inventario actualizado')}`)
}

export type FilaExistencia = { producto_id: number; cantidad: number }

/** Carga masiva desde Excel simplificado (Referencia + Cantidad) — solo suma a artículos que ya existen. */
export async function cargarExistenciasMasivo(filas: FilaExistencia[]) {
  await exigirAcceso()

  if (!Array.isArray(filas) || filas.length === 0) {
    redirect(`/existencias/cargar?error=${encodeURIComponent('No hay filas para cargar')}`)
  }

  const supabase = await createClient()
  let ok = 0
  let fallidos = 0
  for (const f of filas) {
    const { error } = await supabase.rpc('fn_sumar_inventario_producto', {
      p_producto_id: f.producto_id,
      p_cantidad: f.cantidad,
      p_motivo: 'carga_existencias',
    })
    if (error) fallidos++
    else ok++
  }

  revalidatePath('/existencias')
  const mensaje =
    `${ok} artículo${ok !== 1 ? 's' : ''} actualizado${ok !== 1 ? 's' : ''}` +
    (fallidos > 0 ? ` · ${fallidos} no se pudieron actualizar` : '')
  redirect(`/existencias/cargar?${fallidos > 0 ? 'aviso' : 'ok'}=${encodeURIComponent(mensaje)}`)
}
