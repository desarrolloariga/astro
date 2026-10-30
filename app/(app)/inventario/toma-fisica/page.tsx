import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ClipboardList, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { formatearFechaHora } from '@/lib/formato'
import { clasesCampo, montoContable } from '@/lib/contabilidad-general'
import { Encabezado, Mensajes } from '@/components/contabilidad/comunes'
import { ESTADOS_TOMA } from '@/lib/toma-fisica'
import { iniciarToma } from './acciones'

export const metadata = { title: 'Toma física — ASTRO' }

type Toma = {
  id: number
  ciega: boolean
  estado: string
  notas: string | null
  total_faltante: number
  total_sobrante: number
  fecha_creacion: string
  fecha_aprobacion: string | null
  bodega: { nombre: string } | null
  categoria: { nombre: string } | null
  creador: { nombre: string } | null
}

export default async function TomasFisicasPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const [puedeContar, puedeCrear, puedeAprobar, { data }, { data: bodegas }, { data: categorias }] = await Promise.all([
    tienePermiso('toma_fisica', 'contar'),
    tienePermiso('toma_fisica', 'crear'),
    tienePermiso('toma_fisica', 'aprobar'),
    supabase
      .from('tomas_fisicas')
      .select(
        'id, ciega, estado, notas, total_faltante, total_sobrante, fecha_creacion, fecha_aprobacion, bodega:bodega_id ( nombre ), categoria:categoria_id ( nombre ), creador:creado_por ( nombre )',
      )
      .order('id', { ascending: false })
      .limit(100),
    supabase.from('tiendas').select('id, nombre, tipo').eq('activo', true).order('nombre'),
    supabase.from('categorias').select('id, nombre').order('nombre'),
  ])
  if (!puedeContar && !puedeAprobar) redirect('/inicio')
  const tomas = (data ?? []) as unknown as Toma[]

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={ClipboardList}
        titulo="Toma física de inventario"
        descripcion="Conteo físico por bodega con hoja a ciegas o con existencias. Al aprobar, las diferencias ajustan existencias, el Kardex PEPS y la contabilidad (faltantes y sobrantes)."
      />
      <Mensajes ok={sp.ok} error={sp.error} />

      {puedeCrear && (
        <details className="rounded-xl border border-dashed border-primary/40 bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-primary">
            <Plus className="h-4 w-4" />
            Nueva toma física
          </summary>
          <form action={iniciarToma} className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
              Bodega
              <select name="bodega_id" required defaultValue="" className={clasesCampo}>
                <option value="" disabled>
                  Elige…
                </option>
                {((bodegas ?? []) as { id: number; nombre: string; tipo: string }[]).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre} ({b.tipo === 'tienda' ? 'tienda' : 'bodega'})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
              Hoja de conteo
              <select name="hoja" defaultValue="ciega" className={clasesCampo}>
                <option value="ciega">A ciegas (sin existencias)</option>
                <option value="existencias">Con existencias del sistema</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
              Categoría (opcional)
              <select name="categoria_id" defaultValue="" className={clasesCampo}>
                <option value="">Toda la bodega</option>
                {((categorias ?? []) as { id: number; nombre: string }[]).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
              Notas
              <input name="notas" placeholder="Ej. cierre de octubre" className={clasesCampo} />
            </label>
            <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
              Se toma la existencia del sistema en este momento. Evita vender o trasladar desde esa bodega mientras se cuenta: si
              algo cambia, la aprobación te pedirá recontar o actualizar esas líneas.
            </p>
            <div className="flex items-end justify-end">
              <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                Iniciar toma
              </button>
            </div>
          </form>
        </details>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Toma</th>
              <th className="px-3 py-2">Bodega</th>
              <th className="px-3 py-2">Hoja</th>
              <th className="px-3 py-2">Estado</th>
              {puedeAprobar && <th className="px-3 py-2 text-right">Faltantes</th>}
              {puedeAprobar && <th className="px-3 py-2 text-right">Sobrantes</th>}
            </tr>
          </thead>
          <tbody>
            {tomas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Aún no hay tomas físicas.
                </td>
              </tr>
            )}
            {tomas.map((t) => (
              <tr key={t.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                <td className="px-3 py-2">
                  <Link href={`/inventario/toma-fisica/${t.id}`} className="font-semibold text-primary hover:underline">
                    #{t.id}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {formatearFechaHora(t.fecha_creacion)} · {t.creador?.nombre ?? ''}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {t.bodega?.nombre}
                  {t.categoria && <span className="block text-xs text-muted-foreground">{t.categoria.nombre}</span>}
                </td>
                <td className="px-3 py-2 text-xs">{t.ciega ? 'A ciegas' : 'Con existencias'}</td>
                <td className="px-3 py-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', ESTADOS_TOMA[t.estado]?.clase)}>
                    {ESTADOS_TOMA[t.estado]?.etiqueta ?? t.estado}
                  </span>
                </td>
                {puedeAprobar && (
                  <td className="px-3 py-2 text-right tabular-nums">{t.estado === 'aprobada' ? montoContable(t.total_faltante) : ''}</td>
                )}
                {puedeAprobar && (
                  <td className="px-3 py-2 text-right tabular-nums">{t.estado === 'aprobada' ? montoContable(t.total_sobrante) : ''}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        El conteo por tienda anterior sigue disponible en{' '}
        <Link href="/tienda/conteo-fisico" className="font-semibold text-primary hover:underline">
          Conteo físico
        </Link>
        ; esta toma lo reemplaza para bodegas, cantidades y ajustes.
      </p>
    </main>
  )
}
