'use client'

import Image from 'next/image'
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import type { NombreIcono } from '@/lib/catalogo-web/tipos'
import { Icon } from './icono'
import { T, btn, h2 } from './tokens'

export function Badge({ children, tone = 'navy' }: { children: ReactNode; tone?: 'navy' | 'gold' | 'gray' }) {
  const tones = {
    navy: { background: T.navy, color: '#fff' },
    gold: { background: T.gold, color: T.navyDeep },
    gray: { background: T.muted, color: '#fff' },
  }
  return <span style={{ padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800, ...tones[tone] }}>{children}</span>
}

export function CountBubble({
  value,
  bg = T.gold,
  color = T.navyDeep,
  ring = '#fff',
  style,
}: {
  value: ReactNode
  bg?: string
  color?: string
  ring?: string
  style?: CSSProperties
}) {
  return (
    <span
      style={{
        position: 'absolute', top: -6, right: -6, minWidth: 22, height: 22, padding: '0 5px', boxSizing: 'border-box',
        borderRadius: 11, background: bg, color, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center',
        justifyContent: 'center', border: `2px solid ${ring}`, ...style,
      }}
    >
      {value}
    </span>
  )
}

export function RoundButton({
  icon,
  label,
  onClick,
  dark = false,
  size = 44,
  style,
}: {
  icon: NombreIcono
  label: string
  onClick: () => void
  dark?: boolean
  size?: number
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{ ...btn, width: size, height: size, borderRadius: size / 2, flex: 'none', background: dark ? T.navy : T.input, color: dark ? '#fff' : T.text, ...style }}
    >
      <Icon name={icon} size={18} stroke={2.4} />
    </button>
  )
}

export function OptionChip({ active, onClick, children, height = 38 }: { active: boolean; onClick: () => void; children: ReactNode; height?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        ...btn, height, padding: '0 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
        border: `1px solid ${active ? T.navy : T.borderStrong}`, background: active ? T.navy : T.surface, color: active ? '#fff' : T.text,
      }}
    >
      {children}
    </button>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        ...btn, width: 52, height: 30, borderRadius: 15, padding: 3, boxSizing: 'border-box',
        background: checked ? T.primary : '#B8C3D6', justifyContent: checked ? 'flex-end' : 'flex-start', transition: 'background .15s',
      }}
    >
      <span style={{ width: 24, height: 24, borderRadius: 12, background: '#fff', boxShadow: '0 1px 3px rgba(10,30,68,0.3)' }} />
    </button>
  )
}

export function Stepper({
  value,
  onChange,
  max,
  size = 34,
  bg = T.input,
  border,
  disabled = false,
}: {
  value: number
  onChange: (v: number) => void
  max?: number | null
  size?: number
  bg?: string
  border?: string
  disabled?: boolean
}) {
  const grande = size > 40
  const tope = max != null && value >= max
  return (
    <div style={{ display: 'flex', alignItems: 'center', background: bg, borderRadius: grande ? 14 : 10, border, padding: border ? '0 4px' : 0 }}>
      <button
        type="button"
        disabled={disabled || value <= 1}
        onClick={() => onChange(Math.max(1, value - 1))}
        aria-label="Quitar uno"
        style={{ ...btn, width: size, height: size, color: T.text, opacity: disabled || value <= 1 ? 0.4 : 1 }}
      >
        <Icon name="minus" size={grande ? 18 : 15} stroke={2.4} />
      </button>
      <span aria-live="polite" style={{ minWidth: 22, textAlign: 'center', fontSize: grande ? 16 : 14, fontWeight: 800 }}>
        {value}
      </span>
      <button
        type="button"
        disabled={disabled || tope}
        onClick={() => onChange(value + 1)}
        aria-label="Agregar uno"
        style={{ ...btn, width: size, height: size, color: T.text, opacity: disabled || tope ? 0.4 : 1 }}
      >
        <Icon name="plus" size={grande ? 18 : 15} stroke={2.4} />
      </button>
    </div>
  )
}

/** Fondo decorativo para banners/novedades sin imagen. */
export function ArtPlaceholder({
  circles,
  icon,
  size = 420,
  iconSize = 150,
}: {
  circles: string[]
  icon: NombreIcono
  size?: number
  iconSize?: number
}) {
  const r = [size / 2 - 10, size / 3, size / 5]
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ position: 'absolute' }}>
        {circles.map((c, i) => (
          <circle key={i} cx={size / 2} cy={size / 2} r={r[i]} fill={c} />
        ))}
      </svg>
      <Icon name={icon} size={iconSize} stroke={0.9} color="#fff" style={{ position: 'relative' }} />
    </div>
  )
}

/** Círculos del fondo decorativo derivados del color del banner (aclarado). */
export function circulosDe(color: string): string[] {
  const hex = color.replace('#', '')
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex.slice(0, 6)
  const n = parseInt(full, 16)
  if (!Number.isFinite(n)) return ['#163676', '#1E4FD8', '#4F7BEA']
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  const mezcla = (t: number) =>
    '#' + [r, g, b].map((c) => Math.round(c + (255 - c) * t).toString(16).padStart(2, '0')).join('')
  return [mezcla(0.08), mezcla(0.2), T.gold]
}

/** Foto real del producto (o ícono si no tiene). */
export function Foto({
  src,
  alt,
  icon = 'gem',
  iconSize = 88,
  sizes = '320px',
  bg = T.primarySoft,
}: {
  src: string | null | undefined
  alt: string
  icon?: NombreIcono
  iconSize?: number
  sizes?: string
  bg?: string
}) {
  if (!src) {
    return (
      <span style={{ position: 'absolute', inset: 0, background: bg, color: T.iconBlue, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={iconSize} stroke={1} />
      </span>
    )
  }
  return <Image src={src} alt={alt} fill sizes={sizes} style={{ objectFit: 'cover' }} />
}

export function SectionHeader({ id, title, subtitle, action }: { id: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 id={id} style={h2}>
          {title}
        </h2>
        {subtitle && <span style={{ fontSize: 15, color: T.muted }}>{subtitle}</span>}
      </div>
      {action}
    </div>
  )
}

export function LinkAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ ...btn, height: 40, gap: 6, color: T.primary, fontSize: 14, fontWeight: 800 }}>
      {children} <Icon name="arrowRight" size={18} stroke={2.2} />
    </button>
  )
}

/** Modal base: fondo, Escape, bloqueo de scroll y foco dentro del diálogo. */
export function Modal({
  label,
  onClose,
  children,
  maxWidth = 880,
  align = 'center',
  z = 70,
}: {
  label: string
  onClose: () => void
  children: ReactNode
  maxWidth?: number
  align?: 'center' | 'right'
  z?: number
}) {
  const caja = useRef<HTMLDivElement>(null)
  const cerrar = useRef(onClose)
  useEffect(() => {
    cerrar.current = onClose
  }, [onClose])

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null
    caja.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar.current()
      if (e.key === 'Tab' && caja.current) {
        const focos = caja.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        if (focos.length === 0) return
        const primero = focos[0]
        const ultimo = focos[focos.length - 1]
        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault()
          ultimo.focus()
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault()
          primero.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      previo?.focus?.()
    }
  }, [])

  const drawer = align === 'right'
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: z, display: 'flex', alignItems: drawer ? 'stretch' : 'center',
        justifyContent: drawer ? 'flex-end' : 'center', padding: drawer ? 0 : 24, boxSizing: 'border-box',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        tabIndex={-1}
        style={{ ...btn, position: 'absolute', inset: 0, background: T.overlay, animation: 'cw-fade .2s ease-out' }}
      />
      <div
        ref={caja}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={
          drawer
            ? {
                position: 'relative', width: 440, maxWidth: '100%', height: '100%', background: T.surface, display: 'flex', flexDirection: 'column',
                boxShadow: '-20px 0 60px rgba(10,30,68,0.25)', animation: 'cw-slide .28s cubic-bezier(.2,.8,.2,1)', outline: 'none',
              }
            : {
                position: 'relative', width: '100%', maxWidth, maxHeight: 'calc(100vh - 48px)', overflow: 'auto', background: T.surface,
                borderRadius: 28, boxShadow: T.shadowModal, animation: 'cw-pop .25s cubic-bezier(.2,.8,.2,1)', outline: 'none',
              }
        }
      >
        {children}
      </div>
    </div>
  )
}

export function Toast({ text, error = false, onAction }: { text: string; error?: boolean; onAction?: () => void }) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed', left: '50%', bottom: 'calc(28px + env(safe-area-inset-bottom))', transform: 'translateX(-50%)', zIndex: 80,
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px 10px 14px', borderRadius: 16, background: T.navyDeep,
        color: '#fff', boxShadow: '0 18px 40px rgba(10,30,68,0.35)', width: 'max-content', maxWidth: 'calc(100% - 32px)',
        animation: 'cw-up .25s ease-out',
      }}
    >
      <span
        style={{
          flex: 'none', width: 28, height: 28, borderRadius: 14, background: error ? T.danger : T.live,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Icon name={error ? 'close' : 'check'} size={16} stroke={3} />
      </span>
      <span style={{ fontSize: 14, fontWeight: 700 }}>{text}</span>
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          style={{ ...btn, height: 38, padding: '0 14px', borderRadius: 11, background: '#fff', color: T.navyDeep, fontSize: 13, fontWeight: 800 }}
        >
          Ver carrito
        </button>
      )}
    </div>
  )
}
