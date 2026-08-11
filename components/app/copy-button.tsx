'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export function CopyButton({ texto, className }: { texto: string; className?: string }) {
  const [copiado, setCopiado] = useState(false)

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(texto)
        setCopiado(true)
        setTimeout(() => setCopiado(false), 1500)
      }}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary',
        className,
      )}
    >
      {copiado ? (
        <>
          <Check className="h-3.5 w-3.5 text-primary" />
          Copiado
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Copiar enlace
        </>
      )}
    </button>
  )
}
