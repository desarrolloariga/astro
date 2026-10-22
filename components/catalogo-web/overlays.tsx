'use client'

import Image from 'next/image'
import { ImagenProducto } from '@/components/app/imagen-producto'
import Link from 'next/link'
import { useCallback, useState } from 'react'
import type { AppCatalogo } from './app-tipo'
import { ArtPlaceholder, Badge, Foto, Modal, RoundButton, Stepper, circulosDe } from './basicos'
import { Icon } from './icono'
import { iconoCta } from './inicio'
import { LineaGanancia } from './producto'
import { T, btn, discount, eyebrow, h2, piezas, quetzal, stockInfo } from './tokens'

export const CLAVE_NOVEDADES = 'cw-news-muted'

export function NewsModal({ app, startIndex = 0 }: { app: AppCatalogo; startIndex?: number }) {
  const lista = app.config.novedades
  const [i, setI] = useState(Math.min(startIndex, Math.max(0, lista.length - 1)))
  const [mute, setMute] = useState(false)
  const n = lista.length
  const item = lista[i]

  const close = useCallback(() => {
    if (mute) {
      try {
        localStorage.setItem(CLAVE_NOVEDADES, new Date().toDateString())
      } catch {}
    }
    app.closeOverlay()
  }, [mute, app])

  if (!item) return null

  return (
    <Modal label="Novedades" onClose={close} maxWidth={880}>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 340px', minHeight: 340, position: 'relative', overflow: 'hidden', background: item.colorFondo }}>
          {item.imagen ? (
            <Image src={item.imagen} alt={item.titulo} fill sizes="440px" style={{ objectFit: 'cover' }} />
          ) : (
            <ArtPlaceholder circles={circulosDe(item.colorFondo).slice(0, 2)} icon={iconoCta(item.cta.tipo)} size={360} iconSize={130} />
          )}
        </div>
        <div style={{ flex: '1 1 360px', padding: 32, display: 'flex', flexDirection: 'column', gap: 14, boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ ...eyebrow, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.primary }}>
              <Icon name="sparkle" size={16} /> Novedades · {i + 1} de {n}
            </span>
            <RoundButton icon="close" label="Cerrar" onClick={close} size={40} />
          </div>
          {item.etiqueta && (
            <span style={{ alignSelf: 'flex-start', padding: '5px 10px', borderRadius: 8, background: T.goldSoft, color: T.goldText, fontSize: 12, fontWeight: 800 }}>
              {item.etiqueta}
            </span>
          )}
          <h2 style={{ ...h2, lineHeight: 1.15 }}>{item.titulo}</h2>
          {item.texto && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: T.textSoft, whiteSpace: 'pre-line' }}>{item.texto}</p>}
          {item.cta.texto && (
            <button
              type="button"
              onClick={() => app.runCta(item.cta)}
              style={{ ...btn, alignSelf: 'flex-start', marginTop: 4, height: 50, padding: '0 22px', gap: 8, borderRadius: 14, background: T.primary, color: '#fff', fontSize: 15, fontWeight: 800 }}
            >
              {item.cta.texto} <Icon name="arrowRight" size={18} stroke={2.4} />
            </button>
          )}
          <div
            style={{
              marginTop: 'auto', paddingTop: 14, borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: T.muted, cursor: 'pointer' }}>
              <input type="checkbox" checked={mute} onChange={(e) => setMute(e.target.checked)} style={{ width: 18, height: 18, accentColor: T.primary }} />
              No volver a mostrar hoy
            </label>
            {n > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {lista.map((nv, k) => (
                  <button
                    key={nv.id}
                    type="button"
                    onClick={() => setI(k)}
                    aria-label={`Novedad ${k + 1}`}
                    aria-current={k === i}
                    style={{ ...btn, width: k === i ? 24 : 8, height: 8, borderRadius: 4, background: k === i ? T.primary : T.borderBtn, transition: 'width .3s' }}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setI((i + n - 1) % n)}
                  aria-label="Novedad anterior"
                  style={{ ...btn, marginLeft: 6, width: 40, height: 40, borderRadius: 20, border: `1px solid ${T.borderStrong}`, background: T.surface, color: T.text }}
                >
                  <Icon name="back" size={18} stroke={2.2} />
                </button>
                <button
                  type="button"
                  onClick={() => setI((i + 1) % n)}
                  aria-label="Novedad siguiente"
                  style={{ ...btn, width: 40, height: 40, borderRadius: 20, background: T.navy, color: '#fff' }}
                >
                  <Icon name="next" size={18} stroke={2.2} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

export function QuickViewModal({ app, productId }: { app: AppCatalogo; productId: number }) {
  const p = app.productos.find((x) => x.id === productId)
  const [img, setImg] = useState(0)
  const [qty, setQty] = useState(1)
  if (!p) return null
  const me = app.mode === 'mi'
  const off = discount(p)
  const out = p.stock === 0
  const st = stockInfo(p)
  const isFav = app.favs.includes(p.id)
  const views = p.imagenes.slice(0, 4)
  const maxQty = p.modo === 'pieza_unica' ? 1 : p.stock
  const enCarrito = p.modo === 'pieza_unica' && app.lines.some((l) => l.producto_id === p.id)
  const icono = app.categorias.find((c) => c.id === p.catId)?.icono ?? 'gem'
  const datos = [
    `Material: ${p.material || 'No aplica'}`,
    `Kilataje: ${p.kilataje || 'No aplica'}`,
    ...(p.peso ? [`Peso: ${p.peso} g`] : []),
    ...(p.piedras ? [`Piedras: ${p.piedras}`] : []),
    `Código: ${p.codigo}`,
  ]
  const shareBtn = {
    ...btn, flex: '1 1 160px', height: 46, gap: 8, borderRadius: 14, border: `1px solid ${T.borderStrong}`,
    background: T.surface, color: T.text, fontSize: 14, fontWeight: 700, textDecoration: 'none',
  }

  return (
    <Modal label={`Vista rápida: ${p.nombre}`} onClose={app.closeOverlay} maxWidth={940}>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 360px', padding: 20, display: 'flex', flexDirection: 'column', gap: 12, boxSizing: 'border-box' }}>
          <div style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 20, overflow: 'hidden', background: T.primarySoft }}>
            <Foto src={views[img]} alt={p.nombre} icon={icono} iconSize={170} sizes="(max-width: 900px) 100vw, 460px" calidad="completa" />
            <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', gap: 6 }}>
              {p.isNew && <Badge>Nuevo</Badge>}
              {off > 0 && <Badge tone="gold">-{off}%</Badge>}
            </div>
          </div>
          {views.length > 1 && (
            <div style={{ display: 'flex', gap: 10 }}>
              {views.map((src, k) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setImg(k)}
                  aria-label={`Imagen ${k + 1}`}
                  aria-pressed={k === img}
                  style={{ ...btn, position: 'relative', overflow: 'hidden', flex: 1, height: 76, borderRadius: 14, border: `2px solid ${k === img ? T.primary : 'transparent'}`, background: T.primarySoft }}
                >
                  <ImagenProducto src={src} alt="" sizes="100px" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: '1 1 380px', padding: '32px 32px 28px 12px', display: 'flex', flexDirection: 'column', gap: 14, boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ ...eyebrow, fontSize: 12, color: T.primary, paddingTop: 10 }}>{p.categoria}</span>
            <RoundButton icon="close" label="Cerrar" onClick={app.closeOverlay} size={40} />
          </div>
          <h2 style={{ ...h2, lineHeight: 1.15 }}>{p.nombre}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 16, borderRadius: 16, background: T.bg }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 30, fontWeight: 800 }}>{quetzal(app.unitPrice(p))}</span>
              {(!me || p.emb == null) && p.was != null && (
                <span style={{ fontSize: 15, color: T.muted, textDecoration: 'line-through' }}>{quetzal(p.was)}</span>
              )}
            </div>
            <LineaGanancia p={p} app={app} size={13} />
          </div>
          {p.descripcion && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: T.textSoft }}>{p.descripcion}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {datos.map((t) => (
              <span key={t} style={{ padding: '8px 12px', borderRadius: 10, background: T.input, fontSize: 13, fontWeight: 700 }}>
                {t}
              </span>
            ))}
            <span style={{ padding: '8px 12px', borderRadius: 10, background: T.input, fontSize: 13, fontWeight: 700, color: st.color }}>{st.text}</span>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
            {maxQty > 1 && <Stepper value={qty} onChange={setQty} max={maxQty} size={44} bg="transparent" border={`1px solid ${T.borderStrong}`} />}
            <button
              type="button"
              disabled={out || app.cartBusy}
              onClick={() => {
                if (enCarrito) app.setOverlay({ type: 'cart' })
                else {
                  app.addToCart(p.id, qty)
                  app.closeOverlay()
                }
              }}
              style={{
                ...btn, flex: '1 1 200px', height: 52, gap: 8, borderRadius: 14, fontSize: 15, fontWeight: 800,
                background: out ? T.disabledBg : T.navy, color: out ? T.disabledFg : '#fff',
              }}
            >
              <Icon name={enCarrito ? 'check' : 'cart'} size={20} />{' '}
              {out
                ? p.proximamente
                  ? 'Próximamente'
                  : 'Sin existencias'
                : enCarrito
                  ? 'Ya está en tu carrito'
                  : `Agregar · ${quetzal(app.unitPrice(p) * qty)}`}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => app.toggleFav(p.id)} aria-pressed={isFav} style={shareBtn}>
              <Icon name="heart" size={18} fill={isFav ? T.heart : 'none'} /> {isFav ? 'En favoritos' : 'Guardar'}
            </button>
            {app.puedeLink ? (
              <button type="button" onClick={() => app.openLink('sel', [p.id])} style={shareBtn}>
                <Icon name="link" size={18} /> Compartir con un cliente
              </button>
            ) : (
              <Link href={app.rutaFicha(p.id)} style={shareBtn}>
                <Icon name="eye" size={18} /> Ver ficha completa
              </Link>
            )}
          </div>
          {app.puedeLink && (
            <Link href={app.rutaFicha(p.id)} style={{ fontSize: 13, fontWeight: 700, color: T.primary, alignSelf: 'flex-start' }}>
              Ver ficha completa
            </Link>
          )}
        </div>
      </div>
    </Modal>
  )
}

function mensajeCarrito(app: AppCatalogo) {
  if (app.contexto === 'publico') return 'Tus piezas quedan reservadas por unos minutos mientras completas la compra.'
  if (app.mayorista) {
    const minimo = app.mayorista.minimo
    const falta = Math.max(0, minimo - app.cartTotal)
    return falta > 0
      ? `Precios mayoristas aplicados. Te faltan ${quetzal(falta)} para la compra mínima de ${quetzal(minimo)}.`
      : `Precios mayoristas aplicados (${app.mayorista.politica}).`
  }
  if (app.mode === 'mi') return app.conPrecioEmbajador ? 'Precios de embajador aplicados a tu compra.' : 'Compra para ti: el pedido queda a tu nombre.'
  return app.conPrecioEmbajador
    ? `Pedido para cliente: ganarías ${quetzal(app.cartGain)} con este pedido.`
    : 'Pedido para un cliente: se cobra el precio público.'
}

export function CartDrawer({ app }: { app: AppCatalogo }) {
  const me = app.mode === 'mi'
  const conGanancia = app.contexto === 'backoffice' && app.conPrecioEmbajador && !me
  return (
    <Modal label="Carrito" onClose={app.closeOverlay} align="right">
      <div style={{ padding: '22px 22px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 22, fontWeight: 800 }}>Tu carrito</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.muted }}>{piezas(app.cartCount)}</span>
        </div>
        <RoundButton icon="close" label="Cerrar" onClick={app.closeOverlay} size={42} />
      </div>
      <div
        style={{
          margin: '14px 22px 0', padding: '12px 14px', borderRadius: 14, background: conGanancia ? T.successBg : T.primarySoft,
          color: T.navyDeep, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        <Icon name="tag" size={18} />
        {mensajeCarrito(app)}
      </div>

      {app.cartCount > 0 ? (
        <>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {app.lines.map((l) => {
              const unit = l.p ? app.unitPrice(l.p) : l.precio
              const ganancia = l.p ? app.gain(l.p) : null
              return (
                <div key={l.producto_id} style={{ display: 'flex', gap: 12, padding: 10, borderRadius: 16, border: `1px solid ${T.border}` }}>
                  <span style={{ position: 'relative', flex: 'none', width: 84, height: 84, borderRadius: 12, overflow: 'hidden' }}>
                    <Foto src={l.imagen ?? l.p?.imagenes[0]} alt="" iconSize={40} sizes="84px" />
                  </span>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{l.nombre}</span>
                      <button
                        type="button"
                        disabled={app.cartBusy}
                        onClick={() => app.removeLine(l.producto_id)}
                        aria-label={`Eliminar ${l.nombre}`}
                        style={{ ...btn, flex: 'none', width: 32, height: 32, margin: '-4px -4px 0 0', color: T.muted }}
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: conGanancia ? T.success : T.muted }}>
                      {conGanancia && ganancia != null
                        ? `${quetzal(unit)} c/u · ganas ${quetzal(ganancia * l.cantidad)}`
                        : `${quetzal(unit)} c/u${me && l.p?.emb != null ? (app.mayorista ? ' · precio mayorista' : ' · precio embajador') : ''}`}
                    </span>
                    <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 16, fontWeight: 800 }}>{quetzal(unit * l.cantidad)}</span>
                      {l.modo === 'por_cantidad' ? (
                        <Stepper value={l.cantidad} onChange={(v) => app.setQty(l.producto_id, v)} disabled={app.cartBusy} />
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 700, color: T.muted }}>Pieza única</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ padding: '16px 22px 22px', borderTop: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600, color: T.muted }}>
              <span>Subtotal</span>
              <span style={{ color: T.text }}>{quetzal(app.cartTotal)}</span>
            </div>
            {conGanancia && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: T.success }}>
                <span>Tu ganancia estimada</span>
                <span>{quetzal(app.cartGain)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800 }}>
              <span>Total</span>
              <span>{quetzal(app.cartTotal)}</span>
            </div>
            <span style={{ fontSize: 12, color: T.muted }}>El envío se calcula al finalizar el pedido.</span>
            <button
              type="button"
              onClick={app.checkout}
              disabled={app.cartBusy}
              style={{ ...btn, marginTop: 4, height: 54, borderRadius: 16, background: T.primary, color: '#fff', fontSize: 16, fontWeight: 800 }}
            >
              Finalizar pedido
            </button>
            <button type="button" onClick={app.closeOverlay} style={{ ...btn, height: 44, borderRadius: 14, color: T.primary, fontSize: 14, fontWeight: 800 }}>
              Seguir comprando
            </button>
          </div>
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32, textAlign: 'center' }}>
          <span style={{ width: 88, height: 88, borderRadius: 44, background: T.primarySoft, color: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="cart" size={38} stroke={1.6} />
          </span>
          <span style={{ fontSize: 18, fontWeight: 800 }}>Tu carrito está vacío</span>
          <span style={{ fontSize: 14, color: T.muted }}>Agrega piezas desde el catálogo.</span>
          <button
            type="button"
            onClick={app.closeOverlay}
            style={{ ...btn, marginTop: 6, height: 46, padding: '0 20px', borderRadius: 14, background: T.primary, color: '#fff', fontSize: 14, fontWeight: 800 }}
          >
            Explorar catálogo
          </button>
        </div>
      )}
    </Modal>
  )
}
