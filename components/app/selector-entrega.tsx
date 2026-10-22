'use client'

import { useEffect, useMemo, useState } from 'react'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ahoraGuatemala,
  diasProgramados,
  horaLegible,
  normalizarEleccion,
  textoEta,
  type ConfigEntrega,
  type EleccionEntrega,
} from '@/lib/entrega'

/**
 * Forma y momento de entrega en el checkout (precargado con lo elegido en
 * la ficha). Escribe los campos ocultos que lee lib/checkout.ts.
 */
export function SelectorEntrega({
  config,
  permiteInmediata,
  valor,
  onChange,
}: {
  config: ConfigEntrega
  permiteInmediata: boolean
  valor: EleccionEntrega
  onChange: (e: EleccionEntrega) => void
}) {
  const [ahora, setAhora] = useState<ReturnType<typeof ahoraGuatemala> | null>(null)
  useEffect(() => setAhora(ahoraGuatemala()), [])
  const dias = useMemo(() => (ahora ? diasProgramados(config, ahora) : []), [config, ahora])
  useEffect(() => {
    if (dias.length) onChange(normalizarEleccion(valor, config, permiteInmediata, dias))
    // Solo cuando se conocen los días.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias])

  const opcion = (activo: boolean) =>
    cn('rounded-lg border px-4 py-3 text-left transition-colors', activo ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-secondary/50')

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="metodo_entrega" value={valor.metodo} />
      <input type="hidden" name="tipo_entrega" value={valor.tipo} />
      <input type="hidden" name="fecha_entrega" value={valor.tipo === 'programada' ? (valor.fecha ?? '') : ''} />
      <input type="hidden" name="franja_entrega" value={(() => {
        const f = valor.tipo === 'programada' ? config.franjas.find((x) => x.id === valor.franja) : undefined
        return f ? `${f.etiqueta} ${f.inicio} – ${f.fin}` : ''
      })()} />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => onChange({ ...valor, metodo: 'domicilio' })} className={opcion(valor.metodo === 'domicilio')}>
          <p className="text-sm font-semibold text-foreground">A domicilio</p>
          <p className="text-xs text-muted-foreground">Envío a la dirección que indiques</p>
        </button>
        <button type="button" onClick={() => onChange({ ...valor, metodo: 'recoger' })} className={opcion(valor.metodo === 'recoger')}>
          <p className="text-sm font-semibold text-foreground">Recoger en CEDI</p>
          <p className="text-xs text-muted-foreground">Sin costo de envío{config.cedi_direccion ? ` · ${config.cedi_direccion}` : ''}</p>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {permiteInmediata && (
          <button type="button" onClick={() => onChange({ ...valor, tipo: 'inmediata', fecha: null, franja: null })} className={opcion(valor.tipo === 'inmediata')}>
            <p className="text-sm font-semibold text-foreground">Entrega inmediata</p>
            <p className="text-xs text-muted-foreground">
              {valor.metodo === 'domicilio' ? `Confirma antes de las ${horaLegible(config.hora_corte)}` : 'Recoge hoy en CEDI'}
            </p>
          </button>
        )}
        <button
          type="button"
          onClick={() => onChange(normalizarEleccion({ ...valor, tipo: 'programada' }, config, false, dias))}
          className={opcion(valor.tipo === 'programada')}
        >
          <p className="text-sm font-semibold text-foreground">Entrega programada</p>
          <p className="text-xs text-muted-foreground">Elige el día y la franja horaria</p>
        </button>
      </div>

      {valor.tipo === 'programada' && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {dias.map((d) => (
              <button
                key={d.key}
                type="button"
                aria-pressed={valor.fecha === d.key}
                onClick={() => onChange({ ...valor, fecha: d.key })}
                className={cn(
                  'flex h-14 w-14 flex-col items-center justify-center rounded-xl text-xs',
                  valor.fecha === d.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground',
                )}
              >
                <span>{d.weekday}</span>
                <span className="text-base font-bold">{d.day}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {config.franjas.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={valor.franja === f.id}
                onClick={() => onChange({ ...valor, franja: f.id })}
                className={cn(
                  'rounded-full px-3.5 py-2 text-xs font-semibold',
                  valor.franja === f.id ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground',
                )}
              >
                {f.etiqueta} · {f.inicio} – {f.fin}
              </button>
            ))}
          </div>
        </div>
      )}

      <p aria-live="polite" className="flex items-center gap-2 rounded-lg bg-emerald-600/10 px-3 py-2.5 text-sm font-medium text-emerald-700">
        <Clock className="h-4 w-4 shrink-0" />
        {ahora ? textoEta(valor, config, ahora) : ' '}
      </p>
    </div>
  )
}
