'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import type { FiltrosCatalogo, OpcionesFacetas } from '@/lib/catalogo'
import { formatearPrecio } from '@/lib/formato'
import { OrdenSelect } from './orden-select'

export function FiltrosPanel({
  filtros,
  facetas,
  rutaBase,
  totalSinFiltrar,
  totalConFiltro,
}: {
  filtros: FiltrosCatalogo
  facetas: OpcionesFacetas
  rutaBase: string
  totalSinFiltrar: number
  totalConFiltro: number
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [precioVista, setPrecioVista] = useState(filtros.precioMax ?? facetas.precioMax)

  function enviar() {
    formRef.current?.requestSubmit()
  }

  const precioMaxSlider = Math.max(1, facetas.precioMax)
  const paso = Math.max(1, Math.round(precioMaxSlider / 60))

  return (
    <form ref={formRef} method="get" action={rutaBase} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-[4px] border border-[var(--cat-borde)] bg-[var(--cat-bg)] p-[14px] shadow-[var(--cat-sombra-barra)] lg:sticky lg:top-[74px] lg:z-10 lg:flex-row lg:flex-wrap lg:items-center lg:gap-[14px]">
        <div className="flex min-w-56 flex-1 items-center gap-2 rounded-[3px] border border-[var(--cat-borde-control)] bg-[var(--cat-surface)] px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-[var(--cat-rotulo)]" />
          <input
            type="text"
            name="buscar"
            defaultValue={filtros.buscar}
            placeholder="Buscar piezas…"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--cat-tinta)] outline-none placeholder:text-[var(--cat-rotulo)]"
          />
        </div>

        <Divisor />

        <GrupoChips
          etiqueta="Categoría"
          nombre="categoria"
          valorActual={filtros.categoria}
          opciones={facetas.categorias}
          onCambio={enviar}
        />

        <Divisor />

        <GrupoChips
          etiqueta="Material"
          nombre="material"
          valorActual={filtros.material}
          opciones={facetas.materiales}
          onCambio={enviar}
        />

        <Divisor />

        {facetas.precioMax > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[.2em] text-[var(--cat-rotulo)]">
              Precio máx.
            </span>
            <input
              type="range"
              name="precio_max"
              min={0}
              max={precioMaxSlider}
              step={paso}
              defaultValue={filtros.precioMax ?? precioMaxSlider}
              onInput={(e) => setPrecioVista(Number(e.currentTarget.value))}
              onMouseUp={enviar}
              onTouchEnd={enviar}
              onKeyUp={enviar}
              className="w-28 accent-[var(--cat-accento)] sm:w-32"
            />
            <span className="min-w-[74px] text-right text-[12.5px] font-medium text-[var(--cat-tinta)]">
              {formatearPrecio(precioVista)}
            </span>
          </div>
        )}

        <OrdenSelect valorActual={filtros.orden} onCambio={enviar} />

        <div className="flex items-center gap-3 lg:ml-auto">
          <span className="whitespace-nowrap text-[10px] uppercase tracking-[.06em] text-[var(--cat-rotulo)]">
            {totalConFiltro} de {totalSinFiltrar} piezas
          </span>
          <Link
            href={rutaBase}
            className="text-[11px] font-medium uppercase tracking-[.06em] text-[var(--cat-primario)] hover:underline"
          >
            Limpiar
          </Link>
        </div>
      </div>

      {facetas.kilatajes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[10px] font-medium uppercase tracking-[.24em] text-[var(--cat-rotulo)]">
            Kilataje
          </span>
          <GrupoChips
            nombre="kilataje"
            valorActual={filtros.kilataje}
            opciones={facetas.kilatajes}
            onCambio={enviar}
            fondo="surface"
          />
        </div>
      )}
    </form>
  )
}

function Divisor() {
  return <span className="hidden h-6 w-px bg-[var(--cat-borde)] lg:block" aria-hidden />
}

function GrupoChips({
  etiqueta,
  nombre,
  valorActual,
  opciones,
  onCambio,
  fondo = 'bg',
}: {
  etiqueta?: string
  nombre: string
  valorActual: string
  opciones: string[]
  onCambio: () => void
  fondo?: 'bg' | 'surface'
}) {
  if (opciones.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {etiqueta && (
        <span className="mr-1 hidden text-[10px] font-medium uppercase tracking-[.2em] text-[var(--cat-rotulo)] lg:inline">
          {etiqueta}
        </span>
      )}
      <Chip nombre={nombre} valor="" etiqueta="Todo" activo={!valorActual} onCambio={onCambio} fondo={fondo} />
      {opciones.map((op) => (
        <Chip
          key={op}
          nombre={nombre}
          valor={op}
          etiqueta={op}
          activo={valorActual === op}
          onCambio={onCambio}
          fondo={fondo}
        />
      ))}
    </div>
  )
}

function Chip({
  nombre,
  valor,
  etiqueta,
  activo,
  onCambio,
  fondo,
}: {
  nombre: string
  valor: string
  etiqueta: string
  activo: boolean
  onCambio: () => void
  fondo: 'bg' | 'surface'
}) {
  return (
    <label
      className={`cursor-pointer rounded-[3px] px-3.5 py-2 text-[11px] font-normal tracking-[.02em] transition-colors ${
        activo
          ? 'bg-[var(--cat-primario)] text-white'
          : `border border-[var(--cat-borde-control)] text-[var(--cat-texto)] hover:border-[var(--cat-primario)] hover:text-[var(--cat-primario)] ${
              fondo === 'surface' ? 'bg-[var(--cat-surface)]' : 'bg-[var(--cat-bg)]'
            }`
      }`}
    >
      <input type="radio" name={nombre} value={valor} checked={activo} onChange={onCambio} className="sr-only" />
      {etiqueta}
    </label>
  )
}
