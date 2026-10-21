import Link from 'next/link'
import { ArrowLeft, ArrowRight, Gem, LayoutGrid, Search } from 'lucide-react'

export type ResumenCategoria = { nombre: string; total: number; imagen: string | null }

/** Agrupa piezas por categoría: cuántas hay y una foto de muestra (la primera con imagen). */
export function resumirCategorias(
  piezas: { categoria?: string | null; imagen_principal?: string | null }[],
): ResumenCategoria[] {
  const mapa = new Map<string, ResumenCategoria>()
  for (const p of piezas) {
    const nombre = p.categoria?.trim()
    if (!nombre) continue
    const actual = mapa.get(nombre)
    if (actual) {
      actual.total++
      if (!actual.imagen && p.imagen_principal) actual.imagen = p.imagen_principal
    } else {
      mapa.set(nombre, { nombre, total: 1, imagen: p.imagen_principal ?? null })
    }
  }
  return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/**
 * Portada del catálogo: tarjetas por categoría. Al hacer clic se entra al
 * listado filtrado por esa categoría (?categoria=…); "Ver todas las piezas"
 * abre el listado completo (?ver=todo).
 */
export function TarjetasCategorias({
  categorias,
  rutaBase,
  totalPiezas,
}: {
  categorias: ResumenCategoria[]
  rutaBase: string
  totalPiezas: number
}) {
  return (
    <div className="flex flex-col gap-[22px]">
      <form method="get" action={rutaBase} className="flex max-w-xl items-center gap-2 rounded-[3px] border border-[var(--cat-borde-control)] bg-[var(--cat-surface)] px-3 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-[var(--cat-rotulo)]" />
        <input
          type="search"
          name="buscar"
          placeholder="Buscar en todo el catálogo…"
          className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--cat-tinta)] outline-none placeholder:text-[var(--cat-rotulo)]"
        />
      </form>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {categorias.map((c) => (
          <Link
            key={c.nombre}
            href={`${rutaBase}?categoria=${encodeURIComponent(c.nombre)}`}
            className="group relative flex aspect-[4/5] flex-col overflow-hidden rounded-[4px] border border-[var(--cat-borde)] bg-[var(--cat-hueco)] transition-[border-color,box-shadow] duration-200 hover:border-[var(--cat-primario)] hover:shadow-[var(--cat-sombra-tarjeta)]"
          >
            {c.imagen ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.imagen}
                alt=""
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
            ) : (
              <div className="cat-placeholder-imagen absolute inset-0 flex items-center justify-center">
                <Gem className="h-12 w-12 text-[var(--cat-hueco-texto)]" strokeWidth={1.1} />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgba(15,28,48,0.78)] via-[rgba(15,28,48,0.35)] to-transparent px-4 pb-4 pt-14">
              <p className="text-[17px] font-medium leading-tight text-white">{c.nombre}</p>
              <p className="mt-1 flex items-center justify-between text-[11px] uppercase tracking-[.12em] text-white/80">
                {c.total} {c.total === 1 ? 'pieza' : 'piezas'}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </p>
            </div>
          </Link>
        ))}

        <Link
          href={`${rutaBase}?ver=todo`}
          className="group flex aspect-[4/5] flex-col items-center justify-center gap-3 rounded-[4px] border border-dashed border-[var(--cat-borde-control)] bg-[var(--cat-surface)] px-4 text-center transition-colors hover:border-[var(--cat-primario)]"
        >
          <LayoutGrid className="h-8 w-8 text-[var(--cat-primario)]" strokeWidth={1.4} />
          <span className="text-[15px] font-medium text-[var(--cat-tinta)]">Ver todas las piezas</span>
          <span className="text-[11px] uppercase tracking-[.12em] text-[var(--cat-meta)]">{totalPiezas} en total</span>
        </Link>
      </div>
    </div>
  )
}

/** Enlace de regreso a la portada de categorías, con la categoría actual. */
export function VolverACategorias({ rutaBase, categoria }: { rutaBase: string; categoria?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px] uppercase tracking-[.08em] text-[var(--cat-meta)]">
      <Link href={rutaBase} className="inline-flex items-center gap-1.5 hover:text-[var(--cat-primario)]">
        <ArrowLeft className="h-4 w-4" />
        Todas las categorías
      </Link>
      {categoria && (
        <>
          <span>/</span>
          <span className="text-[var(--cat-tinta)]">{categoria}</span>
        </>
      )}
    </div>
  )
}

/** ¿Mostrar la portada de categorías? Solo sin búsqueda ni filtros, y si hay más de una categoría. */
export function esPortadaCategorias(
  filtros: { buscar: string; categoria: string; material: string; kilataje: string; precioMax: number | null; orden: string; pagina: number },
  verTodo: boolean,
  numCategorias: number,
) {
  return (
    !verTodo &&
    numCategorias > 1 &&
    !filtros.buscar &&
    !filtros.categoria &&
    !filtros.material &&
    !filtros.kilataje &&
    filtros.precioMax == null &&
    filtros.orden === 'recientes' &&
    filtros.pagina === 1
  )
}
