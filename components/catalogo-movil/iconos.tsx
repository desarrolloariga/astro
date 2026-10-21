import { T } from './tokens'

/** Trazos SVG 24×24 del diseño; se agrega `gem` para piezas sin foto y `upload`/`alert` para el checkout. */
export const ICONS = {
  gem: 'M7 3h10l4 6-9 12L3 9z M3 9h18 M12 21L8.5 9 12 3l3.5 6L12 21',
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z M20 20l-4-4',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  bag: 'M6 7h12l1 13H5L6 7z M9 7a3 3 0 0 1 6 0',
  sliders: 'M4 7h9 M17 7h3 M15 5v4 M4 17h3 M11 17h9 M9 15v4',
  back: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M6 9l6 6 6-6',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12 M18 6L6 18',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  check: 'M5 12l5 5 9-10',
  clock: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z M12 8v4l3 2',
  pin: 'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z M12 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z',
  user: 'M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M4 20a8 8 0 0 1 16 0',
  bank: 'M3 10l9-6 9 6 M5 10v8 M10 10v8 M14 10v8 M19 10v8 M3 20h18',
  cash: 'M3 7h18v10H3z M12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  alert: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z M12 8v5 M12 16h.01',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
} as const

export type NombreIcono = keyof typeof ICONS

export function Icon({
  name,
  size = 22,
  stroke = 2,
  color = 'currentColor',
  fill = 'none',
}: {
  name: NombreIcono
  size?: number
  stroke?: number
  color?: string
  fill?: string
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
      style={{ flex: 'none' }}
    >
      <path d={ICONS[name]} />
    </svg>
  )
}

export function Star({ size = 13, color = T.primary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" style={{ flex: 'none' }}>
      <path d={ICONS.star} />
    </svg>
  )
}
