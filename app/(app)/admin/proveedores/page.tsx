import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, Truck, PlusCircle, Building2, Contact, Landmark } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { crearProveedor, actualizarProveedor, alternarActivoProveedor } from './acciones'
import { Campo, SeccionFormulario, BotonPrimario, clasesInput } from '@/components/app/formulario'

export const metadata = { title: 'Proveedores — ASTRO' }

const nombresTipo: Record<string, string> = { local: 'Local', importado: 'Importado' }

type Proveedor = {
  id: number
  nombre: string
  tipo: string
  contacto_nombre: string | null
  contacto_telefono: string | null
  contacto_correo: string | null
  nit: string | null
  direccion: string | null
  activo: boolean
  pais_id: number | null
  banco: string | null
  cuenta_bancaria: string | null
  terminos_pago_default: string | null
  sitio_web: string | null
}
type Pais = { id: number; nombre: string }

export default async function AdminProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  if (!(await tienePermiso('proveedores', 'ver'))) redirect('/inicio')
  const puedeEditar = await tienePermiso('proveedores', 'editar')

  const { ok, error } = await searchParams
  const supabase = await createClient()

  const [{ data: proveedores }, { data: paises }] = await Promise.all([
    supabase
      .from('proveedores')
      .select(
        'id, nombre, tipo, contacto_nombre, contacto_telefono, contacto_correo, nit, direccion, activo, pais_id, banco, cuenta_bancaria, terminos_pago_default, sitio_web',
      )
      .order('nombre'),
    supabase.from('paises').select('id, nombre').order('nombre'),
  ])

  const listaProveedores = (proveedores ?? []) as Proveedor[]
  const listaPaises = (paises ?? []) as Pais[]

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Proveedores</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Base para las órdenes de compra e importaciones.
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

      {puedeEditar && (
        <details className="rounded-xl border border-border bg-card shadow-xs">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-sm font-semibold text-foreground">
            <PlusCircle className="h-4 w-4 text-primary" />
            Nuevo proveedor
          </summary>
          <form action={crearProveedor} className="flex flex-col gap-4 px-5 pb-5">
            <SeccionFormulario icon={Building2} titulo="Identificación" className="border-0 bg-secondary/30 p-4 shadow-none">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Campo label="Nombre" required>
                  <input name="nombre" required className={clasesInput} />
                </Campo>
                <Campo label="Tipo">
                  <select name="tipo" required defaultValue="local" className={clasesInput}>
                    <option value="local">Local</option>
                    <option value="importado">Importado</option>
                  </select>
                </Campo>
                <Campo label="NIT">
                  <input name="nit" className={clasesInput} />
                </Campo>
                <Campo label="País">
                  <select name="pais_id" defaultValue="" className={clasesInput}>
                    <option value="">Selecciona…</option>
                    {listaPaises.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Dirección" className="sm:col-span-2">
                  <input name="direccion" className={clasesInput} />
                </Campo>
              </div>
            </SeccionFormulario>

            <SeccionFormulario icon={Contact} titulo="Contacto" className="border-0 bg-secondary/30 p-4 shadow-none">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Campo label="Nombre del contacto">
                  <input name="contacto_nombre" className={clasesInput} />
                </Campo>
                <Campo label="Teléfono">
                  <input name="contacto_telefono" className={clasesInput} />
                </Campo>
                <Campo label="Correo">
                  <input name="contacto_correo" type="email" className={clasesInput} />
                </Campo>
                <Campo label="Sitio web">
                  <input name="sitio_web" className={clasesInput} />
                </Campo>
              </div>
            </SeccionFormulario>

            <SeccionFormulario icon={Landmark} titulo="Datos financieros" className="border-0 bg-secondary/30 p-4 shadow-none">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Campo label="Banco">
                  <input name="banco" className={clasesInput} />
                </Campo>
                <Campo label="Cuenta bancaria">
                  <input name="cuenta_bancaria" className={clasesInput} />
                </Campo>
                <Campo label="Condiciones de pago por defecto" className="sm:col-span-2">
                  <select name="terminos_pago_default" defaultValue="" className={clasesInput}>
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
              </div>
            </SeccionFormulario>

            <div className="flex justify-end">
              <BotonPrimario>Crear</BotonPrimario>
            </div>
          </form>
        </details>
      )}

      {listaProveedores.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Truck className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Aún no hay proveedores registrados</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {listaProveedores.map((p) => (
            <div key={p.id} className="rounded-xl border border-border bg-card shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {p.nombre}
                    {!p.activo && (
                      <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                        Inactivo
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {nombresTipo[p.tipo] ?? p.tipo}
                    {p.contacto_nombre && ` · ${p.contacto_nombre}`}
                    {p.contacto_telefono && ` · ${p.contacto_telefono}`}
                    {p.nit && ` · NIT ${p.nit}`}
                  </p>
                </div>
                {puedeEditar && (
                  <form action={alternarActivoProveedor}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="activo" value={p.activo ? '1' : '0'} />
                    <button
                      type="submit"
                      className={
                        p.activo
                          ? 'rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10'
                          : 'rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary'
                      }
                    >
                      {p.activo ? 'Dar de baja' : 'Reactivar'}
                    </button>
                  </form>
                )}
              </div>
              {puedeEditar && (
                <details>
                  <summary className="cursor-pointer list-none border-t border-border px-4 py-2 text-xs font-semibold text-primary">
                    Editar datos
                  </summary>
                  <form action={actualizarProveedor} className="flex flex-col gap-4 border-t border-border p-4">
                    <input type="hidden" name="id" value={p.id} />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Campo label="Nombre" required>
                        <input name="nombre" defaultValue={p.nombre} required className={clasesInput} />
                      </Campo>
                      <Campo label="Tipo">
                        <select name="tipo" defaultValue={p.tipo} className={clasesInput}>
                          <option value="local">Local</option>
                          <option value="importado">Importado</option>
                        </select>
                      </Campo>
                      <Campo label="Contacto">
                        <input name="contacto_nombre" defaultValue={p.contacto_nombre ?? ''} className={clasesInput} />
                      </Campo>
                      <Campo label="Teléfono">
                        <input name="contacto_telefono" defaultValue={p.contacto_telefono ?? ''} className={clasesInput} />
                      </Campo>
                      <Campo label="Correo">
                        <input
                          name="contacto_correo"
                          type="email"
                          defaultValue={p.contacto_correo ?? ''}
                          className={clasesInput}
                        />
                      </Campo>
                      <Campo label="NIT">
                        <input name="nit" defaultValue={p.nit ?? ''} className={clasesInput} />
                      </Campo>
                      <Campo label="Dirección">
                        <input name="direccion" defaultValue={p.direccion ?? ''} className={clasesInput} />
                      </Campo>
                      <Campo label="País">
                        <select name="pais_id" defaultValue={p.pais_id ?? ''} className={clasesInput}>
                          <option value="">Selecciona…</option>
                          {listaPaises.map((pa) => (
                            <option key={pa.id} value={pa.id}>
                              {pa.nombre}
                            </option>
                          ))}
                        </select>
                      </Campo>
                      <Campo label="Banco">
                        <input name="banco" defaultValue={p.banco ?? ''} className={clasesInput} />
                      </Campo>
                      <Campo label="Cuenta bancaria">
                        <input name="cuenta_bancaria" defaultValue={p.cuenta_bancaria ?? ''} className={clasesInput} />
                      </Campo>
                      <Campo label="Condiciones de pago por defecto">
                        <select
                          name="terminos_pago_default"
                          defaultValue={p.terminos_pago_default ?? ''}
                          className={clasesInput}
                        >
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
                      <Campo label="Sitio web">
                        <input name="sitio_web" defaultValue={p.sitio_web ?? ''} className={clasesInput} />
                      </Campo>
                    </div>
                    <div className="flex justify-end">
                      <BotonPrimario>Guardar cambios</BotonPrimario>
                    </div>
                  </form>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
