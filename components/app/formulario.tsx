import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Clase compartida para input/select/textarea — un solo lugar para pulir el look de todos los formularios. */
export const clasesInput =
  'w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground/70 hover:border-foreground/25 focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring/10 disabled:cursor-not-allowed disabled:opacity-50'

export function Campo({
  label,
  required,
  helpText,
  htmlFor,
  className,
  children,
}: {
  label: string
  required?: boolean
  helpText?: string
  htmlFor?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label htmlFor={htmlFor} className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      {children}
      {helpText && <span className="text-xs leading-snug text-muted-foreground">{helpText}</span>}
    </label>
  )
}

/** Tarjeta de sección con insignia de ícono — el vocabulario visual repetido en cada bloque de un formulario. */
export function SeccionFormulario({
  icon: Icon,
  titulo,
  descripcion,
  className,
  children,
}: {
  icon: LucideIcon
  titulo: string
  descripcion?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn('rounded-xl border border-border bg-card p-5 shadow-xs', className)}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{titulo}</h2>
      </div>
      {descripcion && <p className="mt-1.5 pl-9.5 text-xs text-muted-foreground">{descripcion}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

const clasesBotonBase =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold shadow-xs transition-all active:translate-y-px disabled:pointer-events-none disabled:opacity-50'

export function BotonPrimario({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      className={cn(
        clasesBotonBase,
        'bg-primary px-5 py-2.5 text-primary-foreground hover:opacity-90',
        className,
      )}
      {...props}
    />
  )
}

export function BotonSecundario({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        clasesBotonBase,
        'border border-border bg-card px-5 py-2.5 text-foreground hover:bg-secondary',
        className,
      )}
      {...props}
    />
  )
}

export function BotonPeligro({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      className={cn(
        clasesBotonBase,
        'border border-destructive/30 bg-destructive/5 px-5 py-2.5 text-destructive hover:bg-destructive/10',
        className,
      )}
      {...props}
    />
  )
}
