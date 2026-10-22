import type { CSSProperties } from 'react'
import type { NombreIcono } from '@/lib/catalogo-web/tipos'

export const ICONS: Record<NombreIcono, string> = {
  perfume: 'M9 3h6v3H9z M10 6v2 M14 6v2 M7 8h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z M9 14h6',
  bottle: 'M10 2h4v4h-4z M9 6h6l1 3v11a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9z M8 13h8',
  gem: 'M6 3h12l4 6-10 12L2 9z M2 9h20 M10 3L8 9l4 12 4-12-2-6',
  ring: 'M9 2h6l-1.5 3h-3z M12 7a7 7 0 1 0 0 14a7 7 0 1 0 0-14z M12 10a4 4 0 1 0 0 8a4 4 0 1 0 0-8z',
  shirt: 'M8 3l-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z',
  headphones:
    'M3 14v-2a9 9 0 0 1 18 0v2 M4 14h1a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z M19 14h1a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z',
  watch: 'M9 6h6a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z M9 6l1-4h4l1 4 M9 18l1 4h4l1-4 M12 9.5V12l1.5 1.5',
  bag: 'M6 7h12l1 13H5L6 7z M9 7a3 3 0 0 1 6 0',
  tag: 'M3 12V4h8l10 10-8 8z M7.5 7.5h.01',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1 M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  pulse: 'M3 12h4l3-8 4 16 3-8h4',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  check: 'M5 12l5 5 9-10',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z M20 20l-4-4',
  close: 'M6 6l12 12 M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  arrowRight: 'M5 12h14 M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5 M11 6l-6 6 6 6',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10 21a2 2 0 0 0 4 0',
  cart: 'M3 4h2l2.5 11h11L21 7H6.5 M9 20a1 1 0 1 0 0-.01 M18 20a1 1 0 1 0 0-.01',
  user: 'M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M4 21a8 8 0 0 1 16 0',
  users: 'M9 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M2 21a7 7 0 0 1 14 0 M16 4a4 4 0 0 1 0 8 M18 14a6 6 0 0 1 4 7',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  gift: 'M4 10h16v11H4z M3 7h18v3H3z M12 7v14 M12 7s-1.5-4-4-4a2 2 0 0 0 0 4z M12 7s1.5-4 4-4a2 2 0 0 1 0 4z',
  grid4: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  grid9: 'M3 3h5v5H3z M10 3h4v5h-4z M16 3h5v5h-5z M3 10h5v4H3z M10 10h4v4h-4z M16 10h5v4h-5z M3 16h5v5H3z M10 16h4v5h-4z M16 16h5v5h-5z',
  message: 'M4 5h16v11H8l-4 4z',
  mail: 'M3 6h18v12H3z M3 7l9 6 9-6',
  qr: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h2v2h-2z M18 18h2v2h-2z M18 14h2 M14 18v2',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  truck: 'M2 6h11v10H2z M13 10h5l3 3v3h-8z M6 19a2 2 0 1 0 0-.01 M17 19a2 2 0 1 0 0-.01',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
}

export function Icon({
  name,
  size = 20,
  stroke = 2,
  color = 'currentColor',
  fill = 'none',
  style,
  className,
}: {
  name: NombreIcono
  size?: number
  stroke?: number
  color?: string
  fill?: string
  style?: CSSProperties
  className?: string
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
      aria-hidden="true"
      className={className}
      style={{ flex: 'none', ...style }}
    >
      <path d={ICONS[name]} />
    </svg>
  )
}
