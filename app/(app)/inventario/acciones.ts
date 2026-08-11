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

export async function crearTransferencia(formData: FormData) {
  if (!(await tienePermiso('inventario', 'transferir'))) {
    redirect('/inventario/transferencias?error=No%20tienes%20permiso%20para%20crear%20traslados')
  }

  const tiendaDestinoId = aNumero(formData.get('tienda_destino_id'))
  const productoIds = formData
    .getAll('producto_ids')
    .map((v) => aNumero(v))
    .filter((v): v is number => v !== null)

  if (!tiendaDestinoId || productoIds.length === 0) {
    redirect(
      `/inventario/transferencias?error=${encodeURIComponent('Elige la bodega destino y al menos una pieza')}`,
    )
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_crear_transferencia', {
    p_tienda_destino_id: tiendaDestinoId,
    p_producto_ids: productoIds,
  })

  revalidatePath('/inventario/transferencias')
  revalidatePath('/inventario')
  if (error) {
    redirect(`/inventario/transferencias?error=${encodeURIComponent(error.message)}`)
  }
  redirect(`/inventario/transferencias?ok=${encodeURIComponent('Transferencia creada')}`)
}

export async function marcarDescuento(formData: FormData) {
  if (!(await tienePermiso('inventario', 'marcar_descuento'))) {
    redirect('/inventario?error=No%20tienes%20permiso%20para%20marcar%20descuentos')
  }

  const productoId = aNumero(formData.get('producto_id'))
  const precioDescuento = aNumero(formData.get('precio_descuento'))
  const motivo = String(formData.get('motivo') ?? '').trim()

  if (!productoId || precioDescuento == null) {
    redirect(`/inventario?error=${encodeURIComponent('Indica el nuevo precio')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_marcar_descuento_pieza', {
    p_producto_id: productoId,
    p_precio_descuento: precioDescuento,
    p_motivo: motivo || null,
  })

  revalidatePath('/inventario')
  if (error) redirect(`/inventario?error=${encodeURIComponent(error.message)}`)
  redirect(`/inventario?ok=${encodeURIComponent('Descuento aplicado')}`)
}

export async function quitarDescuento(formData: FormData) {
  if (!(await tienePermiso('inventario', 'marcar_descuento'))) {
    redirect('/inventario?error=No%20tienes%20permiso%20para%20quitar%20descuentos')
  }

  const productoId = aNumero(formData.get('producto_id'))
  if (!productoId) redirect('/inventario')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_quitar_descuento_pieza', { p_producto_id: productoId })

  revalidatePath('/inventario')
  if (error) redirect(`/inventario?error=${encodeURIComponent(error.message)}`)
  redirect(`/inventario?ok=${encodeURIComponent('Descuento retirado')}`)
}

export async function confirmarRecepcion(formData: FormData) {
  const detalleId = aNumero(formData.get('detalle_id'))
  const ok = formData.get('accion') === 'confirmar'
  const comentario = String(formData.get('comentario') ?? '').trim() || null

  if (!detalleId) redirect('/inventario/transferencias')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_confirmar_recepcion', {
    p_detalle_id: detalleId,
    p_ok: ok,
    p_comentario: ok ? null : comentario,
  })

  revalidatePath('/inventario/transferencias')
  revalidatePath('/inventario')
  if (error) {
    redirect(`/inventario/transferencias?error=${encodeURIComponent(error.message)}`)
  }
  redirect(
    `/inventario/transferencias?ok=${encodeURIComponent(ok ? 'Recepción confirmada' : 'Incidencia registrada')}`,
  )
}
