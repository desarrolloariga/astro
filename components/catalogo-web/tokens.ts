import type { CSSProperties } from 'react'
import type { ProductoWeb } from '@/lib/catalogo-web/tipos'

/**
 * Tokens del catálogo con la marca ASTRO (Manual de Marca, nov 2026): Naranja Astro #F6A637, negro y blanco;
 * los grises son solo de apoyo de interfaz. Botones naranjas siempre con texto negro.
 */
export const T = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  text: '#000000',
  textSoft: '#1A1A1A',
  muted: '#6B6B6B',
  faint: '#9A9A9A',
  navy: '#000000',
  navyDeep: '#000000',
  primary: '#F6A637',
  primarySoft: '#FFF4E3',
  primaryTint: '#FFF9F0',
  band: '#F7F7F7',
  input: '#F4F4F4',
  border: '#EFEFEF',
  borderStrong: '#E2E2E2',
  borderBtn: '#D4D4D4',
  gold: '#F6A637',
  goldSoft: '#FFE6C2',
  goldText: '#000000',
  iconBlue: '#000000',
  success: '#000000',
  successBg: '#F2F2F2',
  live: '#F6A637',
  warning: '#A35F00',
  danger: '#B42318',
  heart: '#F6A637',
  disabledBg: '#EFEFEF',
  disabledFg: '#8A8A8A',
  overlay: 'rgba(0,0,0,0.55)',
  shadowPop: '0 18px 40px rgba(0,0,0,0.16)',
  shadowModal: '0 30px 80px rgba(0,0,0,0.35)',
  maxW: 1320,
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
export const h2: CSSProperties = { margin: 0, fontSize: 30, fontWeight: 900, letterSpacing: '-0.01em' }

export const quetzal = (n: number) =>
  'Q' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Íconos oficiales ASTRO en /astro/icons (color: negro | naranja | blanco). */
export const astroIcon = (slug: string, color: 'negro' | 'naranja' | 'blanco' = 'negro') => `/astro/icons/${slug}-${color}.png`

const ICONOS_CATEGORIA: [RegExp, string][] = [
  [/reloj|smartwatch/, 'relojeria'],
  [/joy|anillo|collar|arete|argolla|pulsera|brazalete|esclava|cadena|dije|gargantilla|oro|plata|bisuter/, 'joyeria'],
  [/perfum|fragan|colonia|locion|body mist|eau de/, 'perfumeria'],
  [/cosm|maquill|belleza|cuidado|labial|crema|piel|skin|unas/, 'cosmeticos'],
  [/hogar|casa|cocina|deco|tupper|recipiente/, 'hogar'],
  [/mascot|perro|gato|pet/, 'mascotas'],
]
/** Ícono oficial ASTRO de la categoría por su nombre (sin tildes); null si no corresponde a ninguno de los seis. */
export function iconoAstroDe(nombre: string | null | undefined): string | null {
  const n = norm(nombre)
  return ICONOS_CATEGORIA.find(([re]) => re.test(n))?.[1] ?? null
}
/** Ícono oficial de una categoría por su nombre o slug; la estrella ASTRO si no hay uno propio. */
export function iconoCategoria(nombre: string | null | undefined): string {
  return iconoAstroDe(nombre) ?? 'estrella'
}
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
.cw-astro-card{background:#fff;color:#000;border:1px solid #EFEFEF;border-radius:16px;box-shadow:0 2px 14px rgba(0,0,0,.07);padding:20px 20px 18px;display:flex;flex-direction:column;gap:12px;min-width:0;transition:transform .2s ease,box-shadow .2s ease}
.cw-hero-orbitas{position:absolute;left:-300px;top:50%;transform:translateY(-50%);opacity:.55;z-index:0}
.cw-hero-copy{position:relative;z-index:1}
@media (max-width: 900px){.cw-hero-orbitas{display:none}}
.cw-astro-card:hover{transform:translateY(-3px);box-shadow:0 16px 32px rgba(0,0,0,.12)}
.cw-astro-btn{border:0;border-radius:999px;font-family:inherit;font-weight:800;font-size:11px;line-height:1;letter-spacing:.04em;text-transform:uppercase;cursor:pointer;padding:12px 16px;background:#F6A637;color:#000;transition:background .15s,color .15s;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.cw-astro-btn:hover:not(:disabled){background:#000;color:#F6A637}
.cw-astro-btn:disabled{background:#EFEFEF;color:#8A8A8A}
.cw-astro-btn--ghost{background:#000;color:#fff}
.cw-astro-btn--ghost:hover:not(:disabled){background:#F6A637;color:#000}
.cw button:disabled{cursor:not-allowed}
.cw button:focus-visible,.cw input:focus-visible,.cw select:focus-visible,.cw a:focus-visible{outline:3px solid #F6A637;outline-offset:2px}
.cw input[type=search]::-webkit-search-cancel-button{display:none}
.cw-card{transition:transform .2s ease, box-shadow .2s ease}
.cw-card:hover{transform:translateY(-4px);box-shadow:0 16px 32px rgba(0,0,0,0.12)}
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
