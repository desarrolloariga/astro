import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const PALETAS = {
  destructive: { icono: 'bg-destructive/10 text-destructive', fondo: 'bg-destructive/5', valor: 'text-destructive' },
  accent: { icono: 'bg-accent text-accent-foreground', fondo: 'bg-accent/40', valor: 'text-accent-foreground' },
} as const

export function AlertaCard({
  icon: Icon,
  titulo,
  subtitulo,
  valor,
  severidad = 'destructive',
  href,
}: {
  icon: LucideIcon
  titulo: string
  subtitulo?: string
  valor: string
  severidad?: keyof typeof PALETAS
  href?: string
}) {
  const paleta = PALETAS[severidad]

  const contenido = (
    <div className={cn('flex items-center justify-between gap-3 rounded-lg px-3 py-2.5', paleta.fondo)}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', paleta.icono)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{titulo}</p>
          {subtitulo && <p className="text-xs text-muted-foreground">{subtitulo}</p>}
        </div>
      </div>
      <span className={cn('shrink-0 text-sm font-semibold', paleta.valor)}>{valor}</span>
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="block transition-opacity hover:opacity-80">
        {contenido}
      </Link>
    )
  }
  return contenido
}
