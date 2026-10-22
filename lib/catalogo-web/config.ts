import type {
  Audiencia,
  Beneficio,
  ConfigBanda,
  ConfigGeneral,
  ConfigOferta,
  ConfigPie,
  CtaTipo,
  NombreIcono,
  PromoLateral,
} from './tipos'

/** Valores por defecto de cada bloque de catalogo_config (si falta la fila o un campo). */
export const GENERAL_DEFECTO: ConfigGeneral = { marca: 'ASTRO', subtitulo: 'Catálogo', dias_nuevo: 15, popup_novedades: true }
export const OFERTA_DEFECTO: ConfigOferta = {
  activa: false,
  titulo: 'Ofertas relámpago',
  subtitulo: 'Precios especiales por tiempo limitado.',
  fecha_fin: null,
}
export const BANDA_DEFECTO: ConfigBanda = {
  activa: true,
  titulo: 'Tus clientes compran desde tu link',
  texto: 'Genera un link del catálogo completo, de una categoría o de piezas puntuales. Cada pedido queda asociado a ti.',
  cta_texto: 'Generar link ahora',
}
export const PIE_DEFECTO: ConfigPie = {
  descripcion: 'Catálogo en línea para embajadores y sus clientes.',
  columnas: [],
  telefono: '',
  correo: '',
  direccion: '',
}

export const CTA_TIPOS: { valor: CtaTipo; etiqueta: string }[] = [
  { valor: 'todo', etiqueta: 'Todo el catálogo' },
  { valor: 'categoria', etiqueta: 'Una categoría' },
  { valor: 'ofertas', etiqueta: 'Ofertas' },
  { valor: 'generar_link', etiqueta: 'Generar link (solo backoffice)' },
  { valor: 'url', etiqueta: 'Dirección web (URL)' },
]

export const AUDIENCIAS: { valor: Audiencia; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'backoffice', etiqueta: 'Embajadores y equipo' },
  { valor: 'publico', etiqueta: 'Clientes (link público)' },
  { valor: 'mayorista', etiqueta: 'Mayoristas' },
]

export const ICONOS_CONFIG: { valor: NombreIcono; etiqueta: string }[] = [
  { valor: 'tag', etiqueta: 'Etiqueta' },
  { valor: 'link', etiqueta: 'Link' },
  { valor: 'pulse', etiqueta: 'Pulso' },
  { valor: 'sparkle', etiqueta: 'Destello' },
  { valor: 'gift', etiqueta: 'Regalo' },
  { valor: 'gem', etiqueta: 'Gema' },
  { valor: 'ring', etiqueta: 'Anillo' },
  { valor: 'truck', etiqueta: 'Envío' },
  { valor: 'shield', etiqueta: 'Escudo' },
  { valor: 'star', etiqueta: 'Estrella' },
  { valor: 'heart', etiqueta: 'Corazón' },
  { valor: 'bolt', etiqueta: 'Rayo' },
]

const ICONOS_VALIDOS = new Set<string>([
  ...ICONOS_CONFIG.map((i) => i.valor),
  'perfume', 'bottle', 'shirt', 'headphones', 'watch', 'bag', 'users', 'user', 'cart',
])
const CTAS_VALIDOS = new Set<string>(CTA_TIPOS.map((c) => c.valor))
const AUDIENCIAS_VALIDAS = new Set<string>(AUDIENCIAS.map((a) => a.valor))

const texto = (v: unknown, def = '') => (typeof v === 'string' ? v : def)
const color = (v: unknown, def: string) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v.trim()) ? v.trim() : def)
export const icono = (v: unknown, def: NombreIcono = 'sparkle'): NombreIcono =>
  typeof v === 'string' && ICONOS_VALIDOS.has(v) ? (v as NombreIcono) : def
export const ctaTipo = (v: unknown): CtaTipo => (typeof v === 'string' && CTAS_VALIDOS.has(v) ? (v as CtaTipo) : 'todo')
export const audiencia = (v: unknown): Audiencia =>
  typeof v === 'string' && AUDIENCIAS_VALIDAS.has(v) ? (v as Audiencia) : 'todos'
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

export function leerGeneral(v: unknown): ConfigGeneral {
  const o = obj(v)
  const dias = Number(o.dias_nuevo)
  return {
    marca: texto(o.marca, GENERAL_DEFECTO.marca) || GENERAL_DEFECTO.marca,
    subtitulo: texto(o.subtitulo, GENERAL_DEFECTO.subtitulo),
    dias_nuevo: Number.isFinite(dias) && dias >= 0 ? Math.floor(dias) : GENERAL_DEFECTO.dias_nuevo,
    popup_novedades: o.popup_novedades == null ? true : Boolean(o.popup_novedades),
  }
}

export function leerOferta(v: unknown): ConfigOferta {
  const o = obj(v)
  return {
    activa: Boolean(o.activa),
    titulo: texto(o.titulo, OFERTA_DEFECTO.titulo) || OFERTA_DEFECTO.titulo,
    subtitulo: texto(o.subtitulo, OFERTA_DEFECTO.subtitulo),
    fecha_fin: typeof o.fecha_fin === 'string' && o.fecha_fin ? o.fecha_fin : null,
  }
}

export function leerBanda(v: unknown): ConfigBanda {
  const o = obj(v)
  return {
    activa: o.activa == null ? true : Boolean(o.activa),
    titulo: texto(o.titulo, BANDA_DEFECTO.titulo) || BANDA_DEFECTO.titulo,
    texto: texto(o.texto, BANDA_DEFECTO.texto),
    cta_texto: texto(o.cta_texto, BANDA_DEFECTO.cta_texto) || BANDA_DEFECTO.cta_texto,
  }
}

export function leerPie(v: unknown): ConfigPie {
  const o = obj(v)
  const columnas = Array.isArray(o.columnas)
    ? o.columnas.map((c) => {
        const co = obj(c)
        return {
          titulo: texto(co.titulo),
          enlaces: Array.isArray(co.enlaces) ? co.enlaces.filter((e): e is string => typeof e === 'string' && e.trim() !== '') : [],
        }
      }).filter((c) => c.titulo)
    : []
  return {
    descripcion: texto(o.descripcion, PIE_DEFECTO.descripcion),
    columnas,
    telefono: texto(o.telefono),
    correo: texto(o.correo),
    direccion: texto(o.direccion),
  }
}

export function leerPromos(v: unknown): PromoLateral[] {
  if (!Array.isArray(v)) return []
  return v.map((p) => {
    const o = obj(p)
    return {
      etiqueta: texto(o.etiqueta),
      titulo: texto(o.titulo),
      cta_texto: texto(o.cta_texto, 'Ver catálogo') || 'Ver catálogo',
      cta_tipo: ctaTipo(o.cta_tipo),
      cta_valor: typeof o.cta_valor === 'string' && o.cta_valor ? o.cta_valor : null,
      color_fondo: color(o.color_fondo, '#DCE6FA'),
      color_boton: color(o.color_boton, '#1E4FD8'),
      imagen_url: typeof o.imagen_url === 'string' && o.imagen_url ? o.imagen_url : null,
      icono: icono(o.icono, 'gift'),
      audiencia: audiencia(o.audiencia),
    }
  }).filter((p) => p.titulo)
}

export function leerBeneficios(v: unknown): Beneficio[] {
  if (!Array.isArray(v)) return []
  return v.map((b) => {
    const o = obj(b)
    return { icono: icono(o.icono, 'sparkle'), titulo: texto(o.titulo), texto: texto(o.texto), audiencia: audiencia(o.audiencia) }
  }).filter((b) => b.titulo)
}

export function colorValido(v: unknown, def: string) {
  return color(v, def)
}
