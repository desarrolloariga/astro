import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import type { PiezaCatalogo } from '@/components/catalogo/tipos'
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

const LOTE = 1000
const PALETA = ['#DCE6FA', '#E4ECFB', '#F6E9C4', '#E8EEF8', '#D7E3F8', '#EFE6CF']

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

export type PiezaFuente = PiezaCatalogo & { categoria_id?: number | null; precio_lista?: number | null; en_descuento?: boolean | null }

export const COLUMNAS_PIEZA =
  'id, codigo, nombre, descripcion, categoria_id, categoria, material, peso_gramos, kilataje, piedras, precio_venta, precio_lista, en_descuento, estado, imagen_principal, imagenes, modo_inventario, stock_disponible'

async function piezasBackoffice(supabase: Supabase): Promise<PiezaFuente[]> {
  const piezas: PiezaFuente[] = []
  for (let desde = 0; desde < 20 * LOTE; desde += LOTE) {
    const { data } = await supabase
      .from('vw_catalogo')
      .select(
        'id, codigo, nombre, descripcion, categoria_id, categoria, material, peso_gramos, kilataje, piedras, precio_venta, precio_lista, en_descuento, estado, imagen_principal, imagenes, modo_inventario, stock_disponible',
      )
      .order('id', { ascending: false })
      .range(desde, desde + LOTE - 1)
    const lote = (data ?? []) as PiezaFuente[]
    piezas.push(...lote)
    if (lote.length < LOTE) break
  }
  return piezas
}

type Meta = { producto_id: number; fecha_publicacion: string | null; precio_lista: number | null; en_descuento: boolean; vendidos: number }

/** Productos del catálogo con precio embajador, oferta, "Nuevo" y unidades vendidas. */
async function cargarProductos(
  supabase: Supabase,
  contexto: Contexto,
  token: string | undefined,
  diasNuevo: number,
): Promise<ProductoWeb[]> {
  const piezas: PiezaFuente[] =
    contexto === 'publico'
      ? (((await supabase.rpc('fn_catalogo_por_token', { p_token: token ?? '' })).data ?? []) as PiezaFuente[])
      : await piezasBackoffice(supabase)
  return enriquecerPiezas(supabase, piezas, contexto, diasNuevo)
}

/** Piezas de vw_catalogo / fn_catalogo_por_token → productos con precio embajador, oferta, "Nuevo" y vendidos. */
export async function enriquecerPiezas(
  supabase: Supabase,
  piezas: PiezaFuente[],
  contexto: Contexto,
  diasNuevo: number,
): Promise<ProductoWeb[]> {
  const ids = piezas.map((p) => p.id)
  const [metaRes, embRes] = await Promise.all([
    ids.length ? supabase.rpc('fn_catalogo_meta', { p_producto_ids: ids }) : Promise.resolve({ data: [] }),
    contexto === 'backoffice' && ids.length
      ? supabase.rpc('fn_precios_embajador', { p_producto_ids: ids })
      : Promise.resolve({ data: [] }),
  ])
  const meta = new Map<number, Meta>()
  for (const m of (metaRes.data ?? []) as Meta[]) meta.set(Number(m.producto_id), m)
  const emb = new Map<number, number>()
  for (const f of (embRes.data ?? []) as { producto_id: number; precio_embajador: number | null }[]) {
    if (f.precio_embajador != null) emb.set(Number(f.producto_id), Number(f.precio_embajador))
  }

  const limiteNuevo = Date.now() - diasNuevo * 86_400_000
  return piezas
    .filter((p) => p.precio_venta != null)
    .map((p) => {
      const m = meta.get(p.id)
      const pub = Number(p.precio_venta)
      const lista = Number(p.precio_lista ?? m?.precio_lista ?? 0)
      const enDescuento = Boolean(p.en_descuento ?? m?.en_descuento)
      const fecha = m?.fecha_publicacion ? new Date(m.fecha_publicacion).getTime() : 0
      const modo = p.modo_inventario ?? 'pieza_unica'
      const proximamente = p.estado === 'en_transito'
      const imagenes = (p.imagenes ?? [])
        .slice()
        .sort((a, b) => a.orden - b.orden)
        .map((i) => i.url)
      if (imagenes.length === 0 && p.imagen_principal) imagenes.push(p.imagen_principal)
      const categoria = p.categoria?.trim() || 'Otros'
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
        emb: emb.get(p.id) ?? null,
        was: enDescuento && lista > pub ? lista : null,
        isNew: diasNuevo > 0 && fecha >= limiteNuevo,
        modo,
        stock: proximamente ? 0 : modo === 'por_cantidad' ? Math.max(0, Number(p.stock_disponible ?? 0)) : 1,
        proximamente,
        imagenes,
        fecha: fecha || p.id,
        vendidos: Number(m?.vendidos ?? 0),
      } satisfies ProductoWeb
    })
}

type FilaContenido = Record<string, unknown> & {
  id: number
  audiencia: string
  fecha_inicio: string | null
  fecha_fin: string | null
}

function vigente(f: FilaContenido, contexto: Contexto, hoy: string) {
  return (
    (f.audiencia === 'todos' || f.audiencia === contexto) &&
    (!f.fecha_inicio || f.fecha_inicio <= hoy) &&
    (!f.fecha_fin || f.fecha_fin >= hoy)
  )
}

const cadena = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Contenido de "Configuración del catálogo" para un contexto (solo lo activo y vigente hoy). */
export async function cargarConfigCatalogo(supabase: Supabase, contexto: Contexto): Promise<ConfigCatalogo> {
  const orden = { ascending: true }
  const [anuncios, banners, novedades, config] = await Promise.all([
    supabase.from('catalogo_anuncios').select('*').eq('activo', true).order('orden', orden).order('id', orden),
    supabase.from('catalogo_banners').select('*').eq('activo', true).order('orden', orden).order('id', orden),
    supabase.from('catalogo_novedades').select('*').eq('activo', true).order('orden', orden).order('id', orden),
    supabase.from('catalogo_config').select('clave, valor'),
  ])
  const hoy = hoyGuatemala()
  const filtrar = (filas: unknown) => ((filas ?? []) as FilaContenido[]).filter((f) => vigente(f, contexto, hoy))
  const bloques = new Map<string, unknown>(((config.data ?? []) as { clave: string; valor: unknown }[]).map((c) => [c.clave, c.valor]))
  const paraContexto = <T extends { audiencia: string }>(lista: T[]) =>
    lista.filter((x) => x.audiencia === 'todos' || x.audiencia === contexto)

  // En el enlace público no existe "Generar link": esos llamados a la acción se ocultan.
  const ctaVisible = (tipo: string) => contexto === 'backoffice' || tipo !== 'generar_link'

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

type EstiloCategoria = { id: number; nombre: string; orden: number; imagen_catalogo: string | null; color_catalogo: string | null }

/** Tarjetas de categoría: las que tienen piezas, con su imagen/color configurados. */
async function cargarCategorias(supabase: Supabase, productos: ProductoWeb[]): Promise<CategoriaWeb[]> {
  const { data } = await supabase.rpc('fn_categorias_catalogo')
  const estilos = new Map<string, EstiloCategoria>()
  for (const e of (data ?? []) as EstiloCategoria[]) estilos.set(slug(e.nombre), e)

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

export async function cargarCatalogoWeb(supabase: Supabase, contexto: Contexto, token?: string) {
  const config = await cargarConfigCatalogo(supabase, contexto)
  const productos = await cargarProductos(supabase, contexto, token, config.general.dias_nuevo)
  const categorias = await cargarCategorias(supabase, productos)
  return { config, productos, categorias }
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
