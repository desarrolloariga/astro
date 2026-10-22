import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, Target, Megaphone } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { formatearFecha } from '@/lib/formato'
import { crearMeta, crearCampana, alternarCampana } from './acciones'
import { FilaMeta, EsqueletoFilaMeta, type Meta } from './secciones'

export const metadata = { title: 'Metas — ASTRO' }

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

  // Metas, catálogos del formulario y campañas en una sola tanda; el avance
  // de cada meta (una consulta de ventas por meta) se transmite fila a fila.
  const [{ data: metas }, { data: periodos }, { data: tiendas }, { data: campanas }, { data: vendedores }] =
    await Promise.all([
      supabase
        .from('metas')
        .select('id, ambito, usuario_id, tienda_id, monto_meta, usuarios ( nombre ), tiendas ( nombre ), periodos ( id, nombre, fecha_inicio, fecha_fin )')
        .order('id', { ascending: false })
        .limit(50),
      supabase.from('periodos').select('id, nombre').order('fecha_inicio', { ascending: false }).limit(12),
      supabase.from('tiendas').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('campanas').select('id, nombre, fecha_inicio, fecha_fin, activo').order('fecha_inicio', { ascending: false }).limit(20),
      // Vendedores potenciales (cualquier rol comercial), resueltos por
      // nombre de rol para no depender de su id numérico.
      supabase
        .from('usuarios')
        .select('id, nombre, roles ( nombre )')
        .eq('activo', true)
        .order('nombre')
        .limit(300),
    ])

  const listaCampanas = (campanas ?? []) as Campana[]

  const listaVendedores = ((vendedores ?? []) as unknown as { id: number; nombre: string; roles: { nombre: string } | null }[])
    .filter((u) => ['supervisor', 'asesor', 'embajador', 'tienda'].includes(u.roles?.nombre ?? ''))

  const listaMetas = (metas ?? []) as unknown as Meta[]

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
          {listaMetas.map((m) => (
            <Suspense key={m.id} fallback={<EsqueletoFilaMeta meta={m} />}>
              <FilaMeta meta={m} />
            </Suspense>
          ))}
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
