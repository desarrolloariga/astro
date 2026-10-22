'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BannerWeb, CtaTipo, NombreIcono, PromoLateral } from '@/lib/catalogo-web/tipos'
import type { AppCatalogo } from './app-tipo'
import { ArtPlaceholder, LinkAction, SectionHeader, circulosDe } from './basicos'
import { Icon } from './icono'
import { ProductCard, ProductGrid } from './producto'
import { HERO_INTERVAL_MS, OFFER_CARD_W, OFFER_GAP, T, btn, container, eyebrow, h2, pad, piezas } from './tokens'

export function iconoCta(tipo: CtaTipo): NombreIcono {
  if (tipo === 'ofertas') return 'tag'
  if (tipo === 'generar_link') return 'link'
  return 'gem'
}

function HeroCarousel({ app, banners }: { app: AppCatalogo; banners: BannerWeb[] }) {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const n = banners.length
  useEffect(() => {
    if (paused || n < 2) return
    const t = setInterval(() => setI((v) => (v + 1) % n), HERO_INTERVAL_MS)
    return () => clearInterval(t)
  }, [paused, n])

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carrusel"
      aria-label="Promociones"
      style={{ flex: '999 1 640px', minWidth: 0, position: 'relative', borderRadius: 28, overflow: 'hidden', background: T.navy }}
    >
      <div style={{ display: 'flex', transition: 'transform .6s cubic-bezier(.2,.8,.2,1)', transform: `translateX(-${i * 100}%)` }}>
        {banners.map((sl, k) => {
          const activo = k === i
          return (
            <div
              key={sl.id}
              aria-roledescription="diapositiva"
              aria-label={`${k + 1} de ${n}`}
              aria-hidden={!activo}
              style={{ flex: 'none', width: '100%', minHeight: 440, background: sl.colorFondo, color: '#fff', display: 'flex', flexWrap: 'wrap', alignItems: 'stretch' }}
            >
              <div
                className="cw-hero-copy"
                style={{ flex: '1 1 320px', padding: '48px 48px 72px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16, boxSizing: 'border-box' }}
              >
                {sl.etiqueta && (
                  <span
                    style={{
                      alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 999, background: sl.colorEtiqueta, color: T.navyDeep,
                      fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}
                  >
                    {sl.etiqueta}
                  </span>
                )}
                <h2 className="cw-hero-title" style={{ margin: 0, fontSize: 42, lineHeight: 1.08, fontWeight: 800, letterSpacing: '-0.02em', maxWidth: 440 }}>
                  {sl.titulo}
                </h2>
                {sl.texto && <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: '#C9D6F2', maxWidth: 400 }}>{sl.texto}</p>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
                  {sl.cta.texto && (
                    <button
                      type="button"
                      tabIndex={activo ? 0 : -1}
                      onClick={() => app.runCta(sl.cta)}
                      style={{ ...btn, height: 50, padding: '0 22px', gap: 8, borderRadius: 14, background: '#fff', color: T.navyDeep, fontSize: 15, fontWeight: 800 }}
                    >
                      {sl.cta.texto} <Icon name="arrowRight" size={18} stroke={2.4} />
                    </button>
                  )}
                  {sl.cta.tipo !== 'todo' && (
                    <button
                      type="button"
                      tabIndex={activo ? 0 : -1}
                      onClick={() => app.goCategory('all')}
                      style={{ ...btn, height: 50, padding: '0 20px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.45)', color: '#fff', fontSize: 15, fontWeight: 700 }}
                    >
                      Ver catálogo
                    </button>
                  )}
                </div>
              </div>
              <div style={{ flex: '1 1 300px', minHeight: 280, position: 'relative', overflow: 'hidden' }}>
                {sl.imagen ? (
                  <Image src={sl.imagen} alt={sl.titulo} fill sizes="(max-width: 900px) 100vw, 560px" style={{ objectFit: 'cover' }} priority={k === 0} />
                ) : (
                  <ArtPlaceholder circles={circulosDe(sl.colorFondo)} icon={iconoCta(sl.cta.tipo)} />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {n > 1 && (
        <div className="cw-hero-dots" style={{ position: 'absolute', left: 48, right: 24, bottom: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
          {banners.map((b, k) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setI(k)}
              aria-label={`Ir al banner ${k + 1}`}
              aria-current={k === i}
              style={{ ...btn, width: k === i ? 32 : 8, height: 8, borderRadius: 4, background: k === i ? '#fff' : 'rgba(255,255,255,0.45)', transition: 'width .3s' }}
            />
          ))}
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => setI((i + n - 1) % n)}
            aria-label="Banner anterior"
            style={{ ...btn, width: 44, height: 44, borderRadius: 22, background: 'rgba(255,255,255,0.16)', color: '#fff' }}
          >
            <Icon name="back" size={20} stroke={2.2} />
          </button>
          <button
            type="button"
            onClick={() => setI((i + 1) % n)}
            aria-label="Banner siguiente"
            style={{ ...btn, width: 44, height: 44, borderRadius: 22, background: '#fff', color: T.navyDeep }}
          >
            <Icon name="next" size={20} stroke={2.2} />
          </button>
        </div>
      )}
    </div>
  )
}

function SidePromo({ promo, app }: { promo: PromoLateral; app: AppCatalogo }) {
  return (
    <div
      style={{
        flex: 1, minHeight: 210, borderRadius: 24, background: promo.color_fondo, color: T.navyDeep, padding: 28, display: 'flex',
        flexDirection: 'column', justifyContent: 'space-between', gap: 12, position: 'relative', overflow: 'hidden', boxSizing: 'border-box',
      }}
    >
      {promo.imagen_url ? (
        <span style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '46%' }}>
          <Image src={promo.imagen_url} alt="" fill sizes="200px" style={{ objectFit: 'cover' }} />
          <span style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, ${promo.color_fondo} 0%, transparent 60%)` }} />
        </span>
      ) : (
        <Icon name={promo.icono} size={140} stroke={0.9} color={promo.color_boton} style={{ position: 'absolute', right: -14, bottom: -14, opacity: 0.35 }} />
      )}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {promo.etiqueta && (
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: promo.color_boton }}>{promo.etiqueta}</span>
        )}
        <span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.15, maxWidth: 230 }}>{promo.titulo}</span>
      </div>
      <button
        type="button"
        onClick={() => app.runCta({ texto: promo.cta_texto, tipo: promo.cta_tipo, valor: promo.cta_valor })}
        style={{
          ...btn, position: 'relative', alignSelf: 'flex-start', height: 44, padding: '0 18px', borderRadius: 12,
          background: promo.color_boton, color: '#fff', fontSize: 14, fontWeight: 800,
        }}
      >
        {promo.cta_texto}
      </button>
    </div>
  )
}

function CategoryGrid({ app }: { app: AppCatalogo }) {
  return (
    <section aria-labelledby="h-cats" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SectionHeader
        id="h-cats"
        title="Compra por categoría"
        subtitle="Piezas disponibles en tiempo real en toda la red."
        action={<LinkAction onClick={() => app.goCategory('all')}>Ver todo el catálogo</LinkAction>}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(180px, 100%), 1fr))', gap: 16 }}>
        {app.categorias.map((c) => (
          <button
            key={c.id}
            type="button"
            className="cw-tile cw-card"
            onClick={() => app.goCategory(c.id)}
            style={{ ...btn, display: 'block', position: 'relative', height: 240, borderRadius: 22, overflow: 'hidden', background: c.color ?? T.primarySoft, textAlign: 'left', color: '#fff' }}
          >
            {c.imagen ? (
              <span className="cw-tile-icon" style={{ position: 'absolute', inset: '0 0 64px 0' }}>
                <Image src={c.imagen} alt="" fill sizes="240px" style={{ objectFit: 'cover' }} />
              </span>
            ) : (
              <span style={{ position: 'absolute', top: 24, left: 0, right: 0, display: 'flex', justifyContent: 'center', color: T.iconBlue }}>
                <Icon name={c.icono} size={96} stroke={1} className="cw-tile-icon" />
              </span>
            )}
            <span
              style={{
                position: 'absolute', left: 0, right: 0, bottom: 0, padding: '16px 18px', background: T.navyDeep, display: 'flex',
                alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 17, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</span>
                <span style={{ ...eyebrow, color: '#AFC3EA' }}>{piezas(c.total)}</span>
              </span>
              <span style={{ flex: 'none', width: 32, height: 32, borderRadius: 16, background: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="arrowRight" size={16} stroke={2.4} />
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

function Countdown({ seconds }: { seconds: number }) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const Box = ({ v, unit, gold }: { v: number; unit: string; gold?: boolean }) => (
    <span
      style={{
        minWidth: 48, height: 48, borderRadius: 12, background: gold ? T.gold : '#fff', color: T.navyDeep, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, lineHeight: 1,
      }}
    >
      {pad(v)}
      <span style={{ fontSize: 9, fontWeight: 700, color: gold ? T.goldText : T.muted, marginTop: 2 }}>{unit}</span>
    </span>
  )
  return (
    <div role="timer" aria-label={`Tiempo restante ${d ? `${d} días ` : ''}${h} horas ${m} minutos`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {d > 0 && (
        <>
          <Box v={d} unit="DÍAS" />
          <span style={{ fontWeight: 800 }}>:</span>
        </>
      )}
      <Box v={h} unit="HRS" />
      <span style={{ fontWeight: 800 }}>:</span>
      <Box v={m} unit="MIN" />
      <span style={{ fontWeight: 800 }}>:</span>
      <Box v={s} unit="SEG" gold />
    </div>
  )
}

function restante(fin: string | null) {
  if (!fin) return 0
  const t = new Date(fin).getTime()
  return Number.isFinite(t) ? Math.max(0, Math.floor((t - Date.now()) / 1000)) : 0
}

function FlashOffers({ app }: { app: AppCatalogo }) {
  const { oferta } = app.config
  const offers = useMemo(() => app.productos.filter((p) => p.was != null && p.stock > 0), [app.productos])
  const [idx, setIdx] = useState(0)
  const [secs, setSecs] = useState<number | null>(null)
  const [porVista, setPorVista] = useState(3)
  const pista = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tick = () => setSecs(restante(oferta.fecha_fin))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [oferta.fecha_fin])

  useEffect(() => {
    const el = pista.current
    if (!el) return
    const medir = () => setPorVista(Math.max(1, Math.floor((el.clientWidth + OFFER_GAP) / (OFFER_CARD_W + OFFER_GAP))))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (offers.length === 0 || secs === 0) return null
  const maxIdx = Math.max(0, offers.length - porVista)
  const cur = Math.min(idx, maxIdx)

  return (
    <section aria-labelledby="h-flash" style={{ background: T.navy, borderRadius: 28, padding: 28, display: 'flex', flexDirection: 'column', gap: 20, color: '#fff' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 48, height: 48, borderRadius: 14, background: T.gold, color: T.navyDeep, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="bolt" size={24} fill="currentColor" />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h2 id="h-flash" style={{ ...h2, fontSize: 26 }}>
              {oferta.titulo}
            </h2>
            <span style={{ fontSize: 14, color: '#C9D6F2' }}>{oferta.subtitulo}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {secs != null && (
            <>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#C9D6F2' }}>Terminan en</span>
              <Countdown seconds={secs} />
            </>
          )}
          <button
            type="button"
            onClick={() => setIdx(Math.max(0, cur - 1))}
            aria-label="Ofertas anteriores"
            disabled={cur === 0}
            style={{ ...btn, marginLeft: 8, width: 44, height: 44, borderRadius: 22, border: '1px solid rgba(255,255,255,0.35)', color: '#fff', opacity: cur === 0 ? 0.5 : 1 }}
          >
            <Icon name="back" size={20} stroke={2.2} />
          </button>
          <button
            type="button"
            onClick={() => setIdx(Math.min(maxIdx, cur + 1))}
            aria-label="Ofertas siguientes"
            disabled={cur === maxIdx}
            style={{ ...btn, width: 44, height: 44, borderRadius: 22, background: '#fff', color: T.navyDeep, opacity: cur === maxIdx ? 0.5 : 1 }}
          >
            <Icon name="next" size={20} stroke={2.2} />
          </button>
        </div>
      </div>
      <div ref={pista} style={{ overflow: 'hidden', margin: '0 -4px', padding: 4 }}>
        <div
          style={{
            display: 'flex', gap: OFFER_GAP, transition: 'transform .45s cubic-bezier(.2,.8,.2,1)',
            transform: `translateX(-${cur * (OFFER_CARD_W + OFFER_GAP)}px)`,
          }}
        >
          {offers.map((p) => (
            <ProductCard key={p.id} p={p} app={app} variant="carousel" />
          ))}
        </div>
      </div>
    </section>
  )
}

type Pestana = 'new' | 'top' | 'offers'

function ProductTabs({ app }: { app: AppCatalogo }) {
  const [tab, setTab] = useState<Pestana>('new')
  const tabs: { id: Pestana; label: string }[] = [
    { id: 'new', label: 'Novedades' },
    { id: 'top', label: 'Más vendidos' },
    { id: 'offers', label: 'Ofertas' },
  ]
  const list = useMemo(() => {
    const recientes = [...app.productos].sort((a, b) => b.fecha - a.fecha)
    if (tab === 'new') {
      const nuevos = recientes.filter((p) => p.isNew)
      return (nuevos.length ? nuevos : recientes).slice(0, 8)
    }
    if (tab === 'offers') return recientes.filter((p) => p.was != null).slice(0, 8)
    return [...app.productos].sort((a, b) => b.vendidos - a.vendidos || b.fecha - a.fecha).slice(0, 8)
  }, [tab, app.productos])

  return (
    <section aria-labelledby="h-tabs" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SectionHeader
        id="h-tabs"
        title="Descubre el catálogo"
        action={
          <div role="tablist" aria-label="Listas de productos" style={{ display: 'flex', gap: 6, padding: 4, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14 }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                style={{
                  ...btn, height: 40, padding: '0 16px', borderRadius: 10, fontSize: 14, fontWeight: 800,
                  background: tab === t.id ? T.navy : 'transparent', color: tab === t.id ? '#fff' : T.textSoft,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      />
      <div role="tabpanel">
        {list.length > 0 ? (
          <ProductGrid products={list} app={app} />
        ) : (
          <div style={{ background: T.surface, border: `1px dashed ${T.borderBtn}`, borderRadius: 20, padding: '40px 24px', textAlign: 'center', fontSize: 15, color: T.muted }}>
            Por ahora no hay piezas en oferta.
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => app.goCategory('all')}
        style={{ ...btn, alignSelf: 'center', height: 50, padding: '0 28px', borderRadius: 14, border: `1px solid ${T.borderBtn}`, background: T.surface, color: T.text, fontSize: 15, fontWeight: 800 }}
      >
        Ver todas las piezas
      </button>
    </section>
  )
}

export function HomeView({ app }: { app: AppCatalogo }) {
  const { banners, promos, beneficios, banda } = app.config
  return (
    <main style={{ ...container, paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 40 }}>
      {(banners.length > 0 || promos.length > 0) && (
        <section aria-label="Promociones destacadas" style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
          {banners.length > 0 && <HeroCarousel app={app} banners={banners} />}
          {promos.length > 0 && (
            <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {promos.slice(0, 2).map((p, i) => (
                <SidePromo key={i} promo={p} app={app} />
              ))}
            </div>
          )}
        </section>
      )}

      {beneficios.length > 0 && (
        <section aria-label="Beneficios" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(230px, 100%), 1fr))', gap: 12 }}>
          {beneficios.map((b) => (
            <div key={b.titulo} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 18, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18 }}>
              <span
                style={{
                  flex: 'none', width: 48, height: 48, borderRadius: 14, background: T.primarySoft, color: T.primary,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Icon name={b.icono} size={24} stroke={1.8} />
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 15, fontWeight: 800 }}>{b.titulo}</span>
                <span style={{ fontSize: 13, color: T.muted, fontWeight: 500 }}>{b.texto}</span>
              </span>
            </div>
          ))}
        </section>
      )}

      {app.categorias.length > 0 && <CategoryGrid app={app} />}
      {app.config.oferta.activa && <FlashOffers app={app} />}
      {app.productos.length > 0 && <ProductTabs app={app} />}

      {app.puedeLink && banda.activa && (
        <section
          style={{
            borderRadius: 28, background: T.primary, color: '#fff', padding: 36, display: 'flex', flexWrap: 'wrap', alignItems: 'center',
            justifyContent: 'space-between', gap: 20, position: 'relative', overflow: 'hidden',
          }}
        >
          <svg width="320" height="320" viewBox="0 0 320 320" aria-hidden="true" style={{ position: 'absolute', right: -60, top: -100 }}>
            <circle cx="160" cy="160" r="150" fill="#2C5EE6" />
            <circle cx="160" cy="160" r="96" fill="#3D6DF0" />
          </svg>
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 620 }}>
            <h2 style={h2}>{banda.titulo}</h2>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: '#DCE6FA' }}>{banda.texto}</p>
          </div>
          <button
            type="button"
            onClick={() => app.openLink()}
            style={{ ...btn, position: 'relative', height: 54, padding: '0 26px', gap: 8, borderRadius: 16, background: '#fff', color: T.navyDeep, fontSize: 15, fontWeight: 800 }}
          >
            <Icon name="link" size={20} /> {banda.cta_texto}
          </button>
        </section>
      )}

      {app.productos.length === 0 && (
        <div style={{ background: T.surface, border: `1px dashed ${T.borderBtn}`, borderRadius: 20, padding: '48px 24px', textAlign: 'center' }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>Aún no hay piezas disponibles</span>
        </div>
      )}
    </main>
  )
}
