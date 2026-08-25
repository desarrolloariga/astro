'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'

type PiezaCargaMasiva = {
  codigo: string
  nombre: string
  descripcion: string | null
  categoria_id: number
  material_id: number | null
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
  proveedor_id: number | null
  punto_reorden: number | null
}

export async function cargarPiezasMasivo(piezas: PiezaCargaMasiva[]) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'produccion' && usuario.rol !== 'admin') {
    redirect('/inicio')
  }

  if (!Array.isArray(piezas) || piezas.length === 0) {
    redirect(`/produccion/carga-masiva?error=${encodeURIComponent('No hay artículos para cargar')}`)
  }

  const filaInvalida = piezas.some((p) => !p.codigo?.trim() || !p.nombre?.trim() || !p.categoria_id)
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

  const { data: moneda } = await supabase.from('monedas').select('id').eq('codigo', 'GTQ').single()

  const filas = piezas.map((p) => ({
    codigo: p.codigo.trim(),
    nombre: p.nombre.trim(),
    descripcion: p.descripcion?.trim() || null,
    categoria_id: p.categoria_id,
    material_id: p.material_id,
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
    proveedor_id: p.proveedor_id,
    punto_reorden: p.punto_reorden,
  }))

  const { data: creadas, error } = await supabase.from('productos').insert(filas).select('id, costo_produccion')

  revalidatePath('/produccion')
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

  redirect(
    `/produccion?ok=${encodeURIComponent(
      `${creadas?.length ?? 0} artículos cargados como borrador` +
        (sinCosto > 0 ? ` (${sinCosto} sin costo, sin precio todavía)` : ''),
    )}`,
  )
}
