'use client'

import { useEffect, useState } from 'react'
import { Icon as IconoWeb } from '@/components/catalogo-web/icono'
import { circulosDe } from '@/components/catalogo-web/basicos'
import { Icon } from '../iconos'
import { T, btn } from '../tokens'
import { useCatalogo } from '../store'

/** Misma clave que el catálogo web: "No volver a mostrar hoy" aplica a los dos. */
export const CLAVE_NOVEDADES_MUTE = 'cw-news-muted'
export const CLAVE_NOVEDADES_SESION = 'cw-news-seen'

/** Popup de novedades configuradas (hoja inferior), con navegación y "No volver a mostrar hoy". */
export function PopupNovedades() {
  const app = useCatalogo()
  const lista = app.config?.novedades ?? []
  const [i, setI] = useState(0)
  const [mute, setMute] = useState(false)
  const { closeNews } = app
  const n = lista.length
  const item = lista[Math.min(i, n - 1)]

  const cerrar = () => {
    if (mute) {
      try {
        localStorage.setItem(CLAVE_NOVEDADES_MUTE, new Date().toDateString())
      } catch {}
    }
    closeNews()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeNews()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeNews])

  if (!item) return null

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 45, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <button type="button" onClick={cerrar} aria-label="Cerrar novedades" style={{ ...btn, position: 'absolute', inset: 0, background: T.overlay, animation: 'cat-fade .2s ease-out' }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Novedades"
        style={{
          position: 'relative',
          background: T.surface,
          borderRadius: '28px 28px 0 0',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92%',
          animation: 'cat-up .25s cubic-bezier(.2,.8,.2,1)',
        }}
      >
        <div style={{ position: 'relative', height: 190, background: item.colorFondo, overflow: 'hidden', flex: 'none' }}>
          {item.imagen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imagen} alt={item.titulo} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="300" height="300" viewBox="0 0 300 300" aria-hidden="true" style={{ position: 'absolute' }}>
                {circulosDe(item.colorFondo).slice(0, 2).map((c, k) => (
                  <circle key={k} cx="150" cy="150" r={[140, 90][k]} fill={c} />
                ))}
              </svg>
              <IconoWeb name={item.cta.tipo === 'ofertas' ? 'tag' : 'sparkle'} size={96} stroke={0.9} color="#fff" style={{ position: 'relative' }} />
            </div>
          )}
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar"
            style={{ ...btn, position: 'absolute', top: 12, right: 12, width: 40, height: 40, borderRadius: 20, background: 'rgba(255,255,255,0.92)', color: T.text }}
          >
            <Icon name="close" size={18} stroke={2.4} />
          </button>
        </div>

        <div className="cat-noscroll" style={{ padding: '18px 20px calc(20px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.primary }}>
            Novedades · {i + 1} de {n}
          </span>
          {item.etiqueta && (
            <span style={{ alignSelf: 'flex-start', padding: '4px 9px', borderRadius: 8, background: T.primarySoft, color: T.chipText, fontSize: 11, fontWeight: 800 }}>
              {item.etiqueta}
            </span>
          )}
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>{item.titulo}</h2>
          {item.texto && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: T.muted, whiteSpace: 'pre-line' }}>{item.texto}</p>}
          {item.cta.texto && (
            <button
              type="button"
              onClick={() => {
                closeNews()
                app.runCta(item.cta)
              }}
              style={{ ...btn, height: 48, borderRadius: 14, background: T.primary, color: '#fff', fontSize: 15, fontWeight: 800, gap: 6 }}
            >
              {item.cta.texto}
              <Icon name="chevronRight" size={16} stroke={2.4} />
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 8, borderTop: `1px solid ${T.borderSoft}` }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: T.muted }}>
              <input type="checkbox" checked={mute} onChange={(e) => setMute(e.target.checked)} style={{ width: 18, height: 18, accentColor: T.primary }} />
              No volver a mostrar hoy
            </label>
            {n > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {lista.map((nv, k) => (
                  <button
                    key={nv.id}
                    type="button"
                    onClick={() => setI(k)}
                    aria-label={`Novedad ${k + 1}`}
                    aria-current={k === i}
                    style={{ ...btn, width: k === i ? 20 : 7, height: 7, borderRadius: 4, background: k === i ? T.primary : T.radioOff, transition: 'width .25s' }}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setI((i + 1) % n)}
                  aria-label="Siguiente novedad"
                  style={{ ...btn, marginLeft: 4, width: 36, height: 36, borderRadius: 18, background: T.stepperBg, color: T.text }}
                >
                  <Icon name="chevronRight" size={16} stroke={2.4} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
