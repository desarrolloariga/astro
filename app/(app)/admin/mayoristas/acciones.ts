'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'

const txt = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const num = (f: FormData, k: string) => {
  const t = txt(f, k)
  if (!t) return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function volver(clave: 'ok' | 'error', mensaje: string, ancla = ''): never {
  redirect(`/admin/mayoristas?${clave}=${encodeURIComponent(mensaje)}${ancla ? `#${ancla}` : ''}`)
}

async function exigirPermiso() {
  if (!(await tienePermiso('mayoristas', 'configurar'))) volver('error', 'No tienes permiso para configurar mayoristas')
}

function refrescar() {
  revalidatePath('/admin/mayoristas')
  revalidatePath('/catalogo', 'layout')
  revalidatePath('/carrito', 'layout')
}

/** Crea o actualiza una política y su configuración por categoría. */
export async function guardarPolitica(formData: FormData) {
  await exigirPermiso()
  const id = num(formData, 'id')
  const nombre = txt(formData, 'nombre')
  const descuento = num(formData, 'descuento_pct') ?? 0
  if (!nombre) volver('error', 'Escribe el nombre de la política')
  if (descuento < 0 || descuento >= 100) volver('error', 'El descuento general debe estar entre 0 y 99.99 %')
  const todas = formData.get('todas_categorias') === 'on'

  const supabase = await createClient()
  const fila = {
    nombre,
    descripcion: txt(formData, 'descripcion') || null,
    descuento_pct: descuento,
    minimo_compra: Math.max(0, num(formData, 'minimo_compra') ?? 0),
    todas_categorias: todas,
    activo: formData.get('activo') === 'on',
    fecha_actualizacion: new Date().toISOString(),
  }
  const { data, error } = id
    ? await supabase.from('politicas_mayoristas').update(fila).eq('id', id).select('id').single()
    : await supabase.from('politicas_mayoristas').insert(fila).select('id').single()
  if (error || !data) volver('error', error?.message ?? 'No se pudo guardar la política')
  const politicaId = data.id as number

  // Por categoría: se guarda si se ve (cuando la política no muestra todas) o si tiene % propio.
  const categorias = formData.getAll('categoria_id').map(Number).filter(Boolean)
  const filas = categorias
    .map((categoriaId) => {
      const visible = todas || formData.get(`visible_${categoriaId}`) === 'on'
      const pct = num(formData, `pct_${categoriaId}`)
      return { politica_id: politicaId, categoria_id: categoriaId, visible, descuento_pct: pct }
    })
    .filter((f) => (!todas && f.visible) || f.descuento_pct != null)
  if (filas.some((f) => f.descuento_pct != null && (f.descuento_pct < 0 || f.descuento_pct >= 100))) {
    volver('error', 'Los descuentos por categoría deben estar entre 0 y 99.99 %', `politica-${politicaId}`)
  }

  const { error: errorBorrar } = await supabase.from('politica_mayorista_categorias').delete().eq('politica_id', politicaId)
  if (errorBorrar) volver('error', errorBorrar.message)
  if (filas.length) {
    const { error: errorCat } = await supabase.from('politica_mayorista_categorias').insert(filas)
    if (errorCat) volver('error', errorCat.message)
  }

  refrescar()
  volver('ok', id ? 'Política actualizada' : 'Política creada', `politica-${politicaId}`)
}

export async function asignarPolitica(formData: FormData) {
  await exigirPermiso()
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_asignar_politica_mayorista', {
    p_usuario_id: num(formData, 'usuario_id'),
    p_politica_id: num(formData, 'politica_id'),
  })
  if (error) volver('error', error.message, 'mayoristas')
  refrescar()
  volver('ok', 'Política asignada', 'mayoristas')
}
