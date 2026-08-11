'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { tienePermiso } from '@/lib/permisos'
import { formatearPrecio } from '@/lib/formato'

function aNumero(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export async function separarPieza(formData: FormData) {
  const productoId = aNumero(formData.get('producto_id'))
  if (!productoId) redirect('/catalogo')

  if (!(await tienePermiso('separados', 'crear'))) {
    redirect(`/catalogo/${productoId}?error=No%20tienes%20permiso%20para%20separar%20piezas`)
  }

  const clienteNombre = String(formData.get('cliente_nombre') ?? '').trim()
  const clienteTelefono = String(formData.get('cliente_telefono') ?? '').trim()

  if (!clienteNombre) {
    redirect(`/catalogo/${productoId}?error=El%20nombre%20del%20cliente%20es%20obligatorio`)
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_separar_pieza', {
    p_producto_id: productoId,
    p_cliente_nombre: clienteNombre,
    p_cliente_telefono: clienteTelefono || null,
  })

  if (error) {
    redirect(`/catalogo/${productoId}?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/catalogo')
  revalidatePath('/separados')
  redirect(`/separados?ok=${encodeURIComponent('Pieza separada correctamente')}`)
}

export async function venderPieza(formData: FormData) {
  const productoId = aNumero(formData.get('producto_id'))
  if (!productoId) redirect('/catalogo')

  if (!(await tienePermiso('ventas', 'crear'))) {
    redirect(`/catalogo/${productoId}?error=No%20tienes%20permiso%20para%20registrar%20ventas`)
  }

  const clienteNombre = String(formData.get('cliente_nombre') ?? '').trim()
  const clienteTelefono = String(formData.get('cliente_telefono') ?? '').trim()
  const metodoPago = String(formData.get('metodo_pago') ?? '').trim()
  const monto = aNumero(formData.get('monto'))
  const referencia = String(formData.get('referencia') ?? '').trim()
  const descuentoEmbajadorPct = (await tienePermiso('ventas', 'descuento_embajador'))
    ? aNumero(formData.get('descuento_embajador_pct'))
    : null
  const cantidad = aNumero(formData.get('cantidad')) ?? 1

  if (!clienteNombre || !metodoPago || monto == null) {
    redirect(
      `/catalogo/${productoId}?error=${encodeURIComponent(
        'Cliente, método de pago y monto son obligatorios',
      )}`,
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
    p_descuento_embajador_pct: descuentoEmbajadorPct,
    p_cantidad: cantidad,
  })

  if (error || !ventaId) {
    redirect(`/catalogo/${productoId}?error=${encodeURIComponent(error?.message ?? 'No se pudo registrar la venta')}`)
  }

  revalidatePath('/catalogo')
  revalidatePath('/ventas')

  // Advertencia (no bloqueante): el monto que escribió el vendedor puede
  // no coincidir con el total que calculó el sistema (con descuentos ya
  // aplicados) — se avisa, pero la venta ya quedó registrada.
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

export async function compartirPieza(formData: FormData) {
  const usuario = await obtenerUsuarioActual()
  const productoId = aNumero(formData.get('producto_id'))
  if (!productoId) redirect('/catalogo')

  if (!['tienda', 'asesor', 'embajador', 'admin'].includes(usuario.rol)) {
    redirect(`/catalogo/${productoId}?error=Tu%20rol%20no%20puede%20generar%20enlaces`)
  }

  const supabase = await createClient()
  const { data: token, error } = await supabase.rpc('fn_crear_link_venta', {
    p_tipo: 'pieza',
    p_producto_ids: [productoId],
  })

  if (error || !token) {
    redirect(`/catalogo/${productoId}?error=${encodeURIComponent(error?.message ?? 'No se pudo generar el enlace')}`)
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  redirect(`/catalogo/${productoId}?link=${encodeURIComponent(`${baseUrl}/c/${token}`)}`)
}
