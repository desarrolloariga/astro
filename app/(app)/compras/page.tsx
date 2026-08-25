import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ShoppingCart, PlusCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearPrecio, formatearFecha } from '@/lib/formato'
import { EstadoBadge, estadosCompra } from '@/components/app/estado-badge'

export const metadata = { title: 'Compras — ASTRO' }

type Orden = {
  id: number
  estado: string
  total: number
  fecha_creacion: string
  proveedores: { nombre: string } | null
}

export default async function ComprasPage() {
  if (!(await tienePermiso('compras', 'ver'))) redirect('/inicio')
  const puedeCrear = await tienePermiso('compras', 'crear')

  const supabase = await createClient()
  const { data: ordenes } = await supabase
    .from('ordenes_compra')
    .select('id, estado, total, fecha_creacion, proveedores ( nombre )')
    .order('fecha_creacion', { ascending: false })

  const lista = (ordenes ?? []) as unknown as Orden[]

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Órdenes de compra</h1>
          <p className="mt-1 text-sm text-muted-foreground">Compras locales, desde borrador hasta pago.</p>
        </div>
        {puedeCrear && (
          <Link
            href="/compras/nueva"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
          >
            <PlusCircle className="h-4 w-4" />
            Nueva orden
          </Link>
        )}
      </div>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <ShoppingCart className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Aún no hay órdenes de compra</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {lista.map((o) => (
            <Link
              key={o.id}
              href={`/compras/${o.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/40"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Orden #{o.id} · {o.proveedores?.nombre ?? '—'}
                </p>
                <p className="text-xs text-muted-foreground">{formatearFecha(o.fecha_creacion)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-foreground">{formatearPrecio(o.total)}</span>
                <EstadoBadge estado={o.estado} config={estadosCompra} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
