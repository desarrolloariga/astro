'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ProductoSeleccionable = {
  id: number
  codigo: string
  nombre: string
  estado?: string
}

const nombresEstado: Record<string, string> = {
  en_produccion: 'Borrador',
  disponible_cedi: 'En CEDI',
  separada: 'Separada',
  vendida: 'Vendida',
  entregada: 'Entregada',
}

/**
 * Buscador de piezas del maestro de productos. Filtra client-side sobre
 * la lista ya cargada (catálogos de esta escala no justifican ida y
 * vuelta al servidor por cada tecla). Expone el id elegido vía un
 * input oculto `name` para que viaje con el <form> que lo envuelve.
 */
export function SelectorProducto({
  productos,
  name,
  placeholder = 'Buscar por código o nombre…',
  defaultProductoId,
}: {
  productos: ProductoSeleccionable[]
  name: string
  placeholder?: string
  defaultProductoId?: number | null
}) {
  const seleccionInicial = productos.find((p) => p.id === defaultProductoId) ?? null
  const [seleccionado, setSeleccionado] = useState<ProductoSeleccionable | null>(seleccionInicial)
  const [consulta, setConsulta] = useState('')
  const [abierto, setAbierto] = useState(false)
  const contenedorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function alHacerClickFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false)
      }
    }
    document.addEventListener('mousedown', alHacerClickFuera)
    return () => document.removeEventListener('mousedown', alHacerClickFuera)
  }, [])

  const coincidencias = useMemo(() => {
    const q = consulta.trim().toLowerCase()
    const base = q
      ? productos.filter((p) => p.codigo.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q))
      : productos
    return base.slice(0, 30)
  }, [consulta, productos])

  return (
    <div ref={contenedorRef} className="relative">
      <input type="hidden" name={name} value={seleccionado?.id ?? ''} />

      {seleccionado ? (
        <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2.5 text-sm">
          <span className="flex-1 truncate text-foreground">
            <span className="font-semibold">{seleccionado.codigo}</span> — {seleccionado.nombre}
          </span>
          <button
            type="button"
            onClick={() => {
              setSeleccionado(null)
              setConsulta('')
            }}
            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
            aria-label="Quitar selección"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2.5 focus-within:border-primary">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={consulta}
            onChange={(e) => {
              setConsulta(e.target.value)
              setAbierto(true)
            }}
            onFocus={() => setAbierto(true)}
            placeholder={placeholder}
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      )}

      {abierto && !seleccionado && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="max-h-64 overflow-y-auto">
            {coincidencias.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">Sin coincidencias</p>
            ) : (
              coincidencias.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSeleccionado(p)
                    setAbierto(false)
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary"
                >
                  <span className="truncate text-foreground">
                    <span className="font-semibold">{p.codigo}</span> — {p.nombre}
                  </span>
                  {p.estado && (
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        'bg-secondary text-secondary-foreground',
                      )}
                    >
                      {nombresEstado[p.estado] ?? p.estado}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
