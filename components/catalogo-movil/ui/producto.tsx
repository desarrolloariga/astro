'use client'

import type { CSSProperties } from 'react'
import { miniaturaDe } from '@/lib/imagenes'
import { formatearPrecio } from '@/lib/formato'
import type { Producto } from '@/lib/catalogo-movil/tipos'
import { Icon } from '../iconos'
import { T, btn, card } from '../tokens'
import { useCatalogo } from '../store'

export const money = (n: number) => formatearPrecio(n)

/** Foto de la pieza (o el ícono de joya si no tiene) sobre el fondo suave del diseño. */
export function ProductThumb({
  src,
  alt = '',
  width = '100%',
  height,
  iconSize = 62,
  radius = 14,
  stroke = 1.3,
  onClick,
  label,
  square = false,
}: {
  src: string | null | undefined
  alt?: string
  width?: number | string
  height?: number | string
  iconSize?: number
  radius?: number
  stroke?: number
  onClick?: () => void
  label?: string
  /** Cuadrada según el ancho disponible (rejilla de 3 columnas). */
  square?: boolean
}) {
  const style: CSSProperties = {
    ...btn,
    width,
    height: square ? 'auto' : (height ?? width),
    aspectRatio: square ? '1 / 1' : undefined,
    borderRadius: radius,
    background: T.primarySoft,
    color: T.primary,
    flex: 'none',
    overflow: 'hidden',
  }
  const contenido = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={miniaturaDe(src)}
      alt={alt}
      loading="lazy"
      onError={(e) => {
        if (e.currentTarget.src !== src) e.currentTarget.src = src
      }}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  ) : (
    <Icon name="gem" size={iconSize} stroke={stroke} />
  )
  return onClick ? (
    <button type="button" onClick={onClick} aria-label={label ?? 'Ver producto'} style={style}>
      {contenido}
    </button>
  ) : (
    <span style={style}>{contenido}</span>
  )
}

export function HeartButton({
  active,
  onClick,
  size = 36,
  iconSize = 18,
  style,
}: {
  active: boolean
  onClick: () => void
  size?: number
  iconSize?: number
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? 'Quitar de favoritos' : 'Guardar en favoritos'}
      style={{ ...btn, width: size, height: size, borderRadius: size / 2, background: T.surface, ...style }}
    >
      <Icon name="heart" size={iconSize} color={active ? T.primary : T.text} fill={active ? T.primary : 'none'} />
    </button>
  )
}

/** "+" de la tarjeta. Una pieza única ya apartada se muestra como ✓ y lleva al carrito. */
export function AddButton({ product, size = 40, radius = 12 }: { product: Producto; size?: number; radius?: number }) {
  const app = useCatalogo()
  const linea = app.enCarrito(product.id)
  const yaUnica = product.modo === 'pieza_unica' && Boolean(linea)
  const out = !product.disponible
  if (yaUnica) {
    return (
      <button
        type="button"
        onClick={() => app.go('cart')}
        aria-label={`${product.nombre} ya está en tu carrito`}
        style={{ ...btn, flex: 'none', width: size, height: size, borderRadius: radius, background: T.primarySoft, color: T.primary }}
      >
        <Icon name="check" size={20} stroke={2.6} />
      </button>
    )
  }
  return (
    <button
      type="button"
      disabled={out || app.estado.ocupado}
      onClick={() => app.addToCart(product.id, 1)}
      aria-label={`Agregar ${product.nombre} al carrito`}
      style={{
        ...btn,
        flex: 'none',
        width: size,
        height: size,
        borderRadius: radius,
        background: out ? T.disabledBg : T.primary,
        color: out ? T.disabledFg : '#fff',
      }}
    >
      <Icon name="plus" size={20} stroke={2.4} />
    </button>
  )
}

export function MetaLine({ product, extra }: { product: Producto; extra?: string }) {
  const partes = [product.material, product.kilataje].filter(Boolean)
  const texto = partes.length ? partes.join(' · ') : (product.categoria ?? product.codigo)
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: T.muted }}>
      {texto}
      {extra ? ` · ${extra}` : ''}
    </span>
  )
}

function BadgeAgotado() {
  return (
    <span
      style={{
        position: 'absolute',
        top: 10,
        left: 10,
        padding: '4px 8px',
        borderRadius: 8,
        background: T.navy,
        color: '#fff',
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      Agotado
    </span>
  )
}

/** Tarjeta de la rejilla. `compact` = 3 columnas: foto cuadrada, textos más pequeños, sin material. */
export function ProductCard({ product, compact = false }: { product: Producto; compact?: boolean }) {
  const app = useCatalogo()
  const isFav = app.estado.favs.includes(product.id)
  return (
    <div
      style={{
        ...card,
        borderRadius: compact ? 16 : 20,
        padding: compact ? '6px 6px 8px' : '8px 8px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 6 : 10,
        minWidth: 0,
      }}
    >
      <div style={{ position: 'relative' }}>
        <ProductThumb
          src={product.imagenes[0]}
          alt={product.nombre}
          height={compact ? undefined : 128}
          square={compact}
          iconSize={compact ? 40 : 62}
          radius={compact ? 12 : 14}
          onClick={() => app.openDetail(product.id)}
          label={`Ver ${product.nombre}`}
        />
        <HeartButton
          active={isFav}
          onClick={() => app.toggleFav(product.id)}
          size={compact ? 28 : 36}
          iconSize={compact ? 14 : 18}
          style={{ position: 'absolute', top: compact ? 4 : 6, right: compact ? 4 : 6 }}
        />
        {product.nuevo && compact && product.disponible && (
          <span style={{ position: 'absolute', top: 6, left: 6, padding: '2px 6px', borderRadius: 6, background: T.primary, color: '#fff', fontSize: 9, fontWeight: 800 }}>
            Nuevo
          </span>
        )}
        {!product.disponible && <BadgeAgotado />}
      </div>
      <button
        type="button"
        onClick={() => app.openDetail(product.id)}
        style={{
          ...btn,
          justifyContent: 'flex-start',
          alignItems: 'flex-start',
          flexDirection: 'column',
          gap: 4,
          padding: '0 4px',
          textAlign: 'left',
          color: T.text,
        }}
      >
        <span
          style={{
            fontSize: compact ? 12 : 14,
            fontWeight: 700,
            lineHeight: 1.25,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minHeight: compact ? 30 : undefined,
          }}
        >
          {product.nombre}
        </span>
        {!compact && <MetaLine product={product} />}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, padding: compact ? '0 2px' : '0 4px' }}>
        <span
          style={{
            fontSize: compact ? (product.precio >= 10000 ? 11 : 12) : 16,
            fontWeight: 800,
            minWidth: 0,
            whiteSpace: 'nowrap',
            letterSpacing: compact ? '-0.01em' : undefined,
          }}
        >
          {money(product.precio)}
        </span>
        <AddButton product={product} size={compact ? 26 : 40} radius={compact ? 9 : 12} />
      </div>
    </div>
  )
}

export function ProductRow({ product }: { product: Producto }) {
  const app = useCatalogo()
  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 18 }}>
      <ProductThumb
        src={product.imagenes[0]}
        alt={product.nombre}
        width={72}
        iconSize={36}
        stroke={1.4}
        onClick={() => app.openDetail(product.id)}
        label={`Ver ${product.nombre}`}
      />
      <button
        type="button"
        onClick={() => app.openDetail(product.id)}
        style={{ ...btn, flex: 1, minWidth: 0, flexDirection: 'column', alignItems: 'flex-start', gap: 4, textAlign: 'left', color: T.text }}
      >
        <span style={{ fontSize: 15, fontWeight: 700 }}>{product.nombre}</span>
        <MetaLine product={product} extra={product.disponible ? 'Disponible' : 'Agotado'} />
        <span style={{ fontSize: 16, fontWeight: 800 }}>{money(product.precio)}</span>
      </button>
      <AddButton product={product} size={44} radius={14} />
    </div>
  )
}
