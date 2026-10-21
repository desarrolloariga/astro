import { Check, X, Clock } from 'lucide-react'
import { formatearFechaHora } from '@/lib/formato'
import { cn } from '@/lib/utils'

export type EventoPedido = {
  estado: string
  fecha: string
  comentario: string | null
  usuarios: { nombre: string } | null
}

type Paso = {
  clave: string
  titulo: string
  estados: string[]
}

// Cada burbuja agrupa los estados que la completan.
const PASOS: Paso[] = [
  { clave: 'creado', titulo: 'Pedido creado', estados: ['en_espera'] },
  { clave: 'pago', titulo: 'Pago aprobado', estados: ['listo_para_despacho'] },
  { clave: 'preparacion', titulo: 'En preparación', estados: ['en_preparacion'] },
  { clave: 'enviado', titulo: 'Enviado', estados: ['despachado'] },
  { clave: 'recibido', titulo: 'Recibido', estados: ['entregado'] },
]

const ORDEN: Record<string, number> = {
  en_espera: 0,
  pago_rechazado: 0,
  listo_para_despacho: 1,
  en_preparacion: 2,
  despachado: 3,
  entregado: 4,
}

/**
 * Línea de tiempo en burbujas: verde = completado (fecha y quién),
 * ámbar = paso en curso, gris = pendiente, rojo = pago rechazado.
 */
export function LineaTiempoPedido({ estadoActual, eventos }: { estadoActual: string; eventos: EventoPedido[] }) {
  const indiceActual = ORDEN[estadoActual] ?? 0
  const rechazado = estadoActual === 'pago_rechazado'

  // Último evento de cada estado (el más reciente gana si se repitió).
  const ultimoPorEstado = new Map<string, EventoPedido>()
  for (const e of eventos) ultimoPorEstado.set(e.estado, e)
  const eventoRechazo = ultimoPorEstado.get('pago_rechazado')

  return (
    <ol className="flex flex-col gap-0 md:flex-row md:items-start">
      {PASOS.map((paso, i) => {
        const evento = paso.estados.map((s) => ultimoPorEstado.get(s)).find(Boolean)
        const completado = i <= indiceActual && !(rechazado && i === 1)
        const esRechazo = rechazado && i === 1
        const enCurso = !esRechazo && i === indiceActual + 1 && estadoActual !== 'entregado'
        const ultimo = i === PASOS.length - 1

        const color = esRechazo
          ? 'bg-destructive text-white'
          : completado
            ? 'bg-emerald-600 text-white'
            : enCurso
              ? 'bg-amber-500 text-white'
              : 'bg-muted text-muted-foreground'

        return (
          <li key={paso.clave} className="relative flex flex-1 gap-3 pb-6 md:flex-col md:items-center md:pb-0 md:text-center">
            {!ultimo && (
              <span
                aria-hidden
                className={cn(
                  'absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 md:left-[calc(50%+16px)] md:top-[15px] md:h-0.5 md:w-[calc(100%-32px)]',
                  completado && i < indiceActual ? 'bg-emerald-600' : 'bg-border',
                )}
              />
            )}
            <span className={cn('relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', color)}>
              {esRechazo ? <X className="h-4 w-4" /> : completado ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            </span>
            <div className="min-w-0 md:mt-2 md:px-1">
              <p className={cn('text-sm font-semibold', esRechazo ? 'text-destructive' : 'text-foreground')}>
                {esRechazo ? 'Pago rechazado' : paso.titulo}
              </p>
              {esRechazo && eventoRechazo ? (
                <>
                  <p className="text-xs text-muted-foreground">{formatearFechaHora(eventoRechazo.fecha)}</p>
                  {eventoRechazo.comentario && <p className="text-xs text-destructive">{eventoRechazo.comentario}</p>}
                </>
              ) : completado && evento ? (
                <>
                  <p className="text-xs text-muted-foreground">{formatearFechaHora(evento.fecha)}</p>
                  {evento.usuarios?.nombre && <p className="text-xs text-muted-foreground">{evento.usuarios.nombre}</p>}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">{enCurso ? 'En curso' : 'Pendiente'}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
