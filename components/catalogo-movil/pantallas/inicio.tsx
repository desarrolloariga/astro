'use client'

import { useMemo } from 'react'
import { ORDENES } from '@/lib/catalogo-movil/tipos'
import { valoresUnicos } from '@/lib/catalogo-movil/datos'
import { Icon } from '../iconos'
import { T, btn, scrollY } from '../tokens'
import { useCatalogo } from '../store'
import { ActiveFilters, Chip, CountBadge, EmptyState, FilterButton, SearchField } from '../ui/basicos'
import { ProductCard } from '../ui/producto'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function HomeScreen() {
  const app = useCatalogo()
  const { query, filtros } = app.estado
  const categorias = useMemo(() => valoresUnicos(app.productos, 'categoria'), [app.productos])
  const showBanner = !query && filtros.cat === 'all' && app.chips.length === 0 && filtros.orden !== 'new'

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 20px 12px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Catálogo de {app.info.vendedor}
            </span>
            <h1
              style={{
                margin: 0,
                fontSize: 28,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {app.info.titulo}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => app.go('cart')}
            aria-label={`Abrir carrito, ${app.cartCount} artículos`}
            style={{
              ...btn,
              position: 'relative',
              flex: 'none',
              width: 48,
              height: 48,
              borderRadius: 16,
              border: `1px solid ${T.border}`,
              background: T.surface,
              color: T.text,
            }}
          >
            <Icon name="bag" size={22} stroke={1.8} />
            {app.cartCount > 0 && <CountBadge value={app.cartCount} />}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <SearchField value={query} onChange={app.setQuery} placeholder="Buscar productos…" />
          <FilterButton count={app.chips.length} onClick={app.openSheet} />
        </div>
        {categorias.length > 1 && (
          <div className="cat-noscroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -20px', padding: '0 20px' }}>
            <Chip active={filtros.cat === 'all'} onClick={() => app.patchFilters({ cat: 'all' })} height={42} radius={21} fontSize={14}>
              Todos
            </Chip>
            {categorias.map((c) => (
              <Chip
                key={c.valor}
                active={filtros.cat === c.valor}
                onClick={() => app.patchFilters({ cat: c.valor })}
                height={42}
                radius={21}
                fontSize={14}
              >
                {c.valor}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="cat-noscroll" style={{ ...scrollY, padding: '4px 20px 92px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ActiveFilters chips={app.chips} onClearAll={app.clearAll} />

        {showBanner && (
          <div
            style={{
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 22,
              background: T.primaryDeep,
              color: '#fff',
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              minHeight: 132,
              boxSizing: 'border-box',
              flex: 'none',
            }}
          >
            <svg width="220" height="220" viewBox="0 0 220 220" aria-hidden="true" style={{ position: 'absolute', right: -60, top: -50 }}>
              <circle cx="110" cy="110" r="100" fill="#1D4ED8" />
              <circle cx="110" cy="110" r="62" fill="#3B82F6" />
              <circle cx="110" cy="110" r="28" fill="#93C5FD" />
            </svg>
            <span
              style={{
                position: 'relative',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: T.skyText,
              }}
            >
              Novedades
            </span>
            <span style={{ position: 'relative', fontSize: 21, fontWeight: 800, lineHeight: 1.2, maxWidth: 210 }}>
              Lo más nuevo de la colección
            </span>
            <button
              type="button"
              onClick={() => app.patchFilters({ orden: 'new' })}
              style={{
                ...btn,
                position: 'relative',
                alignSelf: 'flex-start',
                marginTop: 4,
                height: 40,
                padding: '0 16px',
                borderRadius: 12,
                background: '#fff',
                color: T.primaryDeep,
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Ver colección
            </button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.muted }}>{plural(app.resultados.length, 'producto', 'productos')}</span>
          <button type="button" onClick={app.openSheet} style={{ ...btn, height: 36, gap: 4, fontSize: 13, fontWeight: 700, color: T.text }}>
            Ordenar: {ORDENES.find((s) => s.id === filtros.orden)?.label}
            <Icon name="chevronDown" size={16} stroke={2.2} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          {app.resultados.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>

        {app.resultados.length === 0 &&
          (app.productos.length === 0 ? (
            <EmptyState icon="gem" title="Aún no hay piezas" text="Este catálogo no tiene piezas disponibles en este momento. Escríbele a tu asesor." />
          ) : (
            <EmptyState
              icon="search"
              title="Sin resultados"
              text="Prueba con otra palabra o quita algunos filtros."
              cta="Limpiar búsqueda y filtros"
              onCta={app.clearAll}
            />
          ))}
      </div>
    </div>
  )
}

export { plural }
