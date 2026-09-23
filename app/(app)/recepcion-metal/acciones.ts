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

export type LineaRecepcionMetal = {
  // Un producto existente trae producto_id; uno nuevo trae
  // producto_nuevo con los datos mínimos para crearlo primero.
  producto_id: number | null
  producto_nuevo: {
    nombre: string
    nivel_ganancia: string
    categoria_id: number | null
    referencia_proveedor: string | null
  } | null
  codigo: string
  nombre: string
  cantidad: number
  peso_gramos: number
  costo_unitario: number
}

export type DatosRecepcionMetal = {
  proveedor_id: number | null
  peso_total_gramos: number
  cantidad_total_piezas: number
  notas: string | null
}

/** Crea la recepción, resuelve artículos nuevos y agrega todas las líneas de una vez. */
export async function crearRecepcionMetalConLineas(datos: DatosRecepcionMetal, lineas: LineaRecepcionMetal[]) {
  if (!(await tienePermiso('recepcion_metal', 'crear'))) redirect('/inicio')

  if (!datos.peso_total_gramos || datos.peso_total_gramos <= 0) {
    redirect(`/recepcion-metal/nueva?error=${encodeURIComponent('Indica el peso total recibido')}`)
  }
  if (!datos.cantidad_total_piezas || datos.cantidad_total_piezas <= 0) {
    redirect(`/recepcion-metal/nueva?error=${encodeURIComponent('Indica la cantidad total de piezas')}`)
  }
  if (!Array.isArray(lineas) || lineas.length === 0) {
    redirect(`/recepcion-metal/nueva?error=${encodeURIComponent('Agrega al menos un artículo')}`)
  }

  const supabase = await createClient()

  const { data: recepcionId, error: errorCabecera } = await supabase.rpc('fn_crear_recepcion_metal', {
    p_peso_total_gramos: datos.peso_total_gramos,
    p_cantidad_total_piezas: datos.cantidad_total_piezas,
    p_proveedor_id: datos.proveedor_id,
    p_notas: datos.notas,
  })

  if (errorCabecera || !recepcionId) {
    redirect(`/recepcion-metal/nueva?error=${encodeURIComponent(errorCabecera?.message ?? 'No se pudo crear la recepción')}`)
  }

  let fallidos = 0
  for (const l of lineas) {
    let productoId = l.producto_id

    if (!productoId && l.producto_nuevo) {
      const { data: nuevoId, error: errorCrear } = await supabase.rpc('fn_crear_producto_recepcion_metal', {
        p_nombre: l.producto_nuevo.nombre,
        p_nivel_ganancia: l.producto_nuevo.nivel_ganancia,
        p_proveedor_id: datos.proveedor_id,
        p_referencia_proveedor: l.producto_nuevo.referencia_proveedor,
        p_categoria_id: l.producto_nuevo.categoria_id,
      })
      if (errorCrear || !nuevoId) {
        fallidos++
        continue
      }
      productoId = nuevoId
    }

    if (!productoId) {
      fallidos++
      continue
    }

    const { error: errorLinea } = await supabase.rpc('fn_agregar_linea_recepcion_metal', {
      p_recepcion_metal_id: recepcionId,
      p_producto_id: productoId,
      p_cantidad: l.cantidad,
      p_peso_gramos: l.peso_gramos,
      p_costo_unitario: l.costo_unitario,
    })
    if (errorLinea) fallidos++
  }

  revalidatePath('/recepcion-metal')
  revalidatePath(`/recepcion-metal/${recepcionId}`)
  if (fallidos > 0) {
    redirect(
      `/recepcion-metal/${recepcionId}?error=${encodeURIComponent(`Recepción creada, pero ${fallidos} línea(s) no se pudieron agregar`)}`,
    )
  }
  redirect(`/recepcion-metal/${recepcionId}?ok=${encodeURIComponent('Recepción creada — revisa el cuadre antes de confirmar')}`)
}

export async function confirmarRecepcionMetal(formData: FormData) {
  if (!(await tienePermiso('recepcion_metal', 'confirmar'))) redirect('/inicio')

  const recepcionId = aNumero(formData.get('recepcion_metal_id'))
  if (!recepcionId) redirect('/recepcion-metal')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_confirmar_recepcion_metal', { p_recepcion_metal_id: recepcionId })

  revalidatePath('/recepcion-metal')
  revalidatePath(`/recepcion-metal/${recepcionId}`)
  revalidatePath('/existencias')
  if (error) redirect(`/recepcion-metal/${recepcionId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/recepcion-metal/${recepcionId}?ok=${encodeURIComponent('Recepción confirmada — artículos publicados al CEDI')}`)
}

export async function cancelarRecepcionMetal(formData: FormData) {
  if (!(await tienePermiso('recepcion_metal', 'crear'))) redirect('/inicio')

  const recepcionId = aNumero(formData.get('recepcion_metal_id'))
  if (!recepcionId) redirect('/recepcion-metal')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_cancelar_recepcion_metal', { p_recepcion_metal_id: recepcionId })

  revalidatePath('/recepcion-metal')
  revalidatePath(`/recepcion-metal/${recepcionId}`)
  if (error) redirect(`/recepcion-metal/${recepcionId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/recepcion-metal?ok=${encodeURIComponent('Recepción cancelada')}`)
}

export async function quitarLineaRecepcionMetal(formData: FormData) {
  if (!(await tienePermiso('recepcion_metal', 'crear'))) redirect('/inicio')

  const recepcionId = aNumero(formData.get('recepcion_metal_id'))
  const detalleId = aNumero(formData.get('detalle_id'))
  if (!recepcionId || !detalleId) redirect('/recepcion-metal')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_quitar_linea_recepcion_metal', { p_detalle_id: detalleId })

  revalidatePath(`/recepcion-metal/${recepcionId}`)
  if (error) redirect(`/recepcion-metal/${recepcionId}?error=${encodeURIComponent(error.message)}`)
  redirect(`/recepcion-metal/${recepcionId}?ok=${encodeURIComponent('Línea quitada')}`)
}
