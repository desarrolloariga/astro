/**
 * Reglas de entrega (ficha de producto y checkout). Sin dependencias del
 * servidor: se usan igual en el navegador.
 *
 * - Entrega inmediata: solo si la pieza tiene existencia en un CEDI; pasada
 *   la hora de corte (hora de Guatemala) llega el siguiente día hábil.
 * - Entrega programada: próximos N días hábiles (sin los días no laborables).
 * - Recoger en CEDI: sin costo de envío.
 */

export type Franja = { id: string; etiqueta: string; inicio: string; fin: string }

export type ConfigEntrega = {
  hora_corte: string
  cedi_direccion: string
  cedi_horario: string
  dias_programada: number
  /** 0 = domingo … 6 = sábado. */
  dias_laborables: number[]
  /** Fechas YYYY-MM-DD sin entregas (feriados). */
  dias_no_laborables: string[]
  franjas: Franja[]
  garantia: string
  cambios: string
}

export type MetodoEntrega = 'domicilio' | 'recoger'
export type TipoEntrega = 'inmediata' | 'programada'

export type EleccionEntrega = {
  metodo: MetodoEntrega
  tipo: TipoEntrega
  fecha: string | null
  franja: string | null
}

export type DiaEntrega = { key: string; weekday: string; day: number; full: string }

/** Cookie con la entrega elegida en la ficha; el checkout la usa para precargarse. */
export const COOKIE_ENTREGA = 'astro_entrega'

export const CONFIG_ENTREGA_DEFECTO: ConfigEntrega = {
  hora_corte: '14:00',
  cedi_direccion: '',
  cedi_horario: '',
  dias_programada: 5,
  dias_laborables: [1, 2, 3, 4, 5, 6],
  dias_no_laborables: [],
  franjas: [
    { id: 'am', etiqueta: 'Mañana', inicio: '8:00', fin: '12:00' },
    { id: 'pm', etiqueta: 'Tarde', inicio: '12:00', fin: '17:00' },
  ],
  garantia: '',
  cambios: '',
}

const WD = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const HORA = /^([01]?\d|2[0-3]):[0-5]\d$/

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export function leerConfigEntrega(v: unknown): ConfigEntrega {
  const o = obj(v)
  const d = CONFIG_ENTREGA_DEFECTO
  const dias = Number(o.dias_programada)
  const laborables = Array.isArray(o.dias_laborables)
    ? o.dias_laborables.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    : d.dias_laborables
  const franjas = Array.isArray(o.franjas)
    ? o.franjas
        .map((f, i) => {
          const fo = obj(f)
          return { id: txt(fo.id) || `f${i + 1}`, etiqueta: txt(fo.etiqueta), inicio: txt(fo.inicio), fin: txt(fo.fin) }
        })
        .filter((f) => f.etiqueta && f.inicio && f.fin)
    : d.franjas
  return {
    hora_corte: HORA.test(txt(o.hora_corte)) ? txt(o.hora_corte) : d.hora_corte,
    cedi_direccion: txt(o.cedi_direccion),
    cedi_horario: txt(o.cedi_horario),
    dias_programada: Number.isFinite(dias) && dias >= 1 ? Math.min(14, Math.floor(dias)) : d.dias_programada,
    dias_laborables: laborables.length ? laborables : d.dias_laborables,
    dias_no_laborables: Array.isArray(o.dias_no_laborables)
      ? o.dias_no_laborables.filter((x): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x))
      : [],
    franjas: franjas.length ? franjas : d.franjas,
    garantia: txt(o.garantia),
    cambios: txt(o.cambios),
  }
}

/** Fecha (YYYY-MM-DD) y minutos del día en hora de Guatemala. */
export function ahoraGuatemala(ahora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(ahora)
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? '00'
  return { fecha: `${p('year')}-${p('month')}-${p('day')}`, minutos: (Number(p('hour')) % 24) * 60 + Number(p('minute')) }
}

const aMinutos = (hora: string) => {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

export function pasoHoraCorte(config: ConfigEntrega, ahora = ahoraGuatemala()) {
  return ahora.minutos >= aMinutos(config.hora_corte)
}

/** "14:00" → "2:00 p. m." */
export function horaLegible(hora: string) {
  const [h, m] = hora.split(':').map(Number)
  const sufijo = h >= 12 ? 'p. m.' : 'a. m.'
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${sufijo}`
}

function sumarDias(fecha: string, n: number) {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d
}

function esHabil(config: ConfigEntrega, d: Date) {
  return config.dias_laborables.includes(d.getUTCDay()) && !config.dias_no_laborables.includes(d.toISOString().slice(0, 10))
}

/** Próximos días hábiles para entrega programada (desde mañana). */
export function diasProgramados(config: ConfigEntrega, ahora = ahoraGuatemala()): DiaEntrega[] {
  const dias: DiaEntrega[] = []
  for (let i = 1; dias.length < config.dias_programada && i <= 60; i++) {
    const d = sumarDias(ahora.fecha, i)
    if (!esHabil(config, d)) continue
    dias.push({
      key: d.toISOString().slice(0, 10),
      weekday: i === 1 ? 'Mañana' : WD[d.getUTCDay()],
      day: d.getUTCDate(),
      full: `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]}`,
    })
  }
  return dias
}

export function textoDia(key: string) {
  const d = new Date(`${key}T12:00:00Z`)
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]}`
}

/** Entrega elegida, normalizada contra la configuración (la inmediata solo si se permite). */
export function normalizarEleccion(
  e: Partial<EleccionEntrega> | null | undefined,
  config: ConfigEntrega,
  permiteInmediata: boolean,
  dias: DiaEntrega[] = diasProgramados(config),
): EleccionEntrega {
  const metodo: MetodoEntrega = e?.metodo === 'recoger' ? 'recoger' : 'domicilio'
  const tipo: TipoEntrega = permiteInmediata && e?.tipo !== 'programada' ? 'inmediata' : 'programada'
  if (tipo === 'inmediata') return { metodo, tipo, fecha: null, franja: null }
  const fecha = dias.some((d) => d.key === e?.fecha) ? (e?.fecha as string) : (dias[0]?.key ?? null)
  const franja = config.franjas.some((f) => f.id === e?.franja) ? (e?.franja as string) : (config.franjas[0]?.id ?? null)
  return { metodo, tipo, fecha, franja }
}

/** Frase de cuándo llega (franja verde de la ficha y resumen del checkout). */
export function textoEta(e: EleccionEntrega, config: ConfigEntrega, ahora = ahoraGuatemala()) {
  const casa = e.metodo === 'domicilio'
  if (e.tipo === 'programada') {
    const f = config.franjas.find((x) => x.id === e.franja)
    const dia = e.fecha ? textoDia(e.fecha) : 'el día que elijas'
    return `${casa ? 'Llega' : 'Recoge'} el ${dia}${f ? `, entre ${f.inicio} y ${f.fin}` : ''}`
  }
  if (pasoHoraCorte(config, ahora)) return casa ? 'Llega mañana: ya pasó la hora de corte de hoy' : 'Lista para recoger mañana'
  return casa ? `Llega hoy si confirmas antes de las ${horaLegible(config.hora_corte)}` : 'Lista para recoger hoy'
}

/** Versión corta ("llega hoy", "jue 23 oct, 8:00 – 12:00"). */
export function textoEtaCorto(e: EleccionEntrega, config: ConfigEntrega, ahora = ahoraGuatemala()) {
  if (e.tipo === 'programada') {
    const f = config.franjas.find((x) => x.id === e.franja)
    return `${e.fecha ? textoDia(e.fecha) : ''}${f ? `, ${f.inicio} – ${f.fin}` : ''}`
  }
  const manana = pasoHoraCorte(config, ahora)
  return e.metodo === 'domicilio' ? (manana ? 'llega mañana' : 'llega hoy') : manana ? 'recoge mañana' : 'recoge hoy'
}

export function serializarEleccion(e: EleccionEntrega) {
  return encodeURIComponent(JSON.stringify(e))
}

export function parsearEleccion(valor: string | null | undefined): Partial<EleccionEntrega> | null {
  if (!valor) return null
  try {
    const o = obj(JSON.parse(decodeURIComponent(valor)))
    return {
      metodo: o.metodo === 'recoger' ? 'recoger' : 'domicilio',
      tipo: o.tipo === 'programada' ? 'programada' : 'inmediata',
      fecha: typeof o.fecha === 'string' ? o.fecha : null,
      franja: typeof o.franja === 'string' ? o.franja : null,
    }
  } catch {
    return null
  }
}
