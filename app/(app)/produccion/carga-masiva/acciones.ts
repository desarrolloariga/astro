'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { obtenerUsuarioActual } from '@/lib/usuario'

type PiezaCargaMasiva = {
  codigo: string
  nombre: string
  descripcion: string | null
  categoria: string
  material: string | null
  origen: string
  costo_produccion: number | null
  peso_gramos: number | null
  kilataje: string | null
  piedras: string | null
  modo_inventario: 'pieza_unica' | 'por_cantidad'
  cantidad_inicial: number | null
  atributos: Record<string, unknown>
  marca: string | null
  coleccion: string | null
  codigo_barras: string | null
  etiquetas: string[]
  proveedor: string | null
  punto_reorden: number | null
  nivel_ganancia: 'introduccion' | 'socio_comercial' | 'importacion'
  producto_existente_id: number | null
}

/**
 * Resuelve nombre → id contra una tabla de catálogo (comparación sin
 * mayúsculas/minúsculas), creando las filas que falten. Devuelve el
 * mapa completo (existentes + recién creadas) y cuántas se crearon.
 */
async function resolverOCrearCatalogo(
  admin: ReturnType<typeof createAdminClient>,
  tabla: 'categorias' | 'materiales' | 'proveedores',
  nombres: string[],
  datosExtra?: (nombre: string) => Record<string, unknown>,
): Promise<{ mapa: Map<string, number>; creadas: string[] }> {
  const distintos = Array.from(new Set(nombres.filter(Boolean)))
  const mapa = new Map<string, number>()
  if (distintos.length === 0) return { mapa, creadas: [] }

  const { data: existentes } = await admin.from(tabla).select('id, nombre')
  for (const fila of existentes ?? []) {
    mapa.set(fila.nombre.toLowerCase(), fila.id)
  }

  const faltantes = distintos.filter((n) => !mapa.has(n.toLowerCase()))
  if (faltantes.length === 0) return { mapa, creadas: [] }

  const filasNuevas = faltantes.map((nombre) => ({
    nombre,
    ...(datosExtra ? datosExtra(nombre) : {}),
  }))

  const { data: creadas, error } = await admin.from(tabla).insert(filasNuevas).select('id, nombre')
  if (error) {
    // Carrera improbable (otra carga creó el mismo nombre a la vez) —
    // no es fatal, se resuelve releyendo el catálogo.
    const { data: reintento } = await admin.from(tabla).select('id, nombre')
    for (const fila of reintento ?? []) mapa.set(fila.nombre.toLowerCase(), fila.id)
    return { mapa, creadas: [] }
  }

  for (const fila of creadas ?? []) mapa.set(fila.nombre.toLowerCase(), fila.id)
  return { mapa, creadas: faltantes }
}

export type TrazabilidadCargaMasiva = {
  numero_factura: string | null
  referencia_orden_compra: string | null
  proveedor_id: number | null
  notas: string | null
  subtotal: number | null
  impuestos: number | null
}

export async function cargarPiezasMasivo(piezas: PiezaCargaMasiva[], trazabilidad?: TrazabilidadCargaMasiva) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'produccion' && usuario.rol !== 'admin') {
    redirect('/inicio')
  }

  if (!Array.isArray(piezas) || piezas.length === 0) {
    redirect(`/produccion/carga-masiva?error=${encodeURIComponent('No hay artículos para cargar')}`)
  }

  // Si se captura trazabilidad financiera (factura, subtotal o
  // impuestos), el proveedor pasa a ser obligatorio — esa carga va a
  // generar una orden de compra real (ordenes_compra.proveedor_id es
  // NOT NULL), no solo el registro de trazabilidad.
  const requiereOrdenCompra = Boolean(
    trazabilidad && (trazabilidad.numero_factura || trazabilidad.subtotal || trazabilidad.impuestos),
  )
  if (requiereOrdenCompra && !trazabilidad?.proveedor_id) {
    redirect(
      `/produccion/carga-masiva?error=${encodeURIComponent(
        'Indica el proveedor del lote — es obligatorio cuando capturas factura, subtotal o impuestos',
      )}`,
    )
  }

  // Las filas cuyo código ya existe (producto_existente_id) no crean
  // un producto nuevo: solo reabastecen el inventario de ese producto
  // con la "cantidad_inicial" del Excel (ver fn_sumar_inventario_producto).
  const piezasNuevas = piezas.filter((p) => p.producto_existente_id == null)
  const piezasReabastecer = piezas.filter((p) => p.producto_existente_id != null)

  const filaInvalida = piezasNuevas.some((p) => !p.codigo?.trim() || !p.nombre?.trim())
  if (filaInvalida) {
    redirect(`/produccion/carga-masiva?error=${encodeURIComponent('Hay filas sin código o nombre')}`)
  }
  const cantidadInvalida = piezasNuevas.some(
    (p) => p.modo_inventario === 'por_cantidad' && (p.cantidad_inicial == null || p.cantidad_inicial <= 0),
  )
  if (cantidadInvalida) {
    redirect(
      `/produccion/carga-masiva?error=${encodeURIComponent('Hay filas por cantidad sin una cantidad válida')}`,
    )
  }
  const reabastecerInvalido = piezasReabastecer.some((p) => p.cantidad_inicial == null || p.cantidad_inicial <= 0)
  if (reabastecerInvalido) {
    redirect(
      `/produccion/carga-masiva?error=${encodeURIComponent('Hay filas de reabastecimiento sin una cantidad válida')}`,
    )
  }

  const supabase = await createClient()

  let reabastecidos = 0
  for (const p of piezasReabastecer) {
    const { error: errorReabastecer } = await supabase.rpc('fn_sumar_inventario_producto', {
      p_producto_id: p.producto_existente_id,
      p_cantidad: p.cantidad_inicial,
      p_motivo: 'carga_masiva',
    })
    if (!errorReabastecer) reabastecidos++
  }

  if (piezasNuevas.length === 0) {
    revalidatePath('/produccion')
    redirect(
      `/produccion?ok=${encodeURIComponent(
        reabastecidos > 0 ? `${reabastecidos} artículos reabastecidos` : 'No había artículos nuevos que cargar',
      )}`,
    )
  }
  // categorias/materiales/proveedores son de escritura admin-only por
  // RLS — producción no tiene ese permiso directo, así que la
  // creación automática de dependencias usa el cliente de servicio
  // (el rol ya se validó arriba: solo produccion/admin llegan aquí).
  const admin = createAdminClient()

  // Categoría, material y proveedor se resuelven contra el catálogo
  // existente y se crean automáticamente los que falten — así una
  // carga masiva ya no se rechaza solo porque el archivo trae una
  // categoría (u otra dependencia) que todavía no existe. Una
  // categoría nueva se crea con grupo='general' (default de la
  // columna) — la carga masiva ya no pide elegir un grupo, así que no
  // hay forma de inferir si le corresponden campos de ficha técnica
  // especiales (kilataje/piedras, talla/color/tela, etc.).
  const [{ mapa: mapaCategorias, creadas: categoriasCreadas }, { mapa: mapaMateriales, creadas: materialesCreados }] =
    await Promise.all([
      resolverOCrearCatalogo(admin, 'categorias', piezasNuevas.map((p) => p.categoria)),
      resolverOCrearCatalogo(
        admin,
        'materiales',
        piezasNuevas.map((p) => p.material ?? '').filter(Boolean),
      ),
    ])

  // El tipo del proveedor nuevo se infiere de la primera fila que lo
  // menciona: "origen" ahora es texto libre (país de procedencia), así
  // que un proveedor se considera local solo si ese texto dice
  // literalmente "local" o "Guatemala" — cualquier otro país cuenta
  // como importado. Es solo el valor inicial, se ajusta después desde
  // Proveedores si hace falta.
  const esOrigenLocal = (origen: string) => ['local', 'guatemala'].includes(origen.trim().toLowerCase())
  const tipoPorProveedor = new Map<string, 'local' | 'importado'>()
  for (const p of piezasNuevas) {
    if (p.proveedor && !tipoPorProveedor.has(p.proveedor)) {
      tipoPorProveedor.set(p.proveedor, esOrigenLocal(p.origen) ? 'local' : 'importado')
    }
  }
  const { mapa: mapaProveedores, creadas: proveedoresCreados } = await resolverOCrearCatalogo(
    admin,
    'proveedores',
    piezasNuevas.map((p) => p.proveedor ?? '').filter(Boolean),
    (nombre) => ({ tipo: tipoPorProveedor.get(nombre) ?? 'local' }),
  )

  const { data: moneda } = await supabase.from('monedas').select('id').eq('codigo', 'GTQ').single()

  // Trazabilidad: si se indicó factura, orden de compra o proveedor
  // del lote, se registra una sola vez para toda la carga y cada
  // artículo nuevo queda enlazado a ese registro.
  let cargaMasivaId: number | null = null
  const hayTrazabilidad =
    trazabilidad &&
    (trazabilidad.numero_factura ||
      trazabilidad.referencia_orden_compra ||
      trazabilidad.proveedor_id ||
      trazabilidad.notas ||
      trazabilidad.subtotal ||
      trazabilidad.impuestos)
  if (hayTrazabilidad) {
    const { data: idCarga, error: errorCarga } = await supabase.rpc('fn_crear_carga_masiva', {
      p_numero_factura: trazabilidad!.numero_factura,
      p_referencia_orden_compra: trazabilidad!.referencia_orden_compra,
      p_proveedor_id: trazabilidad!.proveedor_id,
      p_notas: trazabilidad!.notas,
      p_subtotal: trazabilidad!.subtotal,
      p_impuestos: trazabilidad!.impuestos,
    })
    if (!errorCarga) cargaMasivaId = idCarga
  }

  const filas = piezasNuevas.map((p) => ({
    codigo: p.codigo.trim(),
    nombre: p.nombre.trim(),
    descripcion: p.descripcion?.trim() || null,
    categoria_id: mapaCategorias.get(p.categoria.toLowerCase()) ?? null,
    material_id: p.material ? (mapaMateriales.get(p.material.toLowerCase()) ?? null) : null,
    origen: p.origen.trim() || 'Local',
    costo_produccion: p.costo_produccion,
    peso_gramos: p.peso_gramos,
    kilataje: p.kilataje?.trim() || null,
    piedras: p.piedras?.trim() || null,
    modo_inventario: p.modo_inventario,
    cantidad_inicial: p.modo_inventario === 'por_cantidad' ? p.cantidad_inicial : null,
    atributos: p.atributos ?? {},
    moneda_id: moneda?.id ?? null,
    creado_por: usuario.id,
    marca: p.marca?.trim() || null,
    coleccion: p.coleccion?.trim() || null,
    codigo_barras: p.codigo_barras?.trim() || null,
    etiquetas: p.etiquetas ?? [],
    proveedor_id: p.proveedor ? (mapaProveedores.get(p.proveedor.toLowerCase()) ?? null) : null,
    punto_reorden: p.punto_reorden,
    nivel_ganancia: p.nivel_ganancia,
    carga_masiva_id: cargaMasivaId,
  }))

  const { data: creadas, error } = await supabase.from('productos').insert(filas).select('id, costo_produccion')

  revalidatePath('/produccion')
  revalidatePath('/admin/proveedores')
  if (error) {
    const mensaje =
      error.code === '23505' ? 'Uno o más códigos o códigos de barras ya existen' : error.message
    redirect(`/produccion/carga-masiva?error=${encodeURIComponent(mensaje)}`)
  }

  // Orden de compra real (aparece en /compras/historial): una línea
  // por cada producto creado con costo válido y cantidad > 0 — el
  // insert preserva el orden de piezasNuevas, así se empareja cada
  // fila creada con sus datos originales del Excel.
  let ordenCompraId: number | null = null
  if (requiereOrdenCompra && cargaMasivaId && creadas && creadas.length > 0) {
    const lineasOrden = creadas
      .map((fila, i) => {
        const p = piezasNuevas[i]
        const cantidad = p.modo_inventario === 'por_cantidad' ? p.cantidad_inicial : 1
        if (fila.costo_produccion == null || fila.costo_produccion <= 0) return null
        if (cantidad == null || cantidad <= 0) return null
        return { producto_id: fila.id, cantidad, costo_unitario: fila.costo_produccion }
      })
      .filter((l): l is { producto_id: number; cantidad: number; costo_unitario: number } => l !== null)

    if (lineasOrden.length > 0) {
      const { data: idOrden, error: errorOrden } = await supabase.rpc(
        'fn_crear_orden_compra_recibida_desde_carga_masiva',
        {
          p_carga_masiva_id: cargaMasivaId,
          p_proveedor_id: trazabilidad!.proveedor_id,
          p_numero_factura: trazabilidad!.numero_factura,
          p_referencia_orden_compra: trazabilidad!.referencia_orden_compra,
          p_impuestos: trazabilidad!.impuestos,
          p_lineas: lineasOrden,
        },
      )
      if (!errorOrden) ordenCompraId = idOrden
    }
  }

  // El precio ya no se escribe a mano: se calcula por fila, mejor
  // esfuerzo (una fila sin costo válido simplemente queda sin precio
  // y no se puede publicar todavía).
  // Carga masiva sigue publicando directo al CEDI (a diferencia de
  // crear un artículo individual, que volvió a tener paso de
  // borrador) — decisión deliberada: un lote cargado por Excel ya
  // trae costo y cantidad reales, no necesita revisión previa. Una
  // fila sin costo se queda en_produccion hasta que se le complete el
  // costo desde su ficha (fn_publicar_producto lo exige).
  let sinCosto = 0
  let publicados = 0
  for (const fila of creadas ?? []) {
    if (fila.costo_produccion == null || fila.costo_produccion <= 0) {
      sinCosto++
      continue
    }
    await supabase.rpc('fn_recalcular_precio_producto', {
      p_producto_id: fila.id,
      p_motivo: 'carga_masiva',
    })
    const { error: errorPublicar } = await supabase.rpc('fn_publicar_producto', { p_producto_id: fila.id })
    if (!errorPublicar) publicados++
  }

  const dependenciasCreadas = categoriasCreadas.length + materialesCreados.length + proveedoresCreados.length
  const avisoDependencias =
    dependenciasCreadas > 0
      ? ` · ${dependenciasCreadas} dependencia${dependenciasCreadas !== 1 ? 's' : ''} nueva${dependenciasCreadas !== 1 ? 's' : ''} creada${dependenciasCreadas !== 1 ? 's' : ''} (${[...categoriasCreadas, ...materialesCreados, ...proveedoresCreados].join(', ')})`
      : ''

  const avisoReabastecidos = reabastecidos > 0 ? ` · ${reabastecidos} artículo${reabastecidos !== 1 ? 's' : ''} reabastecido${reabastecidos !== 1 ? 's' : ''}` : ''
  const avisoOrdenCompra = ordenCompraId
    ? ` · orden de compra #${ordenCompraId} registrada en el historial de compras`
    : ''

  if (ordenCompraId) {
    revalidatePath('/compras')
    revalidatePath('/compras/historial')
  }

  redirect(
    `/produccion?ok=${encodeURIComponent(
      `${publicados} artículo${publicados !== 1 ? 's' : ''} publicado${publicados !== 1 ? 's' : ''} al CEDI` +
        (sinCosto > 0 ? ` · ${sinCosto} sin costo, quedaron sin publicar` : '') +
        avisoDependencias +
        avisoReabastecidos +
        avisoOrdenCompra,
    )}`,
  )
}
