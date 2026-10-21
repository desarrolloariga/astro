'use client'

import { T, scrollY } from '../tokens'
import { useCatalogo } from '../store'
import { EmptyState } from '../ui/basicos'
import { ProductCard } from '../ui/producto'
import { plural } from './inicio'

export function FavsScreen() {
  const app = useCatalogo()
  // Solo las que siguen en el catálogo (o apartadas en el carrito).
  const list = app.estado.favs.map((id) => app.producto(id)).filter((p) => p !== null)

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 20px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.muted }}>{plural(list.length, 'guardado', 'guardados')}</span>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>Favoritos</h1>
      </div>
      <div className="cat-noscroll" style={{ ...scrollY, padding: '4px 20px 92px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          {list.map((p) => (
            <ProductCard key={p.id} product={p} compact />
          ))}
        </div>
        {list.length === 0 && (
          <EmptyState
            title="Aún no tienes favoritos"
            text="Toca el corazón en cualquier producto para guardarlo aquí."
            cta="Explorar catálogo"
            onCta={() => app.tab('home')}
            padding="48px 12px"
          />
        )}
      </div>
    </div>
  )
}
