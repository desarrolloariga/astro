'use client'

import Image from 'next/image'
import { useEffect, useRef, type ReactNode } from 'react'
import { Icon, T, btn } from './tokens'

export function Segmented<V extends string>({
  options,
  value,
  onChange,
  label,
  size = 34,
}: {
  options: { id: V; label: string }[]
  value: V
  onChange: (v: V) => void
  label: string
  size?: number
}) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', padding: 3, background: T.soft, borderRadius: 999 }}>
      {options.map((o) => {
        const on = value === o.id
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            style={{
              ...btn, flex: 1, height: size, padding: '0 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
              background: on ? '#fff' : 'transparent', color: on ? T.ink : T.muted, transition: 'background .15s', whiteSpace: 'nowrap',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function UnderlineTabs<V extends string>({
  tabs,
  value,
  onChange,
  label,
  gap = 32,
  height = 48,
  fontSize = 15,
}: {
  tabs: { id: V; label: string }[]
  value: V
  onChange: (v: V) => void
  label: string
  gap?: number
  height?: number
  fontSize?: number
}) {
  return (
    <div role="tablist" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap, borderBottom: `1px solid ${T.line}` }}>
      {tabs.map((t) => {
        const on = value === t.id
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            style={{
              ...btn, height, fontSize, fontWeight: 600, color: on ? T.ink : T.muted,
              borderBottom: `2px solid ${on ? T.ink : 'transparent'}`, marginBottom: -1, transition: 'color .15s',
            }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

export function RadioRow({ checked, onSelect, title, subtitle }: { checked: boolean; onSelect: () => void; title: string; subtitle: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      style={{ ...btn, justifyContent: 'flex-start', gap: 14, padding: '12px 0', textAlign: 'left', color: T.ink }}
    >
      <span
        style={{
          flex: 'none', width: 20, height: 20, borderRadius: 10, border: `2px solid ${checked ? T.blue : T.radioOff}`,
          boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: 5, background: checked ? T.blue : 'transparent' }} />
      </span>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 13, color: T.muted }}>{subtitle}</span>
      </span>
    </button>
  )
}

export function QtyStepper({ value, onChange, max }: { value: number; onChange: (v: number) => void; max: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: 52, borderRadius: 999, background: T.soft, padding: '0 4px' }}>
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        aria-label="Quitar uno"
        disabled={value <= 1}
        style={{ ...btn, width: 44, height: 44, borderRadius: 22, color: T.ink, opacity: value <= 1 ? 0.4 : 1 }}
      >
        <Icon name="minus" size={16} stroke={2.2} />
      </button>
      <span aria-live="polite" style={{ minWidth: 26, textAlign: 'center', fontSize: 16, fontWeight: 600 }}>
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label="Agregar uno"
        disabled={value >= max}
        style={{ ...btn, width: 44, height: 44, borderRadius: 22, color: T.ink, opacity: value >= max ? 0.4 : 1 }}
      >
        <Icon name="plus" size={16} stroke={2.2} />
      </button>
    </div>
  )
}

export function SummaryRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: color ?? T.muted }}>
      <span>{label}</span>
      <span style={{ color: color ?? T.ink }}>{value}</span>
    </div>
  )
}

/** Foto real del producto (next/image) o ícono suave si no tiene. */
export function ProductImage({
  src,
  alt,
  size,
  stroke = 0.9,
  radius = 22,
  height,
  bg,
  sizes = '480px',
  priority = false,
}: {
  src: string | null | undefined
  alt: string
  size: number
  stroke?: number
  radius?: number
  height?: number
  bg: string
  sizes?: string
  priority?: boolean
}) {
  return (
    <div
      style={{
        position: 'relative', width: '100%', height, aspectRatio: height ? undefined : '1 / 1', borderRadius: radius, background: bg,
        overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.iconBlue,
      }}
    >
      {src ? <Image src={src} alt={alt} fill sizes={sizes} priority={priority} style={{ objectFit: 'cover' }} /> : <Icon name="gem" size={size} stroke={stroke} />}
    </div>
  )
}

/** Escape para cerrar, bloqueo de scroll y foco dentro del diálogo. */
export function useModal(onClose: () => void) {
  const caja = useRef<HTMLDivElement | HTMLElement | null>(null)
  const cerrar = useRef(onClose)
  useEffect(() => {
    cerrar.current = onClose
  }, [onClose])
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null
    caja.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar.current()
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
  return caja
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Cerrar"
      style={{ ...btn, flex: 'none', width: 40, height: 40, borderRadius: 20, background: T.soft, color: T.ink }}
    >
      <Icon name="close" size={16} stroke={2.2} />
    </button>
  )
}

export function Fondo({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onClose}
      aria-label="Cerrar"
      style={{ ...btn, position: 'absolute', inset: 0, background: T.overlay, animation: 'pd-fade .2s' }}
    />
  )
}

export function Toast({ text, error = false, action }: { text: string; error?: boolean; action?: ReactNode }) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed', left: '50%', bottom: 'calc(28px + env(safe-area-inset-bottom))', transform: 'translateX(-50%)', zIndex: 80,
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderRadius: 999, background: T.ink, color: '#fff',
        boxShadow: '0 14px 34px rgba(20,33,61,0.25)', width: 'max-content', maxWidth: 'calc(100% - 32px)', fontSize: 14, fontWeight: 500,
        animation: 'pd-up .22s ease-out',
      }}
    >
      <Icon name={error ? 'close' : 'check'} size={16} stroke={2.6} color={error ? '#FCA5A5' : '#6EE7B7'} /> {text}
      {action}
    </div>
  )
}
