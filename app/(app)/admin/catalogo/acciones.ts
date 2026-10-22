'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tienePermiso } from '@/lib/permisos'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { audiencia, ctaTipo, icono } from '@/lib/catalogo-web/config'

const BUCKET = 'astro-catalogo'
const MAX_BYTES = 5 * 1024 * 1024
const TABLAS = {
  anuncios: 'catalogo_anuncios',
  banners: 'catalogo_banners',
  novedades: 'catalogo_novedades',
} as const
type Seccion = keyof typeof TABLAS

function volver(seccion: string, clave: 'ok' | 'error', mensaje: string): never {
  redirect(`/admin/catalogo?tab=${seccion}&${clave}=${encodeURIComponent(mensaje)}`)
}

async function exigirPermiso(seccion: string) {
  if (!(await tienePermiso('catalogo', 'configurar'))) volver(seccion, 'error', 'No tienes permiso para configurar el catálogo')
}

const txt = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const opcional = (f: FormData, k: string) => txt(f, k) || null
const entero = (f: FormData, k: string, def = 0) => {
  const n = Number(txt(f, k))
  return Number.isFinite(n) ? Math.round(n) : def
}
const color = (f: FormData, k: string, def: string) => {
  const v = txt(f, k)
  return /^#[0-9a-f]{3,8}$/i.test(v) ? v : def
}

/** Sube una imagen al bucket público del catálogo y devuelve su URL. */
async function subirImagen(archivo: File, carpeta: string): Promise<string> {
  if (!archivo.type.startsWith('image/')) throw new Error(`"${archivo.name}" no es una imagen`)
  if (archivo.size > MAX_BYTES) throw new Error(`"${archivo.name}" supera 5 MB`)
  const extension = archivo.name.split('.').pop()?.toLowerCase() || 'jpg'
  const ruta = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`
  const admin = createAdminClient()
  const { error } = await admin.storage.from(BUCKET).upload(ruta, archivo, { contentType: archivo.type })
  if (error) throw new Error(`No se pudo subir la imagen: ${error.message}`)
  return admin.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl
}

/** Imagen resultante de un formulario: nueva si se subió, ninguna si se quitó, o la actual. */
async function resolverImagen(f: FormData, campo: string, carpeta: string): Promise<string | null> {
  const archivo = f.get(campo)
  if (archivo instanceof File && archivo.size > 0) return subirImagen(archivo, carpeta)
  if (f.get(`${campo}_quitar`) === 'on') return null
  return opcional(f, `${campo}_actual`)
}

function refrescar() {
  revalidatePath('/', 'layout')
}

export async function guardarContenido(formData: FormData) {
  const seccion = txt(formData, 'seccion') as Seccion
  if (!(seccion in TABLAS)) volver('anuncios', 'error', 'Sección inválida')
  await exigirPermiso(seccion)

  const id = entero(formData, 'id', 0) || null
  const comun = {
    audiencia: audiencia(txt(formData, 'audiencia')),
    orden: entero(formData, 'orden'),
    activo: formData.get('activo') === 'on',
    fecha_inicio: opcional(formData, 'fecha_inicio'),
    fecha_fin: opcional(formData, 'fecha_fin'),
  }
  if (comun.fecha_inicio && comun.fecha_fin && comun.fecha_fin < comun.fecha_inicio) {
    volver(seccion, 'error', 'La fecha final no puede ser anterior a la inicial')
  }

  let fila: Record<string, unknown>
  if (seccion === 'anuncios') {
    const texto = txt(formData, 'texto')
    if (!texto) volver(seccion, 'error', 'Escribe el texto del anuncio')
    fila = { ...comun, texto }
  } else {
    const titulo = txt(formData, 'titulo')
    if (!titulo) volver(seccion, 'error', 'Escribe el título')
    let imagen: string | null
    try {
      imagen = await resolverImagen(formData, 'imagen', seccion)
    } catch (e) {
      volver(seccion, 'error', (e as Error).message)
    }
    fila = {
      ...comun,
      etiqueta: opcional(formData, 'etiqueta'),
      titulo,
      texto: opcional(formData, 'texto'),
      cta_texto: opcional(formData, 'cta_texto'),
      cta_tipo: ctaTipo(txt(formData, 'cta_tipo')),
      cta_valor: opcional(formData, 'cta_valor'),
      imagen_url: imagen,
      color_fondo: color(formData, 'color_fondo', '#0F2A5C'),
      ...(seccion === 'banners' ? { color_etiqueta: color(formData, 'color_etiqueta', '#F2D58A') } : {}),
    }
  }

  const supabase = await createClient()
  const tabla = TABLAS[seccion]
  const { error } = id ? await supabase.from(tabla).update(fila).eq('id', id) : await supabase.from(tabla).insert(fila)
  if (error) volver(seccion, 'error', error.message)
  refrescar()
  volver(seccion, 'ok', id ? 'Cambios guardados' : 'Agregado al catálogo')
}

export async function eliminarContenido(formData: FormData) {
  const seccion = txt(formData, 'seccion') as Seccion
  if (!(seccion in TABLAS)) volver('anuncios', 'error', 'Sección inválida')
  await exigirPermiso(seccion)
  const id = entero(formData, 'id')
  const supabase = await createClient()
  const { error } = await supabase.from(TABLAS[seccion]).delete().eq('id', id)
  if (error) volver(seccion, 'error', error.message)
  refrescar()
  volver(seccion, 'ok', 'Eliminado')
}

async function guardarClave(clave: string, valor: unknown, seccion: string) {
  const usuario = await obtenerUsuarioActual()
  const supabase = await createClient()
  const { error } = await supabase
    .from('catalogo_config')
    .upsert({ clave, valor, fecha_actualizacion: new Date().toISOString(), actualizado_por: usuario.id })
  if (error) volver(seccion, 'error', error.message)
}

/** Bloques fijos del inicio: general, promos laterales, beneficios, oferta relámpago, banda de link y pie. */
export async function guardarBloques(formData: FormData) {
  const bloque = txt(formData, 'bloque')
  const seccion = 'bloques'
  await exigirPermiso(seccion)

  try {
    if (bloque === 'general') {
      await guardarClave('general', {
        marca: txt(formData, 'marca') || 'ASTRO',
        subtitulo: txt(formData, 'subtitulo'),
        dias_nuevo: Math.max(0, entero(formData, 'dias_nuevo', 15)),
        popup_novedades: formData.get('popup_novedades') === 'on',
      }, seccion)
    } else if (bloque === 'promos') {
      const promos = []
      for (let i = 0; i < 3; i++) {
        const titulo = txt(formData, `p${i}_titulo`)
        if (!titulo) continue
        promos.push({
          etiqueta: txt(formData, `p${i}_etiqueta`),
          titulo,
          cta_texto: txt(formData, `p${i}_cta_texto`) || 'Ver catálogo',
          cta_tipo: ctaTipo(txt(formData, `p${i}_cta_tipo`)),
          cta_valor: opcional(formData, `p${i}_cta_valor`),
          color_fondo: color(formData, `p${i}_color_fondo`, '#DCE6FA'),
          color_boton: color(formData, `p${i}_color_boton`, '#1E4FD8'),
          imagen_url: await resolverImagen(formData, `p${i}_imagen`, 'promos'),
          icono: icono(txt(formData, `p${i}_icono`), 'gift'),
          audiencia: audiencia(txt(formData, `p${i}_audiencia`)),
        })
      }
      await guardarClave('promos_laterales', promos, seccion)
    } else if (bloque === 'beneficios') {
      const beneficios = []
      for (let i = 0; i < 6; i++) {
        const titulo = txt(formData, `b${i}_titulo`)
        if (!titulo) continue
        beneficios.push({
          icono: icono(txt(formData, `b${i}_icono`), 'sparkle'),
          titulo,
          texto: txt(formData, `b${i}_texto`),
          audiencia: audiencia(txt(formData, `b${i}_audiencia`)),
        })
      }
      await guardarClave('beneficios', beneficios, seccion)
    } else if (bloque === 'oferta') {
      const fin = txt(formData, 'fecha_fin')
      // datetime-local llega sin zona: se interpreta en hora de Guatemala (UTC-6).
      const fechaFin = fin ? new Date(`${fin}:00-06:00`).toISOString() : null
      await guardarClave('oferta_relampago', {
        activa: formData.get('activa') === 'on',
        titulo: txt(formData, 'titulo') || 'Ofertas relámpago',
        subtitulo: txt(formData, 'subtitulo'),
        fecha_fin: fechaFin,
      }, seccion)
    } else if (bloque === 'banda') {
      await guardarClave('banda_link', {
        activa: formData.get('activa') === 'on',
        titulo: txt(formData, 'titulo'),
        texto: txt(formData, 'texto'),
        cta_texto: txt(formData, 'cta_texto'),
      }, seccion)
    } else if (bloque === 'entrega') {
      // Franjas: una por línea "Etiqueta | 8:00 | 12:00". Feriados: fechas YYYY-MM-DD separadas por coma o línea.
      const franjas = txt(formData, 'franjas')
        .split(/\r?\n/)
        .map((l) => l.split('|').map((x) => x.trim()))
        .filter((f) => f.length >= 3 && f[0] && f[1] && f[2])
        .map((f, i) => ({ id: `f${i + 1}`, etiqueta: f[0], inicio: f[1], fin: f[2] }))
      const feriados = txt(formData, 'dias_no_laborables')
        .split(/[\s,]+/)
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      const hora = txt(formData, 'hora_corte')
      await guardarClave('entrega', {
        hora_corte: /^([01]?\d|2[0-3]):[0-5]\d$/.test(hora) ? hora : '14:00',
        cedi_direccion: txt(formData, 'cedi_direccion'),
        cedi_horario: txt(formData, 'cedi_horario'),
        dias_programada: Math.min(14, Math.max(1, entero(formData, 'dias_programada', 5))),
        dias_laborables: formData.getAll('dias_laborables').map(Number).filter((n) => n >= 0 && n <= 6),
        dias_no_laborables: feriados,
        franjas,
        garantia: txt(formData, 'garantia'),
        cambios: txt(formData, 'cambios'),
      }, 'entrega')
      refrescar()
      volver('entrega', 'ok', 'Configuración de entrega guardada')
    } else if (bloque === 'pie') {
      // Una columna por línea: "Título: elemento 1, elemento 2".
      const columnas = txt(formData, 'columnas')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [titulo, resto = ''] = l.split(':')
          return { titulo: titulo.trim(), enlaces: resto.split(',').map((e) => e.trim()).filter(Boolean) }
        })
        .filter((c) => c.titulo)
      await guardarClave('pie', {
        descripcion: txt(formData, 'descripcion'),
        columnas,
        telefono: txt(formData, 'telefono'),
        correo: txt(formData, 'correo'),
        direccion: txt(formData, 'direccion'),
      }, seccion)
    } else {
      volver(seccion, 'error', 'Bloque inválido')
    }
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw e
    volver(seccion, 'error', (e as Error).message)
  }

  refrescar()
  volver(seccion, 'ok', 'Bloque guardado')
}

export async function guardarEstiloCategoria(formData: FormData) {
  const seccion = 'categorias'
  await exigirPermiso(seccion)
  const categoriaId = entero(formData, 'categoria_id')
  let imagen: string | null
  try {
    imagen = await resolverImagen(formData, 'imagen', 'categorias')
  } catch (e) {
    volver(seccion, 'error', (e as Error).message)
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_guardar_estilo_categoria', {
    p_categoria_id: categoriaId,
    p_imagen: imagen ?? '',
    p_color: formData.get('sin_color') === 'on' ? '' : color(formData, 'color', ''),
  })
  if (error) volver(seccion, 'error', error.message)
  refrescar()
  volver(seccion, 'ok', 'Categoría actualizada')
}
