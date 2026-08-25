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

export async function crearImportacion(formData: FormData) {
  if (!(await tienePermiso('importaciones', 'crear'))) redirect('/inicio')

  const proveedorId = aNumero(formData.get('proveedor_id'))
  if (!proveedorId) {
    redirect(`/importaciones/nueva?error=${encodeURIComponent('Elige un proveedor')}`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_crear_importacion', {
    p_proveedor_id: proveedorId,
    p_moneda_origen_id: aNumero(formData.get('moneda_origen_id')),
    p_tipo_cambio: aNumero(formData.get('tipo_cambio')) ?? 1,
    p_notas: String(formData.get('notas') ?? '').trim() || null,
  })

  if (error || !data) {
    redirect(`/importaciones/nueva?error=${encodeURIComponent(error?.message ?? 'No se pudo crear la importación')}`)
  }

  revalidatePath('/importaciones')
  redirect(`/importaciones/${data}`)
}

export async function agregarLineaImportacion(formData: FormData) {
  if (!(await tienePermiso('importaciones', 'crear'))) redirect('/inicio')

  const importacionId = aNumero(formData.get('importacion_id'))
  const cantidad = aNumero(formData.get('cantidad'))
  const valorFobUnitario = aNumero(formData.get('valor_fob_unitario'))
  const descripcion = String(formData.get('descripcion') ?? '').trim()

  if (!importacionId) redirect('/importaciones')
  if (!descripcion || cantidad == null || cantidad <= 0 || valorFobUnitario == null || valorFobUnitario < 0) {
    redirect(
      `/importaciones/${importacionId}?error=${encodeURIComponent('Completa descripción, cantidad y valor FOB válidos')}`,
    )
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_agregar_linea_importacion', {
    p_importacion_id: importacionId,
    p_producto_id: aNumero(formData.get('producto_id')),
    p_descripcion: descripcion,
    p_cantidad: cantidad,
    p_valor_fob_unitario: valorFobUnitario,
  })

  revalidatePath(`/importaciones/${importacionId}`)
  if (error) redirect(`/importaciones/${importacionId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/importaciones/${importacionId}?ok=${encodeURIComponent('Línea agregada')}`)
}

export async function autorizarImportacion(formData: FormData) {
  if (!(await tienePermiso('importaciones', 'autorizar'))) redirect('/inicio')

  const importacionId = aNumero(formData.get('importacion_id'))
  if (!importacionId) redirect('/importaciones')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_autorizar_importacion', { p_importacion_id: importacionId })

  revalidatePath(`/importaciones/${importacionId}`)
  if (error) redirect(`/importaciones/${importacionId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/importaciones/${importacionId}?ok=${encodeURIComponent('Importación autorizada')}`)
}

export async function marcarEnTransitoImportacion(formData: FormData) {
  if (!(await tienePermiso('importaciones', 'autorizar'))) redirect('/inicio')

  const importacionId = aNumero(formData.get('importacion_id'))
  if (!importacionId) redirect('/importaciones')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_marcar_en_transito_importacion', {
    p_importacion_id: importacionId,
  })

  revalidatePath(`/importaciones/${importacionId}`)
  if (error) redirect(`/importaciones/${importacionId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/importaciones/${importacionId}?ok=${encodeURIComponent('Marcada en tránsito')}`)
}

export async function recibirLineaImportacion(formData: FormData) {
  if (!(await tienePermiso('importaciones', 'recibir'))) redirect('/inicio')

  const importacionId = aNumero(formData.get('importacion_id'))
  const detalleId = aNumero(formData.get('detalle_id'))
  const cantidadRecibida = aNumero(formData.get('cantidad_recibida'))
  if (!importacionId || !detalleId) redirect('/importaciones')
  if (cantidadRecibida == null || cantidadRecibida <= 0) {
    redirect(`/importaciones/${importacionId}?error=${encodeURIComponent('Indica una cantidad recibida válida')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_recibir_linea_importacion', {
    p_detalle_id: detalleId,
    p_cantidad_recibida: cantidadRecibida,
  })

  revalidatePath(`/importaciones/${importacionId}`)
  if (error) redirect(`/importaciones/${importacionId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/importaciones/${importacionId}?ok=${encodeURIComponent('Recepción registrada')}`)
}

export async function nacionalizarImportacion(formData: FormData) {
  if (!(await tienePermiso('importaciones', 'costear'))) redirect('/inicio')

  const importacionId = aNumero(formData.get('importacion_id'))
  if (!importacionId) redirect('/importaciones')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_nacionalizar_importacion', {
    p_importacion_id: importacionId,
    p_flete_internacional: aNumero(formData.get('flete_internacional')) ?? 0,
    p_seguro: aNumero(formData.get('seguro')) ?? 0,
    p_aranceles: aNumero(formData.get('aranceles')) ?? 0,
    p_gastos_aduana: aNumero(formData.get('gastos_aduana')) ?? 0,
    p_transporte_interno: aNumero(formData.get('transporte_interno')) ?? 0,
  })

  revalidatePath(`/importaciones/${importacionId}`)
  if (error) redirect(`/importaciones/${importacionId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/importaciones/${importacionId}?ok=${encodeURIComponent('Importación nacionalizada')}`)
}

export async function marcarFacturadaImportacion(formData: FormData) {
  if (!(await tienePermiso('importaciones', 'facturar'))) redirect('/inicio')

  const importacionId = aNumero(formData.get('importacion_id'))
  const numeroFactura = String(formData.get('numero_factura') ?? '').trim()
  if (!importacionId) redirect('/importaciones')
  if (!numeroFactura) {
    redirect(`/importaciones/${importacionId}?error=${encodeURIComponent('Indica el número de factura del proveedor')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_marcar_facturada_importacion', {
    p_importacion_id: importacionId,
    p_numero_factura: numeroFactura,
  })

  revalidatePath(`/importaciones/${importacionId}`)
  if (error) redirect(`/importaciones/${importacionId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/importaciones/${importacionId}?ok=${encodeURIComponent('Importación marcada como facturada')}`)
}

export async function marcarPagadaImportacion(formData: FormData) {
  if (!(await tienePermiso('importaciones', 'pagar'))) redirect('/inicio')

  const importacionId = aNumero(formData.get('importacion_id'))
  if (!importacionId) redirect('/importaciones')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_marcar_pagada_importacion', {
    p_importacion_id: importacionId,
  })

  revalidatePath(`/importaciones/${importacionId}`)
  if (error) redirect(`/importaciones/${importacionId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/importaciones/${importacionId}?ok=${encodeURIComponent('Importación marcada como pagada')}`)
}

export async function cancelarImportacion(formData: FormData) {
  if (!(await tienePermiso('importaciones', 'autorizar'))) redirect('/inicio')

  const importacionId = aNumero(formData.get('importacion_id'))
  const motivo = String(formData.get('motivo') ?? '').trim()
  if (!importacionId) redirect('/importaciones')
  if (!motivo) {
    redirect(`/importaciones/${importacionId}?error=${encodeURIComponent('Indica el motivo de la cancelación')}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_cancelar_importacion', {
    p_importacion_id: importacionId,
    p_motivo: motivo,
  })

  revalidatePath(`/importaciones/${importacionId}`)
  revalidatePath('/importaciones')
  if (error) redirect(`/importaciones/${importacionId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/importaciones?ok=${encodeURIComponent('Importación cancelada')}`)
}
