'use client'

import { useMemo, type ReactNode } from 'react'
import type { NombreIcono } from '@/lib/catalogo-web/tipos'
import { FILTROS_VACIOS, type AppCatalogo } from './app-tipo'
import { OptionChip, Switch } from './basicos'
import { Icon } from './icono'
import { ProductGrid } from './producto'
import { PAGE_SIZE, SORTS, T, btn, container, discount, eyebrow, matchesQuery, piezas, quetzal, type Sort } from './tokens'

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ ...eyebrow, letterSpacing: '0.1em' }}>{title}</span>
      {children}
    </div>
  )
}

function FiltersSidebar({ app }: { app: AppCatalogo }) {
  const { filters, setFilters, cat, setCat } = app
  const set = (patch: Partial<typeof filters>) => setFilters({ ...filters, ...patch })
  const max = filters.maxPrice ?? app.precioMax
  const paso = app.precioMax - app.precioMin > 2000 ? 50 : 10

  return (
    <aside
      aria-label="Filtros"
      className="cw-sidebar"
      style={{
        flex: '1 1 260px', maxWidth: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, padding: 20,
        display: 'flex', flexDirection: 'column', gap: 22, boxSizing: 'border-box', position: 'sticky', top: 160,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 17, fontWeight: 800 }}>Filtros</span>
        <button type="button" onClick={app.clearFilters} style={{ ...btn, height: 32, color: T.primary, fontSize: 13, fontWeight: 800 }}>
          Limpiar
        </button>
      </div>

      <Group title="Categoría">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[{ id: 'all', nombre: 'Todas', total: app.productos.length }, ...app.categorias].map((c) => {
            const on = cat === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                aria-pressed={on}
                style={{
                  ...btn, height: 40, justifyContent: 'space-between', padding: '0 12px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                  background: on ? T.navy : 'transparent', color: on ? '#fff' : T.text, textAlign: 'left', gap: 8,
                }}
              >
                <span>{c.nombre}</span>
                <span style={{ fontSize: 12, opacity: 0.75 }}>{c.total}</span>
              </button>
            )
          })}
        </div>
      </Group>

      {app.materiales.length > 0 && (
        <Group title="Material">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['all', ...app.materiales].map((m) => (
              <OptionChip key={m} active={filters.mat === m} onClick={() => set({ mat: m })}>
                {m === 'all' ? 'Todos' : m}
              </OptionChip>
            ))}
          </div>
        </Group>
      )}

      {app.kilatajes.length > 0 && (
        <Group title="Kilataje">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['all', ...app.kilatajes].map((k) => (
              <OptionChip key={k} active={filters.kil === k} onClick={() => set({ kil: k })}>
                {k === 'all' ? 'Todos' : k}
              </OptionChip>
            ))}
          </div>
        </Group>
      )}

      {app.precioMax > app.precioMin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <label htmlFor="cw-maxp" style={{ ...eyebrow, letterSpacing: '0.1em' }}>
              Precio máximo
            </label>
            <span style={{ fontSize: 15, fontWeight: 800 }}>{quetzal(max)}</span>
          </div>
          <input
            id="cw-maxp"
            type="range"
            min={app.precioMin}
            max={app.precioMax}
            step={paso}
            value={max}
            onChange={(e) => {
              const v = Number(e.target.value)
              set({ maxPrice: v >= app.precioMax ? null : v })
            }}
            style={{ width: '100%', accentColor: T.primary }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: T.muted }}>
            <span>{quetzal(app.precioMin)}</span>
            <span>{quetzal(app.precioMax)}</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>Solo disponibles</span>
          <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>Ocultar agotados</span>
        </span>
        <Switch checked={filters.onlyStock} onChange={(v) => set({ onlyStock: v })} label="Solo disponibles" />
      </div>

      {app.contexto === 'backoffice' && app.conPrecioEmbajador && !app.mayorista && app.mode === 'mi' && (
        <div style={{ borderRadius: 16, background: T.goldSoft, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: T.navyDeep }}>¿Buscas algo para un cliente?</span>
          <span style={{ fontSize: 13, color: '#4A3A10', lineHeight: 1.45 }}>
            Cambia a “Para un cliente” y verás el precio público y tu ganancia por pieza.
          </span>
          <button
            type="button"
            onClick={() => app.setMode('cliente')}
            style={{ ...btn, alignSelf: 'flex-start', height: 36, padding: '0 12px', borderRadius: 10, background: T.navyDeep, color: '#fff', fontSize: 13, fontWeight: 800 }}
          >
            Cambiar modo
          </button>
        </div>
      )}
    </aside>
  )
}

export function CategoryView({ app }: { app: AppCatalogo }) {
  const { cat, filters, sort, setSort, cols, setCols, visible, setVisible, query, setQuery } = app
  const catInfo = app.categorias.find((c) => c.id === cat)
  const titulo = catInfo?.nombre ?? 'Todo el catálogo'
  const icono: NombreIcono = catInfo?.icono ?? 'sparkle'
  const total = cat === 'all' ? app.productos.length : (catInfo?.total ?? 0)

  const filtered = useMemo(() => {
    const list = app.productos.filter(
      (p) =>
        matchesQuery(p, query) &&
        (cat === 'all' || p.catId === cat) &&
        (filters.mat === 'all' || p.material === filters.mat) &&
        (filters.kil === 'all' || p.kilataje === filters.kil) &&
        (filters.maxPrice == null || app.unitPrice(p) <= filters.maxPrice) &&
        (!filters.onlyStock || p.stock > 0),
    )
    const by: Record<Sort, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
      asc: (a, b) => a.pub - b.pub,
      desc: (a, b) => b.pub - a.pub,
      off: (a, b) => discount(b) - discount(a) || b.fecha - a.fecha,
      new: (a, b) => b.fecha - a.fecha,
    }
    return list.sort(by[sort] ?? by.new)
    // app.unitPrice depende del modo; se incluye mode para recalcular.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.productos, cat, filters, sort, query, app.mode])

  const shown = filtered.slice(0, visible)

  const chips: { k: string; label: string; remove: () => void }[] = []
  if (filters.mat !== 'all') chips.push({ k: 'mat', label: `Material: ${filters.mat}`, remove: () => app.setFilters({ ...filters, mat: 'all' }) })
  if (filters.kil !== 'all') chips.push({ k: 'kil', label: `Kilataje: ${filters.kil}`, remove: () => app.setFilters({ ...filters, kil: 'all' }) })
  if (filters.maxPrice != null)
    chips.push({ k: 'max', label: `Hasta ${quetzal(filters.maxPrice)}`, remove: () => app.setFilters({ ...filters, maxPrice: null }) })
  if (filters.onlyStock) chips.push({ k: 'stock', label: 'Solo disponibles', remove: () => app.setFilters({ ...filters, onlyStock: false }) })
  if (query.trim()) chips.push({ k: 'q', label: `Búsqueda: “${query}”`, remove: () => setQuery('') })

  const colBtn = (n: 3 | 4, icon: NombreIcono) => (
    <button
      type="button"
      onClick={() => setCols(n)}
      aria-label={`${n} columnas`}
      aria-pressed={cols === n}
      style={{
        ...btn, width: 42, height: 42, borderRadius: 12, border: `1px solid ${T.borderStrong}`,
        background: cols === n ? T.navy : T.surface, color: cols === n ? '#fff' : T.text,
      }}
    >
      <Icon name={icon} size={18} />
    </button>
  )

  return (
    <main style={{ ...container, paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <nav aria-label="Ruta" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, flexWrap: 'wrap' }}>
        <button type="button" onClick={app.goHome} style={{ ...btn, height: 36, gap: 6, color: T.muted, fontSize: 13, fontWeight: 700 }}>
          <Icon name="arrowLeft" size={16} stroke={2.2} /> Inicio
        </button>
        <span style={{ color: T.faint }}>/</span>
        <button type="button" onClick={() => app.setCat('all')} style={{ ...btn, height: 36, color: T.muted, fontSize: 13, fontWeight: 700 }}>
          Catálogo
        </button>
        {catInfo && (
          <>
            <span style={{ color: T.faint }}>/</span>
            <span aria-current="page">{catInfo.nombre}</span>
          </>
        )}
      </nav>

      <div
        style={{
          borderRadius: 24, background: T.navy, color: '#fff', padding: '28px 32px', display: 'flex', flexWrap: 'wrap', alignItems: 'center',
          justifyContent: 'space-between', gap: 20, position: 'relative', overflow: 'hidden',
        }}
      >
        <Icon name={icono} size={260} stroke={0.7} color="#25468A" style={{ position: 'absolute', right: 40, top: -40 }} />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em' }}>{titulo}</h1>
          <span style={{ fontSize: 15, color: '#C9D6F2' }}>{piezas(total)} · disponibles en tiempo real en toda la red</span>
        </div>
        {app.puedeLink && (
          <button
            type="button"
            onClick={() => app.openLink(cat === 'all' ? 'all' : 'cat', cat)}
            style={{ ...btn, position: 'relative', height: 46, padding: '0 18px', gap: 8, borderRadius: 14, background: '#fff', color: T.navyDeep, fontSize: 14, fontWeight: 800 }}
          >
            <Icon name="link" size={18} /> {cat === 'all' ? 'Compartir el catálogo' : 'Compartir esta categoría'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <FiltersSidebar app={app} />

        <div style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 16, padding: '10px 12px 10px 16px',
            }}
          >
            <label style={{ flex: '1 1 220px', height: 42, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', background: T.input, borderRadius: 12, color: T.muted }}>
              <Icon name="search" size={18} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar dentro de los resultados…"
                aria-label="Buscar piezas"
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 16, color: T.text }}
              />
            </label>
            <span aria-live="polite" style={{ fontSize: 13, fontWeight: 700, color: T.muted }}>
              {filtered.length} de {piezas(total)}
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: T.muted }}>
              Ordenar
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                style={{
                  height: 42, padding: '0 12px', borderRadius: 12, border: `1px solid ${T.borderStrong}`, background: T.surface,
                  fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: T.text,
                }}
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <div role="group" aria-label="Densidad de la cuadrícula" style={{ display: 'flex', gap: 4 }}>
              {colBtn(3, 'grid4')}
              {colBtn(4, 'grid9')}
            </div>
          </div>

          {chips.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {chips.map((c) => (
                <button
                  key={c.k}
                  type="button"
                  onClick={c.remove}
                  aria-label={`Quitar filtro ${c.label}`}
                  style={{ ...btn, height: 34, gap: 6, padding: '0 10px 0 12px', borderRadius: 17, background: T.primarySoft, color: T.navy, fontSize: 13, fontWeight: 700 }}
                >
                  {c.label} <Icon name="close" size={14} stroke={2.4} />
                </button>
              ))}
            </div>
          )}

          <ProductGrid products={shown} app={app} minCol={cols === 3 ? 260 : 200} />

          {filtered.length === 0 && (
            <div
              style={{
                background: T.surface, border: `1px dashed ${T.borderBtn}`, borderRadius: 20, padding: '48px 24px', display: 'flex',
                flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center',
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 800 }}>No hay piezas con estos filtros</span>
              <span style={{ fontSize: 14, color: T.muted }}>Prueba subir el precio máximo o quitar algún filtro.</span>
              <button
                type="button"
                onClick={() => {
                  app.setFilters(FILTROS_VACIOS)
                  setQuery('')
                }}
                style={{ ...btn, marginTop: 6, height: 44, padding: '0 18px', borderRadius: 12, background: T.primary, color: '#fff', fontSize: 14, fontWeight: 800 }}
              >
                Limpiar filtros
              </button>
            </div>
          )}

          {filtered.length > visible && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.muted }}>
                Viendo {shown.length} de {piezas(filtered.length)}
              </span>
              <div style={{ width: 220, height: 6, borderRadius: 3, background: T.border, overflow: 'hidden' }}>
                <div style={{ height: 6, width: `${Math.round((shown.length / filtered.length) * 100)}%`, background: T.primary, borderRadius: 3 }} />
              </div>
              <button
                type="button"
                onClick={() => setVisible(visible + PAGE_SIZE)}
                style={{
                  ...btn, marginTop: 4, height: 48, padding: '0 26px', borderRadius: 14, border: `1px solid ${T.borderBtn}`,
                  background: T.surface, color: T.text, fontSize: 15, fontWeight: 800,
                }}
              >
                Cargar más piezas
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
