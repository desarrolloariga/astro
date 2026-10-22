import type { CSSProperties } from 'react'
import type { ProductoWeb } from '@/lib/catalogo-web/tipos'

/** Tokens del diseño aprobado (CatalogoWeb.jsx). Valores exactos en hex y px. */
export const T = {
  bg: '#F5F7FB',
  surface: '#FFFFFF',
  text: '#0D1B36',
  textSoft: '#3B4964',
  muted: '#55627D',
  faint: '#9AA6BE',
  navy: '#0F2A5C',
  navyDeep: '#0A1E44',
  primary: '#1E4FD8',
  primarySoft: '#E5ECFB',
  primaryTint: '#F0F4FE',
  band: '#EEF3FC',
  input: '#F1F4FA',
  border: '#E3E9F4',
  borderStrong: '#DCE4F2',
  borderBtn: '#C9D4EA',
  gold: '#F2D58A',
  goldSoft: '#F6E9C4',
  goldText: '#6B5212',
  iconBlue: '#2A4C9A',
  success: '#11704F',
  successBg: '#DDF3E8',
  live: '#1FA36B',
  warning: '#B45309',
  danger: '#B42318',
  heart: '#D93A3A',
  disabledBg: '#E3E9F4',
  disabledFg: '#7A879F',
  overlay: 'rgba(10,30,68,0.55)',
  shadowPop: '0 18px 40px rgba(10,30,68,0.16)',
  shadowModal: '0 30px 80px rgba(10,30,68,0.35)',
  maxW: 1280,
} as const

export const HERO_INTERVAL_MS = 5000
export const ANN_INTERVAL_MS = 4000
export const TOAST_MS = 2800
export const PAGE_SIZE = 8
export const OFFER_CARD_W = 264
export const OFFER_GAP = 16

export const SORTS = [
  { id: 'new', label: 'Más recientes' },
  { id: 'asc', label: 'Menor precio' },
  { id: 'desc', label: 'Mayor precio' },
  { id: 'off', label: 'Mayor descuento' },
] as const
export type Sort = (typeof SORTS)[number]['id']

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
export const container: CSSProperties = { maxWidth: T.maxW, margin: '0 auto', paddingInline: 24, boxSizing: 'border-box', width: '100%' }
export const eyebrow: CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.muted }
export const h2: CSSProperties = { margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }

export const quetzal = (n: number) =>
  'Q ' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const norm = (t: string | null | undefined) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
export const pad = (n: number) => String(n).padStart(2, '0')
export const piezas = (n: number) => `${n} ${n === 1 ? 'pieza' : 'piezas'}`
export const discount = (p: ProductoWeb) => (p.was ? Math.round(((p.was - p.pub) / p.was) * 100) : 0)

export function matchesQuery(p: ProductoWeb, q: string) {
  const nq = norm(q).trim()
  return !nq || norm(`${p.nombre} ${p.codigo} ${p.categoria} ${p.material ?? ''} ${p.kilataje ?? ''}`).includes(nq)
}

export function stockInfo(p: ProductoWeb) {
  if (p.proximamente) return { text: 'Próximamente', color: T.warning }
  if (p.stock === 0) return { text: 'Agotado', color: T.danger }
  if (p.modo === 'pieza_unica') return { text: 'Pieza única', color: T.success }
  if (p.stock <= 3) return { text: `¡Quedan ${p.stock}!`, color: T.warning }
  return { text: 'Disponible', color: T.success }
}

export const GLOBAL_CSS = `
.cw button:disabled{cursor:not-allowed}
.cw button:focus-visible,.cw input:focus-visible,.cw select:focus-visible,.cw a:focus-visible{outline:3px solid #7FA2F0;outline-offset:2px}
.cw input[type=search]::-webkit-search-cancel-button{display:none}
.cw-card{transition:transform .2s ease, box-shadow .2s ease}
.cw-card:hover{transform:translateY(-4px);box-shadow:0 16px 32px rgba(10,30,68,0.12)}
.cw-tile .cw-tile-icon{transition:transform .35s ease}
.cw-tile:hover .cw-tile-icon{transform:scale(1.08)}
.cw-suggest:hover{background:${T.input}!important}
@keyframes cw-fade{from{opacity:0}to{opacity:1}}
@keyframes cw-pop{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:none}}
@keyframes cw-slide{from{transform:translateX(100%)}to{transform:none}}
@keyframes cw-up{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}
@media (prefers-reduced-motion: reduce){.cw *{animation:none!important;transition:none!important}}
@media (max-width: 640px){
  .cw-hero-title{font-size:30px!important}
  .cw-hero-copy{padding:32px 24px 72px!important}
  .cw-hero-dots{left:24px!important}
  .cw-header-actions{width:100%;justify-content:flex-end}
  .cw-sidebar{position:static!important}
}
`
