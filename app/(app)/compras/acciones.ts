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

export async function crearOrdenCompra(formData: FormData) {
  if (!(await tienePermiso('compras', 'crear'))) redirect('/inicio')

  const proveedorId = aNumero(formData.get('proveedor_id'))
  if (!proveedorId) {
    redirect(`/compras/nueva?error=${encodeURIComponent('Elige un proveedor')}`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_crear_orden_compra', {
    p_proveedor_id: proveedorId,
    p_notas: String(formData.get('notas') ?? '').trim() || null,
  })

  if (error || !data) {
    redirect(`/compras/nueva?error=${encodeURIComponent(error?.message ?? 'No se pudo crear la orden')}`)
  }

  revalidatePath('/compras')
  redirect(`/compras/${data}`)
}

export async function agregarLineaCompra(formData: FormData) {
  if (!(await tienePermiso('compras', 'crear'))) redirect('/inicio')

  const ordenId = aNumero(formData.get('orden_compra_id'))
  const cantidad = aNumero(formData.get('cantidad'))
  const costoUnitario = aNumero(formData.get('costo_unitario'))
  const descripcion = String(formData.get('descripcion') ?? '').trim()

  if (!ordenId) redirect('/compras')
  if (!descripcion || cantidad == null || cantidad <= 0 || costoUnitario == null || costoUnitario < 0) {
    redirect(`/compras/${ordenId}?error=${encodeURIComponent('Completa descripción, cantidad y costo válidos')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_agregar_linea_compra', {
    p_orden_compra_id: ordenId,
    p_producto_id: aNumero(formData.get('producto_id')),
    p_descripcion: descripcion,
    p_cantidad: cantidad,
    p_costo_unitario: costoUnitario,
  })

  revalidatePath(`/compras/${ordenId}`)
  if (error) redirect(`/compras/${ordenId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/compras/${ordenId}?ok=${encodeURIComponent('Línea agregada')}`)
}

export async function autorizarOrdenCompra(formData: FormData) {
  if (!(await tienePermiso('compras', 'autorizar'))) redirect('/inicio')

  const ordenId = aNumero(formData.get('orden_compra_id'))
  if (!ordenId) redirect('/compras')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_autorizar_orden_compra', { p_orden_compra_id: ordenId })

  revalidatePath(`/compras/${ordenId}`)
  if (error) redirect(`/compras/${ordenId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/compras/${ordenId}?ok=${encodeURIComponent('Orden autorizada')}`)
}

export async function recibirLineaCompra(formData: FormData) {
  if (!(await tienePermiso('compras', 'recibir'))) redirect('/inicio')

  const ordenId = aNumero(formData.get('orden_compra_id'))
  const detalleId = aNumero(formData.get('detalle_id'))
  const cantidadRecibida = aNumero(formData.get('cantidad_recibida'))
  if (!ordenId || !detalleId) redirect('/compras')
  if (cantidadRecibida == null || cantidadRecibida <= 0) {
    redirect(`/compras/${ordenId}?error=${encodeURIComponent('Indica una cantidad recibida válida')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_recibir_linea_compra', {
    p_detalle_id: detalleId,
    p_cantidad_recibida: cantidadRecibida,
    p_costo_unitario_real: aNumero(formData.get('costo_unitario_real')),
  })

  revalidatePath(`/compras/${ordenId}`)
  if (error) redirect(`/compras/${ordenId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/compras/${ordenId}?ok=${encodeURIComponent('Recepción registrada')}`)
}

export async function marcarFacturadaCompra(formData: FormData) {
  if (!(await tienePermiso('compras', 'facturar'))) redirect('/inicio')

  const ordenId = aNumero(formData.get('orden_compra_id'))
  const numeroFactura = String(formData.get('numero_factura') ?? '').trim()
  if (!ordenId) redirect('/compras')
  if (!numeroFactura) {
    redirect(`/compras/${ordenId}?error=${encodeURIComponent('Indica el número de factura del proveedor')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_marcar_facturada_compra', {
    p_orden_compra_id: ordenId,
    p_numero_factura: numeroFactura,
  })

  revalidatePath(`/compras/${ordenId}`)
  if (error) redirect(`/compras/${ordenId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/compras/${ordenId}?ok=${encodeURIComponent('Orden marcada como facturada')}`)
}

export async function marcarPagadaCompra(formData: FormData) {
  if (!(await tienePermiso('compras', 'pagar'))) redirect('/inicio')

  const ordenId = aNumero(formData.get('orden_compra_id'))
  if (!ordenId) redirect('/compras')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_marcar_pagada_compra', { p_orden_compra_id: ordenId })

  revalidatePath(`/compras/${ordenId}`)
  if (error) redirect(`/compras/${ordenId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/compras/${ordenId}?ok=${encodeURIComponent('Orden marcada como pagada')}`)
}

export async function cancelarOrdenCompra(formData: FormData) {
  if (!(await tienePermiso('compras', 'autorizar'))) redirect('/inicio')

  const ordenId = aNumero(formData.get('orden_compra_id'))
  const motivo = String(formData.get('motivo') ?? '').trim()
  if (!ordenId) redirect('/compras')
  if (!motivo) {
    redirect(`/compras/${ordenId}?error=${encodeURIComponent('Indica el motivo de la cancelación')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_cancelar_orden_compra', {
    p_orden_compra_id: ordenId,
    p_motivo: motivo,
  })

  revalidatePath(`/compras/${ordenId}`)
  revalidatePath('/compras')
  if (error) redirect(`/compras/${ordenId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/compras?ok=${encodeURIComponent('Orden cancelada')}`)
}
