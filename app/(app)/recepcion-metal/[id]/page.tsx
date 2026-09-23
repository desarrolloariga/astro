import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { AlertCircle, CheckCircle2, ArrowLeft, Scale, PackageCheck, X, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearFechaHora, formatearNumero, formatearPrecio } from '@/lib/formato'
import { EstadoBadge, estadosRecepcionMetal } from '@/components/app/estado-badge'
import { BotonPrimario } from '@/components/app/formulario'
import { FormularioConConfirmacion } from '@/components/app/boton-eliminar'
import { confirmarRecepcionMetal, cancelarRecepcionMetal, quitarLineaRecepcionMetal } from '../acciones'

export const metadata = { title: 'Recepción de oro y plata — ASTRO' }

type Detalle = {
  id: number
  producto_id: number
  cantidad: number
  peso_gramos: number
  costo_unitario: number
  productos: { codigo: string; nombre: string } | null
}
type Recepcion = {
  id: number
  estado: string
  peso_total_gramos: number
  cantidad_total_piezas: number
  notas: string | null
  fecha_creacion: string
  fecha_confirmacion: string | null
  proveedores: { nombre: string } | null
  recepcion_metal_detalles: Detalle[]
}

export default async function DetalleRecepcionMetalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  if (!(await tienePermiso('recepcion_metal', 'ver'))) redirect('/inicio')
  const puedeCrear = await tienePermiso('recepcion_metal', 'crear')
  const puedeConfirmar = await tienePermiso('recepcion_metal', 'confirmar')

  const { id } = await params
  const { ok, error } = await searchParams
  const supabase = await createClient()

  const { data } = await supabase
    .from('recepciones_metal')
    .select(
      'id, estado, peso_total_gramos, cantidad_total_piezas, notas, fecha_creacion, fecha_confirmacion, proveedores ( nombre ), recepcion_metal_detalles ( id, producto_id, cantidad, peso_gramos, costo_unitario, productos ( codigo, nombre ) )',
    )
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()
  const recepcion = data as unknown as Recepcion
  const detalles = recepcion.recepcion_metal_detalles

  const sumaCantidad = detalles.reduce((acc, d) => acc + d.cantidad, 0)
  const sumaPeso = detalles.reduce((acc, d) => acc + d.peso_gramos, 0)
  const totalCosto = detalles.reduce((acc, d) => acc + d.cantidad * d.costo_unitario, 0)
  const cuadraCantidad = sumaCantidad === recepcion.cantidad_total_piezas
  const cuadraPeso = sumaPeso === recepcion.peso_total_gramos
  const cuadra = cuadraCantidad && cuadraPeso && detalles.length > 0

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <Link
          href="/recepcion-metal"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a recepciones
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Scale className="h-5 w-5 text-primary" />
            Recepción #{recepcion.id}
          </h1>
          <EstadoBadge estado={recepcion.estado} config={estadosRecepcionMetal} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {recepcion.proveedores?.nombre ?? 'Sin proveedor'} · {formatearFechaHora(recepcion.fecha_creacion)}
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

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Cuadre declarado</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Piezas declaradas</p>
            <p className="text-lg font-bold text-foreground">{formatearNumero(recepcion.cantidad_total_piezas)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Piezas en líneas</p>
            <p className={`text-lg font-bold ${cuadraCantidad ? 'text-primary' : 'text-destructive'}`}>
              {formatearNumero(sumaCantidad)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Peso declarado</p>
            <p className="text-lg font-bold text-foreground">{formatearNumero(recepcion.peso_total_gramos)} g</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Peso en líneas</p>
            <p className={`text-lg font-bold ${cuadraPeso ? 'text-primary' : 'text-destructive'}`}>
              {formatearNumero(sumaPeso)} g
            </p>
          </div>
        </div>
        {!cuadra && recepcion.estado === 'borrador' && (
          <p className="mt-3 text-xs font-medium text-destructive">
            Las líneas todavía no cuadran exacto con lo declarado — no se puede confirmar hasta que
            coincidan.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Artículos</h2>
        {detalles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin líneas todavía.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {detalles.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 p-3 text-sm"
              >
                <div className="min-w-40 flex-1">
                  <span className="font-medium text-foreground">
                    {d.productos?.codigo} — {d.productos?.nombre}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {formatearNumero(d.cantidad)} pza · {formatearNumero(d.peso_gramos)} g ·{' '}
                    {formatearPrecio(d.costo_unitario)} c/u
                  </p>
                </div>
                {puedeCrear && recepcion.estado === 'borrador' && (
                  <form action={quitarLineaRecepcionMetal}>
                    <input type="hidden" name="recepcion_metal_id" value={recepcion.id} />
                    <input type="hidden" name="detalle_id" value={d.id} />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3 w-3" />
                      Quitar
                    </button>
                  </form>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-bold text-foreground">
              <span>Costo total</span>
              <span>{formatearPrecio(totalCosto)}</span>
            </div>
          </div>
        )}
      </section>

      {recepcion.estado === 'borrador' && (
        <div className="flex flex-wrap items-center gap-3">
          {puedeConfirmar && (
            <form action={confirmarRecepcionMetal}>
              <input type="hidden" name="recepcion_metal_id" value={recepcion.id} />
              <BotonPrimario type="submit" disabled={!cuadra} title={!cuadra ? 'Las líneas deben cuadrar exacto' : undefined}>
                <PackageCheck className="h-4 w-4" />
                Confirmar y publicar al CEDI
              </BotonPrimario>
            </form>
          )}
          {puedeCrear && (
            <FormularioConConfirmacion
              action={cancelarRecepcionMetal}
              mensaje="¿Cancelar esta recepción? No se puede deshacer."
            >
              <input type="hidden" name="recepcion_metal_id" value={recepcion.id} />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-card px-4 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
              >
                <X className="h-4 w-4" />
                Cancelar recepción
              </button>
            </FormularioConConfirmacion>
          )}
        </div>
      )}

      {recepcion.notas && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Notas</h2>
          <p className="text-sm text-foreground">{recepcion.notas}</p>
        </section>
      )}
    </main>
  )
}
