'use client'

import type { CSSProperties, ReactNode } from 'react'
import { Icon, type NombreIcono } from '../iconos'
import { T, btn } from '../tokens'
import type { Chip as ChipFiltro } from '../store'

export function CountBadge({
  value,
  bg = T.primary,
  color = '#fff',
  ring = T.bg,
  style,
}: {
  value: number
  bg?: string
  color?: string
  ring?: string
  style?: CSSProperties
}) {
  return (
    <span
      style={{
        position: 'absolute',
        top: -6,
        right: -6,
        minWidth: 22,
        height: 22,
        padding: '0 5px',
        boxSizing: 'border-box',
        borderRadius: 11,
        background: bg,
        color,
        fontSize: 11,
        fontWeight: 800,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `2px solid ${ring}`,
        ...style,
      }}
    >
      {value}
    </span>
  )
}

export function SearchField({
  value,
  onChange,
  placeholder,
  focused = false,
  autoFocus = false,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  focused?: boolean
  autoFocus?: boolean
}) {
  return (
    <label
      style={{
        flex: 1,
        minWidth: 0,
        height: 50,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 8px 0 14px',
        background: T.surface,
        border: focused ? `2px solid ${T.primary}` : `1px solid ${T.border}`,
        borderRadius: 16,
        boxSizing: 'border-box',
        color: T.muted,
      }}
    >
      <Icon name="search" size={20} />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Buscar productos"
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontFamily: 'inherit',
          fontSize: 16,
          color: T.text,
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Borrar búsqueda"
          style={{ ...btn, width: 32, height: 32, borderRadius: 16, background: T.primarySoft, color: T.text }}
        >
          <Icon name="close" size={14} stroke={2.4} />
        </button>
      )}
    </label>
  )
}

export function FilterButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir filtros"
      style={{ ...btn, position: 'relative', flex: 'none', width: 50, height: 50, borderRadius: 16, background: T.primary, color: '#fff' }}
    >
      <Icon name="sliders" size={22} />
      {count > 0 && <CountBadge value={count} bg={T.navy} />}
    </button>
  )
}

export function Chip({
  active,
  onClick,
  children,
  height = 40,
  radius = 20,
  fontSize = 13,
  style,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  height?: number
  radius?: number
  fontSize?: number
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        ...btn,
        flex: 'none',
        gap: 6,
        height,
        padding: '0 14px',
        borderRadius: radius,
        fontSize,
        fontWeight: 700,
        border: `1px solid ${active ? T.primary : T.border}`,
        background: active ? T.primary : T.surface,
        color: active ? '#fff' : T.text,
        transition: 'background .15s, color .15s',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export function ActiveFilters({ chips, onClearAll }: { chips: ChipFiltro[]; onClearAll?: () => void }) {
  if (!chips.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.remove}
          aria-label={`Quitar filtro ${c.label}`}
          style={{
            ...btn,
            height: 36,
            gap: 6,
            padding: '0 10px 0 12px',
            borderRadius: 18,
            background: T.primarySoft,
            color: T.chipText,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {c.label}
          <Icon name="close" size={14} stroke={2.4} />
        </button>
      ))}
      {onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          style={{ ...btn, height: 36, padding: '0 6px', fontSize: 13, fontWeight: 700, textDecoration: 'underline', color: T.text }}
        >
          Limpiar todo
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  text,
  cta,
  onCta,
  padding = '32px 12px',
  big = false,
}: {
  icon?: NombreIcono
  title: string
  text: string
  cta?: string
  onCta?: () => void
  padding?: string
  big?: boolean
}) {
  const d = big ? 96 : 72
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, padding }}>
      {icon && (
        <div
          style={{
            width: d,
            height: d,
            borderRadius: d / 2,
            background: T.primarySoft,
            color: T.primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon} size={big ? 42 : 32} stroke={big ? 1.6 : 2} />
        </div>
      )}
      <span style={{ fontSize: big ? 19 : 17, fontWeight: 800 }}>{title}</span>
      <span style={{ fontSize: 14, color: T.muted, lineHeight: 1.5 }}>{text}</span>
      {cta && (
        <button
          type="button"
          onClick={onCta}
          style={{
            ...btn,
            marginTop: 6,
            height: big ? 48 : 44,
            padding: '0 20px',
            borderRadius: 14,
            background: T.primary,
            color: '#fff',
            fontSize: 14,
            fontWeight: 800,
          }}
        >
          {cta}
        </button>
      )}
    </div>
  )
}

export function BackButton({ onClick, label = 'Volver', style }: { onClick: () => void; label?: string; style?: CSSProperties }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{ ...btn, flex: 'none', width: 44, height: 44, borderRadius: 14, color: T.text, ...style }}
    >
      <Icon name="back" size={24} stroke={2.2} />
    </button>
  )
}

export function Stepper({
  value,
  onDec,
  onInc,
  size = 34,
  bg = T.stepperBg,
  radius = 12,
  fontSize = 14,
  border,
  disabled = false,
  maxed = false,
}: {
  value: number
  onDec: () => void
  onInc: () => void
  size?: number
  bg?: string
  radius?: number
  fontSize?: number
  border?: string
  disabled?: boolean
  /** Sin más unidades disponibles: deshabilita el "+". */
  maxed?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: bg,
        borderRadius: radius,
        border,
        padding: border ? '0 4px' : 0,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <button
        type="button"
        onClick={onDec}
        disabled={disabled || value <= 1}
        aria-label="Quitar uno"
        style={{ ...btn, width: size, height: size, color: value <= 1 ? T.disabledFg : T.text }}
      >
        <Icon name="minus" size={size > 40 ? 18 : 16} stroke={2.4} />
      </button>
      <span style={{ minWidth: 20, textAlign: 'center', fontSize, fontWeight: 800 }} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={onInc}
        disabled={disabled || maxed}
        aria-label="Agregar uno"
        style={{ ...btn, width: size, height: size, color: maxed ? T.disabledFg : T.text }}
      >
        <Icon name="plus" size={size > 40 ? 18 : 16} stroke={2.4} />
      </button>
    </div>
  )
}

export function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        fontSize: strong ? 18 : 14,
        fontWeight: strong ? 800 : 600,
        color: strong ? T.text : T.muted,
      }}
    >
      <span>{label}</span>
      <span style={{ color: T.text, whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  )
}
