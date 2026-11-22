'use client'

import Link from 'next/link'
import type { ProductoWeb } from '@/lib/catalogo-web/tipos'
import type { AppCatalogo } from './app-tipo'
import { Badge, Foto } from './basicos'
import { Icon } from './icono'
import { OFFER_CARD_W, T, btn, discount, quetzal, stockInfo } from './tokens'

/** Texto secundario de precio según el modo (vacío si el usuario no tiene precio embajador). */
export function LineaGanancia({ p, app, size = 12 }: { p: ProductoWeb; app: AppCatalogo; size?: number }) {
  const ganancia = app.gain(p)
  if (ganancia == null) return null
  const me = app.mode === 'mi'
  return (
    <span style={{ fontSize: size, fontWeight: 700, color: me ? T.muted : T.success }}>
      {me ? `Precio público ${quetzal(p.pub)}` : `Tu ganancia ${quetzal(ganancia)}`}
    </span>
  )
}

/**
 * Tarjeta de producto ASTRO — variante blanca (Propuesta 2.2 del manual de marca):
 * marca/categoría → nombre → descripción → foto 16:11 → precio y precio anterior → botón naranja "Añadir a carrito".
 * variant="carousel" = ancho fijo (ofertas relámpago).
 */
export function ProductCard({ p, app, variant = 'grid' }: { p: ProductoWeb; app: AppCatalogo; variant?: 'grid' | 'carousel' }) {
  const off = discount(p)
  const out = p.stock === 0
  const isFav = app.favs.includes(p.id)
  const st = stockInfo(p)
  const isCarousel = variant === 'carousel'
  const enCarrito = p.modo === 'pieza_unica' && app.lines.some((l) => l.producto_id === p.id)
  const detalle = [p.material, p.kilataje].filter(Boolean).join(' ')
  const descripcion = p.descripcion?.trim() || detalle || p.codigo

  return (
    <article
      className="cw-astro-card"
      style={{ width: isCarousel ? OFFER_CARD_W : undefined, flex: isCarousel ? 'none' : undefined, height: '100%' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{p.categoria}</span>
        <Link
          href={app.rutaFicha(p.id)}
          style={{
            fontSize: isCarousel ? 19 : 22, fontWeight: 900, lineHeight: 1.1, color: '#000', textDecoration: 'none',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}
        >
          {p.nombre}
        </Link>
        <span
          style={{
            fontSize: 13, lineHeight: 1.4, color: '#000', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}
        >
          {descripcion}
        </span>
      </div>

      <div style={{ position: 'relative', aspectRatio: '16 / 11', borderRadius: 12, overflow: 'hidden', background: '#111' }}>
        <Foto src={p.imagenes[0]} alt={p.nombre} categoria={p.categoria} sizes="(max-width: 640px) 90vw, 320px" />
        {/* La foto abre la ficha completa; "Vista rápida" queda como botón aparte. */}
        <Link href={app.rutaFicha(p.id)} aria-label={`Ver detalle de ${p.nombre}`} style={{ position: 'absolute', inset: 0 }} />
        <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6, pointerEvents: 'none', flexWrap: 'wrap' }}>
          {off > 0 && <Badge tone="gold">-{off}%</Badge>}
          {p.isNew && !isCarousel && <Badge>Nuevo</Badge>}
          {out && <Badge tone="gray">{p.proximamente ? 'Próximamente' : 'Agotado'}</Badge>}
        </div>
        <button
          type="button"
          onClick={() => app.toggleFav(p.id)}
          aria-pressed={isFav}
          aria-label={isFav ? 'Quitar de favoritos' : 'Guardar en favoritos'}
          style={{ ...btn, position: 'absolute', top: 8, right: 8, width: 34, height: 34, borderRadius: 17, background: '#fff' }}
        >
          <Icon name="heart" size={17} fill={isFav ? T.primary : 'none'} color="#000" />
        </button>
        <button
          type="button"
          onClick={() => app.openQuick(p.id)}
          style={{
            ...btn, position: 'absolute', left: 10, bottom: 10, height: 30, gap: 6, padding: '0 12px', borderRadius: 999,
            background: 'rgba(255,255,255,0.92)', color: '#000', fontSize: 11, fontWeight: 800,
          }}
        >
          <Icon name="eye" size={14} /> Vista rápida
        </button>
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 20, fontWeight: 900, lineHeight: 1 }}>{quetzal(app.unitPrice(p))}</span>
            {(app.mode !== 'mi' || p.emb == null) && p.was != null && (
              <span style={{ fontSize: 12, color: T.muted, textDecoration: 'line-through' }}>{quetzal(p.was)}</span>
            )}
          </div>
          <button
            type="button"
            className="cw-astro-btn"
            disabled={out || app.cartBusy}
            onClick={() => (enCarrito ? app.setOverlay({ type: 'cart' }) : app.addToCart(p.id, 1))}
          >
            {out ? (p.proximamente ? 'Próximamente' : 'Agotado') : enCarrito ? 'En tu carrito' : 'Añadir a carrito'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 16 }}>
          <LineaGanancia p={p} app={app} />
          {!isCarousel && <span style={{ fontSize: 11, fontWeight: 700, color: st.color, marginLeft: 'auto' }}>{st.text}</span>}
        </div>
      </div>
    </article>
  )
}

export function ProductGrid({ products, app, minCol = 270 }: { products: ProductoWeb[]; app: AppCatalogo; minCol?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(${minCol}px, 100%), 1fr))`, gap: 16 }}>
      {products.map((p) => (
        <ProductCard key={p.id} p={p} app={app} />
      ))}
    </div>
  )
}
