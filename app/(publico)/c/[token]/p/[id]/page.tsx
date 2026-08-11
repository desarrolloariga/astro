import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Gem } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerCarrito } from '@/lib/publico/carrito'
import { formatearPrecio } from '@/lib/formato'
import { BotonBolsa } from '@/components/catalogo/tarjeta-pieza'
import type { PiezaCatalogo } from '@/components/catalogo/tipos'
import '@/app/catalogo-tema.css'

export const metadata = { title: 'Pieza — ASTRO' }

export default async function PiezaPublicaPage({
  params,
}: {
  params: Promise<{ token: string; id: string }>
}) {
  const { token, id } = await params
  const supabase = await createClient()

  const [{ data: infoData }, { data: piezasData }, { items: carrito }] = await Promise.all([
    supabase.rpc('fn_link_info', { p_token: token }),
    supabase.rpc('fn_catalogo_por_token', { p_token: token }),
    obtenerCarrito(token),
  ])

  const info = infoData?.[0] as { vendedor_nombre: string; vigente: boolean } | undefined

  if (!info?.vigente) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col items-center gap-3 px-4 py-20 text-center">
        <Gem className="h-12 w-12 text-muted-foreground" strokeWidth={1.2} />
        <h1 className="text-lg font-bold text-foreground">Este enlace ya no está disponible</h1>
      </main>
    )
  }

  const piezas = (piezasData ?? []) as PiezaCatalogo[]
  const pieza = piezas.find((p) => String(p.id) === id)

  if (!pieza) notFound()

  const enCarrito = carrito.some((c) => c.producto_id === pieza.id)
  const imagenes = (pieza.imagenes ?? []).slice().sort((a, b) => a.orden - b.orden)

  const metadatos =
    [pieza.material, pieza.kilataje].filter(Boolean).join(' · ') || pieza.codigo

  return (
    <div className="catalogo-tema">
      <main className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 py-8 md:px-10">
        <Link
          href={`/c/${token}`}
          className="inline-flex w-fit items-center gap-1.5 text-[12px] font-medium uppercase tracking-[.06em] text-[var(--cat-meta)] hover:text-[var(--cat-primario)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al catálogo
        </Link>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <div className="aspect-[4/5] overflow-hidden rounded-[4px] border border-[var(--cat-borde)] bg-[var(--cat-hueco)]">
              {pieza.imagen_principal ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pieza.imagen_principal}
                  alt={pieza.nombre}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[var(--cat-hueco-texto)]">
                  <Gem className="h-14 w-14" strokeWidth={1.1} />
                </div>
              )}
            </div>
            {imagenes.length > 1 && (
              <div className="grid grid-cols-5 gap-2">
                {imagenes.map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={img.url}
                    src={img.url}
                    alt=""
                    className="aspect-square rounded-[3px] border border-[var(--cat-borde)] object-cover"
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-2xl text-[var(--cat-tinta)]">{pieza.nombre}</h1>
              <p className="mt-1 text-[10.5px] tracking-[.04em] text-[var(--cat-meta)]">{metadatos}</p>
            </div>

            <p className="text-[22px] font-medium text-[var(--cat-tinta)]">
              {pieza.precio_venta != null ? formatearPrecio(pieza.precio_venta) : '—'}
            </p>
            {pieza.modo_inventario === 'por_cantidad' && (
              <p className="text-[12px] text-[var(--cat-meta)]">
                {pieza.stock_disponible ?? 0} unidades disponibles
              </p>
            )}

            {pieza.descripcion && (
              <p className="text-[13px] leading-relaxed text-[var(--cat-texto)]">{pieza.descripcion}</p>
            )}

            {pieza.piedras && (
              <dl className="grid grid-cols-2 gap-y-1 rounded-[4px] border border-[var(--cat-borde)] bg-[var(--cat-surface)] p-4 text-[13px]">
                <dt className="text-[var(--cat-meta)]">Piedras</dt>
                <dd className="text-right font-medium text-[var(--cat-tinta)]">{pieza.piedras}</dd>
              </dl>
            )}

            <div className="max-w-xs">
              <BotonBolsa pieza={pieza} token={token} enCarrito={enCarrito} />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
