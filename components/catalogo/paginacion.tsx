import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { construirQueryString, type FiltrosCatalogo } from '@/lib/catalogo'

export function Paginacion({
  filtros,
  totalPaginas,
  rutaBase,
}: {
  filtros: FiltrosCatalogo
  totalPaginas: number
  rutaBase: string
}) {
  if (totalPaginas <= 1) return null

  const paginaActual = filtros.pagina

  function href(pagina: number) {
    const qs = construirQueryString(filtros, { pagina })
    return qs ? `${rutaBase}?${qs}` : rutaBase
  }

  return (
    <nav className="flex items-center justify-center gap-3 pt-4" aria-label="Paginación">
      <Link
        href={href(Math.max(1, paginaActual - 1))}
        aria-disabled={paginaActual === 1}
        className={`flex h-8 w-8 items-center justify-center rounded-[3px] border border-[var(--cat-borde-control)] text-[var(--cat-texto)] ${
          paginaActual === 1
            ? 'pointer-events-none opacity-40'
            : 'hover:border-[var(--cat-primario)] hover:text-[var(--cat-primario)]'
        }`}
      >
        <ChevronLeft className="h-4 w-4" />
      </Link>
      <span className="px-2 text-[11px] uppercase tracking-[.06em] text-[var(--cat-meta)]">
        Página {paginaActual} de {totalPaginas}
      </span>
      <Link
        href={href(Math.min(totalPaginas, paginaActual + 1))}
        aria-disabled={paginaActual === totalPaginas}
        className={`flex h-8 w-8 items-center justify-center rounded-[3px] border border-[var(--cat-borde-control)] text-[var(--cat-texto)] ${
          paginaActual === totalPaginas
            ? 'pointer-events-none opacity-40'
            : 'hover:border-[var(--cat-primario)] hover:text-[var(--cat-primario)]'
        }`}
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    </nav>
  )
}
