import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { FormularioRecepcionMetal } from '@/components/app/formulario-recepcion-metal'

export const metadata = { title: 'Nueva recepción de oro y plata — ASTRO' }

export default async function NuevaRecepcionMetalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  if (!(await tienePermiso('recepcion_metal', 'crear'))) redirect('/inicio')

  const { error } = await searchParams
  const supabase = await createClient()

  const [{ data: proveedores }, { data: productos }, { data: categorias }] = await Promise.all([
    supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
    supabase
      .from('productos')
      .select('id, codigo, nombre, estado')
      .eq('activo', true)
      .in('estado', ['disponible_cedi', 'disponible_tienda'])
      .order('codigo'),
    supabase.from('categorias').select('id, nombre').eq('activo', true).order('orden'),
  ])

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <Link
          href="/recepcion-metal"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a recepciones
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Nueva recepción de oro y plata</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Declara el peso y cantidad total recibidos, luego desglosa en artículos — existentes o
          nuevos. La suma de las líneas debe cuadrar exacto antes de poder confirmar.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <FormularioRecepcionMetal
        proveedores={proveedores ?? []}
        productos={productos ?? []}
        categorias={categorias ?? []}
      />
    </main>
  )
}
