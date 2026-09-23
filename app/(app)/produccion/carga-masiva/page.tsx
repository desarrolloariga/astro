import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, ArrowLeft, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { CargadorMasivo } from '@/components/app/cargador-masivo'

export const metadata = { title: 'Carga masiva — ASTRO' }

export default async function CargaMasivaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'produccion' && usuario.rol !== 'admin') redirect('/inicio')

  const { error } = await searchParams
  const supabase = await createClient()

  const [{ data: categorias }, { data: materiales }, { data: proveedores }, { data: productosExistentes }] =
    await Promise.all([
      supabase.from('categorias').select('id, nombre').eq('activo', true).order('orden'),
      supabase.from('materiales').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('productos').select('id, codigo, codigo_barras, nombre, modo_inventario, estado').eq('activo', true),
    ])

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/produccion"
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a producción
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Carga masiva de artículos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Descarga la plantilla, complétala y súbela. Los artículos con costo se publican
            directo al CEDI — las fotos se agregan después desde Traslados.
          </p>
        </div>
        <Link
          href="/produccion/carga-masiva/historial"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
        >
          <History className="h-4 w-4" />
          Historial de compras
        </Link>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <CargadorMasivo
        categorias={categorias ?? []}
        materiales={materiales ?? []}
        proveedores={proveedores ?? []}
        productosExistentes={productosExistentes ?? []}
      />
    </main>
  )
}
