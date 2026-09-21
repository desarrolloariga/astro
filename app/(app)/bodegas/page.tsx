import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, Warehouse, PlusCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearFechaHora } from '@/lib/formato'
import { crearBodega, actualizarBodega, alternarActivoBodega } from './acciones'

export const metadata = { title: 'Bodegas — ASTRO' }

const clasesCampo =
  'rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none'

type Bodega = {
  id: number
  nombre: string
  direccion: string | null
  telefono: string | null
  activo: boolean
}
type CambioAuditoria = { registro_id: number; fecha_creacion: string; usuarios: { nombre: string } | null }

export default async function BodegasPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  if (!(await tienePermiso('inventario', 'transferir'))) redirect('/inicio')

  const { ok, error } = await searchParams
  const supabase = await createClient()

  const [{ data: bodegasData }, { data: paises }] = await Promise.all([
    supabase.from('tiendas').select('id, nombre, direccion, telefono, activo').eq('tipo', 'cedi').order('nombre'),
    supabase.from('paises').select('id, nombre').order('nombre'),
  ])

  const bodegas = (bodegasData ?? []) as Bodega[]

  const ultimoCambioPorId = new Map<number, CambioAuditoria>()
  if (bodegas.length > 0) {
    const { data: cambios } = await supabase
      .from('auditoria')
      .select('registro_id, fecha_creacion, usuarios ( nombre )')
      .eq('tabla', 'tiendas')
      .in('registro_id', bodegas.map((b) => b.id))
      .order('fecha_creacion', { ascending: false })
    ;(cambios as unknown as CambioAuditoria[] | null)?.forEach((c) => {
      if (!ultimoCambioPorId.has(c.registro_id)) ultimoCambioPorId.set(c.registro_id, c)
    })
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <Warehouse className="h-5 w-5 text-primary" />
          Bodegas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Alta, baja y datos de cada bodega (CEDI) — el inventario y los traslados solo se mueven
          entre bodegas activas de aquí.
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

      <details className="rounded-xl border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground">
          <PlusCircle className="h-4 w-4 text-primary" />
          Nueva bodega
        </summary>
        <form action={crearBodega} className="flex flex-col gap-3 px-4 pb-4">
          <input name="nombre" required placeholder="Nombre" className={clasesCampo} />
          <input name="direccion" placeholder="Dirección (opcional)" className={clasesCampo} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input name="telefono" placeholder="Teléfono (opcional)" className={clasesCampo} />
            <select name="pais_id" defaultValue="" className={clasesCampo}>
              <option value="" disabled>
                País
              </option>
              {(paises ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
          >
            Crear bodega
          </button>
        </form>
      </details>

      {bodegas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Warehouse className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Todavía no hay bodegas registradas</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {bodegas.map((b) => (
            <div key={b.id} className="rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {b.nombre}
                    {!b.activo && (
                      <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                        Inactiva
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {b.direccion}
                    {b.direccion && b.telefono && ' · '}
                    {b.telefono}
                  </p>
                  {ultimoCambioPorId.get(b.id) && (
                    <p className="text-[11px] text-muted-foreground">
                      Última edición: {formatearFechaHora(ultimoCambioPorId.get(b.id)!.fecha_creacion)}
                      {ultimoCambioPorId.get(b.id)!.usuarios && ` · ${ultimoCambioPorId.get(b.id)!.usuarios!.nombre}`}
                    </p>
                  )}
                </div>
                <form action={alternarActivoBodega}>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="activo" value={b.activo ? '1' : '0'} />
                  <button
                    type="submit"
                    className={
                      b.activo
                        ? 'rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10'
                        : 'rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary'
                    }
                  >
                    {b.activo ? 'Dar de baja' : 'Reactivar'}
                  </button>
                </form>
              </div>
              <details>
                <summary className="cursor-pointer list-none border-t border-border px-4 py-2 text-xs font-semibold text-primary">
                  Editar datos
                </summary>
                <form action={actualizarBodega} className="flex flex-col gap-3 border-t border-border px-4 py-3">
                  <input type="hidden" name="id" value={b.id} />
                  <input name="nombre" defaultValue={b.nombre} required className={clasesCampo} />
                  <input name="direccion" defaultValue={b.direccion ?? ''} placeholder="Dirección" className={clasesCampo} />
                  <input name="telefono" defaultValue={b.telefono ?? ''} placeholder="Teléfono" className={clasesCampo} />
                  <button
                    type="submit"
                    className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
                  >
                    Guardar cambios
                  </button>
                </form>
              </details>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
