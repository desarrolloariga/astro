import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { FormularioNuevaOrdenCompra } from '@/components/app/formulario-nueva-orden-compra'

export const metadata = { title: 'Nueva orden de compra — ASTRO' }

export default async function NuevaOrdenCompraPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  if (!(await tienePermiso('compras', 'crear'))) redirect('/inicio')

  const { error } = await searchParams
  const supabase = await createClient()
  const [{ data: proveedores }, { data: productos }] = await Promise.all([
    supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('productos').select('id, codigo, nombre, estado').eq('activo', true).order('codigo'),
  ])

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <Link
          href="/compras"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a compras
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Nueva orden de compra</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Completa la cabecera y arma el carrito de productos — la orden se crea con todas sus
          líneas de una vez.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <FormularioNuevaOrdenCompra proveedores={proveedores ?? []} productos={productos ?? []} />
    </main>
  )
}
