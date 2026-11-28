/** Enlaces públicos de registro de embajadores: tipos y textos por defecto. */

export type EnlaceRegistro = {
  id: number
  token: string
  nombre: string
  superior_id: number
  tipo_embajador: string
  activo: boolean
  vence: string | null
  cupo: number | null
  usos: number
  titulo_bienvenida: string
  mensaje_bienvenida: string | null
  mensajes_expectativa: string[]
  fecha_lanzamiento: string | null
  permitir_ingreso: boolean
  fecha_creacion: string
}

export const TITULO_BIENVENIDA = '¡Felicidades por inscribirte!'

export const MENSAJE_BIENVENIDA =
  'Ya eres parte de la red de embajadores ASTRO. Guardamos tu lugar para que seas de los primeros en entrar.'

export const MENSAJES_EXPECTATIVA = [
  'Próximamente se abren las entradas al Universo de Compras ASTRO.',
  'Tendrás acceso anticipado a marcas, lanzamientos y ofertas exclusivas.',
  'Tu catálogo personal y tus primeras ganancias están por llegar.',
  'Te avisaremos por WhatsApp y correo el día del lanzamiento.',
]

/** Disponible = activo, sin vencer y con cupo. */
export function estadoEnlace(e: Pick<EnlaceRegistro, 'activo' | 'vence' | 'cupo' | 'usos'>): { disponible: boolean; motivo: string | null } {
  if (!e.activo) return { disponible: false, motivo: 'Desactivado' }
  if (e.vence && new Date(e.vence).getTime() <= Date.now()) return { disponible: false, motivo: 'Vencido' }
  if (e.cupo != null && e.usos >= e.cupo) return { disponible: false, motivo: 'Cupo lleno' }
  return { disponible: true, motivo: null }
}

export const urlRegistro = (base: string, token: string) => `${base.replace(/\/$/, '')}/registro/${token}`
