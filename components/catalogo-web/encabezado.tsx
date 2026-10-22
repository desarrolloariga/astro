'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import type { ModoWeb } from '@/lib/catalogo-web/tipos'
import type { AppCatalogo } from './app-tipo'
import { CountBubble, Foto } from './basicos'
import { Icon } from './icono'
import { ANN_INTERVAL_MS, T, btn, container, eyebrow, matchesQuery, norm, quetzal } from './tokens'

export function AnnouncementBar({ anuncios }: { anuncios: string[] }) {
  const [i, setI] = useState(0)
  const n = anuncios.length
  useEffect(() => {
    if (n < 2) return
    const t = setInterval(() => setI((v) => (v + 1) % n), ANN_INTERVAL_MS)
    return () => clearInterval(t)
  }, [n])
  if (n === 0) return null
  const actual = anuncios[i % n]
  return (
    <div
      style={{
        background: T.navyDeep, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        minHeight: 40, padding: '0 16px', fontSize: 13, fontWeight: 600,
      }}
    >
      {n > 1 && (
        <button type="button" onClick={() => setI((i + n - 1) % n)} aria-label="Anuncio anterior" style={{ ...btn, width: 32, height: 32, color: '#AFC3EA' }}>
          <Icon name="back" size={16} stroke={2.2} />
        </button>
      )}
      <span aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'center' }}>
        <Icon name="sparkle" size={16} color={T.gold} /> {actual}
      </span>
      {n > 1 && (
        <button type="button" onClick={() => setI((i + 1) % n)} aria-label="Anuncio siguiente" style={{ ...btn, width: 32, height: 32, color: '#AFC3EA' }}>
          <Icon name="next" size={16} stroke={2.2} />
        </button>
      )}
    </div>
  )
}

function SearchBox({ app }: { app: AppCatalogo }) {
  const [open, setOpen] = useState(false)
  const blurT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nq = norm(app.query).trim()
  const base = nq ? app.productos.filter((p) => matchesQuery(p, app.query)) : app.productos.filter((p) => p.isNew)
  const list = (base.length || nq ? base : [...app.productos].sort((a, b) => b.fecha - a.fecha)).slice(0, nq ? 5 : 4)
  const showDropdown = open && app.view === 'home'

  return (
    <div style={{ flex: '1 1 280px', position: 'relative', minWidth: 0 }}>
      <label
        style={{
          height: 46, display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 0 14px', background: T.input,
          border: `1px solid ${open ? T.primary : T.border}`, borderRadius: 14, color: T.muted,
        }}
      >
        <Icon name="search" size={20} />
        <input
          type="search"
          value={app.query}
          placeholder="Buscar anillos, collares, aretes…"
          aria-label="Buscar en todo el catálogo"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="cw-suggest"
          onChange={(e) => {
            app.setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurT.current = setTimeout(() => setOpen(false), 150)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setOpen(false)
              app.goCategory(app.view === 'category' ? app.cat : 'all')
            }
            if (e.key === 'Escape') setOpen(false)
          }}
          style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 16, color: T.text }}
        />
        {app.query && (
          <button
            type="button"
            onClick={() => app.setQuery('')}
            aria-label="Borrar búsqueda"
            style={{ ...btn, width: 30, height: 30, borderRadius: 15, background: T.primarySoft, color: T.text }}
          >
            <Icon name="close" size={14} stroke={2.4} />
          </button>
        )}
      </label>

      {showDropdown && (
        <div
          id="cw-suggest"
          role="listbox"
          style={{
            position: 'absolute', top: 54, left: 0, right: 0, background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 16, boxShadow: T.shadowPop, padding: 8, display: 'flex', flexDirection: 'column', gap: 2, zIndex: 30,
            animation: 'cw-fade .15s',
          }}
        >
          <span style={{ ...eyebrow, padding: '8px 10px 4px' }}>{nq ? 'Piezas que coinciden' : 'Novedades'}</span>
          {list.map((p) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected="false"
              className="cw-suggest"
              onMouseDown={(e) => {
                e.preventDefault()
                if (blurT.current) clearTimeout(blurT.current)
                setOpen(false)
                app.openQuick(p.id)
              }}
              style={{ ...btn, justifyContent: 'flex-start', gap: 12, padding: '8px 10px', borderRadius: 12, background: T.surface, color: T.text, textAlign: 'left' }}
            >
              <span style={{ position: 'relative', width: 44, height: 44, borderRadius: 10, overflow: 'hidden', flex: 'none' }}>
                <Foto src={p.imagenes[0]} alt="" iconSize={24} sizes="44px" />
              </span>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{p.nombre}</span>
                <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>{p.categoria}</span>
              </span>
              <span style={{ fontSize: 14, fontWeight: 800 }}>{quetzal(app.unitPrice(p))}</span>
            </button>
          ))}
          {list.length === 0 && <span style={{ padding: 10, fontSize: 14, color: T.muted }}>No encontramos piezas con esa palabra.</span>}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              setOpen(false)
              app.goCategory('all')
            }}
            style={{ ...btn, marginTop: 4, height: 42, borderRadius: 12, background: T.primarySoft, color: T.primary, fontSize: 14, fontWeight: 800 }}
          >
            Ver todos los resultados
          </button>
        </div>
      )}
    </div>
  )
}

function ModeToggle({ mode, setMode }: { mode: ModoWeb; setMode: (m: ModoWeb) => void }) {
  const opciones = [
    { id: 'mi' as const, icon: 'user' as const, label: 'Comprar para mí' },
    { id: 'cliente' as const, icon: 'users' as const, label: 'Para un cliente' },
  ]
  return (
    <div role="radiogroup" aria-label="Modo de compra" style={{ display: 'flex', padding: 4, background: T.surface, border: `1px solid ${T.borderStrong}`, borderRadius: 999 }}>
      {opciones.map((o) => {
        const on = mode === o.id
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setMode(o.id)}
            style={{
              ...btn, height: 36, padding: '0 14px', gap: 6, borderRadius: 999, fontSize: 13, fontWeight: 800,
              background: on ? T.primary : 'transparent', color: on ? '#fff' : T.textSoft, transition: 'background .15s',
            }}
          >
            <Icon name={o.icon} size={16} /> {o.label}
          </button>
        )
      })}
    </div>
  )
}

function textoModo(app: AppCatalogo) {
  if (app.conPrecioEmbajador) {
    return app.mode === 'mi'
      ? 'Ves tu precio de embajador: aplica a lo que compras para ti.'
      : 'Ves el precio público y la ganancia que obtienes por cada pieza.'
  }
  return app.mode === 'mi'
    ? 'Compras para ti: el pedido queda a tu nombre.'
    : 'Compras para un cliente: el pedido queda a nombre de tu cliente.'
}

export function Header({ app }: { app: AppCatalogo }) {
  const navBtn = (active: boolean) => ({
    ...btn, height: 40, padding: '0 12px', gap: 6, borderRadius: 10, fontSize: 14, fontWeight: 700,
    background: active ? T.band : 'transparent', color: T.text,
  })
  const nNovedades = app.config.novedades.length
  return (
    <header style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, position: 'sticky', top: 0, zIndex: 20 }}>
      <div style={{ ...container, paddingBlock: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px 24px' }}>
        <button type="button" onClick={app.goHome} aria-label="Ir al inicio del catálogo" style={{ ...btn, gap: 10, color: T.text }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: T.navy, color: T.gold, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="gem" size={22} stroke={1.8} />
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
            <span style={{ fontSize: 17, fontWeight: 800 }}>{app.config.general.marca}</span>
            <span style={{ ...eyebrow, letterSpacing: '0.06em' }}>
              {app.vendedor ? `Catálogo de ${app.vendedor}` : app.config.general.subtitulo}
            </span>
          </span>
        </button>

        <nav aria-label="Secciones" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <button type="button" onClick={app.goHome} style={navBtn(app.view === 'home')} aria-current={app.view === 'home' ? 'page' : undefined}>
            Inicio
          </button>
          <button
            type="button"
            onClick={() => app.goCategory('all')}
            style={navBtn(app.view === 'category')}
            aria-current={app.view === 'category' ? 'page' : undefined}
          >
            Todo el catálogo
          </button>
          <button type="button" onClick={app.goOffers} style={navBtn(false)}>
            <Icon name="bolt" size={16} fill="#E3B341" /> Ofertas
          </button>
        </nav>

        <SearchBox app={app} />

        <div className="cw-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {nNovedades > 0 && (
            <button
              type="button"
              onClick={() => app.setOverlay({ type: 'news' })}
              aria-label={`Novedades, ${nNovedades} sin leer`}
              style={{ ...btn, position: 'relative', width: 46, height: 46, borderRadius: 14, border: `1px solid ${T.border}`, background: T.surface, color: T.text }}
            >
              <Icon name="bell" size={22} stroke={1.8} />
              <CountBubble value={nNovedades} bg={T.heart} color="#fff" style={{ top: -5, right: -5, minWidth: 20, height: 20 }} />
            </button>
          )}
          {app.puedeLink && (
            <button
              type="button"
              onClick={() => app.openLink()}
              style={{ ...btn, height: 46, padding: '0 16px', gap: 8, borderRadius: 14, background: T.navy, color: '#fff', fontSize: 14, fontWeight: 800 }}
            >
              <Icon name="link" size={18} /> Generar link
            </button>
          )}
          <button
            type="button"
            onClick={() => app.setOverlay({ type: 'cart' })}
            aria-label={`Abrir carrito, ${app.cartCount} piezas`}
            style={{ ...btn, position: 'relative', height: 46, padding: '0 14px', gap: 8, borderRadius: 14, background: T.primary, color: '#fff', fontSize: 14, fontWeight: 800 }}
          >
            <Icon name="cart" size={20} /> {quetzal(app.cartTotal)}
            {app.cartCount > 0 && <CountBubble value={app.cartCount} />}
          </button>
        </div>
      </div>

      <div style={{ background: T.band, borderTop: `1px solid ${T.border}` }}>
        <div style={{ ...container, paddingBlock: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 16px' }}>
          {app.contexto === 'backoffice' ? (
            <>
              <ModeToggle mode={app.mode} setMode={app.setMode} />
              <span style={{ fontSize: 13, fontWeight: 600, color: T.textSoft }}>{textoModo(app)}</span>
            </>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600, color: T.textSoft }}>
              Agrega piezas a tu carrito; se reservan por unos minutos mientras completas tu compra.
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: T.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: T.live }} /> Inventario en tiempo real · precios en quetzales
          </span>
        </div>
      </div>
    </header>
  )
}

export function Footer({ app }: { app: AppCatalogo }) {
  const { pie, general } = app.config
  const col = (title: string, items: { texto: string; onClick?: () => void }[]) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff' }}>{title}</span>
      {items.map((t) =>
        t.onClick ? (
          <button key={t.texto} type="button" onClick={t.onClick} style={{ ...btn, justifyContent: 'flex-start', fontSize: 14, color: '#C9D6F2' }}>
            {t.texto}
          </button>
        ) : (
          <span key={t.texto}>{t.texto}</span>
        ),
      )}
    </div>
  )
  const contacto = [pie.telefono, pie.correo, pie.direccion].filter(Boolean).map((texto) => ({ texto }))
  return (
    <footer style={{ marginTop: 56, background: T.navyDeep, color: '#C9D6F2' }}>
      <div style={{ ...container, paddingBlock: 40, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{general.marca}</span>
          <span style={{ fontSize: 14, lineHeight: 1.55 }}>{pie.descripcion}</span>
        </div>
        {col('Catálogo', [
          ...app.categorias.slice(0, 4).map((c) => ({ texto: c.nombre, onClick: () => app.goCategory(c.id) })),
          { texto: 'Ofertas', onClick: app.goOffers },
        ])}
        {pie.columnas.map((c) => (
          <Fragment key={c.titulo}>{col(c.titulo, c.enlaces.map((texto) => ({ texto })))}</Fragment>
        ))}
        {contacto.length > 0 && col('Contacto', contacto)}
      </div>
    </footer>
  )
}
