'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'

/**
 * Niveles, insignias y premios del ranking gamificado: crear y editar.
 * Lo que se guarda aquí lo muestra /ranking (fn_ranking) sin tocar código.
 */

const txt = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const num = (f: FormData, k: string) => {
  const t = txt(f, k)
  if (!t) return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const color = (f: FormData, k: string) => {
  const v = txt(f, k)
  return /^#[0-9a-f]{6}$/i.test(v) ? v : null
}

function volver(clave: 'ok' | 'error', mensaje: string, ancla: string): never {
  redirect(`/admin/fidelizacion?${clave}=${encodeURIComponent(mensaje)}#${ancla}`)
}

async function exigirAdmin(ancla: string) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'admin') volver('error', 'Solo administración puede editar el programa', ancla)
}

function terminar(error: { message: string } | null, ok: string, ancla: string): never {
  revalidatePath('/admin/fidelizacion')
  revalidatePath('/ranking')
  if (error) volver('error', error.message, ancla)
  volver('ok', ok, ancla)
}

export async function guardarNivel(formData: FormData) {
  await exigirAdmin('niveles')
  const id = num(formData, 'id')
  const nombre = txt(formData, 'nombre')
  if (!nombre) volver('error', 'Escribe el nombre del nivel', 'niveles')
  const fila = {
    nombre,
    umbral_puntos: num(formData, 'umbral_puntos') ?? 0,
    orden: num(formData, 'orden') ?? 0,
    color: color(formData, 'color'),
    icono: txt(formData, 'icono') || 'star',
    beneficios: { texto: txt(formData, 'beneficio') },
    activo: formData.get('activo') === 'on',
  }
  const supabase = await createClient()
  const { error } = id ? await supabase.from('niveles').update(fila).eq('id', id) : await supabase.from('niveles').insert(fila)
  terminar(error, id ? 'Nivel actualizado' : 'Nivel creado', 'niveles')
}

const TIPOS_CON_UMBRAL = new Set(['ventas_mes', 'racha', 'top', 'puntos', 'clientes_nuevos', 'cursos'])

export async function guardarInsignia(formData: FormData) {
  await exigirAdmin('insignias')
  const id = num(formData, 'id')
  const nombre = txt(formData, 'nombre')
  const tipo = txt(formData, 'criterio_tipo')
  if (!nombre || !tipo) volver('error', 'Completa el nombre y el criterio de la insignia', 'insignias')
  const umbral = num(formData, 'criterio_umbral')
  const fila = {
    nombre,
    descripcion: txt(formData, 'descripcion') || null,
    criterio: TIPOS_CON_UMBRAL.has(tipo) ? { tipo, umbral: umbral ?? 1 } : { tipo },
    icono: txt(formData, 'icono') || 'trophy',
    color: color(formData, 'color'),
    recompensa: txt(formData, 'recompensa') || null,
    orden: num(formData, 'orden') ?? 0,
    activo: formData.get('activo') === 'on',
  }
  const supabase = await createClient()
  const { error } = id ? await supabase.from('insignias').update(fila).eq('id', id) : await supabase.from('insignias').insert(fila)
  terminar(error, id ? 'Insignia actualizada' : 'Insignia creada', 'insignias')
}

export async function guardarPremio(formData: FormData) {
  await exigirAdmin('premios')
  const id = num(formData, 'id')
  const tipo = txt(formData, 'tipo') === 'puntos' ? 'puntos' : 'posicion'
  const descripcion = txt(formData, 'descripcion')
  if (!descripcion) volver('error', 'Escribe en qué consiste el premio', 'premios')
  const fila = {
    periodo_id: num(formData, 'periodo_id'),
    titulo: txt(formData, 'titulo') || null,
    tipo,
    posicion_desde: tipo === 'posicion' ? (num(formData, 'posicion_desde') ?? 1) : null,
    posicion_hasta: tipo === 'posicion' ? (num(formData, 'posicion_hasta') ?? 1) : null,
    minimo_puntos: tipo === 'puntos' ? (num(formData, 'minimo_puntos') ?? 0) : null,
    descripcion,
    icono: txt(formData, 'icono') || 'trophy',
    activo: formData.get('activo') === 'on',
  }
  const supabase = await createClient()
  const { error } = id ? await supabase.from('premios').update(fila).eq('id', id) : await supabase.from('premios').insert(fila)
  terminar(error, id ? 'Premio actualizado' : 'Premio creado', 'premios')
}

export async function eliminarPremio(formData: FormData) {
  await exigirAdmin('premios')
  const supabase = await createClient()
  const { error } = await supabase.from('premios').delete().eq('id', num(formData, 'id') ?? 0)
  terminar(error, 'Premio eliminado', 'premios')
}
