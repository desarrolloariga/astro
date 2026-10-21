import { User, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ModoCompra } from '@/lib/modo-compra'
import { cambiarModoCompra } from '@/app/(app)/carrito/acciones'

/** Interruptor "Comprar para mí / Para un cliente" del catálogo y el carrito del backoffice. */
export function SelectorModoCompra({
  modo,
  volver,
  esEmbajador,
}: {
  modo: ModoCompra
  volver: string
  esEmbajador: boolean
}) {
  const opciones = [
    { valor: 'mi' as const, titulo: 'Comprar para mí', icono: User },
    { valor: 'cliente' as const, titulo: 'Para un cliente', icono: Users },
  ]
  return (
    <div className="flex flex-col gap-1.5">
      <form action={cambiarModoCompra} className="inline-flex w-fit rounded-full border border-border bg-card p-1">
        <input type="hidden" name="volver" value={volver} />
        {opciones.map((o) => (
          <button
            key={o.valor}
            type="submit"
            name="modo"
            value={o.valor}
            aria-pressed={modo === o.valor}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
              modo === o.valor ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <o.icono className="h-3.5 w-3.5" />
            {o.titulo}
          </button>
        ))}
      </form>
      {esEmbajador && (
        <p className="text-xs text-muted-foreground">
          {modo === 'mi'
            ? 'Ves tu precio de embajador: aplica a lo que compras para ti.'
            : 'Comprando para un cliente: se cobra el precio público.'}
        </p>
      )}
    </div>
  )
}
