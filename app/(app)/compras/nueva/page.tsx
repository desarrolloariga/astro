import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { crearOrdenCompra } from '../acciones'

export const metadata = { title: 'Nueva orden de compra — ASTRO' }

const clasesCampo =
  'rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none'

export default async function NuevaOrdenCompraPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  if (!(await tienePermiso('compras', 'crear'))) redirect('/inicio')

  const { error } = await searchParams
  const supabase = await createClient()
  const { data: proveedores } = await supabase
    .from('proveedores')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <Link
          href="/compras"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a compras
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Nueva orden de compra</h1>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form action={crearOrdenCompra} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Proveedor *</span>
          <select name="proveedor_id" required defaultValue="" className={clasesCampo}>
            <option value="" disabled>
              Selecciona…
            </option>
            {(proveedores ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Notas</span>
          <textarea name="notas" rows={3} className={clasesCampo} />
        </label>
        <button
          type="submit"
          className="w-fit rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          Crear orden
        </button>
      </form>
    </main>
  )
}
