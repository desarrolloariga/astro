'use client'

import { useEffect, useRef, useState } from 'react'
import { formatearNumero } from '@/lib/formato'
import { Icon } from '../iconos'
import { T, btn, scrollY } from '../tokens'
import { useCatalogo } from '../store'
import { BackButton, CountBadge, EmptyState, Stepper } from '../ui/basicos'
import { HeartButton, ProductThumb, money } from '../ui/producto'

export function DetailScreen() {
  const app = useCatalogo()
  const p = app.producto(app.estado.seleccionado)
  const scrollRef = useRef<HTMLDivElement>(null)
  const galeriaRef = useRef<HTMLDivElement>(null)
  const [foto, setFoto] = useState(0)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    galeriaRef.current?.scrollTo({ left: 0 })
    setFoto(0)
  }, [p?.id])

  if (!p) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20 }}>
        <BackButton onClick={app.back} />
        <EmptyState icon="gem" title="Esta pieza ya no está disponible" text="Puede que alguien más la haya comprado." cta="Ver catálogo" onCta={() => app.tab('home')} />
      </div>
    )
  }

  const isFav = app.estado.favs.includes(p.id)
  const linea = app.enCarrito(p.id)
  const unicaEnCarrito = p.modo === 'pieza_unica' && Boolean(linea)
  const porCantidad = p.modo === 'por_cantidad'
  const maximo = porCantidad ? Math.max(1, p.stock ?? 1) : 1
  const qty = Math.min(app.estado.cantidad, maximo)
  const related = [
    ...app.productos.filter((x) => x.id !== p.id && x.categoria && x.categoria === p.categoria),
    ...app.productos.filter((x) => x.id !== p.id && x.categoria !== p.categoria),
  ].slice(0, 5)

  const fotos = p.imagenes.length ? p.imagenes : [null]
  const detalles = [
    { k: 'Material', v: p.material },
    { k: 'Kilataje', v: p.kilataje },
    { k: 'Peso', v: p.peso ? `${formatearNumero(p.peso)} g` : null },
    { k: 'Piedras', v: p.piedras },
    { k: 'Código', v: p.codigo },
  ].filter((d) => d.v)

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div ref={scrollRef} className="cat-noscroll" style={scrollY}>
        <div style={{ position: 'relative', height: 330, background: T.primarySoft, color: T.primary }}>
          <div
            ref={galeriaRef}
            className="cat-noscroll cat-snap"
            aria-label="Fotos de la pieza"
            onScroll={(e) => {
              const el = e.currentTarget
              setFoto(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
            }}
            style={{ display: 'flex', height: '100%', overflowX: 'auto' }}
          >
            {fotos.map((src, i) =>
              src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={src}
                  alt={i === 0 ? p.nombre : `${p.nombre}, foto ${i + 1}`}
                  style={{ flex: 'none', width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div key="sin-foto" style={{ flex: 'none', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="gem" size={150} stroke={1} />
                </div>
              ),
            )}
          </div>
          <div style={{ position: 'absolute', top: 16, left: 16, right: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <BackButton onClick={app.back} style={{ borderRadius: 22, background: T.surface }} />
            <span style={{ flex: 1 }} />
            <HeartButton active={isFav} onClick={() => app.toggleFav(p.id)} size={44} iconSize={20} />
            <button
              type="button"
              onClick={() => app.go('cart')}
              aria-label="Abrir carrito"
              style={{ ...btn, position: 'relative', width: 44, height: 44, borderRadius: 22, background: T.surface, color: T.text }}
            >
              <Icon name="bag" size={20} stroke={1.8} />
              {app.cartCount > 0 && (
                <CountBadge value={app.cartCount} ring={T.surface} style={{ top: -4, right: -4, minWidth: 20, height: 20 }} />
              )}
            </button>
          </div>
          {fotos.length > 1 && (
            <div aria-hidden="true" style={{ position: 'absolute', bottom: 44, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6 }}>
              {fotos.map((_, i) => (
                <span
                  key={i}
                  style={{ width: i === foto ? 20 : 6, height: 6, borderRadius: 3, background: i === foto ? T.primary : '#9DB6EA', transition: 'width .2s' }}
                />
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: -28,
            position: 'relative',
            background: T.surface,
            borderRadius: '28px 28px 0 0',
            padding: '24px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {p.categoria && (
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.primary }}>
                {p.categoria}
              </span>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.01em' }}>{p.nombre}</h1>
              <span style={{ fontSize: 22, fontWeight: 800, whiteSpace: 'nowrap' }}>{money(p.precio)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: T.muted }}>
              {porCantidad ? `${p.stock ?? 0} disponibles` : 'Pieza única'} ·
              <span style={{ color: p.disponible ? T.success : T.danger, fontWeight: 700 }}>
                {unicaEnCarrito ? 'Apartada para ti' : p.disponible ? 'Disponible' : 'Agotado'}
              </span>
            </div>
          </div>

          {p.descripcion && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: T.muted }}>{p.descripcion}</p>}

          {detalles.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>Detalles</span>
              <dl
                style={{
                  margin: 0,
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: '8px 16px',
                  padding: 14,
                  borderRadius: 16,
                  background: T.primaryTint,
                  fontSize: 13,
                }}
              >
                {detalles.map((d) => (
                  <div key={d.k} style={{ display: 'contents' }}>
                    <dt style={{ color: T.muted, fontWeight: 600 }}>{d.k}</dt>
                    <dd style={{ margin: 0, textAlign: 'right', fontWeight: 700 }}>{d.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {related.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 800 }}>También te puede gustar</span>
              <div className="cat-noscroll" style={{ display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -20px', padding: '0 20px 4px' }}>
                {related.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => app.openDetail(r.id)}
                    style={{
                      ...btn,
                      flex: 'none',
                      width: 132,
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      justifyContent: 'flex-start',
                      gap: 8,
                      color: T.text,
                      textAlign: 'left',
                    }}
                  >
                    <ProductThumb src={r.imagenes[0]} width={132} height={104} iconSize={46} radius={16} />
                    <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{r.nombre}</span>
                    <span style={{ fontSize: 13, fontWeight: 800 }}>{money(r.precio)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 'none', display: 'flex', gap: 12, padding: '12px 20px 24px', background: T.surface, borderTop: `1px solid ${T.borderSoft}` }}>
        {porCantidad && p.disponible && (
          <Stepper
            value={qty}
            onDec={() => app.setQty(Math.max(1, qty - 1))}
            onInc={() => app.setQty(Math.min(maximo, qty + 1))}
            maxed={qty >= maximo}
            size={44}
            bg={T.surface}
            radius={16}
            fontSize={16}
            border={`1px solid ${T.border}`}
          />
        )}
        {unicaEnCarrito ? (
          <button
            type="button"
            onClick={() => app.go('cart')}
            style={{
              ...btn,
              flex: 1,
              height: 54,
              gap: 8,
              borderRadius: 16,
              fontSize: 15,
              fontWeight: 800,
              background: T.primarySoft,
              color: T.primaryDeep,
            }}
          >
            <Icon name="check" size={20} stroke={2.4} />
            En tu carrito · Ver carrito
          </button>
        ) : (
          <button
            type="button"
            disabled={!p.disponible || app.estado.ocupado}
            onClick={() => app.addToCart(p.id, qty)}
            style={{
              ...btn,
              flex: 1,
              height: 54,
              gap: 8,
              borderRadius: 16,
              fontSize: 15,
              fontWeight: 800,
              background: p.disponible ? T.primary : T.disabledBg,
              color: p.disponible ? '#fff' : T.disabledFg,
              opacity: app.estado.ocupado ? 0.7 : 1,
            }}
          >
            <Icon name="bag" size={20} />
            {!p.disponible ? 'Agotado' : app.estado.ocupado ? 'Agregando…' : `Agregar · ${money(p.precio * qty)}`}
          </button>
        )}
      </div>
    </div>
  )
}
