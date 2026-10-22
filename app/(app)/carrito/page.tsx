import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ShoppingCart, ImageOff, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearPrecio } from '@/lib/formato'
import { Countdown } from '@/components/publico/countdown'
import type { ItemCarrito } from '@/lib/publico/carrito'
import { quitarDeMiCarrito } from './acciones'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { obtenerModoCompra, obtenerPreciosEmbajador } from '@/lib/modo-compra'
import { SelectorModoCompra } from '@/components/app/selector-modo-compra'

export const metadata = { title: 'Carrito — ASTRO' }

export default async function CarritoPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const supabase = await createClient()
  // El carrito no depende del permiso: viaja junto con el contexto de sesión.
  const [permitido, { data }] = await Promise.all([tienePermiso('catalogo', 'ver'), supabase.rpc('fn_ver_mi_carrito')])
  if (!permitido) redirect('/inicio')
  const { ok, error } = await searchParams

  const items = (data ?? []) as ItemCarrito[]
  const usuario = await obtenerUsuarioActual()
  const esEmbajador = usuario.rol === 'embajador'
  const modo = await obtenerModoCompra()
  // Embajador comprando para sí: se cobra su precio de embajador.
  const preciosEmbajador =
    esEmbajador && modo === 'mi' ? await obtenerPreciosEmbajador(supabase, items.map((i) => i.producto_id)) : new Map<number, number>()
  const precioDe = (i: ItemCarrito) => preciosEmbajador.get(i.producto_id) ?? i.precio_venta ?? 0
  const total = items.reduce((acc, i) => acc + precioDe(i) * i.cantidad, 0)

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6">
      <Link
        href="/catalogo"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Seguir en el catálogo
      </Link>
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
        <ShoppingCart className="h-5 w-5 text-primary" />
        Carrito
      </h1>
      <SelectorModoCompra modo={modo} volver="/carrito" esEmbajador={esEmbajador} />

      {ok && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{ok}</span>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <ShoppingCart className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Tu carrito está vacío</p>
          <Link href="/catalogo" className="text-sm font-semibold text-primary hover:underline">
            Ir al catálogo
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            {items.map((item) => (
              <div key={item.producto_id} className="flex items-center gap-3">
                {item.imagen_principal ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imagen_principal}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                    <ImageOff className="h-4 w-4" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {item.nombre}
                    {item.cantidad > 1 && <span className="text-muted-foreground"> ×{item.cantidad}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.codigo}</p>
                  <p className="text-xs">
                    <Countdown segundosIniciales={item.segundos_restantes} />
                  </p>
                </div>
                <span className="flex shrink-0 flex-col items-end">
                  {preciosEmbajador.has(item.producto_id) && item.precio_venta != null && (
                    <span className="text-xs text-muted-foreground line-through">
                      {formatearPrecio(item.precio_venta * item.cantidad)}
                    </span>
                  )}
                  <span className="text-sm font-bold text-foreground">
                    {item.precio_venta != null ? formatearPrecio(precioDe(item) * item.cantidad) : '—'}
                  </span>
                </span>
                <form action={quitarDeMiCarrito}>
                  <input type="hidden" name="producto_id" value={item.producto_id} />
                  <button type="submit" className="text-xs font-semibold text-muted-foreground hover:text-destructive">
                    Quitar
                  </button>
                </form>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm font-semibold text-foreground">Total</span>
              <span className="text-lg font-bold text-foreground">{formatearPrecio(total)}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Las piezas quedan reservadas por tiempo limitado mientras completas la compra.
          </p>
          <Link
            href="/carrito/checkout"
            className="rounded-lg bg-primary py-3 text-center text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Realizar compra
          </Link>
        </>
      )}
    </main>
  )
}
