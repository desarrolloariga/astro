import type { CSSProperties } from 'react'

/** Tokens del diseño aprobado (RankingGamificado.jsx). Valores exactos. */
export const T = {
  bg: '#F7F9FC',
  card: '#FFFFFF',
  ink: '#14213D',
  body: '#3C4A66',
  muted: '#64708A',
  faint: '#8A94A8',
  line: '#EDF0F5',
  lineSoft: '#F0F2F6',
  soft: '#F5F7FA',
  track: '#EEF1F6',
  blue: '#2453D6',
  blueSoft: '#EEF3FD',
  navy: '#102A5C',
  navyLine: '#1C3B78',
  gold: '#F2D58A',
  green: '#22A06B',
  greenText: '#157A52',
  greenSoft: '#E7F6EE',
  red: '#E04848',
  danger: '#B42318',
  neutral: '#A0A9BA',
  overlay: 'rgba(20,33,61,0.40)',
} as const

export const MEDALS = [
  { c: '#E0AC1E', t: '#8A6508', base: '#FFF6DD' }, // oro
  { c: '#9AA6BA', t: '#4D5A70', base: '#F0F2F6' }, // plata
  { c: '#C07A3E', t: '#8A531F', base: '#FBF1E7' }, // bronce
]

export const AVATAR_COLORS = ['#5B7BD5', '#2F9E8F', '#C2708A', '#8E6CCF', '#D08A3E', '#4A8FB8', '#6B8E4E', '#B15E5E']

export const ICONS = {
  trophy: 'M8 21h8 M12 17v4 M7 4h10v5a5 5 0 0 1-10 0z M17 5h3v2a3 3 0 0 1-3 3 M7 5H4v2a3 3 0 0 0 3 3',
  medal: 'M7 3l3 6 M17 3l-3 6 M12 9a6 6 0 1 0 0 12a6 6 0 1 0 0-12z',
  crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  flame: 'M12 22c4.4 0 7-2.9 7-6.8 0-3.1-1.8-5.3-3.4-7.2-.4 1.6-1.3 2.8-2.6 3.3.4-3.2-.8-6.6-3.5-9.3-.3 3.6-2.4 5.6-4.1 7.6C4 11.4 5 13 5 15.2 5 19.1 7.6 22 12 22z',
  target: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10z M12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  bag: 'M6 7h12l1 13H5L6 7z M9 7a3 3 0 0 1 6 0',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1 M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  userPlus: 'M9 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M2 21a7 7 0 0 1 14 0 M19 8v6 M16 11h6',
  users: 'M9 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M2 21a7 7 0 0 1 14 0 M16 4a4 4 0 0 1 0 8 M18 14a6 6 0 0 1 4 7',
  cap: 'M2 9l10-5 10 5-10 5z M6 11v5c3 2 9 2 12 0v-5',
  gift: 'M4 10h16v11H4z M3 7h18v3H3z M12 7v14',
  lock: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4',
  check: 'M5 12l5 5 9-10',
  up: 'M12 19V5 M6 11l6-6 6 6',
  down: 'M12 5v14 M6 13l6 6 6-6',
  dash: 'M6 12h12',
  arrowRight: 'M5 12h14 M13 6l6 6-6 6',
  close: 'M6 6l12 12 M18 6L6 18',
  sum: 'M18 4H6l6 8-6 8h12',
  avg: 'M4 18h16 M7 14l4-6 3 4 3-5',
  tag: 'M3 12V4h8l10 10-8 8z M7.5 7.5h.01',
} as const

export type NombreIconoRk = keyof typeof ICONS

export const iconoValido = (v: string | null | undefined, def: NombreIconoRk = 'trophy'): NombreIconoRk =>
  v && v in ICONS ? (v as NombreIconoRk) : def

export function Icon({
  name,
  size = 18,
  stroke = 1.8,
  color = 'currentColor',
  fill = 'none',
  style,
  label,
}: {
  name: NombreIconoRk
  size?: number
  stroke?: number
  color?: string
  fill?: string
  style?: CSSProperties
  label?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={fill === 'none' ? color : 'none'}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: 'none', ...style }}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <path d={ICONS[name]} />
    </svg>
  )
}

export const btn: CSSProperties = {
  border: 'none',
  background: 'none',
  padding: 0,
  margin: 0,
  fontFamily: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}
export const card: CSSProperties = { borderRadius: 28, background: T.card, border: `1px solid ${T.line}` }
export const h2: CSSProperties = { margin: 0, fontSize: 20, fontWeight: 800 }
export const srOnly: CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }

export const GLOBAL_CSS = `
.rk button:focus-visible,.rk select:focus-visible{outline:3px solid #9DB5F0;outline-offset:2px}
.rk-badge{transition:transform .2s ease, box-shadow .2s ease}
.rk-badge:hover{transform:translateY(-3px);box-shadow:0 10px 24px rgba(20,33,61,0.08)}
.rk-bar{transition:width .7s cubic-bezier(.2,.8,.2,1)}
@keyframes rk-fade{from{opacity:0}to{opacity:1}}
@keyframes rk-pop{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}
@keyframes rk-rise{from{transform:scaleY(.2);opacity:0}to{transform:none;opacity:1}}
@keyframes rk-confetti{0%{transform:translateY(0) rotate(0)}100%{transform:translateY(16px) rotate(200deg);opacity:0}}
@media (prefers-reduced-motion: reduce){.rk *{animation:none!important;transition:none!important}}
@media (max-width: 640px){.rk-main{padding:20px 16px 48px!important;gap:24px!important}.rk-pos{font-size:64px!important}}
`

/* ---------------- Datos que devuelve fn_ranking ---------------- */

/** Fila del ranking. Las filas ajenas de un embajador llegan sin name/store/role desde la base. */
export type Fila = { pos: number; pts: number; move: number; isMe: boolean; name?: string; store?: string | null; role?: string }
export type PeriodoRk = { id: number; nombre: string; inicio: string; fin: string; en_curso: boolean }
export type NivelRk = { id: number; name: string; min: number; color: string; icon: string; benefit: string }
export type PremioRk = { id: number; title: string; prize: string; tipo: 'posicion' | 'puntos'; maxPos: number | null; minPts: number | null; icon: string }
export type ReglaRk = { title: string; tipo: string; valor: number; condiciones: Record<string, unknown> }
export type LogroRk = { id: number; name: string; desc: string; icon: string; color: string; reward: string; have: number; need: number; unlocked: boolean }

export type DatosRanking = {
  sin_periodo?: boolean
  es_admin: boolean
  alcance: 'red' | 'tienda' | 'rol'
  total: number
  me: Fila | null
  mis_puntos: number
  racha: number
  rows: Fila[]
  periodo: PeriodoRk
  periodos: PeriodoRk[]
  niveles: NivelRk[]
  premios: PremioRk[]
  reglas: ReglaRk[]
  tiendas: { id: number; nombre: string }[]
  logros: LogroRk[]
}

/* ---------------- Helpers ---------------- */

export const fmt = (n: number) => Math.round(n).toLocaleString('es-GT')
export const initials = (n: string) =>
  n
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
export const MASKS = ['Xxxxxx Xxxxxxx', 'Xxxxx Xxxxxx', 'Xxxxxxx Xxxxx', 'Xxxx Xxxxxxxx']
export const moveIcon = (m: number): NombreIconoRk => (m > 0 ? 'up' : m < 0 ? 'down' : 'dash')
export const moveColor = (m: number) => (m > 0 ? T.green : m < 0 ? T.red : T.neutral)
export const moveLabel = (m: number) => (m > 0 ? `Subió ${m}` : m < 0 ? `Bajó ${-m}` : 'Sin cambio')

const NIVEL_VACIO: NivelRk = { id: 0, name: 'Sin nivel', min: 0, color: '#8D9AAE', icon: 'star', benefit: '' }

/** Nivel alcanzado con `pts` (los niveles vienen ordenados por umbral). */
export function nivelDe(niveles: NivelRk[], pts: number) {
  const lista = niveles.length ? niveles : [NIVEL_VACIO]
  let idx = 0
  lista.forEach((l, i) => {
    if (pts >= l.min) idx = i
  })
  return { nivel: lista[idx], idx, siguiente: lista[Math.min(lista.length - 1, idx + 1)], esMaximo: idx === lista.length - 1, lista }
}

/** Fondo y texto suaves a partir del color del nivel. */
export function tonoNivel(color: string) {
  const hex = color.replace('#', '')
  const n = parseInt(hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.slice(0, 6), 16)
  if (!Number.isFinite(n)) return { bg: T.soft, fg: T.body }
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  const mezcla = (t: number) => '#' + [r, g, b].map((c) => Math.round(c + (255 - c) * t).toString(16).padStart(2, '0')).join('')
  const oscuro = '#' + [r, g, b].map((c) => Math.round(c * 0.62).toString(16).padStart(2, '0')).join('')
  return { bg: mezcla(0.86), fg: oscuro }
}

/** "2026-10-01T00:00:00+00:00" → "Octubre 2026". */
export function nombrePeriodo(p: PeriodoRk) {
  const t = new Intl.DateTimeFormat('es-GT', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(p.inicio))
  return t.charAt(0).toUpperCase() + t.slice(1).replace(' de ', ' ')
}
