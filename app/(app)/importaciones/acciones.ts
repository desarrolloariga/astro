'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { prefijoDesdeCategoria } from '@/lib/productos'

function aNumero(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function aTexto(formData: FormData, nombre: string): string | null {
  const texto = String(formData.get(nombre) ?? '').trim()
  return texto || null
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
    p_condiciones_pago: aTexto(formData, 'condiciones_pago'),
    p_fecha_entrega_esperada: aTexto(formData, 'fecha_entrega_esperada'),
    p_direccion_entrega: aTexto(formData, 'direccion_entrega'),
    p_metodo_envio: aTexto(formData, 'metodo_envio'),
    p_referencia_proveedor: aTexto(formData, 'referencia_proveedor'),
    p_notas_proveedor: aTexto(formData, 'notas_proveedor'),
    p_notas: aTexto(formData, 'notas'),
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
  const productoId = aNumero(formData.get('producto_id'))
  const cantidad = aNumero(formData.get('cantidad'))
  const valorFobUnitario = aNumero(formData.get('valor_fob_unitario'))
  let descripcion = String(formData.get('descripcion') ?? '').trim()

  if (!importacionId) redirect('/importaciones')
  if (!descripcion && !productoId) {
    redirect(
      `/importaciones/${importacionId}?error=${encodeURIComponent('Elige un producto del maestro o escribe una descripción')}`,
    )
  }
  if (cantidad == null || cantidad <= 0 || valorFobUnitario == null || valorFobUnitario < 0) {
    redirect(`/importaciones/${importacionId}?error=${encodeURIComponent('Indica cantidad y valor FOB válidos')}`)
  }

  const supabase = await createClient()

  if (!descripcion && productoId) {
    const { data: producto } = await supabase
      .from('productos')
      .select('codigo, nombre')
      .eq('id', productoId)
      .maybeSingle()
    descripcion = producto ? `${producto.codigo} — ${producto.nombre}` : 'Producto vinculado'
  }

  const { error } = await supabase.rpc('fn_agregar_linea_importacion', {
    p_importacion_id: importacionId,
    p_producto_id: productoId,
    p_descripcion: descripcion,
    p_cantidad: cantidad,
    p_valor_fob_unitario: valorFobUnitario,
    p_descuento_pct: aNumero(formData.get('descuento_pct')) ?? 0,
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

/**
 * Acceso rápido: da de alta una pieza nueva y de una vez la agrega
 * como línea al embarque — sin salir del flujo de importaciones.
 */
export async function crearProductoYAgregarLineaImportacion(formData: FormData) {
  if (!(await tienePermiso('importaciones', 'crear'))) redirect('/inicio')

  const importacionId = aNumero(formData.get('importacion_id'))
  const nombre = String(formData.get('nombre') ?? '').trim()
  const categoriaId = aNumero(formData.get('categoria_id'))
  const modoInventario = formData.get('modo_inventario') === 'por_cantidad' ? 'por_cantidad' : 'pieza_unica'
  const cantidadInicial = modoInventario === 'por_cantidad' ? aNumero(formData.get('cantidad_inicial_producto')) : null
  const cantidad = aNumero(formData.get('cantidad'))
  const valorFobUnitario = aNumero(formData.get('valor_fob_unitario'))

  if (!importacionId) redirect('/importaciones')
  if (!nombre || !categoriaId) {
    redirect(`/importaciones/${importacionId}?error=${encodeURIComponent('Nombre y categoría son obligatorios para crear la pieza')}`)
  }
  if (modoInventario === 'por_cantidad' && (cantidadInicial == null || cantidadInicial <= 0)) {
    redirect(`/importaciones/${importacionId}?error=${encodeURIComponent('Indica la cantidad inicial de la referencia')}`)
  }
  if (cantidad == null || cantidad <= 0 || valorFobUnitario == null || valorFobUnitario < 0) {
    redirect(`/importaciones/${importacionId}?error=${encodeURIComponent('Indica cantidad y valor FOB válidos para la línea')}`)
  }

  const usuario = await obtenerUsuarioActual()
  const supabase = await createClient()

  const [{ data: moneda }, { data: categoria }] = await Promise.all([
    supabase.from('monedas').select('id').eq('codigo', 'GTQ').single(),
    supabase.from('categorias').select('nombre').eq('id', categoriaId).maybeSingle(),
  ])

  const prefijo = prefijoDesdeCategoria(categoria?.nombre)
  const { count: existentes } = await supabase
    .from('productos')
    .select('id', { count: 'exact', head: true })
    .ilike('codigo', `${prefijo}-%`)

  let numero = (existentes ?? 0) + 1
  let codigo = `${prefijo}-${String(numero).padStart(4, '0')}`

  const datosBase = {
    nombre,
    categoria_id: categoriaId,
    origen: 'importado' as const,
    modo_inventario: modoInventario,
    cantidad_inicial: cantidadInicial,
    moneda_id: moneda?.id ?? null,
    creado_por: usuario.id,
  }

  let pieza: { id: number } | null = null
  let error: { code?: string; message: string } | null = null

  for (let intento = 0; intento < 5; intento++) {
    const resultado = await supabase.from('productos').insert({ ...datosBase, codigo }).select('id').single()
    if (!resultado.error) {
      pieza = resultado.data
      break
    }
    if (resultado.error.code === '23505') {
      numero++
      codigo = `${prefijo}-${String(numero).padStart(4, '0')}`
      continue
    }
    error = resultado.error
    break
  }

  if (!pieza) {
    redirect(`/importaciones/${importacionId}?error=${encodeURIComponent(error?.message ?? 'No se pudo crear la pieza')}`)
  }

  const { error: errorLinea } = await supabase.rpc('fn_agregar_linea_importacion', {
    p_importacion_id: importacionId,
    p_producto_id: pieza.id,
    p_descripcion: `${codigo} — ${nombre}`,
    p_cantidad: cantidad,
    p_valor_fob_unitario: valorFobUnitario,
  })

  revalidatePath(`/importaciones/${importacionId}`)
  revalidatePath('/produccion')
  if (errorLinea) {
    redirect(
      `/importaciones/${importacionId}?error=${encodeURIComponent(`Pieza ${codigo} creada, pero no se pudo agregar la línea: ${errorLinea.message}`)}`,
    )
  }
  redirect(`/importaciones/${importacionId}?ok=${encodeURIComponent(`Pieza ${codigo} creada y agregada al embarque`)}`)
}
