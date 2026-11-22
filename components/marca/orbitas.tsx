import { cn } from '@/lib/utils'

/**
 * ASTRO Órbitas (Manual de Marca, Recursos): cinco circunferencias concéntricas separadas
 * por la misma distancia, con grosores que crecen en números impares (1, 3, 5, 7 y 9 px desde el centro).
 * Recurso decorativo: siempre círculos perfectos, sin deformar ni mezclar colores.
 */
export function Orbitas({ className, color = '#F6A637', tamano = 420 }: { className?: string; color?: string; tamano?: number }) {
  const centro = tamano / 2
  const paso = tamano / 2 / 6
  return (
    <svg
      aria-hidden="true"
      width={tamano}
      height={tamano}
      viewBox={`0 0 ${tamano} ${tamano}`}
      className={cn('pointer-events-none', className)}
      fill="none"
    >
      {[1, 3, 5, 7, 9].map((grosor, i) => (
        <circle key={grosor} cx={centro} cy={centro} r={paso * (i + 1.5)} stroke={color} strokeWidth={grosor / 2} />
      ))}
    </svg>
  )
}
