import type { ProductoFicha } from '@/lib/producto-detalle/datos'

/** JSON-LD tipo Product con precio público y disponibilidad (SEO). */
export function JsonLdProducto({ producto, url }: { producto: ProductoFicha; url: string }) {
  const datos = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: producto.nombre,
    sku: producto.codigo,
    description: producto.descripcion ?? undefined,
    image: producto.imagenes.length ? producto.imagenes : undefined,
    category: producto.categoria,
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'GTQ',
      price: producto.pub.toFixed(2),
      availability: producto.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  }
  return (
    <script
      type="application/ld+json"
      // Se escapa "<" para que el contenido no pueda cerrar la etiqueta.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(datos).replace(/</g, '\\u003c') }}
    />
  )
}
