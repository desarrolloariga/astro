'use client'

import { useFormStatus } from 'react-dom'
import { cn } from '@/lib/utils'

/** Botón de envío que pide confirmación antes de mandar el formulario. */
export function BotonConfirmar({
  mensaje,
  children,
  className,
  disabled,
  name,
  value,
}: {
  mensaje: string
  children: React.ReactNode
  className?: string
  disabled?: boolean
  name?: string
  value?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={disabled || pending}
      onClick={(e) => {
        if (!window.confirm(mensaje)) e.preventDefault()
      }}
      className={cn('disabled:cursor-not-allowed disabled:opacity-50', className)}
    >
      {pending ? 'Procesando…' : children}
    </button>
  )
}
