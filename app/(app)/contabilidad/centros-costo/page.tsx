import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChartPie, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { clasesCampo } from '@/lib/contabilidad-general'
import { Encabezado, Mensajes } from '@/components/contabilidad/comunes'
import { guardarCentroCosto } from './acciones'

export const metadata = { title: 'Centros de costo — ASTRO' }

type Centro = {
  id: number
  codigo: string
  nombre: string
  tienda_id: number | null
  activo: boolean
  descripcion: string | null
}

export default async function CentrosCostoPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; editar?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const [puedeVer, puedeConfigurar, { data: centrosData }, { data: tiendasData }] = await Promise.all([
    tienePermiso('contabilidad', 'ver'),
    tienePermiso('contabilidad', 'configurar'),
    supabase.from('centros_costo').select('id, codigo, nombre, tienda_id, activo, descripcion').order('codigo'),
    supabase.from('tiendas').select('id, nombre').order('nombre'),
  ])
  if (!puedeVer) redirect('/inicio')

  const centros = (centrosData ?? []) as Centro[]
  const tiendas = (tiendasData ?? []) as { id: number; nombre: string }[]
  const nombreTienda = new Map(tiendas.map((t) => [t.id, t.nombre]))
  const editando = sp.editar ? centros.find((c) => c.id === Number(sp.editar)) : undefined

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={ChartPie}
        titulo="Centros de costo"
        descripcion="Toda línea de una cuenta de costo o gasto lleva centro de costo; las cuentas de balance (activo, pasivo y patrimonio) no. Si un centro se liga a una tienda, las partidas automáticas de esa tienda lo usan."
      />
      <Mensajes ok={sp.ok} error={sp.error} />

      {puedeConfigurar && (
        <form
          key={editando?.id ?? 'nuevo'}
          action={guardarCentroCosto}
          className="grid grid-cols-1 gap-3 rounded-xl border border-dashed border-primary/40 bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
        >
          <p className="text-sm font-semibold text-foreground sm:col-span-2 lg:col-span-5">
            {editando ? `Editar ${editando.codigo}` : 'Nuevo centro de costo'}
          </p>
          {editando && <input type="hidden" name="id" value={editando.id} />}
          <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
            Código
            <input name="codigo" required defaultValue={editando?.codigo ?? 'CC-'} className={cn(clasesCampo, 'font-mono uppercase')} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
            Nombre
            <input name="nombre" required defaultValue={editando?.nombre ?? ''} className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
            Tienda (opcional)
            <select name="tienda_id" defaultValue={editando?.tienda_id ?? ''} className={clasesCampo}>
              <option value="">Sin tienda</option>
              {tiendas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-foreground lg:col-span-2">
            Descripción
            <input name="descripcion" defaultValue={editando?.descripcion ?? ''} className={clasesCampo} />
          </label>
          <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-5">
            {editando && (
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" name="activo" defaultChecked={editando.activo} className="h-4 w-4" />
                Activo
              </label>
            )}
            <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Guardar
            </button>
            {editando && (
              <Link href="/contabilidad/centros-costo" className="text-sm text-muted-foreground hover:underline">
                Cancelar
              </Link>
            )}
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Tienda</th>
              <th className="px-3 py-2">Estado</th>
              {puedeConfigurar && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {centros.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  Aún no hay centros de costo.
                </td>
              </tr>
            )}
            {centros.map((c) => (
              <tr key={c.id} className={cn('border-b border-border/60 last:border-0', !c.activo && 'opacity-50')}>
                <td className="px-3 py-2 font-mono text-xs font-semibold">{c.codigo}</td>
                <td className="px-3 py-2">
                  <span className="font-medium text-foreground">{c.nombre}</span>
                  {c.descripcion && <span className="block text-xs text-muted-foreground">{c.descripcion}</span>}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{c.tienda_id ? nombreTienda.get(c.tienda_id) : '—'}</td>
                <td className="px-3 py-2 text-xs">{c.activo ? 'Activo' : 'Inactivo'}</td>
                {puedeConfigurar && (
                  <td className="px-3 py-2 text-right">
                    <Link href={`/contabilidad/centros-costo?editar=${c.id}`} title="Editar" className="inline-flex rounded p-1 text-muted-foreground hover:bg-muted">
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
