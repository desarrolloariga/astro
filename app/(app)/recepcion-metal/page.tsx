import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Scale, PlusCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearFechaHora, formatearNumero } from '@/lib/formato'
import { EstadoBadge, estadosRecepcionMetal } from '@/components/app/estado-badge'

export const metadata = { title: 'Recepción de oro y plata — ASTRO' }

type Recepcion = {
  id: number
  estado: string
  peso_total_gramos: number
  cantidad_total_piezas: number
  fecha_creacion: string
  proveedores: { nombre: string } | null
}

export default async function RecepcionMetalPage() {
  if (!(await tienePermiso('recepcion_metal', 'ver'))) redirect('/inicio')
  const puedeCrear = await tienePermiso('recepcion_metal', 'crear')

  const supabase = await createClient()
  const { data } = await supabase
    .from('recepciones_metal')
    .select('id, estado, peso_total_gramos, cantidad_total_piezas, fecha_creacion, proveedores ( nombre )')
    .order('fecha_creacion', { ascending: false })
    .limit(50)

  const recepciones = (data ?? []) as unknown as Recepcion[]

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Scale className="h-5 w-5 text-primary" />
            Recepción de oro y plata
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ingreso directo por peso y cantidad — sin pasar por una orden de compra.
          </p>
        </div>
        {puedeCrear && (
          <Link
            href="/recepcion-metal/nueva"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
          >
            <PlusCircle className="h-4 w-4" />
            Nueva recepción
          </Link>
        )}
      </div>

      {recepciones.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Scale className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Todavía no hay recepciones</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Proveedor</th>
                <th className="px-4 py-3 font-semibold text-right">Peso total</th>
                <th className="px-4 py-3 font-semibold text-right">Piezas</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {recepciones.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/recepcion-metal/${r.id}`} className="font-semibold text-primary hover:underline">
                      #{r.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.proveedores?.nombre ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-foreground">{formatearNumero(r.peso_total_gramos)} g</td>
                  <td className="px-4 py-3 text-right text-foreground">{formatearNumero(r.cantidad_total_piezas)}</td>
                  <td className="px-4 py-3">
                    <EstadoBadge estado={r.estado} config={estadosRecepcionMetal} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatearFechaHora(r.fecha_creacion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
