import type { CSSProperties } from 'react'

/** Tokens del diseño móvil aprobado (CatalogApp.jsx). Valores exactos — no cambiar. */
export const T = {
  bg: '#F3F6FC',
  surface: '#FFFFFF',
  text: '#0B1B3F',
  muted: '#4A5876',
  primary: '#1D4ED8',
  primarySoft: '#E2EBFF',
  primaryTint: '#EEF3FF',
  primaryDeep: '#0B2E8A',
  chipText: '#0B2E8A',
  navy: '#0B1B3F',
  navySoft: '#1C3364',
  sky: '#60A5FA',
  skyText: '#BFD3FF',
  border: '#DCE4F2',
  borderSoft: '#E3EAF6',
  stepperBg: '#EEF3FC',
  radioOff: '#CBD5E1',
  switchOff: '#B8C3D6',
  success: '#0E6B8C',
  danger: '#B42318',
  disabledBg: '#E3EAF6',
  disabledFg: '#7A879F',
  overlay: 'rgba(11,27,63,0.48)',
  shadow: '0 12px 28px rgba(11,27,63,0.30)',
} as const

export const TOAST_MS = 2400
/** Minutos que se aparta una pieza en el carrito (parámetro minutos_retencion_carrito, 20 por defecto). */
export const MINUTOS_RETENCION = 20

export const btn: CSSProperties = {
  border: 'none',
  background: 'none',
  padding: 0,
  margin: 0,
  fontFamily: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}
export const scrollY: CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto' }
export const card: CSSProperties = { background: T.surface, border: `1px solid ${T.borderSoft}` }
export const sectionTitle: CSSProperties = { fontSize: 15, fontWeight: 800 }

export const GLOBAL_CSS = `
.cat-noscroll{scrollbar-width:none}
.cat-noscroll::-webkit-scrollbar{display:none}
.cat-app button:focus-visible,.cat-app input:focus-visible,.cat-app select:focus-visible{outline:3px solid ${T.sky};outline-offset:2px}
.cat-app input[type=search]::-webkit-search-cancel-button{display:none}
.cat-app button:disabled{cursor:not-allowed}
.cat-snap{scroll-snap-type:x mandatory}
.cat-snap>*{scroll-snap-align:center}
@keyframes cat-up{from{transform:translateY(100%)}to{transform:none}}
@keyframes cat-fade{from{opacity:0}to{opacity:1}}
@keyframes cat-drop{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.cat-app *{animation:none!important;transition:none!important}}
`
