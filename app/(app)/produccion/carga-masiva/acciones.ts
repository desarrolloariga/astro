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
  origen: 'local' | 'importado'
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

export async function cargarPiezasMasivo(piezas: PiezaCargaMasiva[], grupo: string) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'produccion' && usuario.rol !== 'admin') {
    redirect('/inicio')
  }

  if (!Array.isArray(piezas) || piezas.length === 0) {
    redirect(`/produccion/carga-masiva?error=${encodeURIComponent('No hay artículos para cargar')}`)
  }

  const filaInvalida = piezas.some((p) => !p.codigo?.trim() || !p.nombre?.trim() || !p.categoria?.trim())
  if (filaInvalida) {
    redirect(
      `/produccion/carga-masiva?error=${encodeURIComponent('Hay filas sin código, nombre o categoría')}`,
    )
  }
  const cantidadInvalida = piezas.some(
    (p) => p.modo_inventario === 'por_cantidad' && (p.cantidad_inicial == null || p.cantidad_inicial <= 0),
  )
  if (cantidadInvalida) {
    redirect(
      `/produccion/carga-masiva?error=${encodeURIComponent('Hay filas por cantidad sin una cantidad válida')}`,
    )
  }

  const supabase = await createClient()
  // categorias/materiales/proveedores son de escritura admin-only por
  // RLS — producción no tiene ese permiso directo, así que la
  // creación automática de dependencias usa el cliente de servicio
  // (el rol ya se validó arriba: solo produccion/admin llegan aquí).
  const admin = createAdminClient()

  // Categoría, material y proveedor se resuelven contra el catálogo
  // existente y se crean automáticamente los que falten — así una
  // carga masiva ya no se rechaza solo porque el archivo trae una
  // categoría (u otra dependencia) que todavía no existe.
  const [{ mapa: mapaCategorias, creadas: categoriasCreadas }, { mapa: mapaMateriales, creadas: materialesCreados }] =
    await Promise.all([
      resolverOCrearCatalogo(
        admin,
        'categorias',
        piezas.map((p) => p.categoria),
        () => ({ grupo }),
      ),
      resolverOCrearCatalogo(
        admin,
        'materiales',
        piezas.map((p) => p.material ?? '').filter(Boolean),
      ),
    ])

  // El tipo del proveedor nuevo se infiere de la primera fila que lo
  // menciona: si esa pieza es importada, se crea como proveedor
  // importado; si no, local — es solo el valor inicial, se ajusta
  // después desde Proveedores si hace falta.
  const tipoPorProveedor = new Map<string, 'local' | 'importado'>()
  for (const p of piezas) {
    if (p.proveedor && !tipoPorProveedor.has(p.proveedor)) {
      tipoPorProveedor.set(p.proveedor, p.origen)
    }
  }
  const { mapa: mapaProveedores, creadas: proveedoresCreados } = await resolverOCrearCatalogo(
    admin,
    'proveedores',
    piezas.map((p) => p.proveedor ?? '').filter(Boolean),
    (nombre) => ({ tipo: tipoPorProveedor.get(nombre) ?? 'local' }),
  )

  const { data: moneda } = await supabase.from('monedas').select('id').eq('codigo', 'GTQ').single()

  const filas = piezas.map((p) => ({
    codigo: p.codigo.trim(),
    nombre: p.nombre.trim(),
    descripcion: p.descripcion?.trim() || null,
    categoria_id: mapaCategorias.get(p.categoria.toLowerCase()) ?? null,
    material_id: p.material ? (mapaMateriales.get(p.material.toLowerCase()) ?? null) : null,
    origen: p.origen === 'importado' ? 'importado' : 'local',
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
  }))

  const { data: creadas, error } = await supabase.from('productos').insert(filas).select('id, costo_produccion')

  revalidatePath('/produccion')
  revalidatePath('/admin/proveedores')
  if (error) {
    const mensaje =
      error.code === '23505' ? 'Uno o más códigos o códigos de barras ya existen' : error.message
    redirect(`/produccion/carga-masiva?error=${encodeURIComponent(mensaje)}`)
  }

  // El precio ya no se escribe a mano: se calcula por fila, mejor
  // esfuerzo (una fila sin costo válido simplemente queda sin precio
  // hasta que se complete su ficha).
  let sinCosto = 0
  for (const fila of creadas ?? []) {
    if (fila.costo_produccion == null || fila.costo_produccion <= 0) {
      sinCosto++
      continue
    }
    await supabase.rpc('fn_recalcular_precio_producto', {
      p_producto_id: fila.id,
      p_motivo: 'carga_masiva',
    })
  }

  const dependenciasCreadas = categoriasCreadas.length + materialesCreados.length + proveedoresCreados.length
  const avisoDependencias =
    dependenciasCreadas > 0
      ? ` · ${dependenciasCreadas} dependencia${dependenciasCreadas !== 1 ? 's' : ''} nueva${dependenciasCreadas !== 1 ? 's' : ''} creada${dependenciasCreadas !== 1 ? 's' : ''} (${[...categoriasCreadas, ...materialesCreados, ...proveedoresCreados].join(', ')})`
      : ''

  redirect(
    `/produccion?ok=${encodeURIComponent(
      `${creadas?.length ?? 0} artículos cargados como borrador` +
        (sinCosto > 0 ? ` (${sinCosto} sin costo, sin precio todavía)` : '') +
        avisoDependencias,
    )}`,
  )
}
