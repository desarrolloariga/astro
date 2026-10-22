import { createClient } from '@/lib/supabase/server'
import { formatearPrecio, formatearFecha } from '@/lib/formato'
import { cn } from '@/lib/utils'

/**
 * Fila de meta con su avance real. El avance exige una consulta de ventas
 * por meta, así que cada fila se transmite con Suspense: la lista aparece
 * de inmediato con nombre y período, y las barras se completan fila a fila.
 */

export type Periodo = { id: number; nombre: string; fecha_inicio: string; fecha_fin: string }
export type Meta = {
  id: number
  ambito: string
  usuario_id: number | null
  tienda_id: number | null
  monto_meta: number
  usuarios: { nombre: string } | null
  tiendas: { nombre: string } | null
  periodos: Periodo | null
}

type VentaMeta = { id: number; total: number; fecha_creacion: string; clientes: { nombre: string } | null }

function TituloMeta({ meta: m }: { meta: Meta }) {
  return (
    <p className="text-sm font-semibold text-foreground">
      {m.ambito === 'vendedor' ? m.usuarios?.nombre : m.tiendas?.nombre}
      <span className="ml-1.5 font-normal text-muted-foreground">· {m.periodos?.nombre}</span>
    </p>
  )
}

export async function FilaMeta({ meta: m }: { meta: Meta }) {
  // Progreso: ventas reales del vendedor/tienda dentro de su período — se
  // guarda el detalle completo, no solo la suma, para el drill-down.
  let ventas: VentaMeta[] = []
  if (m.periodos) {
    const supabase = await createClient()
    let consulta = supabase
      .from('ventas')
      .select('id, total, fecha_creacion, clientes ( nombre )')
      .neq('estado', 'anulada')
      .gte('fecha_creacion', m.periodos.fecha_inicio)
      .lt('fecha_creacion', m.periodos.fecha_fin)
    consulta = m.ambito === 'vendedor'
      ? consulta.eq('vendedor_id', m.usuario_id as number)
      : consulta.eq('tienda_id', m.tienda_id as number)
    const { data } = await consulta
    ventas = ((data ?? []) as unknown as VentaMeta[]).sort((a, b) =>
      b.fecha_creacion.localeCompare(a.fecha_creacion),
    )
  }

  const actual = ventas.reduce((acc, v) => acc + (v.total ?? 0), 0)
  const pct = m.monto_meta > 0 ? Math.min(100, Math.round((actual / m.monto_meta) * 100)) : 0
  const cumplida = actual >= m.monto_meta

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TituloMeta meta={m} />
        <p className="text-xs font-semibold text-foreground">
          {formatearPrecio(actual)} / {formatearPrecio(m.monto_meta)}
        </p>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn('h-full rounded-full', cumplida ? 'bg-primary' : 'bg-brand-deep-muted')}
          style={{ width: `${pct}%` }}
        />
      </div>
      {ventas.length > 0 && (
        <details className="mt-2">
          <summary className="w-fit cursor-pointer list-none text-xs font-semibold text-primary">
            Ver {ventas.length} venta{ventas.length > 1 ? 's' : ''} que componen el avance
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {ventas.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 text-xs">
                <a href={`/ventas#venta-${v.id}`} className="text-primary hover:underline">
                  Venta #{v.id}
                </a>
                <span className="text-muted-foreground">
                  {v.clientes?.nombre ?? 'Cliente sin nombre'} · {formatearFecha(v.fecha_creacion)}
                </span>
                <span className="font-semibold text-foreground">{formatearPrecio(v.total)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

/** Misma tarjeta con nombre y período ya visibles; monto y barra en pulso. */
export function EsqueletoFilaMeta({ meta: m }: { meta: Meta }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3" aria-busy="true" aria-label="Cargando avance">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TituloMeta meta={m} />
        <div className="h-4 w-32 animate-pulse rounded-md bg-secondary/70" />
      </div>
      <div className="mt-2 h-2 w-full animate-pulse rounded-full bg-secondary/70" />
    </div>
  )
}
