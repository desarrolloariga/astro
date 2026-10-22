'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AVATAR_COLORS, Icon, T, btn, initials, srOnly } from './tokens'

export function Pills<V extends string>({
  options,
  value,
  onChange,
  label,
  bg = '#EEF1F6',
  height = 36,
}: {
  options: { id: V; label: string }[]
  value: V
  onChange: (v: V) => void
  label: string
  bg?: string
  height?: number
}) {
  return (
    <div role="tablist" aria-label={label} style={{ display: 'flex', padding: 4, background: bg, borderRadius: 999, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const on = value === o.id
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            style={{
              ...btn, height, padding: '0 16px', borderRadius: 999, fontSize: 13, fontWeight: 700,
              background: on ? '#fff' : 'transparent', color: on ? T.ink : T.muted, boxShadow: on ? '0 1px 3px rgba(20,33,61,0.08)' : 'none',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Bar({ pct, color, height = 10, bg = T.track }: { pct: number; color: string; height?: number; bg?: string }) {
  return (
    <div style={{ height, borderRadius: height / 2, background: bg, overflow: 'hidden' }}>
      <div className="rk-bar" style={{ height, width: `${Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0))}%`, background: color, borderRadius: height / 2 }} />
    </div>
  )
}

/** Nombre visible u oculto. Si `name` no viene (respuesta anónima de la base), se desenfoca una máscara. */
export function Person({ name, mask, isMe, weight = 600, size = 15 }: { name?: string; mask: string; isMe?: boolean; weight?: number; size?: number }) {
  if (isMe) return <span style={{ fontSize: size, fontWeight: 800 }}>Tú</span>
  if (name) return <span style={{ fontSize: size, fontWeight: weight, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
  return (
    <span style={{ position: 'relative' }}>
      <span aria-hidden="true" style={{ fontSize: size, fontWeight: weight, filter: 'blur(6px)', userSelect: 'none', whiteSpace: 'nowrap' }}>
        {mask}
      </span>
      <span style={srOnly}>Nombre oculto</span>
    </span>
  )
}

export function Avatar({
  name,
  mask,
  colorIdx,
  size = 40,
  border,
  fontSize = 13,
}: {
  name?: string
  mask: string
  colorIdx: number
  size?: number
  border?: string
  fontSize?: number
}) {
  const hidden = !name
  return (
    <span
      style={{
        flex: 'none', width: size, height: size, borderRadius: '50%', background: AVATAR_COLORS[colorIdx % AVATAR_COLORS.length],
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize, fontWeight: 800, overflow: 'hidden',
        border, boxSizing: 'border-box',
      }}
    >
      <span aria-hidden="true" style={{ filter: hidden ? 'blur(6px)' : 'none' }}>
        {initials(name ?? mask)}
      </span>
    </span>
  )
}

export function Modal({ label, onClose, children, maxWidth = 520 }: { label: string; onClose: () => void; children: ReactNode; maxWidth?: number }) {
  const cerrar = useRef(onClose)
  useEffect(() => {
    cerrar.current = onClose
  }, [onClose])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar.current()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [])
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box' }}>
      <button type="button" tabIndex={-1} onClick={onClose} aria-label="Cerrar" style={{ ...btn, position: 'absolute', inset: 0, background: T.overlay, animation: 'rk-fade .2s' }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={{
          position: 'relative', width: '100%', maxWidth, maxHeight: 'calc(100vh - 48px)', overflow: 'auto', background: '#fff', borderRadius: 28,
          padding: 30, boxSizing: 'border-box', boxShadow: '0 24px 60px rgba(20,33,61,0.22)', animation: 'rk-pop .22s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  )
}

export function CloseBtn({ onClick, style }: { onClick: () => void; style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Cerrar"
      style={{ ...btn, flex: 'none', width: 40, height: 40, borderRadius: 20, background: T.soft, color: T.ink, ...style }}
    >
      <Icon name="close" size={16} stroke={2.2} />
    </button>
  )
}

/** Cuenta animada 0 → value (respeta prefers-reduced-motion). */
export function useCountUp(value: number, ms = 900) {
  const [v, setV] = useState(0)
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setV(value)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      setV(value * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return v
}
