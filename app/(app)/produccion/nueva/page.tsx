import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { FormularioNuevaPieza } from '@/components/app/formulario-nueva-pieza'

export const metadata = { title: 'Nuevo artículo — ASTRO' }

export default async function NuevaPiezaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'produccion' && usuario.rol !== 'admin') redirect('/inicio')

  const { error } = await searchParams
  const supabase = await createClient()

  const [{ data: categorias }, { data: materiales }, { data: politicas }, { data: parametrosCosteo }, { data: cedis }] =
    await Promise.all([
      supabase.from('categorias').select('id, nombre, grupo').eq('activo', true).order('orden'),
      supabase.from('materiales').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('politicas_margen').select('categoria_id, origen, margen_pct').eq('activo', true),
      supabase.from('parametros').select('clave, valor').in('clave', ['pct_empaque', 'pct_flete_importado']),
      supabase.from('tiendas').select('id, nombre').eq('tipo', 'cedi').eq('activo', true).order('nombre'),
    ])

  const pctEmpaque = Number(parametrosCosteo?.find((p) => p.clave === 'pct_empaque')?.valor ?? 0)
  const pctFleteImportado = Number(
    parametrosCosteo?.find((p) => p.clave === 'pct_flete_importado')?.valor ?? 0,
  )

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <Link
          href="/produccion"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a producción
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Nuevo artículo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Completa la ficha técnica. Puedes guardarlo como borrador o publicarlo directo al CEDI.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <FormularioNuevaPieza
        categorias={categorias ?? []}
        materiales={materiales ?? []}
        politicas={politicas ?? []}
        pctEmpaque={pctEmpaque}
        pctFleteImportado={pctFleteImportado}
        cedis={cedis ?? []}
      />
    </main>
  )
}
