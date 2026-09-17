import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, CheckCircle2, AlertCircle, SlidersHorizontal, Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { actualizarParametrosArticulo } from './acciones'

export const metadata = { title: 'Parámetros de artículos — ASTRO' }

type Producto = {
  id: number
  codigo: string
  nombre: string
  punto_reorden: number | null
  dias_sin_venta_descuento: number | null
  descuento_automatico_pct: number | null
  precio_descuento: number | null
  categorias: { nombre: string } | null
}

const clasesInputCompacto =
  'w-24 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none'

export default async function ParametrosArticulosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; buscar?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'produccion' && usuario.rol !== 'admin') redirect('/inicio')

  const { ok, error, buscar } = await searchParams
  const supabase = await createClient()

  let consulta = supabase
    .from('productos')
    .select(
      'id, codigo, nombre, punto_reorden, dias_sin_venta_descuento, descuento_automatico_pct, precio_descuento, categorias ( nombre )',
    )
    .eq('activo', true)
    .in('estado', ['en_produccion', 'disponible_cedi', 'disponible_tienda'])
    .order('nombre')

  const buscarTexto = (buscar ?? '').trim()
  if (buscarTexto) {
    const seguro = buscarTexto.replace(/[,()]/g, ' ').trim()
    consulta = consulta.or(`nombre.ilike.%${seguro}%,codigo.ilike.%${seguro}%`)
  }

  const { data } = await consulta.limit(200)
  const productos = (data ?? []) as unknown as Producto[]

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <Link
          href="/produccion"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Artículos
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <SlidersHorizontal className="h-5 w-5 text-primary" />
          Parámetros de artículos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Punto de reorden y regla de descuento automático por días sin venta, artículo por
          artículo. El descuento automático corre solo una vez al día — indica días sin venta y %
          de descuento juntos, o deja ambos vacíos para desactivar la regla.
        </p>
      </div>

      {ok && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{ok}</span>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form className="flex flex-wrap items-center gap-2">
        <input
          name="buscar"
          defaultValue={buscarTexto}
          placeholder="Buscar por nombre o código…"
          className="min-w-48 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          Buscar
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Artículo</th>
              <th className="px-4 py-3 font-semibold">Categoría</th>
              <th className="px-4 py-3 font-semibold">Parámetros</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5">
                  <p className="font-semibold text-foreground">{p.nombre}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {p.codigo}
                    {p.precio_descuento != null && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                        <Tag className="h-2.5 w-2.5" />
                        Con descuento activo
                      </span>
                    )}
                  </p>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{p.categorias?.nombre ?? '—'}</td>
                <td className="px-4 py-2.5">
                  <form action={actualizarParametrosArticulo} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="producto_id" value={p.id} />
                    <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                      Punto de reorden
                      <input
                        name="punto_reorden"
                        type="number"
                        step="1"
                        min="0"
                        defaultValue={p.punto_reorden ?? ''}
                        className={clasesInputCompacto}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                      Días sin venta
                      <input
                        name="dias_sin_venta_descuento"
                        type="number"
                        step="1"
                        min="1"
                        placeholder="ej. 90"
                        defaultValue={p.dias_sin_venta_descuento ?? ''}
                        className={clasesInputCompacto}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                      % descuento auto.
                      <input
                        name="descuento_automatico_pct"
                        type="number"
                        step="0.01"
                        min="0.01"
                        max="99.99"
                        placeholder="ej. 30"
                        defaultValue={p.descuento_automatico_pct ?? ''}
                        className={clasesInputCompacto}
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
                    >
                      Guardar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {productos.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                  Sin artículos para esta búsqueda
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
