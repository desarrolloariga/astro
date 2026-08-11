'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearPrecio } from '@/lib/formato'

function aNumero(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export async function liberarSeparado(formData: FormData) {
  const separadoId = aNumero(formData.get('separado_id'))
  if (!separadoId) redirect('/separados')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_liberar_separado', {
    p_separado_id: separadoId,
    p_motivo: String(formData.get('motivo') ?? '').trim() || null,
  })

  revalidatePath('/separados')
  revalidatePath('/catalogo')
  if (error) {
    redirect(`/separados?error=${encodeURIComponent(error.message)}`)
  }
  redirect(`/separados?ok=${encodeURIComponent('Separado liberado')}`)
}

export async function venderDesdeSeparado(formData: FormData) {
  const separadoId = aNumero(formData.get('separado_id'))
  const productoId = aNumero(formData.get('producto_id'))
  const clienteNombre = String(formData.get('cliente_nombre') ?? '').trim()
  const clienteTelefono = String(formData.get('cliente_telefono') ?? '').trim()
  const metodoPago = String(formData.get('metodo_pago') ?? '').trim()
  const monto = aNumero(formData.get('monto'))
  const referencia = String(formData.get('referencia') ?? '').trim()

  if (!separadoId || !productoId) redirect('/separados')
  if (!(await tienePermiso('ventas', 'crear'))) {
    redirect(`/separados?error=${encodeURIComponent('No tienes permiso para registrar ventas')}`)
  }
  if (!clienteNombre || !metodoPago || monto == null) {
    redirect(
      `/separados?error=${encodeURIComponent('Cliente, método de pago y monto son obligatorios')}`,
    )
  }

  const supabase = await createClient()
  const { data: ventaId, error } = await supabase.rpc('fn_registrar_venta', {
    p_producto_ids: [productoId],
    p_cliente_nombre: clienteNombre,
    p_cliente_telefono: clienteTelefono || null,
    p_metodo_pago: metodoPago,
    p_monto: monto,
    p_referencia: referencia || null,
    p_separado_id: separadoId,
  })

  revalidatePath('/separados')
  revalidatePath('/ventas')
  if (error || !ventaId) {
    redirect(`/separados?error=${encodeURIComponent(error?.message ?? 'No se pudo registrar la venta')}`)
  }

  // Advertencia (no bloqueante): igual que en venderPieza — el monto
  // manual puede no coincidir con el total ya calculado por el sistema.
  const { data: ventaCreada } = await supabase.from('ventas').select('total').eq('id', ventaId).maybeSingle()
  if (ventaCreada && Math.abs(ventaCreada.total - monto) > 0.01) {
    redirect(
      `/ventas?aviso=${encodeURIComponent(
        `Venta #${ventaId} registrada, pero el monto cobrado (${formatearPrecio(monto)}) no coincide con el total calculado (${formatearPrecio(ventaCreada.total)}). Revísalo antes de aprobar el comprobante.`,
      )}`,
    )
  }

  redirect(`/ventas?ok=${encodeURIComponent('Venta registrada. Sube el comprobante de pago.')}`)
}
