import type { CSSProperties } from 'react'

/** Tokens del diseño aprobado (ProductoDetalle.jsx). Valores exactos. */
export const T = {
  bg: '#FFFFFF',
  soft: '#F5F7FA',
  ink: '#14213D',
  body: '#3C4A66',
  muted: '#64708A',
  faint: '#8A94A8',
  line: '#EDF0F5',
  lineSoft: '#F0F2F6',
  input: '#E2E7EF',
  btnLine: '#D5DCE8',
  radioOff: '#C7CFDC',
  blue: '#2453D6',
  blueSoft: '#EEF3FD',
  navy: '#102A5C',
  gold: '#F2D58A',
  amber: '#C98A0B',
  green: '#157A52',
  greenLive: '#22A06B',
  greenSoft: '#F3F8F5',
  danger: '#B42318',
  heart: '#E04848',
  iconBlue: '#3A5BA8',
  tints: ['#EEF2FA', '#F1F4FA', '#ECF1F9', '#F4F6FA'],
  overlay: 'rgba(20,33,61,0.40)',
  maxW: 1240,
} as const

export const TOAST_MS = 2600
export const REL_CARD_W = 256
export const REL_GAP = 24

const ICONS = {
  gem: 'M6 3h12l4 6-10 12L2 9z M2 9h20 M10 3L8 9l4 12 4-12-2-6',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z M20 20l-4-4',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1 M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  cart: 'M3 4h2l2.5 11h11L21 7H6.5 M9 20a1 1 0 1 0 0-.01 M18 20a1 1 0 1 0 0-.01',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  chevronDown: 'M6 9l6 6 6-6',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12 M18 6L6 18',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  check: 'M5 12l5 5 9-10',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  truck: 'M3 7h11v9H3z M14 10h4l3 3v3h-7 M7 19a2 2 0 1 0 0-.01 M17 19a2 2 0 1 0 0-.01',
  box: 'M21 8l-9-5-9 5 9 5z M3 8v8l9 5 9-5V8 M12 13v8',
  clock: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z M12 8v4l3 2',
  share: 'M18 3a3 3 0 1 0 0 6a3 3 0 1 0 0-6z M6 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z M18 15a3 3 0 1 0 0 6a3 3 0 1 0 0-6z M8.6 13.5l6.8 4 M15.4 6.5l-6.8 4',
  qr: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h2v2h-2z M18 18h2v2h-2z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
  rotate: 'M3 12a9 9 0 1 0 3-6.7 M3 4v5h5',
  ring: 'M9 2h6l-1.5 3h-3z M12 7a7 7 0 1 0 0 14a7 7 0 1 0 0-14z M12 10a4 4 0 1 0 0 8a4 4 0 1 0 0-8z',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
} as const

export type NombreIconoPd = keyof typeof ICONS

export function Icon({
  name,
  size = 18,
  stroke = 1.8,
  color = 'currentColor',
  fill = 'none',
  style,
}: {
  name: NombreIconoPd
  size?: number
  stroke?: number
  color?: string
  fill?: string
  style?: CSSProperties
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: 'none', ...style }}
    >
      <path d={ICONS[name]} />
    </svg>
  )
}

export const quetzal = (n: number) => 'Q ' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
export const linkBtn: CSSProperties = { ...btn, height: 36, gap: 8, color: T.blue, fontSize: 14, fontWeight: 600 }
export const sectionTop: CSSProperties = { paddingTop: 24, borderTop: `1px solid ${T.line}` }
export const h2: CSSProperties = { margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }

export const GLOBAL_CSS = `
.pd button:disabled{cursor:not-allowed}
.pd button:focus-visible,.pd input:focus-visible,.pd select:focus-visible,.pd a:focus-visible{outline:3px solid #9DB5F0;outline-offset:2px}
.pd input[type=search]::-webkit-search-cancel-button{display:none}
.pd-rel-img{transition:transform .25s ease}
.pd-rel:hover .pd-rel-img{transform:translateY(-3px)}
@keyframes pd-fade{from{opacity:0}to{opacity:1}}
@keyframes pd-pop{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes pd-slide{from{transform:translateX(100%)}to{transform:none}}
@keyframes pd-up{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
@media (prefers-reduced-motion: reduce){.pd *{animation:none!important;transition:none!important}}
@media (max-width: 760px){
  .pd-main{padding:16px 16px 0!important;gap:48px!important}
  .pd-header-in{padding:12px 16px!important}
  .pd-gallery{flex-direction:column-reverse!important;position:static!important}
  .pd-thumbs{flex-direction:row!important;overflow-x:auto}
  .pd-title{font-size:28px!important}
  .pd-price{font-size:32px!important}
  .pd-footer-in{padding:24px 16px!important}
}
`
