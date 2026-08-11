import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, Target, Megaphone } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { formatearPrecio, formatearFecha } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { crearMeta, crearCampana, alternarCampana } from './acciones'

export const metadata = { title: 'Metas — ASTRO' }

type Periodo = { id: number; nombre: string; fecha_inicio: string; fecha_fin: string }
type Meta = {
  id: number
  ambito: string
  usuario_id: number | null
  tienda_id: number | null
  monto_meta: number
  usuarios: { nombre: string } | null
  tiendas: { nombre: string } | null
  periodos: Periodo | null
}
type Campana = {
  id: number
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  activo: boolean
}

export default async function MetasPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (!['admin', 'coordinador'].includes(usuario.rol)) redirect('/inicio')

  const { ok, error } = await searchParams
  const supabase = await createClient()

  const [{ data: metas }, { data: periodos }, { data: tiendas }, { data: campanas }] = await Promise.all([
    supabase
      .from('metas')
      .select('id, ambito, usuario_id, tienda_id, monto_meta, usuarios ( nombre ), tiendas ( nombre ), periodos ( id, nombre, fecha_inicio, fecha_fin )')
      .order('id', { ascending: false })
      .limit(50),
    supabase.from('periodos').select('id, nombre').order('fecha_inicio', { ascending: false }).limit(12),
    supabase.from('tiendas').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('campanas').select('id, nombre, fecha_inicio, fecha_fin, activo').order('fecha_inicio', { ascending: false }).limit(20),
  ])

  const listaCampanas = (campanas ?? []) as Campana[]

  // Vendedores potenciales (cualquier rol comercial), resueltos por
  // nombre de rol para no depender de su id numérico.
  const { data: vendedores } = await supabase
    .from('usuarios')
    .select('id, nombre, roles ( nombre )')
    .eq('activo', true)
    .order('nombre')
    .limit(300)

  const listaVendedores = ((vendedores ?? []) as unknown as { id: number; nombre: string; roles: { nombre: string } | null }[])
    .filter((u) => ['supervisor', 'asesor', 'embajador', 'tienda'].includes(u.roles?.nombre ?? ''))

  const listaMetas = (metas ?? []) as unknown as Meta[]

  // Progreso: ventas reales de cada vendedor/tienda dentro de su período —
  // se guarda el detalle completo, no solo la suma, para el drill-down.
  type VentaMeta = { id: number; total: number; fecha_creacion: string; clientes: { nombre: string } | null }
  const progreso = new Map<number, number>()
  const ventasPorMeta = new Map<number, VentaMeta[]>()
  await Promise.all(
    listaMetas.map(async (m) => {
      if (!m.periodos) return
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
      const ventas = (data ?? []) as unknown as VentaMeta[]
      progreso.set(m.id, ventas.reduce((acc, v) => acc + (v.total ?? 0), 0))
      ventasPorMeta.set(
        m.id,
        [...ventas].sort((a, b) => b.fecha_creacion.localeCompare(a.fecha_creacion)),
      )
    }),
  )

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Metas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Metas de venta por vendedor o por tienda, por período. Alimentan el bono de cumplimiento de meta.
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
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">
          + Nueva meta
        </summary>
        <form action={crearMeta} className="flex flex-wrap items-end gap-3 px-4 pb-4">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Ámbito
            <select name="ambito" required defaultValue="" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
              <option value="" disabled>Elige</option>
              <option value="vendedor">Vendedor</option>
              <option value="tienda">Tienda</option>
            </select>
          </label>
          <label className="flex flex-1 min-w-48 flex-col gap-1 text-xs text-muted-foreground">
            Vendedor (si aplica)
            <select name="usuario_id" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
              <option value="">—</option>
              {listaVendedores.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 min-w-40 flex-col gap-1 text-xs text-muted-foreground">
            Tienda (si aplica)
            <select name="tienda_id" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
              <option value="">—</option>
              {(tiendas ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Período
            <select name="periodo_id" required defaultValue="" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
              <option value="" disabled>Elige</option>
              {(periodos ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Monto meta $
            <input name="monto_meta" type="number" step="0.01" required className="w-36 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none" />
          </label>
          <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
            Crear meta
          </button>
        </form>
      </details>

      {listaMetas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Target className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Aún no hay metas definidas</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {listaMetas.map((m) => {
            const actual = progreso.get(m.id) ?? 0
            const pct = m.monto_meta > 0 ? Math.min(100, Math.round((actual / m.monto_meta) * 100)) : 0
            const cumplida = actual >= m.monto_meta
            const ventas = ventasPorMeta.get(m.id) ?? []
            return (
              <div key={m.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {m.ambito === 'vendedor' ? m.usuarios?.nombre : m.tiendas?.nombre}
                    <span className="ml-1.5 font-normal text-muted-foreground">· {m.periodos?.nombre}</span>
                  </p>
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
          })}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <Megaphone className="h-4 w-4 text-primary" /> Campañas
        </h2>
        <p className="text-sm text-muted-foreground">
          Eventos especiales (ej. Día de la Madre, Navidad). Para que apliquen reglas de puntos o
          comisión especiales durante la campaña, dales la misma vigencia en{' '}
          <a href="/admin/incentivos" className="text-primary hover:underline">Incentivos</a>.
        </p>

        {listaCampanas.length > 0 && (
          <div className="flex flex-col gap-2">
            {listaCampanas.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{c.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatearFecha(c.fecha_inicio)} – {formatearFecha(c.fecha_fin)}
                  </p>
                </div>
                <form action={alternarCampana}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="activo" value={c.activo ? '1' : '0'} />
                  <button
                    type="submit"
                    className={
                      c.activo
                        ? 'rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary'
                        : 'rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground'
                    }
                  >
                    {c.activo ? 'Activa' : 'Inactiva'}
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}

        <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">
            + Nueva campaña
          </summary>
          <form action={crearCampana} className="flex flex-wrap items-end gap-3 px-4 pb-4">
            <input name="nombre" required placeholder="Nombre de la campaña" className="flex-1 min-w-48 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Desde
              <input name="fecha_inicio" type="date" required className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Hasta
              <input name="fecha_fin" type="date" required className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none" />
            </label>
            <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
              Crear campaña
            </button>
          </form>
        </details>
      </section>
    </main>
  )
}
