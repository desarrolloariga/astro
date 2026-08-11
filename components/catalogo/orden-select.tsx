'use client'

import { OPCIONES_ORDEN, type OrdenCatalogo } from '@/lib/catalogo'

export function OrdenSelect({
  valorActual,
  onCambio,
}: {
  valorActual: OrdenCatalogo
  onCambio: () => void
}) {
  return (
    <select
      name="orden"
      defaultValue={valorActual}
      onChange={onCambio}
      className="rounded-[3px] border border-[var(--cat-borde-control)] bg-[var(--cat-surface)] px-2.5 py-2 text-[11px] font-medium uppercase tracking-[.06em] text-[var(--cat-texto)] outline-none"
    >
      {OPCIONES_ORDEN.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.etiqueta}
        </option>
      ))}
    </select>
  )
}
