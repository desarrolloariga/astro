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

export type DatosNuevaOrdenCompra = {
  proveedor_id: number
  condiciones_pago: string | null
  fecha_entrega_esperada: string | null
  direccion_entrega: string | null
  metodo_envio: string | null
  referencia_proveedor: string | null
  notas_proveedor: string | null
  notas: string | null
}

/** Crea la orden y agrega de una vez todas las líneas del carrito armado en la misma pantalla. */
export async function crearOrdenCompraConLineas(
  datos: DatosNuevaOrdenCompra,
  lineas: LineaCarritoCompra[],
) {
  if (!(await tienePermiso('compras', 'crear'))) redirect('/inicio')

  if (!datos.proveedor_id) {
    redirect(`/compras/nueva?error=${encodeURIComponent('Elige un proveedor')}`)
  }

  const supabase = await createClient()
  const { data: ordenId, error } = await supabase.rpc('fn_crear_orden_compra', {
    p_proveedor_id: datos.proveedor_id,
    p_condiciones_pago: datos.condiciones_pago,
    p_fecha_entrega_esperada: datos.fecha_entrega_esperada,
    p_direccion_entrega: datos.direccion_entrega,
    p_metodo_envio: datos.metodo_envio,
    p_referencia_proveedor: datos.referencia_proveedor,
    p_notas_proveedor: datos.notas_proveedor,
    p_notas: datos.notas,
  })

  if (error || !ordenId) {
    redirect(`/compras/nueva?error=${encodeURIComponent(error?.message ?? 'No se pudo crear la orden')}`)
  }

  let fallidos = 0
  for (const l of lineas) {
    const { error: errorLinea } = await supabase.rpc('fn_agregar_linea_compra', {
      p_orden_compra_id: ordenId,
      p_producto_id: l.producto_id,
      p_descripcion: l.descripcion,
      p_cantidad: l.cantidad,
      p_costo_unitario: l.costo_unitario,
      p_descuento_pct: l.descuento_pct ?? 0,
    })
    if (errorLinea) fallidos++
  }

  revalidatePath('/compras')
  revalidatePath(`/compras/${ordenId}`)
  if (fallidos > 0) {
    redirect(
      `/compras/${ordenId}?error=${encodeURIComponent(`Orden creada, pero ${fallidos} línea(s) no se pudieron agregar`)}`,
    )
  }
  redirect(`/compras/${ordenId}?ok=${encodeURIComponent('Orden creada con sus líneas')}`)
}

export type LineaCarritoCompra = {
  producto_id: number
  descripcion: string
  cantidad: number
  costo_unitario: number
  descuento_pct: number
}

/** Agrega varias líneas de una vez — el "carrito" que se arma del lado derecho de la orden. */
export async function agregarLineasCompraMasivo(ordenId: number, lineas: LineaCarritoCompra[]) {
  if (!(await tienePermiso('compras', 'crear'))) redirect('/inicio')

  if (!ordenId) redirect('/compras')
  if (!Array.isArray(lineas) || lineas.length === 0) {
    redirect(`/compras/${ordenId}?error=${encodeURIComponent('El carrito está vacío')}`)
  }

  const supabase = await createClient()
  let ok = 0
  let fallidos = 0
  for (const l of lineas) {
    const { error } = await supabase.rpc('fn_agregar_linea_compra', {
      p_orden_compra_id: ordenId,
      p_producto_id: l.producto_id,
      p_descripcion: l.descripcion,
      p_cantidad: l.cantidad,
      p_costo_unitario: l.costo_unitario,
      p_descuento_pct: l.descuento_pct ?? 0,
    })
    if (error) fallidos++
    else ok++
  }

  revalidatePath(`/compras/${ordenId}`)
  const mensaje =
    `${ok} línea${ok !== 1 ? 's' : ''} agregada${ok !== 1 ? 's' : ''}` +
    (fallidos > 0 ? ` · ${fallidos} no se pudieron agregar` : '')
  redirect(`/compras/${ordenId}?${fallidos > 0 ? 'error' : 'ok'}=${encodeURIComponent(mensaje)}`)
}

export async function actualizarImpuestosOrdenCompra(formData: FormData) {
  if (!(await tienePermiso('compras', 'crear'))) redirect('/inicio')

  const ordenId = aNumero(formData.get('orden_compra_id'))
  const impuestos = aNumero(formData.get('impuestos'))
  if (!ordenId) redirect('/compras')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_actualizar_impuestos_orden_compra', {
    p_orden_compra_id: ordenId,
    p_impuestos: impuestos ?? 0,
  })

  revalidatePath(`/compras/${ordenId}`)
  if (error) redirect(`/compras/${ordenId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/compras/${ordenId}?ok=${encodeURIComponent('Impuestos actualizados')}`)
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
  redirect(`/compras/${ordenId}?ok=${encodeURIComponent('Recepción registrada y publicada al CEDI')}`)
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
  const referenciaProveedor = String(formData.get('referencia_proveedor') ?? '').trim() || null

  if (!ordenId) redirect('/compras')
  if (!nombre) {
    redirect(`/compras/${ordenId}?error=${encodeURIComponent('El nombre es obligatorio para crear la pieza')}`)
  }
  if (modoInventario === 'por_cantidad' && (cantidadInicial == null || cantidadInicial <= 0)) {
    redirect(`/compras/${ordenId}?error=${encodeURIComponent('Indica la cantidad inicial de la referencia')}`)
  }
  if (cantidad == null || cantidad <= 0 || costoUnitario == null || costoUnitario < 0) {
    redirect(`/compras/${ordenId}?error=${encodeURIComponent('Indica cantidad y costo válidos para la línea')}`)
  }

  const usuario = await obtenerUsuarioActual()
  const supabase = await createClient()

  const [{ data: moneda }, { data: categoria }, { data: orden }] = await Promise.all([
    supabase.from('monedas').select('id').eq('codigo', 'GTQ').single(),
    supabase.from('categorias').select('nombre').eq('id', categoriaId).maybeSingle(),
    supabase.from('ordenes_compra').select('proveedor_id').eq('id', ordenId).maybeSingle(),
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
    proveedor_id: orden?.proveedor_id ?? null,
    referencia_proveedor: referenciaProveedor,
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
