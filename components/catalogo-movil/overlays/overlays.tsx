'use client'

import { useEffect, useMemo, type ReactNode } from 'react'
import { filtrarProductos } from '@/lib/catalogo-movil/filtrar'
import { valoresUnicos } from '@/lib/catalogo-movil/datos'
import { FILTROS_INICIALES, ORDENES, type Filtros, type Pantalla } from '@/lib/catalogo-movil/tipos'
import { Icon, type NombreIcono } from '../iconos'
import { T, btn } from '../tokens'
import { useCatalogo } from '../store'
import { Chip, CountBadge } from '../ui/basicos'
import { money } from '../ui/producto'
import { plural } from '../pantallas/inicio'

export function MiniCart() {
  const app = useCatalogo()
  return (
    <button
      type="button"
      onClick={() => app.go('cart')}
      style={{
        ...btn,
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 92,
        zIndex: 10,
        height: 60,
        gap: 12,
        padding: '0 8px 0 12px',
        borderRadius: 18,
        background: T.navy,
        color: '#fff',
        boxShadow: T.shadow,
        textAlign: 'left',
        animation: 'cat-drop .2s ease-out',
      }}
    >
      <span
        style={{
          position: 'relative',
          width: 40,
          height: 40,
          borderRadius: 12,
          background: T.navySoft,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="bag" size={20} stroke={1.8} />
        <CountBadge
          value={app.cartCount}
          bg={T.sky}
          color={T.navy}
          ring={T.navy}
          style={{ top: -5, right: -5, minWidth: 20, height: 20, border: 'none' }}
        />
      </span>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: 14, fontWeight: 800 }}>{plural(app.cartCount, 'artículo', 'artículos')}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.skyText }}>Subtotal {money(app.subtotal)}</span>
      </span>
      <span
        style={{
          height: 44,
          padding: '0 14px',
          borderRadius: 13,
          background: T.primary,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 14,
          fontWeight: 800,
        }}
      >
        Ver carrito <Icon name="chevronRight" size={16} stroke={2.4} />
      </span>
    </button>
  )
}

const TABS: { id: Pantalla; label: string; icon: NombreIcono }[] = [
  { id: 'home', label: 'Inicio', icon: 'home' },
  { id: 'search', label: 'Buscar', icon: 'search' },
  { id: 'favs', label: 'Favoritos', icon: 'heart' },
  { id: 'cart', label: 'Carrito', icon: 'bag' },
]

export function TabBar() {
  const app = useCatalogo()
  return (
    <nav
      aria-label="Navegación principal"
      style={{
        flex: 'none',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        padding: '8px 12px calc(20px + env(safe-area-inset-bottom, 0px))',
        background: T.surface,
        borderTop: `1px solid ${T.borderSoft}`,
      }}
    >
      {TABS.map((t) => {
        const on = app.estado.screen === t.id
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => app.tab(t.id)}
            aria-current={on ? 'page' : undefined}
            style={{ ...btn, flexDirection: 'column', gap: 4, height: 54, color: on ? T.primary : T.muted, fontSize: 11, fontWeight: 700 }}
          >
            <span
              style={{
                position: 'relative',
                width: 56,
                height: 30,
                borderRadius: 15,
                background: on ? T.primarySoft : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background .15s',
              }}
            >
              <Icon name={t.icon} size={22} stroke={1.9} />
              {t.id === 'cart' && app.cartCount > 0 && (
                <CountBadge value={app.cartCount} ring={T.surface} style={{ top: -4, right: 6, minWidth: 18, height: 18, fontSize: 10 }} />
              )}
            </span>
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}

export function Toast() {
  const app = useCatalogo()
  const t = app.estado.toast
  if (!t) return null
  const error = t.tipo === 'error'
  return (
    <div
      role={error ? 'alert' : 'status'}
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        right: 16,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 8px 8px 12px',
        minHeight: 54,
        boxSizing: 'border-box',
        borderRadius: 16,
        background: error ? T.danger : T.navy,
        color: '#fff',
        boxShadow: T.shadow,
        animation: 'cat-drop .2s ease-out',
      }}
    >
      <span
        style={{
          flex: 'none',
          width: 28,
          height: 28,
          borderRadius: 14,
          background: error ? 'rgba(255,255,255,0.2)' : T.primary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={error ? 'close' : 'check'} size={16} stroke={3} />
      </span>
      <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{t.texto}</span>
      {!error && (
        <button
          type="button"
          onClick={() => app.go('cart')}
          style={{ ...btn, flex: 'none', height: 38, padding: '0 14px', borderRadius: 11, background: '#fff', color: T.navy, fontSize: 13, fontWeight: 800 }}
        >
          Ver carrito
        </button>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ fontSize: 14, fontWeight: 800 }}>{title}</span>
      {children}
    </div>
  )
}

const wrap = { display: 'flex', flexWrap: 'wrap', gap: 8 } as const

export function FilterSheet() {
  const app = useCatalogo()
  const d = app.estado.borrador
  const count = filtrarProductos(app.productos, d, app.estado.query, app.rangos).length
  const set = (patch: Partial<Filtros>) => app.setDraft({ ...d, ...patch })
  const categorias = useMemo(() => valoresUnicos(app.productos, 'categoria'), [app.productos])
  const materiales = useMemo(() => valoresUnicos(app.productos, 'material'), [app.productos])
  const kilatajes = useMemo(() => valoresUnicos(app.productos, 'kilataje'), [app.productos])
  const { closeSheet } = app

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSheet()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeSheet])

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <button
        type="button"
        onClick={closeSheet}
        aria-label="Cerrar filtros"
        style={{ ...btn, position: 'absolute', inset: 0, background: T.overlay, animation: 'cat-fade .2s ease-out' }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filtros"
        style={{
          position: 'relative',
          background: T.surface,
          borderRadius: '28px 28px 0 0',
          padding: '10px 20px calc(24px + env(safe-area-inset-bottom, 0px))',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          maxHeight: '90%',
          overflowY: 'auto',
          animation: 'cat-up .25s cubic-bezier(.2,.8,.2,1)',
        }}
      >
        <span aria-hidden="true" style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, background: T.radioOff }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: -6 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Filtros</h2>
          <button
            type="button"
            onClick={closeSheet}
            aria-label="Cerrar"
            style={{ ...btn, width: 44, height: 44, borderRadius: 22, background: T.stepperBg, color: T.text }}
          >
            <Icon name="close" size={18} stroke={2.4} />
          </button>
        </div>

        <Section title="Ordenar por">
          <div style={wrap}>
            {ORDENES.map((o) => (
              <Chip key={o.id} active={d.orden === o.id} onClick={() => set({ orden: o.id })}>
                {o.label}
              </Chip>
            ))}
          </div>
        </Section>
        {categorias.length > 0 && (
          <Section title="Categoría">
            <div style={wrap}>
              <Chip active={d.cat === 'all'} onClick={() => set({ cat: 'all' })}>
                Todos
              </Chip>
              {categorias.map((o) => (
                <Chip key={o.valor} active={d.cat === o.valor} onClick={() => set({ cat: o.valor })}>
                  {o.valor}
                </Chip>
              ))}
            </div>
          </Section>
        )}
        {app.rangos.length > 1 && (
          <Section title="Precio">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {app.rangos.map((o) => (
                <Chip key={o.id} active={d.precio === o.id} onClick={() => set({ precio: o.id })} height={44} radius={14} style={{ padding: '0 12px' }}>
                  {o.label}
                </Chip>
              ))}
            </div>
          </Section>
        )}
        {materiales.length > 1 && (
          <Section title="Material">
            <div style={wrap}>
              <Chip active={d.material === 'all'} onClick={() => set({ material: 'all' })}>
                Todos
              </Chip>
              {materiales.map((o) => (
                <Chip key={o.valor} active={d.material === o.valor} onClick={() => set({ material: o.valor })}>
                  {o.valor}
                </Chip>
              ))}
            </div>
          </Section>
        )}
        {kilatajes.length > 1 && (
          <Section title="Kilataje">
            <div style={wrap}>
              <Chip active={d.kilataje === 'all'} onClick={() => set({ kilataje: 'all' })}>
                Todos
              </Chip>
              {kilatajes.map((o) => (
                <Chip key={o.valor} active={d.kilataje === o.valor} onClick={() => set({ kilataje: o.valor })}>
                  {o.valor}
                </Chip>
              ))}
            </div>
          </Section>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          <button
            type="button"
            onClick={() => app.setDraft(FILTROS_INICIALES)}
            style={{
              ...btn,
              flex: 1,
              height: 54,
              borderRadius: 16,
              border: `1px solid ${T.border}`,
              background: T.surface,
              color: T.text,
              fontSize: 15,
              fontWeight: 800,
            }}
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={app.applySheet}
            style={{ ...btn, flex: 2, height: 54, borderRadius: 16, background: T.primary, color: '#fff', fontSize: 15, fontWeight: 800 }}
          >
            Ver {plural(count, 'resultado', 'resultados')}
          </button>
        </div>
      </div>
    </div>
  )
}
