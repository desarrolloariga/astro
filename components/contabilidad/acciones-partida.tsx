'use client'

import { useActionState, useState } from 'react'
import { Trash2, Undo2 } from 'lucide-react'
import { clasesCampo } from '@/lib/contabilidad-general'
import {
  descartarPartidaAccion,
  revertirPartidaAccion,
  type EstadoFormulario,
} from '@/app/(app)/contabilidad/partidas/acciones'
import { CamposAutorizacion, Mensajes } from './comunes'

export function FormularioReversion({
  partidaId,
  hoy,
  fechaBloqueo,
  puedeAutorizar,
}: {
  partidaId: number
  hoy: string
  fechaBloqueo: string | null
  puedeAutorizar: boolean
}) {
  const [estado, accion, enviando] = useActionState<EstadoFormulario, FormData>(revertirPartidaAccion, {})
  const [fecha, setFecha] = useState(hoy)
  const cerrada = Boolean(fechaBloqueo && fecha <= fechaBloqueo)
  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!window.confirm('Se registrará una partida espejo (Debe ↔ Haber) que anula el efecto de esta partida. ¿Continuar?')) {
          e.preventDefault()
        }
      }}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Undo2 className="h-4 w-4 text-primary" />
        Revertir partida
      </p>
      <input type="hidden" name="id" value={partidaId} />
      <Mensajes error={estado.error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Fecha de la reversión
          <input name="fecha" type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Motivo
          <input name="motivo" required maxLength={300} className={clasesCampo} />
        </label>
      </div>
      {cerrada &&
        (puedeAutorizar ? (
          <CamposAutorizacion mensaje="La fecha de la reversión cae en un mes cerrado. Ingresa tu PIN contable y el motivo del cambio en el mes cerrado." />
        ) : (
          <p className="text-sm text-amber-700">Esa fecha está en un mes cerrado: elige una fecha de un mes abierto.</p>
        ))}
      <div>
        <button
          type="submit"
          disabled={enviando || (cerrada && !puedeAutorizar)}
          className="rounded-lg border border-destructive/50 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          {enviando ? 'Revirtiendo…' : 'Revertir'}
        </button>
      </div>
    </form>
  )
}

export function FormularioDescartar({
  partidaId,
  fecha,
  cerrada,
}: {
  partidaId: number
  fecha: string
  cerrada: boolean
}) {
  const [estado, accion, enviando] = useActionState<EstadoFormulario, FormData>(descartarPartidaAccion, {})
  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!window.confirm('¿Descartar este borrador? Se elimina por completo.')) e.preventDefault()
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="id" value={partidaId} />
      <input type="hidden" name="fecha" value={fecha} />
      <Mensajes error={estado.error} />
      {cerrada && <CamposAutorizacion mensaje="El borrador está en un mes cerrado: descartarlo requiere tu PIN contable y el motivo." />}
      <div>
        <button
          type="submit"
          disabled={enviando}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          {enviando ? 'Descartando…' : 'Descartar borrador'}
        </button>
      </div>
    </form>
  )
}
