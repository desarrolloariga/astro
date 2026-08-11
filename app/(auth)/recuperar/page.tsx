import Link from 'next/link'
import { AlertCircle, MailCheck } from 'lucide-react'
import { enviarRecuperacion } from '../acciones'

export const metadata = { title: 'Recuperar contraseña — ASTRO' }

export default async function RecuperarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; enviado?: string }>
}) {
  const { error, enviado } = await searchParams

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h1 className="text-lg font-bold tracking-tight text-foreground">Recuperar contraseña</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Te enviaremos un enlace a tu correo para restablecerla.
      </p>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {enviado ? (
        <div className="mt-5 flex flex-col items-center gap-3 py-4 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <MailCheck className="h-6 w-6" />
          </span>
          <p className="text-sm text-foreground">
            Si el correo está registrado, recibirás un enlace de recuperación en unos minutos.
          </p>
        </div>
      ) : (
        <form action={enviarRecuperacion} className="mt-5 flex flex-col gap-4">
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

          <button
            type="submit"
            className="mt-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
          >
            Enviar enlace
          </button>
        </form>
      )}

      <div className="mt-4 text-center">
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          Volver a iniciar sesión
        </Link>
      </div>
    </div>
  )
}
