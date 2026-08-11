import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, Store, PlusCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearFechaHora } from '@/lib/formato'
import { crearTienda, actualizarTienda, alternarActivoTienda } from './acciones'

export const metadata = { title: 'Tiendas y bodegas — ASTRO' }

const nombresTipo: Record<string, string> = {
  cedi: 'CEDI (inventario central)',
  tienda: 'Tienda',
  bodega: 'Bodega',
}

type Tienda = {
  id: number
  nombre: string
  tipo: string
  direccion: string | null
  telefono: string | null
  activo: boolean
}
type CambioAuditoria = { registro_id: number; fecha_creacion: string; usuarios: { nombre: string } | null }

export default async function AdminTiendasPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  if (!(await tienePermiso('tiendas', 'ver'))) redirect('/inicio')

  const { ok, error } = await searchParams
  const supabase = await createClient()

  const [{ data: tiendas }, { data: paises }] = await Promise.all([
    supabase.from('tiendas').select('id, nombre, tipo, direccion, telefono, activo').order('nombre'),
    supabase.from('paises').select('id, nombre').order('nombre'),
  ])

  const listaTiendas = (tiendas ?? []) as Tienda[]

  const ultimoCambioPorId = new Map<number, CambioAuditoria>()
  if (listaTiendas.length > 0) {
    const { data: cambios } = await supabase
      .from('auditoria')
      .select('registro_id, fecha_creacion, usuarios ( nombre )')
      .eq('tabla', 'tiendas')
      .in(
        'registro_id',
        listaTiendas.map((t) => t.id),
      )
      .order('fecha_creacion', { ascending: false })
    ;(cambios as unknown as CambioAuditoria[] | null)?.forEach((c) => {
      if (!ultimoCambioPorId.has(c.registro_id)) ultimoCambioPorId.set(c.registro_id, c)
    })
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Tiendas y bodegas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Alta, baja y datos de cada punto — el CEDI es una tienda más, tipo &quot;cedi&quot;.
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
          Nueva tienda o bodega
        </summary>
        <form action={crearTienda} className="flex flex-col gap-3 px-4 pb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input name="nombre" required placeholder="Nombre" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
            <select name="tipo" required defaultValue="" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
              <option value="" disabled>Tipo</option>
              <option value="tienda">Tienda</option>
              <option value="bodega">Bodega</option>
              <option value="cedi">CEDI</option>
            </select>
          </div>
          <input name="direccion" placeholder="Dirección (opcional)" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input name="telefono" placeholder="Teléfono (opcional)" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
            <select name="pais_id" defaultValue="" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
              <option value="" disabled>País</option>
              {(paises ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
            Crear
          </button>
        </form>
      </details>

      {listaTiendas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Store className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Aún no hay tiendas registradas</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {listaTiendas.map((t) => (
            <div key={t.id} className="rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {t.nombre}
                    {!t.activo && (
                      <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                        Inactiva
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {nombresTipo[t.tipo] ?? t.tipo}
                    {t.direccion && ` · ${t.direccion}`}
                    {t.telefono && ` · ${t.telefono}`}
                  </p>
                  {ultimoCambioPorId.get(t.id) && (
                    <p className="text-[11px] text-muted-foreground">
                      Última edición: {formatearFechaHora(ultimoCambioPorId.get(t.id)!.fecha_creacion)}
                      {ultimoCambioPorId.get(t.id)!.usuarios && ` · ${ultimoCambioPorId.get(t.id)!.usuarios!.nombre}`}
                    </p>
                  )}
                </div>
                <form action={alternarActivoTienda}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="activo" value={t.activo ? '1' : '0'} />
                  <button
                    type="submit"
                    className={
                      t.activo
                        ? 'rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10'
                        : 'rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary'
                    }
                  >
                    {t.activo ? 'Dar de baja' : 'Reactivar'}
                  </button>
                </form>
              </div>
              <details>
                <summary className="cursor-pointer list-none border-t border-border px-4 py-2 text-xs font-semibold text-primary">
                  Editar datos
                </summary>
                <form action={actualizarTienda} className="flex flex-col gap-3 border-t border-border px-4 py-3">
                  <input type="hidden" name="id" value={t.id} />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input name="nombre" defaultValue={t.nombre} required className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none" />
                    <select name="tipo" defaultValue={t.tipo} className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
                      <option value="tienda">Tienda</option>
                      <option value="bodega">Bodega</option>
                      <option value="cedi">CEDI</option>
                    </select>
                  </div>
                  <input name="direccion" defaultValue={t.direccion ?? ''} placeholder="Dirección" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
                  <input name="telefono" defaultValue={t.telefono ?? ''} placeholder="Teléfono" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
                  <button type="submit" className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
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
