import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Paginacion({
  paginaActual,
  totalPaginas,
  total,
  construirHref,
}: {
  paginaActual: number
  totalPaginas: number
  total: number
  construirHref: (pagina: number) => string
}) {
  if (totalPaginas <= 1) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm text-muted-foreground">
      <span>
        {total} resultado{total !== 1 ? 's' : ''} · página {paginaActual} de {totalPaginas}
      </span>
      <div className="flex items-center gap-2">
        <Link
          href={construirHref(Math.max(1, paginaActual - 1))}
          className={cn(
            'inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 font-medium text-foreground transition-colors hover:bg-secondary',
            paginaActual <= 1 && 'pointer-events-none opacity-40',
          )}
        >
          <ChevronLeft className="h-4 w-4" /> Anterior
        </Link>
        <Link
          href={construirHref(Math.min(totalPaginas, paginaActual + 1))}
          className={cn(
            'inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 font-medium text-foreground transition-colors hover:bg-secondary',
            paginaActual >= totalPaginas && 'pointer-events-none opacity-40',
          )}
        >
          Siguiente <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
