'use client'

import type { ReactNode } from 'react'

export function FormularioConConfirmacion({
  action,
  mensaje,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>
  mensaje: string
  className?: string
  children: ReactNode
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        if (!window.confirm(mensaje)) e.preventDefault()
      }}
    >
      {children}
    </form>
  )
}
