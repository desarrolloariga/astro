import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import type { ItemCarrito } from '@/lib/publico/carrito'
import { hoyGuatemala } from '@/lib/contabilidad'
import {
  colorValido,
  ctaTipo,
  leerBanda,
  leerBeneficios,
  leerGeneral,
  leerOferta,
  leerPie,
  leerPromos,
} from './config'
import { slug } from './slug'
import type { CategoriaWeb, ConfigCatalogo, Contexto, LineaWeb, NombreIcono, ProductoWeb } from './tipos'

type Supabase = Awaited<ReturnType<typeof createClient>>

const PALETA = ['#DCE6FA', '#E4ECFB', '#F6E9C4', '#E8EEF8', '#D7E3F8', '#EFE6CF']

/** Fila de fn_catalogo_piezas: la pieza con precio embajador, "Nuevo", vendidos y entrega inmediata en una sola respuesta. */
export type FilaPieza = {
  id: number
  codigo: string
  nombre: string
  descripcion: string | null
  categoria_id: number | null
  categoria: string | null
  material: string | null
  peso_gramos: number | null
  kilataje: string | null
  piedras: string | null
  precio_venta: number | null
  precio_lista: number | null
  en_descuento: boolean | null
  estado: string
  tienda: string | null
  imagen_principal: string | null
  imagenes: { url: string; orden: number }[] | null
  modo_inventario: 'pieza_unica' | 'por_cantidad'
  stock_disponible: number | null
  fecha_publicacion: string | null
  vendidos: number | null
  precio_embajador: number | null
  inmediata: boolean | null
  ubicacion: string | null
}

export type ParametrosPiezas = {
  /** Enlace público; sin token = catálogo del backoffice (requiere sesión). */
  token?: string
  ids?: number[]
  /** Devuelve esa pieza y las de su misma categoría (ficha de producto). */
  mismaCategoriaQue?: number
}

/** Una sola llamada a la base para todas las piezas del catálogo. */
export async function consultarPiezas(supabase: Supabase, params: ParametrosPiezas = {}): Promise<FilaPieza[]> {
  const { data, error } = await supabase.rpc('fn_catalogo_piezas', {
    p_token: params.token ?? null,
    p_ids: params.ids ?? null,
    p_misma_categoria_que: params.mismaCategoriaQue ?? null,
  })
  // Enlace vencido o sin sesión: la página ya muestra su propio mensaje.
  if (error) return []
  return (data ?? []) as FilaPieza[]
}

export function mapearPieza(p: FilaPieza, diasNuevo: number, ahora = Date.now()): ProductoWeb {
  const pub = Number(p.precio_venta ?? 0)
  const lista = Number(p.precio_lista ?? 0)
  const fecha = p.fecha_publicacion ? new Date(p.fecha_publicacion).getTime() : 0
  const modo = p.modo_inventario ?? 'pieza_unica'
  const proximamente = p.estado === 'en_transito'
  const imagenes = (p.imagenes ?? [])
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map((i) => i.url)
  if (imagenes.length === 0 && p.imagen_principal) imagenes.push(p.imagen_principal)
  const categoria = p.categoria?.trim() || 'Otros'
  const stock = proximamente ? 0 : modo === 'por_cantidad' ? Math.max(0, Number(p.stock_disponible ?? 0)) : 1
  return {
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    descripcion: p.descripcion ?? null,
    categoria,
    catId: slug(categoria),
    material: p.material?.trim() || null,
    kilataje: p.kilataje && p.kilataje.trim() !== '0' ? p.kilataje.trim() : null,
    piedras: p.piedras ?? null,
    peso: p.peso_gramos ?? null,
    pub,
    emb: p.precio_embajador == null ? null : Number(p.precio_embajador),
    was: Boolean(p.en_descuento) && lista > pub ? lista : null,
    isNew: diasNuevo > 0 && fecha >= ahora - diasNuevo * 86_400_000,
    modo,
    stock,
    proximamente,
    imagenes,
    fecha: fecha || p.id,
    vendidos: Number(p.vendidos ?? 0),
    inmediata: stock > 0 && Boolean(p.inmediata),
    ubicacion: p.ubicacion ?? p.tienda ?? null,
  }
}

export function mapearPiezas(filas: FilaPieza[], diasNuevo: number): ProductoWeb[] {
  const ahora = Date.now()
  return filas.filter((p) => p.precio_venta != null).map((p) => mapearPieza(p, diasNuevo, ahora))
}

type FilaContenido = Record<string, unknown> & {
  id: number
  audiencia: string
  fecha_inicio: string | null
  fecha_fin: string | null
}

function vigente(f: FilaContenido, audiencia: string, hoy: string) {
  return (
    (f.audiencia === 'todos' || f.audiencia === audiencia) &&
    (!f.fecha_inicio || f.fecha_inicio <= hoy) &&
    (!f.fecha_fin || f.fecha_fin >= hoy)
  )
}

const cadena = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Contenido de "Configuración del catálogo" para un contexto (solo lo activo y vigente hoy). Cuatro consultas en paralelo. */
export async function cargarConfigCatalogo(
  supabase: Supabase,
  contexto: Contexto,
  /** A quién se le muestra: por defecto el contexto; 'mayorista' para cuentas mayoristas. */
  audiencia: string = contexto,
): Promise<ConfigCatalogo> {
  const orden = { ascending: true }
  const [anuncios, banners, novedades, config] = await Promise.all([
    supabase.from('catalogo_anuncios').select('*').eq('activo', true).order('orden', orden).order('id', orden),
    supabase.from('catalogo_banners').select('*').eq('activo', true).order('orden', orden).order('id', orden),
    supabase.from('catalogo_novedades').select('*').eq('activo', true).order('orden', orden).order('id', orden),
    supabase.from('catalogo_config').select('clave, valor'),
  ])
  const hoy = hoyGuatemala()
  const filtrar = (filas: unknown) => ((filas ?? []) as FilaContenido[]).filter((f) => vigente(f, audiencia, hoy))
  const bloques = new Map<string, unknown>(((config.data ?? []) as { clave: string; valor: unknown }[]).map((c) => [c.clave, c.valor]))
  const paraContexto = <T extends { audiencia: string }>(lista: T[]) =>
    lista.filter((x) => x.audiencia === 'todos' || x.audiencia === audiencia)

  // En el enlace público no existe "Generar link": esos llamados a la acción se ocultan.
  // "Generar link" solo existe para el equipo y los embajadores (no en el enlace público ni para mayoristas).
  const ctaVisible = (tipo: string) => audiencia === 'backoffice' || tipo !== 'generar_link'

  return {
    general: leerGeneral(bloques.get('general')),
    anuncios: filtrar(anuncios.data).map((a) => String(a.texto)).filter(Boolean),
    banners: filtrar(banners.data)
      .filter((b) => ctaVisible(String(b.cta_tipo)))
      .map((b) => ({
        id: b.id,
        etiqueta: cadena(b.etiqueta),
        titulo: String(b.titulo),
        texto: cadena(b.texto),
        cta: { texto: cadena(b.cta_texto), tipo: ctaTipo(b.cta_tipo), valor: cadena(b.cta_valor) },
        imagen: cadena(b.imagen_url),
        colorFondo: colorValido(b.color_fondo, '#0F2A5C'),
        colorEtiqueta: colorValido(b.color_etiqueta, '#F2D58A'),
      })),
    novedades: filtrar(novedades.data)
      .filter((n) => ctaVisible(String(n.cta_tipo)))
      .map((n) => ({
        id: n.id,
        etiqueta: cadena(n.etiqueta),
        titulo: String(n.titulo),
        texto: cadena(n.texto),
        cta: { texto: cadena(n.cta_texto), tipo: ctaTipo(n.cta_tipo), valor: cadena(n.cta_valor) },
        imagen: cadena(n.imagen_url),
        colorFondo: colorValido(n.color_fondo, '#0F2A5C'),
      })),
    promos: paraContexto(leerPromos(bloques.get('promos_laterales'))).filter((p) => ctaVisible(p.cta_tipo)),
    beneficios: paraContexto(leerBeneficios(bloques.get('beneficios'))),
    oferta: leerOferta(bloques.get('oferta_relampago')),
    banda: leerBanda(bloques.get('banda_link')),
    pie: leerPie(bloques.get('pie')),
  }
}

/** Ícono de la tarjeta de categoría según su nombre (si no tiene imagen). */
function iconoCategoria(nombre: string): NombreIcono {
  const n = slug(nombre)
  if (/anillo|sortija|argolla/.test(n)) return 'ring'
  if (/perfume|fragancia/.test(n)) return 'perfume'
  if (/locion|crema/.test(n)) return 'bottle'
  if (/reloj/.test(n)) return 'watch'
  if (/bolso|cartera|bolsa/.test(n)) return 'bag'
  if (/ropa|camisa|blusa/.test(n)) return 'shirt'
  if (/audifono|tecno/.test(n)) return 'headphones'
  return 'gem'
}

type EstiloCategoria = { id: number; nombre: string; orden: number; imagen_catalogo: string | null; color_catalogo: string | null }

/** Tarjetas de categoría: las que tienen piezas, con su imagen/color configurados. */
export function armarCategorias(productos: ProductoWeb[], estilosData: unknown): CategoriaWeb[] {
  const estilos = new Map<string, EstiloCategoria>()
  for (const e of (estilosData ?? []) as EstiloCategoria[]) estilos.set(slug(e.nombre), e)

  const conteo = new Map<string, { nombre: string; total: number; imagen: string | null }>()
  for (const p of productos) {
    const c = conteo.get(p.catId)
    if (c) {
      c.total++
      if (!c.imagen && p.imagenes[0]) c.imagen = p.imagenes[0]
    } else conteo.set(p.catId, { nombre: p.categoria, total: 1, imagen: p.imagenes[0] ?? null })
  }

  return [...conteo.entries()]
    .map(([id, c]) => {
      const e = estilos.get(id)
      return { id, nombre: c.nombre, total: c.total, imagen: e?.imagen_catalogo || c.imagen, color: e?.color_catalogo || null, orden: e?.orden ?? 999 }
    })
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
    .map(({ orden: _o, ...c }, i) => ({ ...c, color: c.color || PALETA[i % PALETA.length], icono: iconoCategoria(c.nombre) }))
}

/** Todo lo que necesita el catálogo web, en una sola ola de red. */
export async function cargarCatalogoWeb(supabase: Supabase, contexto: Contexto, token?: string, audiencia: string = contexto) {
  const [config, filas, { data: estilos }] = await Promise.all([
    cargarConfigCatalogo(supabase, contexto, audiencia),
    consultarPiezas(supabase, { token }),
    supabase.rpc('fn_categorias_catalogo'),
  ])
  const productos = mapearPiezas(filas, config.general.dias_nuevo)
  return { config, productos, categorias: armarCategorias(productos, estilos) }
}

/** Línea del carrito (fn_ver_carrito / fn_ver_mi_carrito) → línea del catálogo web. */
export function adaptarLineaWeb(i: ItemCarrito): LineaWeb {
  return {
    producto_id: i.producto_id,
    nombre: i.nombre,
    precio: Number(i.precio_venta ?? 0),
    imagen: i.imagen_principal,
    cantidad: i.cantidad,
    modo: i.modo_inventario,
    stock: i.stock_disponible,
  }
}
