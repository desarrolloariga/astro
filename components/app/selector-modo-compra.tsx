import { User, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ModoCompra } from '@/lib/modo-compra'

/** Interruptor "Comprar para mí / Para un cliente" del catálogo y el carrito del backoffice. */
export function SelectorModoCompra({
  modo,
  volver,
  esEmbajador,
}: {
  modo: ModoCompra
  /** Ruta (con su query) a la que se regresa tras cambiar el modo. */
  volver: string
  esEmbajador: boolean
}) {
  const opciones = [
    { valor: 'mi' as const, titulo: 'Comprar para mí', icono: User },
    { valor: 'cliente' as const, titulo: 'Para un cliente', icono: Users },
  ]
  return (
    <div className="flex flex-col gap-1.5">
      <div role="group" aria-label="Modo de compra" className="inline-flex w-fit rounded-full border border-border bg-card p-1">
        {opciones.map((o) => (
          // Enlace normal (no <Link>): navegación completa para que la cookie y los precios se apliquen siempre.
          <a
            key={o.valor}
            href={`/carrito/modo?modo=${o.valor}&volver=${encodeURIComponent(volver)}`}
            aria-current={modo === o.valor ? 'true' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
              modo === o.valor ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <o.icono className="h-3.5 w-3.5" />
            {o.titulo}
          </a>
        ))}
      </div>
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
