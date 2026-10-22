import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, AlertCircle, Gem, ImageOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatearPrecio } from '@/lib/formato'
import { Countdown } from '@/components/publico/countdown'
import { FormularioEnvioPago } from '@/components/app/formulario-envio-pago'
import { cargarEntregaCheckout } from '@/lib/entrega-servidor'
import { confirmarCompra } from '../acciones'
import { obtenerPoliticaEnvio } from '@/lib/envio-servidor'

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
  // Carrito y política de envío no dependen entre sí: misma ola.
  const [{ data }, politicaEnvio] = await Promise.all([
    supabase.rpc('fn_ver_carrito', { p_carrito_token: carritoToken }),
    obtenerPoliticaEnvio(supabase),
  ])
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
  const entrega = await cargarEntregaCheckout(supabase, items.map((i) => i.producto_id))

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6">
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

      <FormularioEnvioPago action={confirmarCompra} camposOcultos={{ token }} total={total} politicaEnvio={politicaEnvio} entrega={entrega} />
    </main>
  )
}
