'use client'

import { useEffect, useRef, useState } from 'react'
import type { BannerWeb, Cta } from '@/lib/catalogo-web/tipos'
import { Icon as IconoWeb } from '@/components/catalogo-web/icono'
import { circulosDe } from '@/components/catalogo-web/basicos'
import { Icon } from '../iconos'
import { T, btn, card, sectionTitle } from '../tokens'
import { useCatalogo } from '../store'
import { ProductCard, money } from '../ui/producto'

const ANUNCIO_MS = 4000
const BANNER_MS = 5000

/** Barra superior con los anuncios configurados (rota cada 4 s). */
export function BarraAnuncios() {
  const { config } = useCatalogo()
  const anuncios = config?.anuncios ?? []
  const [i, setI] = useState(0)
  const n = anuncios.length
  useEffect(() => {
    if (n < 2) return
    const t = setInterval(() => setI((v) => (v + 1) % n), ANUNCIO_MS)
    return () => clearInterval(t)
  }, [n])
  if (n === 0) return null
  return (
    <div
      aria-live="polite"
      style={{
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 34,
        padding: '6px 16px',
        background: T.navy,
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        textAlign: 'center',
      }}
    >
      <Icon name="star" size={13} color={T.skyText} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{anuncios[i % n]}</span>
    </div>
  )
}

function iconoDe(tipo: Cta['tipo']) {
  if (tipo === 'ofertas') return 'tag' as const
  if (tipo === 'categoria') return 'gem' as const
  return 'sparkle' as const
}

function TarjetaBanner({ banner, activo }: { banner: BannerWeb; activo: boolean }) {
  const app = useCatalogo()
  return (
    <div
      aria-hidden={!activo}
      style={{
        flex: 'none',
        width: '100%',
        scrollSnapAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 22,
        background: banner.colorFondo,
        color: '#fff',
        minHeight: 168,
        display: 'flex',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ position: 'absolute', inset: 0 }}>
        {banner.imagen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={banner.imagen}
            alt=""
            style={{ position: 'absolute', right: 0, top: 0, width: '55%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <svg width="260" height="260" viewBox="0 0 260 260" aria-hidden="true" style={{ position: 'absolute', right: -70, top: -50 }}>
            {circulosDe(banner.colorFondo).map((c, k) => (
              <circle key={k} cx="130" cy="130" r={[120, 80, 42][k]} fill={c} opacity={k === 2 ? 0.9 : 1} />
            ))}
          </svg>
        )}
        {banner.imagen && (
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, ${banner.colorFondo} 48%, transparent 85%)` }} />
        )}
      </div>
      <div style={{ position: 'relative', padding: 18, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: '72%' }}>
        {banner.etiqueta && (
          <span
            style={{
              alignSelf: 'flex-start',
              padding: '4px 9px',
              borderRadius: 999,
              background: banner.colorEtiqueta,
              color: T.navy,
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {banner.etiqueta}
          </span>
        )}
        <span style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.15 }}>{banner.titulo}</span>
        {banner.texto && <span style={{ fontSize: 12, lineHeight: 1.4, color: 'rgba(255,255,255,0.82)' }}>{banner.texto}</span>}
        {banner.cta.texto && (
          <button
            type="button"
            tabIndex={activo ? 0 : -1}
            onClick={() => app.runCta(banner.cta)}
            style={{
              ...btn,
              alignSelf: 'flex-start',
              marginTop: 4,
              height: 38,
              padding: '0 14px',
              gap: 6,
              borderRadius: 12,
              background: '#fff',
              color: T.navy,
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {banner.cta.texto}
            <Icon name="chevronRight" size={14} stroke={2.4} />
          </button>
        )}
      </div>
    </div>
  )
}

/** Carrusel de banners configurados: avanza cada 5 s, se puede deslizar, puntos abajo. */
export function CarruselBanners() {
  const { config } = useCatalogo()
  const banners = config?.banners ?? []
  const pista = useRef<HTMLDivElement>(null)
  const [i, setI] = useState(0)
  const [pausado, setPausado] = useState(false)
  const n = banners.length

  useEffect(() => {
    if (n < 2 || pausado) return
    const t = setInterval(() => {
      const el = pista.current
      if (!el) return
      const sig = (Math.round(el.scrollLeft / el.clientWidth) + 1) % n
      el.scrollTo({ left: sig * el.clientWidth, behavior: 'smooth' })
    }, BANNER_MS)
    return () => clearInterval(t)
  }, [n, pausado])

  if (n === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 'none' }} aria-roledescription="carrusel" aria-label="Promociones">
      <div
        ref={pista}
        className="cat-noscroll cat-snap"
        onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        onTouchStart={() => setPausado(true)}
        onTouchEnd={() => setPausado(false)}
        style={{ display: 'flex', overflowX: 'auto', gap: 0, borderRadius: 22 }}
      >
        {banners.map((b, k) => (
          <TarjetaBanner key={b.id} banner={b} activo={k === i} />
        ))}
      </div>
      {n > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
          {banners.map((b, k) => (
            <button
              key={b.id}
              type="button"
              aria-label={`Ir al banner ${k + 1}`}
              aria-current={k === i}
              onClick={() => pista.current?.scrollTo({ left: k * pista.current.clientWidth, behavior: 'smooth' })}
              style={{ ...btn, width: k === i ? 22 : 7, height: 7, borderRadius: 4, background: k === i ? T.primary : T.radioOff, transition: 'width .25s' }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Franja de beneficios configurados (desliza horizontal). */
export function Beneficios() {
  const { config } = useCatalogo()
  const lista = config?.beneficios ?? []
  if (lista.length === 0) return null
  return (
    <div className="cat-noscroll" style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '0 -20px', padding: '2px 20px', flex: 'none' }}>
      {lista.map((b) => (
        <div
          key={b.titulo}
          style={{ ...card, flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 16, minWidth: 200 }}
        >
          <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 12, background: T.primarySoft, color: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IconoWeb name={b.icono} size={18} stroke={1.9} />
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>{b.titulo}</span>
            <span style={{ fontSize: 11, color: T.muted, fontWeight: 500 }}>{b.texto}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

/** Promociones configuradas (las que van al lado del carrusel en computador), apiladas. */
export function Promociones() {
  const app = useCatalogo()
  const promos = app.config?.promos ?? []
  if (promos.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 'none' }}>
      {promos.slice(0, 2).map((p, k) => (
        <div
          key={`${p.titulo}-${k}`}
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 18,
            background: p.color_fondo,
            color: T.navy,
            padding: '16px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            minHeight: 92,
            boxSizing: 'border-box',
          }}
        >
          {p.imagen_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imagen_url} alt="" style={{ position: 'absolute', right: 0, top: 0, width: '40%', height: '100%', objectFit: 'cover', opacity: 0.9 }} />
          ) : (
            <IconoWeb name={p.icono} size={88} stroke={0.9} color={p.color_boton} style={{ position: 'absolute', right: -10, bottom: -14, opacity: 0.35 }} />
          )}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '62%' }}>
            {p.etiqueta && (
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: p.color_boton }}>{p.etiqueta}</span>
            )}
            <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.15 }}>{p.titulo}</span>
          </div>
          <button
            type="button"
            onClick={() => app.runCta({ texto: p.cta_texto, tipo: p.cta_tipo, valor: p.cta_valor })}
            style={{ ...btn, position: 'relative', flex: 'none', height: 36, padding: '0 12px', borderRadius: 10, background: p.color_boton, color: '#fff', fontSize: 12, fontWeight: 800 }}
          >
            {p.cta_texto}
          </button>
        </div>
      ))}
    </div>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')

function Contador({ fin }: { fin: string }) {
  const [seg, setSeg] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setSeg(Math.max(0, Math.floor((new Date(fin).getTime() - Date.now()) / 1000)))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [fin])
  if (seg == null) return null
  const d = Math.floor(seg / 86400)
  const h = Math.floor((seg % 86400) / 3600)
  const m = Math.floor((seg % 3600) / 60)
  const s = seg % 60
  const Caja = ({ v, u }: { v: number; u: string }) => (
    <span style={{ minWidth: 34, padding: '4px 0', borderRadius: 8, background: 'rgba(255,255,255,0.14)', textAlign: 'center', lineHeight: 1 }}>
      <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>{pad(v)}</span>
      <span style={{ display: 'block', fontSize: 8, fontWeight: 700, opacity: 0.75 }}>{u}</span>
    </span>
  )
  return (
    <span role="timer" aria-label={`Tiempo restante ${d ? `${d} días ` : ''}${h} horas ${m} minutos`} style={{ display: 'flex', gap: 4 }}>
      {d > 0 && <Caja v={d} u="DÍAS" />}
      <Caja v={h} u="HRS" />
      <Caja v={m} u="MIN" />
      <Caja v={s} u="SEG" />
    </span>
  )
}

/** Ofertas relámpago (piezas con precio anterior) con cuenta regresiva, si está activa. */
export function OfertasRelampago() {
  const app = useCatalogo()
  const oferta = app.config?.oferta
  const piezas = app.productos.filter((p) => p.precioAnterior != null && p.disponible)
  const [vencida, setVencida] = useState(false)
  useEffect(() => {
    if (!oferta?.fecha_fin) return
    const fin = new Date(oferta.fecha_fin).getTime()
    const revisar = () => setVencida(Number.isFinite(fin) && fin <= Date.now())
    revisar()
    const t = setInterval(revisar, 1000)
    return () => clearInterval(t)
  }, [oferta?.fecha_fin])
  if (!oferta?.activa || piezas.length === 0 || vencida) return null
  return (
    <section id="cat-ofertas" aria-label={oferta.titulo} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, borderRadius: 22, background: T.primaryDeep, color: '#fff', flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ ...sectionTitle, fontSize: 16 }}>{oferta.titulo}</span>
          {oferta.subtitulo && <span style={{ fontSize: 12, color: T.skyText }}>{oferta.subtitulo}</span>}
        </div>
        {oferta.fecha_fin && <Contador fin={oferta.fecha_fin} />}
      </div>
      <div className="cat-noscroll" style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '0 -14px', padding: '0 14px' }}>
        {piezas.map((p) => (
          <div key={p.id} style={{ flex: 'none', width: 150 }}>
            <ProductCard product={p} compact />
            <span style={{ display: 'block', marginTop: -6, paddingLeft: 10, fontSize: 11, color: T.skyText, textDecoration: 'line-through' }}>
              {money(p.precioAnterior ?? 0)}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
