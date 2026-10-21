'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from '../iconos'
import { MINUTOS_RETENCION, T, btn, card, scrollY } from '../tokens'
import { useCatalogo } from '../store'
import { BackButton, EmptyState, Stepper, SummaryRow } from '../ui/basicos'
import { ProductThumb, money } from '../ui/producto'
import { plural } from './inicio'

function mmss(s: number) {
  const t = Math.max(0, Math.floor(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

/** Segundos que le quedan a la pieza que vence primero; al llegar a 0 se relee el carrito. */
function useApartado() {
  const app = useCatalogo()
  const { lineas, lineasEn } = app.estado
  const minimo = lineas.length ? Math.min(...lineas.map((l) => l.segundos)) : 0
  const [ahora, setAhora] = useState(() => Date.now())
  const releido = useRef(false)

  useEffect(() => {
    releido.current = false
    if (!lineas.length) return
    const t = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [lineas, lineasEn])

  const restante = minimo - (ahora - lineasEn) / 1000
  const { refreshCart } = app
  useEffect(() => {
    if (lineas.length && restante <= 0 && !releido.current) {
      releido.current = true
      void refreshCart()
    }
  }, [restante, lineas.length, refreshCart])

  return restante
}

export function CartScreen() {
  const app = useCatalogo()
  const { lineas, ocupado } = app.estado
  const restante = useApartado()
  const pct = Math.min(100, Math.max(0, Math.round((restante / (MINUTOS_RETENCION * 60)) * 100)))
  const total = app.subtotal + app.envio

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 20px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <BackButton onClick={app.back} style={{ marginLeft: -10 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>Mi carrito</h1>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.muted }}>{plural(app.cartCount, 'artículo', 'artículos')}</span>
        </div>
      </div>

      {app.cartCount === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 40px 80px' }}>
          <EmptyState
            big
            icon="bag"
            title="Tu carrito está vacío"
            text="Explora el catálogo y agrega los productos que te gusten."
            cta="Explorar catálogo"
            onCta={() => app.tab('home')}
            padding="0"
          />
        </div>
      ) : (
        <>
          <div className="cat-noscroll" style={{ ...scrollY, padding: '4px 20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ ...card, borderRadius: 18, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {restante > 0
                  ? `Tus piezas están apartadas por ${mmss(restante)} — completa tu pedido antes de que se liberen`
                  : 'El apartado venció — actualizando tu carrito…'}
              </span>
              <div
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Tiempo restante del apartado"
                style={{ height: 8, borderRadius: 4, background: T.primarySoft, overflow: 'hidden' }}
              >
                <div style={{ height: 8, borderRadius: 4, width: `${pct}%`, background: T.primary, transition: 'width .3s' }} />
              </div>
            </div>

            {lineas.map((l) => (
              <div key={l.producto_id} style={{ ...card, display: 'flex', gap: 12, padding: 10, borderRadius: 20 }}>
                <ProductThumb
                  src={l.imagen}
                  alt={l.nombre}
                  width={88}
                  iconSize={42}
                  onClick={() => app.openDetail(l.producto_id)}
                  label={`Ver ${l.nombre}`}
                />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25, paddingTop: 2 }}>{l.nombre}</span>
                    <button
                      type="button"
                      onClick={() => app.removeLine(l.producto_id)}
                      disabled={ocupado}
                      aria-label={`Eliminar ${l.nombre}`}
                      style={{ ...btn, flex: 'none', width: 40, height: 40, margin: '-8px -8px 0 0', borderRadius: 10, color: T.muted }}
                    >
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.muted }}>
                    {l.modo === 'pieza_unica' ? 'Pieza única' : `Código ${l.codigo}`}
                  </span>
                  <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 15, fontWeight: 800 }}>{money(l.precio * l.cantidad)}</span>
                    {l.modo === 'por_cantidad' && (
                      <Stepper
                        value={l.cantidad}
                        onDec={() => app.changeQty(l.producto_id, -1)}
                        onInc={() => app.changeQty(l.producto_id, 1)}
                        disabled={ocupado}
                        maxed={l.stock != null && l.stock <= 0}
                        size={40}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => app.tab('home')}
              style={{ ...btn, alignSelf: 'flex-start', height: 44, gap: 6, color: T.primary, fontSize: 14, fontWeight: 800 }}
            >
              <Icon name="plus" size={18} stroke={2.2} /> Seguir comprando
            </button>

            <div style={{ ...card, borderRadius: 20, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SummaryRow label="Subtotal" value={money(app.subtotal)} />
              <SummaryRow label="Envío" value={app.envio === 0 ? 'Gratis' : money(app.envio)} />
              {app.faltaEnvioGratis != null && app.faltaEnvioGratis > 0 && (
                <span style={{ fontSize: 12, fontWeight: 600, color: T.primary }}>
                  Agrega {money(app.faltaEnvioGratis)} más y tu envío es gratis
                </span>
              )}
              <div style={{ height: 1, background: T.borderSoft }} />
              <SummaryRow label="Total" value={money(total)} strong />
            </div>
          </div>

          <div style={{ flex: 'none', padding: '12px 20px', background: T.bg }}>
            <button
              type="button"
              onClick={() => app.go('checkout')}
              style={{
                ...btn,
                width: '100%',
                height: 56,
                justifyContent: 'space-between',
                padding: '0 20px',
                borderRadius: 18,
                background: T.primary,
                color: '#fff',
                fontSize: 16,
                fontWeight: 800,
              }}
            >
              <span>Ir a pagar</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {money(total)}
                <Icon name="chevronRight" size={18} stroke={2.4} />
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
