'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { obtenerUsuarioActual } from '@/lib/usuario'

const RUTA = '/admin/usuarios/registro'
const txt = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

function volver(clave: 'ok' | 'error', mensaje: string): never {
  redirect(`${RUTA}?${clave}=${encodeURIComponent(mensaje)}`)
}

/** Frases de expectativa: una por línea, sin vacías, máximo 8. */
function leerMensajes(f: FormData) {
  return txt(f, 'mensajes_expectativa')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8)
}

function datosBienvenida(f: FormData) {
  return {
    titulo_bienvenida: txt(f, 'titulo_bienvenida') || '¡Felicidades por inscribirte!',
    mensaje_bienvenida: txt(f, 'mensaje_bienvenida') || null,
    mensajes_expectativa: leerMensajes(f),
    fecha_lanzamiento: txt(f, 'fecha_lanzamiento') || null,
    permitir_ingreso: f.get('permitir_ingreso') === 'on',
  }
}

export async function crearEnlaceRegistro(formData: FormData) {
  const [esAdmin, puedeEmbajador, yo] = await Promise.all([
    tienePermiso('usuarios', 'crear'),
    tienePermiso('usuarios', 'crear_embajador'),
    obtenerUsuarioActual(),
  ])
  if (!esAdmin && !puedeEmbajador) redirect('/inicio')
  const nombre = txt(formData, 'nombre')
  if (!nombre) volver('error', 'Ponle un nombre al enlace (ej. Campaña de lanzamiento)')
  // Un asesor solo crea enlaces con él como superior; administración elige.
  const superiorId = esAdmin ? Number(txt(formData, 'superior_id')) || yo.id : yo.id
  const cupo = Number(txt(formData, 'cupo')) || null
  const vence = txt(formData, 'vence')
  const supabase = await createClient()
  const { error } = await supabase.from('enlaces_registro').insert({
    token: randomBytes(16).toString('hex'),
    nombre,
    superior_id: superiorId,
    tipo_embajador: txt(formData, 'tipo_embajador') || 'A1',
    cupo: cupo && cupo > 0 ? Math.floor(cupo) : null,
    vence: vence ? `${vence}T23:59:59-06:00` : null,
    creado_por: yo.id,
    ...datosBienvenida(formData),
  })
  if (error) volver('error', error.message)
  revalidatePath(RUTA)
  volver('ok', 'Enlace creado: cópialo y compártelo con los futuros embajadores')
}

export async function actualizarEnlaceRegistro(formData: FormData) {
  const id = Number(txt(formData, 'id'))
  const supabase = await createClient()
  const { data, error } = await supabase.from('enlaces_registro').update({ ...datosBienvenida(formData), fecha_actualizacion: new Date().toISOString() }).eq('id', id).select('id')
  if (error) volver('error', error.message)
  if (!data?.length) volver('error', 'No tienes permiso para editar ese enlace')
  revalidatePath(RUTA)
  volver('ok', 'Mensajes actualizados')
}

export async function alternarEnlaceRegistro(formData: FormData) {
  const id = Number(txt(formData, 'id'))
  const activo = txt(formData, 'activo') === 'si'
  const supabase = await createClient()
  const { data, error } = await supabase.from('enlaces_registro').update({ activo, fecha_actualizacion: new Date().toISOString() }).eq('id', id).select('id')
  if (error) volver('error', error.message)
  if (!data?.length) volver('error', 'No tienes permiso para cambiar ese enlace')
  revalidatePath(RUTA)
  volver('ok', activo ? 'Enlace activado' : 'Enlace desactivado: ya no acepta registros')
}
