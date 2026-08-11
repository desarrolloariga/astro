'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShoppingBag, X } from 'lucide-react'
import { formatearPrecio } from '@/lib/formato'
import { quitarDelCarrito } from '@/app/(publico)/c/[token]/acciones'

type ItemBolsa = {
  producto_id: number
  nombre: string
  precio_venta: number | null
  imagen_principal: string | null
  cantidad: number
}

export function PanelBolsa({
  token,
  items,
  abrirAlInicio,
}: {
  token: string
  items: ItemBolsa[]
  abrirAlInicio?: boolean
}) {
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    if (abrirAlInicio) setAbierto(true)
  }, [abrirAlInicio])

  const subtotal = items.reduce((acc, i) => acc + (i.precio_venta ?? 0) * i.cantidad, 0)
  const totalUnidades = items.reduce((acc, i) => acc + i.cantidad, 0)

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="relative flex h-9 w-9 items-center justify-center rounded-[3px] text-[var(--cat-tinta)] transition-colors hover:bg-[var(--cat-surface)]"
        aria-label="Ver bolsa"
      >
        <ShoppingBag className="h-[18px] w-[18px]" />
        {totalUnidades > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--cat-primario)] px-1 text-[9px] font-medium text-white">
            {totalUnidades}
          </span>
        )}
      </button>

      <div
        onClick={() => setAbierto(false)}
        aria-hidden={!abierto}
        className={`fixed inset-0 z-40 bg-[var(--cat-velo)] transition-opacity duration-300 ${
          abierto ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col bg-[var(--cat-bg)] shadow-[var(--cat-sombra-panel)] transition-transform duration-300 ease-out ${
          abierto ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-6 py-[30px]">
          <h2 className="text-lg text-[var(--cat-tinta)]">Tu bolsa</h2>
          <button onClick={() => setAbierto(false)} aria-label="Cerrar bolsa">
            <X className="h-5 w-5 text-[var(--cat-meta)]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6">
          {items.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-[var(--cat-meta)]">Tu bolsa está vacía.</p>
          ) : (
            <div className="flex flex-col gap-6 pb-6">
              {items.map((item) => (
                <div key={item.producto_id} className="flex gap-3">
                  <div className="h-[100px] w-[84px] shrink-0 overflow-hidden rounded-[4px] border border-[var(--cat-borde)] bg-[var(--cat-hueco)]">
                    {item.imagen_principal && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imagen_principal} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                    <div>
                      <p className="line-clamp-2 text-sm text-[var(--cat-tinta)]">
                        {item.nombre}
                        {item.cantidad > 1 && (
                          <span className="text-[var(--cat-meta)]"> ×{item.cantidad}</span>
                        )}
                      </p>
                      <p className="mt-1 text-[13px] font-medium text-[var(--cat-tinta)]">
                        {item.precio_venta != null ? formatearPrecio(item.precio_venta * item.cantidad) : '—'}
                      </p>
                    </div>
                    <form action={quitarDelCarrito}>
                      <input type="hidden" name="token" value={token} />
                      <input type="hidden" name="producto_id" value={item.producto_id} />
                      <button
                        type="submit"
                        className="w-fit text-[11px] font-medium uppercase tracking-[.06em] text-[var(--cat-meta)] hover:text-[var(--cat-primario)]"
                      >
                        Quitar
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-[var(--cat-borde)] bg-[var(--cat-surface)] px-6 py-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-[.06em] text-[var(--cat-meta)]">
                Subtotal
              </span>
              <span className="text-[23px] text-[var(--cat-tinta)]">{formatearPrecio(subtotal)}</span>
            </div>
            <Link
              href={`/c/${token}/checkout`}
              className="block w-full rounded-[3px] bg-[var(--cat-primario)] py-4 text-center text-[11px] font-medium uppercase tracking-[.08em] text-white transition-opacity hover:opacity-90"
            >
              Finalizar compra
            </Link>
          </div>
        )}
      </aside>
    </>
  )
}
