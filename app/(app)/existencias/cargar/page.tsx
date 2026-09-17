import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { CargadorExistencias } from '@/components/app/cargador-existencias'

export const metadata = { title: 'Cargar inventario — ASTRO' }

export default async function CargarExistenciasPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; aviso?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'produccion' && usuario.rol !== 'admin') redirect('/inicio')

  const { ok, error, aviso } = await searchParams
  const supabase = await createClient()

  const { data: productosExistentes } = await supabase
    .from('productos')
    .select('id, codigo, nombre, modo_inventario, estado')
    .eq('activo', true)

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <Link
          href="/existencias"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Existencias
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Cargar inventario</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sube un Excel con la referencia y la cantidad a sumar. Solo suma inventario a artículos
          que ya existen — no crea artículos nuevos ni toca costos o precios.
        </p>
      </div>

      {ok && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{ok}</span>
        </div>
      )}
      {(error || aviso) && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error || aviso}</span>
        </div>
      )}

      <CargadorExistencias productosExistentes={productosExistentes ?? []} />
    </main>
  )
}
