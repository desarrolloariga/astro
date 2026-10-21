'use client'

import { useMemo } from 'react'
import { ORDENES } from '@/lib/catalogo-movil/tipos'
import { valoresUnicos } from '@/lib/catalogo-movil/datos'
import { Icon } from '../iconos'
import { T, btn, card, scrollY, sectionTitle } from '../tokens'
import { useCatalogo } from '../store'
import { ActiveFilters, BackButton, EmptyState, FilterButton, SearchField } from '../ui/basicos'
import { ProductRow, ProductThumb } from '../ui/producto'
import { plural } from './inicio'

export function SearchScreen() {
  const app = useCatalogo()
  const { query, filtros, recientes } = app.estado
  const categorias = useMemo(() => valoresUnicos(app.productos, 'categoria'), [app.productos])
  // Foto de muestra por categoría: la primera pieza con imagen.
  const fotoCategoria = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of app.productos) if (p.categoria && p.imagenes[0] && !m.has(p.categoria)) m.set(p.categoria, p.imagenes[0])
    return m
  }, [app.productos])

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 20px 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <BackButton onClick={app.back} style={{ height: 50 }} />
        <SearchField value={query} onChange={app.setQuery} placeholder="¿Qué estás buscando?" focused autoFocus />
        <FilterButton count={app.chips.length} onClick={app.openSheet} />
      </div>

      <div className="cat-noscroll" style={{ ...scrollY, padding: '4px 20px 92px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {!query ? (
          <>
            {recientes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={sectionTitle}>Búsquedas recientes</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {recientes.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => app.setQuery(r)}
                      style={{
                        ...btn,
                        height: 40,
                        gap: 8,
                        padding: '0 14px',
                        borderRadius: 20,
                        border: `1px solid ${T.border}`,
                        background: T.surface,
                        color: T.text,
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      <Icon name="clock" size={16} color={T.muted} />
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {categorias.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={sectionTitle}>Explorar por categoría</span>
                {categorias.map((c) => (
                  <button
                    key={c.valor}
                    type="button"
                    onClick={() => app.goCategory(c.valor)}
                    style={{
                      ...btn,
                      ...card,
                      justifyContent: 'flex-start',
                      gap: 14,
                      padding: '10px 14px 10px 10px',
                      borderRadius: 18,
                      color: T.text,
                      textAlign: 'left',
                    }}
                  >
                    <ProductThumb src={fotoCategoria.get(c.valor)} width={48} iconSize={26} stroke={1.6} radius={14} />
                    <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{c.valor}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.muted }}>{plural(c.total, 'producto', 'productos')}</span>
                    </span>
                    <Icon name="chevronRight" size={18} stroke={2.2} color={T.muted} />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.muted }}>
                {plural(app.resultados.length, 'producto', 'productos')} para “{query}”
              </span>
              <button
                type="button"
                onClick={app.openSheet}
                style={{ ...btn, flex: 'none', height: 36, gap: 4, fontSize: 13, fontWeight: 700, color: T.text }}
              >
                {ORDENES.find((s) => s.id === filtros.orden)?.label}
                <Icon name="chevronDown" size={16} stroke={2.2} />
              </button>
            </div>
            <ActiveFilters chips={app.chips} />
            {app.resultados.map((p) => (
              <ProductRow key={p.id} product={p} />
            ))}
            {app.resultados.length === 0 && (
              <EmptyState
                title="Sin resultados"
                text="No encontramos productos con esa palabra. Revisa la ortografía o quita filtros."
                cta="Limpiar búsqueda y filtros"
                onCta={app.clearAll}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
