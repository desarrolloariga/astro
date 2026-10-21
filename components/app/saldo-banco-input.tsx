'use client'

import { useState } from 'react'
import { formatearPrecio } from '@/lib/formato'
import { cn } from '@/lib/utils'

/** Campo "saldo según estado de cuenta" con la diferencia contra libros calculada al escribir. */
export function SaldoBancoInput({ saldoLibros }: { saldoLibros: number }) {
  const [valor, setValor] = useState('')
  const n = Number(valor.replace(',', '.'))
  const hay = valor.trim() !== '' && Number.isFinite(n)
  const diferencia = hay ? Math.round((n - saldoLibros) * 100) / 100 : null
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
        Saldo según el estado de cuenta del banco (Q)
        <input
          name="saldo_banco"
          type="number"
          step="0.01"
          required
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
        />
      </label>
      {diferencia != null && (
        <p className={cn('text-sm font-semibold', diferencia === 0 ? 'text-emerald-700' : 'text-destructive')}>
          {diferencia === 0
            ? '✓ Cuadra con el saldo en libros'
            : `Diferencia: ${formatearPrecio(diferencia)} (${diferencia > 0 ? 'el banco tiene más' : 'el banco tiene menos'} que los libros)`}
        </p>
      )}
    </div>
  )
}
