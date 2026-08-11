import Link from 'next/link'
import { Gem, X } from 'lucide-react'
import { formatearPrecio } from '@/lib/formato'
import { agregarAlCarrito, quitarDelCarrito } from '@/app/(publico)/c/[token]/acciones'
import type { PiezaCatalogo } from './tipos'

export function TarjetaPieza({
  pieza,
  href,
  acciones,
}: {
  pieza: PiezaCatalogo
  href: string
  acciones?: React.ReactNode
}) {
  const metadatos =
    [pieza.material, pieza.kilataje].filter(Boolean).join(' · ') || pieza.codigo

  return (
    <div className="group flex flex-col overflow-hidden rounded-[4px] border border-[var(--cat-borde)] bg-[var(--cat-bg)] transition-[border-color,box-shadow] duration-200 hover:border-[var(--cat-primario)] hover:shadow-[var(--cat-sombra-tarjeta)]">
      <Link href={href} className="flex flex-col">
        <div className="relative h-[230px] w-full overflow-hidden">
          {pieza.imagen_principal ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pieza.imagen_principal}
              alt={pieza.nombre}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="cat-placeholder-imagen flex h-full w-full items-center justify-center">
              <Gem className="h-10 w-10 text-[var(--cat-hueco-texto)]" strokeWidth={1.1} />
            </div>
          )}
          {pieza.estado === 'en_transito' && (
            <span className="absolute left-[10px] top-[10px] rounded-[3px] bg-[var(--cat-primario)] px-2 py-1 text-[8.5px] font-normal uppercase tracking-[.14em] text-white">
              Próximamente
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-[7px] px-[14px] pb-4 pt-[14px]">
          <h3 className="line-clamp-2 text-base font-normal leading-[1.25] text-[var(--cat-tinta)]">
            {pieza.nombre}
          </h3>
          <p className="text-[10.5px] font-light tracking-[.04em] text-[var(--cat-meta)]">
            {metadatos}
          </p>
          <div className="mt-auto pt-2">
            <span className="text-[15px] font-medium text-[var(--cat-tinta)]">
              {pieza.precio_venta != null ? formatearPrecio(pieza.precio_venta) : '—'}
            </span>
          </div>
        </div>
      </Link>
      {acciones && <div className="px-[14px] pb-[14px]">{acciones}</div>}
    </div>
  )
}

/** Botón agregar/quitar de la bolsa — solo aplica al catálogo público. */
export function BotonBolsa({
  pieza,
  token,
  enCarrito,
}: {
  pieza: { id: number; modo_inventario?: 'pieza_unica' | 'por_cantidad'; stock_disponible?: number | null }
  token: string
  enCarrito: boolean
}) {
  if (enCarrito) {
    return (
      <form action={quitarDelCarrito}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="producto_id" value={pieza.id} />
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-[3px] border border-[var(--cat-primario)] bg-[var(--cat-primario)] py-2 text-[11px] font-medium uppercase tracking-[.06em] text-white transition-opacity hover:opacity-90"
        >
          <X className="h-3.5 w-3.5" />
          Quitar
        </button>
      </form>
    )
  }

  const esPorCantidad = pieza.modo_inventario === 'por_cantidad'

  return (
    <form action={agregarAlCarrito} className="flex items-center gap-1.5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="producto_id" value={pieza.id} />
      {esPorCantidad && (
        <input
          name="cantidad"
          type="number"
          min="1"
          max={pieza.stock_disponible ?? undefined}
          step="1"
          defaultValue={1}
          className="w-14 shrink-0 rounded-[3px] border border-[var(--cat-borde)] bg-[var(--cat-bg)] px-1.5 py-2 text-center text-[11px] text-[var(--cat-tinta)] focus:border-[var(--cat-primario)] focus:outline-none"
        />
      )}
      <button
        type="submit"
        className="w-full rounded-[3px] border border-[var(--cat-primario)] bg-transparent py-2 text-[11px] font-medium uppercase tracking-[.06em] text-[var(--cat-primario)] transition-colors hover:bg-[var(--cat-primario)] hover:text-white"
      >
        Añadir
      </button>
    </form>
  )
}
