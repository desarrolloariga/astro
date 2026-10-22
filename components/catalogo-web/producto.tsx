'use client'

import type { ProductoWeb } from '@/lib/catalogo-web/tipos'
import type { AppCatalogo } from './app-tipo'
import { Badge, Foto } from './basicos'
import { Icon } from './icono'
import { OFFER_CARD_W, T, btn, discount, eyebrow, quetzal, stockInfo } from './tokens'

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

/** Tarjeta de producto. variant="carousel" = ancho fijo (ofertas relámpago). */
export function ProductCard({ p, app, variant = 'grid' }: { p: ProductoWeb; app: AppCatalogo; variant?: 'grid' | 'carousel' }) {
  const off = discount(p)
  const out = p.stock === 0
  const isFav = app.favs.includes(p.id)
  const st = stockInfo(p)
  const isCarousel = variant === 'carousel'
  const enCarrito = p.modo === 'pieza_unica' && app.lines.some((l) => l.producto_id === p.id)
  const icono = app.categorias.find((c) => c.id === p.catId)?.icono ?? 'gem'

  return (
    <article
      className="cw-card"
      style={{
        background: T.surface, border: isCarousel ? 'none' : `1px solid ${T.border}`, borderRadius: 20, overflow: 'hidden',
        display: 'flex', flexDirection: 'column', minWidth: 0, flex: isCarousel ? 'none' : undefined,
        width: isCarousel ? OFFER_CARD_W : undefined, color: T.text,
      }}
    >
      <div
        style={{
          position: 'relative', aspectRatio: isCarousel ? undefined : '1 / 1', height: isCarousel ? 220 : undefined,
          background: T.primarySoft, overflow: 'hidden',
        }}
      >
        <Foto src={p.imagenes[0]} alt={p.nombre} icon={icono} iconSize={isCarousel ? 84 : 88} sizes="(max-width: 640px) 50vw, 320px" />
        <button
          type="button"
          onClick={() => app.openQuick(p.id)}
          aria-label={`Vista rápida de ${p.nombre}`}
          style={{ ...btn, position: 'absolute', inset: 0 }}
        />
        <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6, pointerEvents: 'none', flexWrap: 'wrap' }}>
          {p.isNew && !isCarousel && <Badge>Nuevo</Badge>}
          {off > 0 && <Badge tone="gold">-{off}%</Badge>}
          {out && <Badge tone="gray">{p.proximamente ? 'Próximamente' : 'Agotado'}</Badge>}
        </div>
        <button
          type="button"
          onClick={() => app.toggleFav(p.id)}
          aria-pressed={isFav}
          aria-label={isFav ? 'Quitar de favoritos' : 'Guardar en favoritos'}
          style={{ ...btn, position: 'absolute', top: 10, right: 10, width: 38, height: 38, borderRadius: 19, background: '#fff' }}
        >
          <Icon name="heart" size={18} fill={isFav ? T.heart : 'none'} color={T.text} />
        </button>
        <button
          type="button"
          onClick={() => app.openQuick(p.id)}
          style={{
            ...btn, position: 'absolute', left: 12, bottom: 12, height: 34, gap: 6, padding: '0 12px', borderRadius: 10,
            background: 'rgba(255,255,255,0.92)', color: T.text, fontSize: 12, fontWeight: 800,
          }}
        >
          <Icon name="eye" size={15} /> Vista rápida
        </button>
      </div>

      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <span style={eyebrow}>
          {p.categoria}
          {p.kilataje ? ` · ${p.material ?? ''} ${p.kilataje}`.replace('  ', ' ') : p.material ? ` · ${p.material}` : ''}
        </span>
        <button
          type="button"
          onClick={() => app.openQuick(p.id)}
          style={{ ...btn, justifyContent: 'flex-start', textAlign: 'left', fontSize: 15, fontWeight: 700, lineHeight: 1.3, color: T.text }}
        >
          {p.nombre}
        </button>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 20, fontWeight: 800 }}>{quetzal(app.unitPrice(p))}</span>
          {(app.mode !== 'mi' || p.emb == null) && p.was != null && (
            <span style={{ fontSize: 13, color: T.muted, textDecoration: 'line-through' }}>{quetzal(p.was)}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 18 }}>
          <LineaGanancia p={p} app={app} />
          {!isCarousel && <span style={{ fontSize: 12, fontWeight: 700, color: st.color, marginLeft: 'auto' }}>{st.text}</span>}
        </div>
        <button
          type="button"
          disabled={out || app.cartBusy}
          onClick={() => (enCarrito ? app.setOverlay({ type: 'cart' }) : app.addToCart(p.id, 1))}
          style={{
            ...btn, marginTop: 'auto', height: 44, gap: 8, borderRadius: 12, fontSize: 14, fontWeight: 800,
            background: out ? T.disabledBg : enCarrito ? T.primarySoft : T.navy, color: out ? T.disabledFg : enCarrito ? T.navy : '#fff',
          }}
        >
          <Icon name={enCarrito ? 'check' : 'cart'} size={18} />{' '}
          {out ? (p.proximamente ? 'Próximamente' : 'Sin existencias') : enCarrito ? 'En tu carrito' : 'Agregar al carrito'}
        </button>
      </div>
    </article>
  )
}

export function ProductGrid({ products, app, minCol = 240 }: { products: ProductoWeb[]; app: AppCatalogo; minCol?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(${minCol}px, 100%), 1fr))`, gap: 20 }}>
      {products.map((p) => (
        <ProductCard key={p.id} p={p} app={app} />
      ))}
    </div>
  )
}
