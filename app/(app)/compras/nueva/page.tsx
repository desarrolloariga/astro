import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, ArrowLeft, Handshake, Truck, StickyNote } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { crearOrdenCompra } from '../acciones'
import { Campo, SeccionFormulario, BotonPrimario, clasesInput } from '@/components/app/formulario'

export const metadata = { title: 'Nueva orden de compra — ASTRO' }

export default async function NuevaOrdenCompraPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  if (!(await tienePermiso('compras', 'crear'))) redirect('/inicio')

  const { error } = await searchParams
  const supabase = await createClient()
  const { data: proveedores } = await supabase
    .from('proveedores')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <Link
          href="/compras"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a compras
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Nueva orden de compra</h1>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form action={crearOrdenCompra} className="flex flex-col gap-6">
        <SeccionFormulario icon={Handshake} titulo="Proveedor y condiciones">
          <div className="flex flex-col gap-4">
            <Campo label="Proveedor" required>
              <select name="proveedor_id" required defaultValue="" className={clasesInput}>
                <option value="" disabled>
                  Selecciona…
                </option>
                {(proveedores ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo label="Condiciones de pago">
                <select name="condiciones_pago" defaultValue="" className={clasesInput}>
                  <option value="">Selecciona…</option>
                  <option value="contado">Contado</option>
                  <option value="15_dias">15 días</option>
                  <option value="30_dias">30 días</option>
                  <option value="45_dias">45 días</option>
                  <option value="60_dias">60 días</option>
                  <option value="90_dias">90 días</option>
                  <option value="otro">Otro</option>
                </select>
              </Campo>
              <Campo label="Referencia del proveedor" helpText="Número de cotización u orden propia del proveedor.">
                <input name="referencia_proveedor" placeholder="COT-2026-045" className={clasesInput} />
              </Campo>
            </div>
          </div>
        </SeccionFormulario>

        <SeccionFormulario icon={Truck} titulo="Entrega">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Fecha de entrega esperada">
              <input name="fecha_entrega_esperada" type="date" className={clasesInput} />
            </Campo>
            <Campo label="Método de envío">
              <select name="metodo_envio" defaultValue="" className={clasesInput}>
                <option value="">Selecciona…</option>
                <option value="recoger_proveedor">Recoger con el proveedor</option>
                <option value="courier_local">Courier local</option>
                <option value="transporte_propio">Transporte propio</option>
                <option value="otro">Otro</option>
              </select>
            </Campo>
            <Campo label="Dirección de entrega" className="sm:col-span-2">
              <input name="direccion_entrega" placeholder="CEDI, bodega…" className={clasesInput} />
            </Campo>
          </div>
        </SeccionFormulario>

        <SeccionFormulario icon={StickyNote} titulo="Notas">
          <div className="flex flex-col gap-4">
            <Campo label="Notas para el proveedor" helpText="Se compartirían con el proveedor si se le envía la orden.">
              <textarea name="notas_proveedor" rows={2} className={clasesInput} />
            </Campo>
            <Campo label="Notas internas" helpText="Solo visibles dentro de ASTRO.">
              <textarea name="notas" rows={2} className={clasesInput} />
            </Campo>
          </div>
        </SeccionFormulario>

        <div className="flex justify-end">
          <BotonPrimario>Crear orden</BotonPrimario>
        </div>
      </form>
    </main>
  )
}
