import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { CarritoTraslado } from '@/components/app/carrito-traslado'

export const metadata = { title: 'Nuevo traslado — ASTRO' }

export default async function NuevoTrasladoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  if (!(await tienePermiso('inventario', 'transferir'))) redirect('/inicio')

  const { error } = await searchParams
  const supabase = await createClient()

  const [{ data: bodegas }, { data: productos }] = await Promise.all([
    supabase.from('tiendas').select('id, nombre').eq('tipo', 'cedi').eq('activo', true).order('nombre'),
    supabase
      .from('productos')
      .select('id, codigo, nombre, estado, modo_inventario, tienda_id')
      .eq('activo', true)
      .in('estado', ['disponible_cedi'])
      .order('codigo'),
  ])

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <Link
          href="/traslados"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a traslados
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Nuevo traslado</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Elige la bodega de origen y destino, y arma la lista de artículos a mover.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {(bodegas?.length ?? 0) < 2 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <p className="text-sm font-semibold text-foreground">Necesitas al menos 2 bodegas activas</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Crea otra bodega (tipo CEDI) desde{' '}
            <Link href="/admin/tiendas" className="text-primary hover:underline">
              Tiendas y bodegas
            </Link>{' '}
            para poder trasladar inventario entre ellas.
          </p>
        </div>
      ) : (
        <CarritoTraslado bodegas={bodegas ?? []} productos={productos ?? []} />
      )}
    </main>
  )
}
