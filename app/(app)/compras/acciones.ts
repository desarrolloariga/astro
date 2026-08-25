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

export async function crearOrdenCompra(formData: FormData) {
  if (!(await tienePermiso('compras', 'crear'))) redirect('/inicio')

  const proveedorId = aNumero(formData.get('proveedor_id'))
  if (!proveedorId) {
    redirect(`/compras/nueva?error=${encodeURIComponent('Elige un proveedor')}`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_crear_orden_compra', {
    p_proveedor_id: proveedorId,
    p_condiciones_pago: aTexto(formData, 'condiciones_pago'),
    p_fecha_entrega_esperada: aTexto(formData, 'fecha_entrega_esperada'),
    p_direccion_entrega: aTexto(formData, 'direccion_entrega'),
    p_metodo_envio: aTexto(formData, 'metodo_envio'),
    p_referencia_proveedor: aTexto(formData, 'referencia_proveedor'),
    p_notas_proveedor: aTexto(formData, 'notas_proveedor'),
    p_notas: aTexto(formData, 'notas'),
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
  const productoId = aNumero(formData.get('producto_id'))
  const cantidad = aNumero(formData.get('cantidad'))
  const costoUnitario = aNumero(formData.get('costo_unitario'))
  let descripcion = String(formData.get('descripcion') ?? '').trim()

  if (!ordenId) redirect('/compras')
  if (!descripcion && !productoId) {
    redirect(`/compras/${ordenId}?error=${encodeURIComponent('Elige un producto del maestro o escribe una descripción')}`)
  }
  if (cantidad == null || cantidad <= 0 || costoUnitario == null || costoUnitario < 0) {
    redirect(`/compras/${ordenId}?error=${encodeURIComponent('Indica cantidad y costo válidos')}`)
  }

  const supabase = await createClient()

  // Si se eligió una pieza del maestro y no se escribió descripción,
  // se usa su propio nombre — el picker ya la identifica sin ambigüedad.
  if (!descripcion && productoId) {
    const { data: producto } = await supabase
      .from('productos')
      .select('codigo, nombre')
      .eq('id', productoId)
      .maybeSingle()
    descripcion = producto ? `${producto.codigo} — ${producto.nombre}` : 'Producto vinculado'
  }

  const { error } = await supabase.rpc('fn_agregar_linea_compra', {
    p_orden_compra_id: ordenId,
    p_producto_id: productoId,
    p_descripcion: descripcion,
    p_cantidad: cantidad,
    p_costo_unitario: costoUnitario,
    p_descuento_pct: aNumero(formData.get('descuento_pct')) ?? 0,
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

/**
 * Acceso rápido: da de alta una pieza nueva (ficha mínima, la misma
 * que produccion/nueva puede completar después) y de una vez la
 * agrega como línea a la orden — sin salir del flujo de compras.
 */
export async function crearProductoYAgregarLineaCompra(formData: FormData) {
  if (!(await tienePermiso('compras', 'crear'))) redirect('/inicio')

  const ordenId = aNumero(formData.get('orden_compra_id'))
  const nombre = String(formData.get('nombre') ?? '').trim()
  const categoriaId = aNumero(formData.get('categoria_id'))
  const origen = formData.get('origen') === 'importado' ? 'importado' : 'local'
  const modoInventario = formData.get('modo_inventario') === 'por_cantidad' ? 'por_cantidad' : 'pieza_unica'
  const cantidadInicial = modoInventario === 'por_cantidad' ? aNumero(formData.get('cantidad_inicial_producto')) : null
  const cantidad = aNumero(formData.get('cantidad'))
  const costoUnitario = aNumero(formData.get('costo_unitario'))

  if (!ordenId) redirect('/compras')
  if (!nombre || !categoriaId) {
    redirect(`/compras/${ordenId}?error=${encodeURIComponent('Nombre y categoría son obligatorios para crear la pieza')}`)
  }
  if (modoInventario === 'por_cantidad' && (cantidadInicial == null || cantidadInicial <= 0)) {
    redirect(`/compras/${ordenId}?error=${encodeURIComponent('Indica la cantidad inicial de la referencia')}`)
  }
  if (cantidad == null || cantidad <= 0 || costoUnitario == null || costoUnitario < 0) {
    redirect(`/compras/${ordenId}?error=${encodeURIComponent('Indica cantidad y costo válidos para la línea')}`)
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
    origen,
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
    redirect(`/compras/${ordenId}?error=${encodeURIComponent(error?.message ?? 'No se pudo crear la pieza')}`)
  }

  const { error: errorLinea } = await supabase.rpc('fn_agregar_linea_compra', {
    p_orden_compra_id: ordenId,
    p_producto_id: pieza.id,
    p_descripcion: `${codigo} — ${nombre}`,
    p_cantidad: cantidad,
    p_costo_unitario: costoUnitario,
  })

  revalidatePath(`/compras/${ordenId}`)
  revalidatePath('/produccion')
  if (errorLinea) {
    redirect(
      `/compras/${ordenId}?error=${encodeURIComponent(`Pieza ${codigo} creada, pero no se pudo agregar la línea: ${errorLinea.message}`)}`,
    )
  }
  redirect(`/compras/${ordenId}?ok=${encodeURIComponent(`Pieza ${codigo} creada y agregada a la orden`)}`)
}
