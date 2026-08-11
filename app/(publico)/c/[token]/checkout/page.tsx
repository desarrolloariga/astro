import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, AlertCircle, Gem, ImageOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatearPrecio } from '@/lib/formato'
import { Countdown } from '@/components/publico/countdown'
import { confirmarCompra } from '../acciones'

export const metadata = { title: 'Finalizar compra — ASTRO' }

type ItemCarrito = {
  producto_id: number
  codigo: string
  nombre: string
  precio_venta: number | null
  imagen_principal: string | null
  segundos_restantes: number
  cantidad: number
}

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { token } = await params
  const { error } = await searchParams

  const cookieStore = await cookies()
  const carritoToken = cookieStore.get(`ariga_carrito_${token}`)?.value

  if (!carritoToken) redirect(`/c/${token}`)

  const supabase = await createClient()
  const { data } = await supabase.rpc('fn_ver_carrito', { p_carrito_token: carritoToken })
  const items = (data ?? []) as ItemCarrito[]

  if (items.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col items-center gap-3 px-4 py-20 text-center">
        <Gem className="h-12 w-12 text-muted-foreground" strokeWidth={1.2} />
        <h1 className="text-lg font-bold text-foreground">Tu carrito está vacío</h1>
        <Link href={`/c/${token}`} className="text-sm font-semibold text-primary hover:underline">
          Volver al catálogo
        </Link>
      </main>
    )
  }

  const total = items.reduce((acc, i) => acc + (i.precio_venta ?? 0) * i.cantidad, 0)

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
      <Link
        href={`/c/${token}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Seguir viendo el catálogo
      </Link>

      <h1 className="text-2xl font-bold tracking-tight text-foreground">Finalizar compra</h1>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        {items.map((item) => (
          <div key={item.producto_id} className="flex items-center gap-3">
            {item.imagen_principal ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.imagen_principal}
                alt=""
                className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover"
              />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                <ImageOff className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {item.nombre}
                {item.cantidad > 1 && <span className="text-muted-foreground"> ×{item.cantidad}</span>}
              </p>
              <p className="text-xs">
                <Countdown segundosIniciales={item.segundos_restantes} />
              </p>
            </div>
            <span className="shrink-0 text-sm font-bold text-foreground">
              {item.precio_venta != null ? formatearPrecio(item.precio_venta * item.cantidad) : '—'}
            </span>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm font-semibold text-foreground">Total</span>
          <span className="text-lg font-bold text-foreground">{formatearPrecio(total)}</span>
        </div>
      </div>

      <form action={confirmarCompra} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <input type="hidden" name="token" value={token} />
        <h2 className="text-sm font-bold text-foreground">Tus datos</h2>

        <input
          name="nombre"
          required
          placeholder="Nombre completo"
          className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
        />
        <input
          name="telefono"
          placeholder="Teléfono"
          className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
        />
        <input
          name="correo"
          type="email"
          placeholder="Correo (opcional)"
          className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
        />
        <input
          name="direccion"
          placeholder="Dirección de entrega (opcional)"
          className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
        />

        <h2 className="mt-2 text-sm font-bold text-foreground">Forma de pago</h2>
        <p className="text-xs text-muted-foreground">
          Por ahora aceptamos transferencia o depósito. Tras confirmar tu pedido, sube tu
          comprobante o compártelo con quien te atendió.
        </p>
        <select
          name="metodo_pago"
          required
          defaultValue=""
          className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
        >
          <option value="" disabled>
            Elige un método
          </option>
          <option value="transferencia">Transferencia</option>
          <option value="deposito">Depósito</option>
        </select>
        <input
          name="referencia"
          placeholder="Referencia de pago (opcional)"
          className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
        />

        <button
          type="submit"
          className="mt-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          Confirmar pedido
        </button>
      </form>
    </main>
  )
}
