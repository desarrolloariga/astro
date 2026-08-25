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

  const [{ data: categorias }, { data: materiales }, { data: proveedores }, { data: parametrosPrecio }, { data: cedis }] =
    await Promise.all([
      supabase.from('categorias').select('id, nombre, grupo').eq('activo', true).order('orden'),
      supabase.from('materiales').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
      supabase
        .from('parametros_precio')
        .select('clave, valor_pct')
        .is('categoria_id', null)
        .is('producto_id', null)
        .eq('activo', true),
      supabase.from('tiendas').select('id, nombre').eq('tipo', 'cedi').eq('activo', true).order('nombre'),
    ])

  const factorDe = (clave: string) => Number(parametrosPrecio?.find((p) => p.clave === clave)?.valor_pct ?? 0)
  const factores = {
    factor_importacion: factorDe('factor_importacion'),
    factor_margen_local: factorDe('factor_margen_local'),
    factor_envio: factorDe('factor_envio'),
    factor_empaque: factorDe('factor_empaque'),
    factor_impuesto: factorDe('factor_impuesto'),
    factor_comision_embajador: factorDe('factor_comision_embajador'),
  }

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
        proveedores={proveedores ?? []}
        factores={factores}
        cedis={cedis ?? []}
      />
    </main>
  )
}
