import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { AlertCircle, ArrowLeft, CheckCircle2, ImageOff, X, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { Campo, BotonPrimario, clasesInput } from '@/components/app/formulario'
import { agregarFotosPieza, eliminarFotoPieza } from '@/app/(app)/produccion/acciones'
import { actualizarFichaCedi } from './acciones'

export const metadata = { title: 'Editar artículo — CEDI — ASTRO' }

type Imagen = { id: number; url: string; orden: number; es_principal: boolean }
type Producto = {
  id: number
  codigo: string
  nombre: string
  descripcion: string | null
  referencia_proveedor: string | null
  estado: string
}

export default async function EditarArticuloCediPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'produccion' && usuario.rol !== 'admin') redirect('/inicio')

  const { id } = await params
  const { ok, error } = await searchParams
  const supabase = await createClient()

  const { data: pieza } = await supabase
    .from('productos')
    .select('id, codigo, nombre, descripcion, referencia_proveedor, estado')
    .eq('id', id)
    .maybeSingle()

  if (!pieza) notFound()
  const producto = pieza as Producto

  const { data: imagenesData } = await supabase
    .from('producto_imagenes')
    .select('id, url, orden, es_principal')
    .eq('producto_id', id)
    .order('orden')

  const imagenes = (imagenesData ?? []) as Imagen[]

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <Link
          href="/existencias"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a CEDI
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <Pencil className="h-5 w-5 text-primary" />
          Editar {producto.nombre}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{producto.codigo}</p>
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

      <form action={actualizarFichaCedi} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <input type="hidden" name="producto_id" value={producto.id} />
        <Campo label="Nombre" required>
          <input name="nombre" defaultValue={producto.nombre} required className={clasesInput} />
        </Campo>
        <Campo label="Descripción">
          <textarea
            name="descripcion"
            defaultValue={producto.descripcion ?? ''}
            rows={3}
            className={clasesInput}
          />
        </Campo>
        <Campo label="Referencia del proveedor" helpText="Código/SKU que el proveedor usa para este artículo.">
          <input
            name="referencia_proveedor"
            defaultValue={producto.referencia_proveedor ?? ''}
            className={clasesInput}
          />
        </Campo>
        <div>
          <BotonPrimario>Guardar cambios</BotonPrimario>
        </div>
      </form>

      {imagenes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <ImageOff className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Sin fotos todavía</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {imagenes.map((img) => (
            <div key={img.id} className="group relative overflow-hidden rounded-xl border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="aspect-square w-full object-cover" />
              {img.es_principal && (
                <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                  Principal
                </span>
              )}
              <form action={eliminarFotoPieza} className="absolute right-2 top-2">
                <input type="hidden" name="imagen_id" value={img.id} />
                <input type="hidden" name="producto_id" value={producto.id} />
                <input type="hidden" name="ruta_retorno" value={`/existencias/${producto.id}/editar`} />
                <button
                  type="submit"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      <form
        action={agregarFotosPieza}
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
      >
        <input type="hidden" name="producto_id" value={producto.id} />
        <input type="hidden" name="ruta_retorno" value={`/existencias/${producto.id}/editar`} />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Agregar fotos</span>
          <input
            name="fotos"
            type="file"
            accept="image/*"
            multiple
            required
            className="rounded-lg border border-dashed border-input bg-background px-3 py-4 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground hover:file:opacity-90"
          />
        </label>
        <button
          type="submit"
          className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          Subir
        </button>
      </form>
    </main>
  )
}
