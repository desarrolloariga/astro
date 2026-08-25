import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Ship, PlusCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearPrecio, formatearFecha } from '@/lib/formato'
import { EstadoBadge, estadosImportacion } from '@/components/app/estado-badge'

export const metadata = { title: 'Importaciones — ASTRO' }

type Importacion = {
  id: number
  estado: string
  costo_nacionalizado_total: number | null
  fob_total: number
  fecha_creacion: string
  proveedores: { nombre: string } | null
}

export default async function ImportacionesPage() {
  if (!(await tienePermiso('importaciones', 'ver'))) redirect('/inicio')
  const puedeCrear = await tienePermiso('importaciones', 'crear')

  const supabase = await createClient()
  const { data: importaciones } = await supabase
    .from('importaciones')
    .select('id, estado, costo_nacionalizado_total, fob_total, fecha_creacion, proveedores ( nombre )')
    .order('fecha_creacion', { ascending: false })

  const lista = (importaciones ?? []) as unknown as Importacion[]

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Importaciones</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Embarques internacionales, desde borrador hasta nacionalización y pago.
          </p>
        </div>
        {puedeCrear && (
          <Link
            href="/importaciones/nueva"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
          >
            <PlusCircle className="h-4 w-4" />
            Nueva importación
          </Link>
        )}
      </div>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Ship className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Aún no hay importaciones registradas</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {lista.map((i) => (
            <Link
              key={i.id}
              href={`/importaciones/${i.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/40"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Embarque #{i.id} · {i.proveedores?.nombre ?? '—'}
                </p>
                <p className="text-xs text-muted-foreground">{formatearFecha(i.fecha_creacion)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-foreground">
                  {formatearPrecio(i.costo_nacionalizado_total ?? i.fob_total)}
                </span>
                <EstadoBadge estado={i.estado} config={estadosImportacion} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
