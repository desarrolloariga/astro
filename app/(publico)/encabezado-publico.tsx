'use client'

import { usePathname } from 'next/navigation'
import { LogoAstro } from '@/components/marca/logo-astro'

/** El catálogo y la ficha del producto traen su propio encabezado de marca: aquí no se repite. */
const CON_ENCABEZADO_PROPIO = /^\/c\/[^/]+(\/p\/[^/]+)?\/?$/

export function EncabezadoPublico() {
  const ruta = usePathname()
  if (CON_ENCABEZADO_PROPIO.test(ruta)) return null
  return (
    <header className="sticky top-0 z-20 bg-card pt-[env(safe-area-inset-top)]">
      <div className="h-1.5 bg-primary" />
      <div className="flex h-16 items-center gap-2 border-b border-border bg-card/90 px-4 backdrop-blur md:px-6">
        <LogoAstro ancho={110} prioridad />
      </div>
    </header>
  )
}
