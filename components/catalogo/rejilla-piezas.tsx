import Link from 'next/link'
import { Gem } from 'lucide-react'
import { TarjetaPieza, BotonBolsa } from './tarjeta-pieza'
import type { PiezaCatalogo } from './tipos'

export function RejillaPiezas({
  piezas,
  rutaDetalle,
  rutaLimpiar,
  accionesPublicas,
}: {
  piezas: PiezaCatalogo[]
  rutaDetalle: (id: number) => string
  rutaLimpiar: string
  accionesPublicas?: { idsEnCarrito: Set<number>; token: string }
}) {
  if (piezas.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[4px] border border-dashed border-[#cfdaee] bg-[var(--cat-surface)] px-6 py-[70px] text-center">
        <Gem className="h-10 w-10 text-[var(--cat-rotulo)]" strokeWidth={1.1} />
        <p className="text-[15px] text-[var(--cat-tinta)]">Sin piezas para estos filtros</p>
        <p className="max-w-sm text-[12.5px] text-[var(--cat-meta)]">
          Ajusta o limpia los filtros para ver más resultados.
        </p>
        <Link
          href={rutaLimpiar}
          className="mt-2 rounded-[3px] bg-[var(--cat-primario)] px-4 py-2 text-[11px] font-medium uppercase tracking-[.06em] text-white transition-opacity hover:opacity-90"
        >
          Limpiar filtros
        </Link>
      </div>
    )
  }

  return (
    <div className="cat-anim-entrada grid grid-cols-1 gap-[18px] min-[600px]:grid-cols-2 min-[900px]:grid-cols-3 min-[1200px]:grid-cols-4">
      {piezas.map((pieza) => (
        <TarjetaPieza
          key={pieza.id}
          pieza={pieza}
          href={rutaDetalle(pieza.id)}
          acciones={
            accionesPublicas ? (
              <BotonBolsa
                pieza={pieza}
                token={accionesPublicas.token}
                enCarrito={accionesPublicas.idsEnCarrito.has(pieza.id)}
              />
            ) : undefined
          }
        />
      ))}
    </div>
  )
}
