'use client'

import { Printer } from 'lucide-react'

export function BotonImprimir({ children = 'Imprimir' }: { children?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 print:hidden"
    >
      <Printer className="h-4 w-4" />
      {children}
    </button>
  )
}
