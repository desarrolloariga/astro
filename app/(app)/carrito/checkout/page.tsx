import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { formatearPrecio } from '@/lib/formato'
import { FormularioEnvioPago } from '@/components/app/formulario-envio-pago'
import type { ItemCarrito } from '@/lib/publico/carrito'
import { confirmarMiCarrito } from '../acciones'

export const metadata = { title: 'Realizar compra — ASTRO' }

export default async function CheckoutBackofficePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  if (!(await tienePermiso('catalogo', 'ver'))) redirect('/inicio')
  const { error } = await searchParams
  const usuario = await obtenerUsuarioActual()

  const supabase = await createClient()
  const { data } = await supabase.rpc('fn_ver_mi_carrito')
  const items = (data ?? []) as ItemCarrito[]
  if (items.length === 0) redirect('/carrito')

  const total = items.reduce((acc, i) => acc + (i.precio_venta ?? 0) * i.cantidad, 0)

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6">
      <Link
        href="/carrito"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al carrito
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Realizar compra</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {items.length} artículo{items.length !== 1 ? 's' : ''} · total {formatearPrecio(total)}
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <FormularioEnvioPago
        action={confirmarMiCarrito}
        total={total}
        permitirCompraPropia
        nombreUsuario={usuario.nombre}
      />
    </main>
  )
}
