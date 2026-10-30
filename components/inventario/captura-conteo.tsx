'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, ScanLine } from 'lucide-react'
import { clasesCampo } from '@/lib/contabilidad-general'
import { registrarConteo, type EstadoConteo } from '@/app/(app)/inventario/toma-fisica/acciones'

/** Captura de conteo: escáner o teclado. En modo "sumar" cada lectura suma; en "fijar" reemplaza el conteo. */
export function CapturaConteo({ tomaId }: { tomaId: number }) {
  const [estado, accion, enviando] = useActionState<EstadoConteo, FormData>(registrarConteo, {})
  const [modo, setModo] = useState<'sumar' | 'fijar'>('sumar')
  const codigo = useRef<HTMLInputElement>(null)
  const cantidad = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (estado.ok && codigo.current) {
      codigo.current.value = ''
      if (cantidad.current) cantidad.current.value = '1'
    }
    codigo.current?.focus()
  }, [estado])

  return (
    <form action={accion} className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-card p-4">
      <input type="hidden" name="toma_id" value={tomaId} />
      <input type="hidden" name="modo" value={modo} />
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <ScanLine className="h-4 w-4 text-primary" />
        Registrar conteo
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_7rem_auto]">
        <input
          ref={codigo}
          name="codigo"
          autoFocus
          autoComplete="off"
          placeholder="Escanea o escribe el código"
          className={`${clasesCampo} font-mono`}
        />
        <input ref={cantidad} name="cantidad" inputMode="numeric" defaultValue="1" aria-label="Cantidad" className={`${clasesCampo} text-right`} />
        <button
          type="submit"
          disabled={enviando}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {enviando ? 'Guardando…' : modo === 'sumar' ? 'Sumar' : 'Fijar'}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={modo === 'sumar'} onChange={() => setModo('sumar')} />
          Sumar a lo ya contado (escaneo pieza por pieza)
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={modo === 'fijar'} onChange={() => setModo('fijar')} />
          Fijar el total contado
        </label>
      </div>
      {estado.ok && (
        <p className="flex items-center gap-2 text-sm text-primary">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {estado.ok}
        </p>
      )}
      {estado.error && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {estado.error}
        </p>
      )}
    </form>
  )
}
