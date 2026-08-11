import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { iniciarSesion } from '../acciones'

export const metadata = { title: 'Iniciar sesión — ASTRO' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; destino?: string }>
}) {
  const { error, destino } = await searchParams

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h1 className="text-lg font-bold tracking-tight text-foreground">Iniciar sesión</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Accede con las credenciales asignadas por ASTRO.
      </p>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form action={iniciarSesion} className="mt-5 flex flex-col gap-4">
        <input type="hidden" name="destino" value={destino ?? ''} />

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Correo electrónico</span>
          <input
            type="email"
            name="correo"
            required
            autoComplete="email"
            placeholder="tucorreo@ejemplo.com"
            className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Contraseña</span>
          <input
            type="password"
            name="contrasena"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
          />
        </label>

        <button
          type="submit"
          className="mt-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          Entrar
        </button>
      </form>

      <div className="mt-4 text-center">
        <Link href="/recuperar" className="text-sm font-medium text-primary hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
    </div>
  )
}
