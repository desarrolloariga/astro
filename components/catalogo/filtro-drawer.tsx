'use client'

import { useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function FiltroDrawer({ panel }: { panel: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-2 rounded-[3px] border border-[var(--cat-borde-control)] bg-[var(--cat-bg)] px-3.5 py-2 text-[11px] font-medium uppercase tracking-[.06em] text-[var(--cat-texto)]"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filtros
      </button>

      <div
        onClick={() => setAbierto(false)}
        aria-hidden={!abierto}
        className={cn(
          'fixed inset-0 z-40 bg-[var(--cat-velo)] transition-opacity duration-300',
          abierto ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[85vw] max-w-sm overflow-y-auto bg-[var(--cat-bg)] p-4 shadow-[var(--cat-sombra-panel)] transition-transform duration-300 ease-out',
          abierto ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[13px] font-semibold uppercase tracking-[.1em] text-[var(--cat-tinta)]">
            Filtros
          </span>
          <button onClick={() => setAbierto(false)} aria-label="Cerrar filtros">
            <X className="h-5 w-5 text-[var(--cat-meta)]" />
          </button>
        </div>
        {panel}
      </aside>
    </div>
  )
}
