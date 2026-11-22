import type { ReactNode } from 'react'
import { Gem, Sparkles, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Identidad visual de la Billetera ASTRO (antes "bolsa"): el saldo de
 * comisión del embajador que se usa para comprar producto. Azul profundo
 * con acentos dorados para que se reconozca como algo especial.
 */
export const NOMBRE_BILLETERA = 'Billetera ASTRO'

export const fondoBilletera =
  'bg-[radial-gradient(120%_140%_at_100%_0%,#F6A637_0%,rgba(246,166,55,0)_45%),linear-gradient(135deg,#000000_0%,#141414_55%,#262626_100%)]'

/** Chip pequeño con la marca (etiquetas, tablas). */
export function ChipBilletera({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-black px-2 py-0.5 text-[11px] font-bold text-[#F6A637] shadow-sm',
        className,
      )}
    >
      <Wallet className="h-3 w-3" />
      {children ?? NOMBRE_BILLETERA}
    </span>
  )
}

/** Tarjeta grande tipo tarjeta premium para mostrar el saldo. */
export function TarjetaBilletera({
  saldo,
  titular,
  detalle,
  children,
}: {
  saldo: string
  titular?: string
  detalle?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className={cn('relative overflow-hidden rounded-2xl p-5 text-white shadow-[0_18px_40px_-12px_rgba(0,0,0,0.55)]', fondoBilletera)}>
      {/* brillo decorativo */}
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-[#F6A637]/25 blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-[#F6A637]/10 blur-2xl" />
      <Gem aria-hidden className="pointer-events-none absolute right-5 top-5 h-10 w-10 text-[#F6A637]/80" strokeWidth={1.3} />

      <div className="relative flex flex-col gap-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[#F6A637]">
          <Sparkles className="h-3.5 w-3.5" />
          {NOMBRE_BILLETERA}
        </p>
        {titular && <p className="pr-12 text-sm text-white/75">{titular}</p>}
        <p className="mt-3 text-4xl font-extrabold tracking-tight drop-shadow-sm">{saldo}</p>
        <p className="text-xs font-medium text-white/70">disponible para comprar</p>
        {detalle && <div className="mt-2 text-sm text-white/85">{detalle}</div>}
      </div>
      {children && <div className="relative mt-4">{children}</div>}
    </section>
  )
}
