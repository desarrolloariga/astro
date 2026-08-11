import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, Target, Trophy, HandCoins, Users, Ban } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { formatearPrecio, formatearFecha } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { anularVenta } from '../acciones'

export const metadata = { title: 'Mi equipo — ASTRO' }

type MiembroRed = {
  usuario_id: number
  nombre: string
  ventas_periodo: number | null
  num_ventas_periodo: number | null
}
type Comision = {
  id: number
  usuario_id: number
  usuario_nombre: string
  monto: number
  motivo: string | null
  venta_id: number | null
}
type Ranking = { puntos_totales: number; posicion: number }
type Venta = {
  id: number
  total: number
  estado: string
  fecha_creacion: string
  clientes: { nombre: string } | null
  usuarios: { nombre: string } | null
}

export default async function MiEquipoPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'supervisor' && usuario.rol !== 'admin') redirect('/inicio')

  const { ok, error } = await searchParams
  const supabase = await createClient()

  const [
    { data: asesoresData },
    { data: periodoAbierto },
    { data: comisionesRed },
    { data: misComisionesData },
    { data: rankingData },
    { data: ventasData },
  ] = await Promise.all([
    supabase
      .from('vw_mi_red')
      .select('usuario_id, nombre, ventas_periodo, num_ventas_periodo')
      .eq('rol', 'asesor')
      .order('ventas_periodo', { ascending: false }),
    supabase.from('periodos').select('id').eq('estado', 'abierto').order('fecha_inicio', { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from('vw_comisiones_red')
      .select('id, usuario_id, usuario_nombre, monto, motivo, venta_id')
      .order('fecha_creacion', { ascending: false })
      .limit(100),
    // Aparte y sin límite: "mi comisión" debe sumar el ledger completo,
    // no solo la ventana reciente que se muestra en pantalla.
    supabase.from('vw_comisiones_red').select('monto').eq('usuario_id', usuario.id),
    supabase
      .from('vw_ranking')
      .select('puntos_totales, posicion')
      .eq('usuario_id', usuario.id)
      .order('periodo_id', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('ventas')
      .select('id, total, estado, fecha_creacion, clientes ( nombre ), usuarios ( nombre )')
      .neq('estado', 'anulada')
      .order('fecha_creacion', { ascending: false })
      .limit(30),
  ])

  const asesores = (asesoresData ?? []) as MiembroRed[]
  const comisiones = (comisionesRed ?? []) as Comision[]
  const ranking = rankingData as Ranking | null
  const ventas = (ventasData ?? []) as unknown as Venta[]

  const miComision = (misComisionesData ?? []).reduce((acc, c) => acc + c.monto, 0)
  const comisionesAsesores = comisiones.filter((c) => c.usuario_id !== usuario.id)

  let meta: { monto_meta: number } | null = null
  if (periodoAbierto) {
    const { data } = await supabase
      .from('metas')
      .select('monto_meta')
      .eq('ambito', 'vendedor')
      .eq('usuario_id', usuario.id)
      .eq('periodo_id', periodoAbierto.id)
      .maybeSingle()
    meta = data
  }
  const ventasDelPeriodo = asesores.reduce((acc, a) => acc + (a.ventas_periodo ?? 0), 0)
  const faltante = meta ? Math.max(0, meta.monto_meta - ventasDelPeriodo) : null

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Mi equipo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {asesores.length} asesor{asesores.length !== 1 ? 'es' : ''} en tu red.
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

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Target className="h-3.5 w-3.5" /> Meta del período
          </p>
          <p className="mt-1 text-xl font-bold text-foreground">
            {meta ? formatearPrecio(meta.monto_meta) : 'Sin meta asignada'}
          </p>
          {faltante != null && (
            <p className="text-xs text-muted-foreground">Faltan {formatearPrecio(faltante)}</p>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <HandCoins className="h-3.5 w-3.5" /> Mi comisión (red)
          </p>
          <p className="mt-1 text-xl font-bold text-foreground">{formatearPrecio(miComision)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Trophy className="h-3.5 w-3.5" /> Mis puntos
          </p>
          <p className="mt-1 text-xl font-bold text-foreground">{ranking?.puntos_totales ?? 0}</p>
          {ranking?.posicion && <p className="text-xs text-muted-foreground">Posición #{ranking.posicion}</p>}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <Users className="h-4 w-4 text-primary" /> Top asesores (este mes)
        </h2>
        {asesores.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no tienes asesores.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-semibold">Asesor</th>
                  <th className="px-4 py-2 text-right font-semibold">Ventas</th>
                  <th className="px-4 py-2 text-right font-semibold">Monto</th>
                </tr>
              </thead>
              <tbody>
                {asesores.map((a) => (
                  <tr key={a.usuario_id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-foreground">{a.nombre}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{a.num_ventas_periodo ?? 0}</td>
                    <td className="px-4 py-2 text-right font-semibold text-foreground">
                      {formatearPrecio(a.ventas_periodo ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {comisionesAsesores.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <HandCoins className="h-4 w-4 text-primary" /> Comisiones de mis asesores
          </h2>
          <div className="flex flex-col gap-2">
            {comisionesAsesores.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{c.usuario_nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.motivo ?? 'Comisión'}
                    {c.venta_id && (
                      <>
                        {' · '}
                        <a href={`/ventas#venta-${c.venta_id}`} className="font-medium text-primary hover:underline">
                          venta #{c.venta_id}
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <span className="shrink-0 font-bold text-foreground">{formatearPrecio(c.monto)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <Ban className="h-4 w-4 text-primary" /> Ventas de mi red
        </h2>
        <p className="text-xs text-muted-foreground">
          Puedes anular cualquier venta de tu red, esté o no aprobado su comprobante.
        </p>
        <div className="flex flex-col gap-2">
          {ventas.map((v) => (
            <div key={v.id} className={cn('flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3')}>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Venta #{v.id} · {v.usuarios?.nombre ?? '—'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {v.clientes?.nombre ?? 'Cliente sin nombre'} · {formatearFecha(v.fecha_creacion)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-bold text-foreground">{formatearPrecio(v.total)}</span>
                <details>
                  <summary className="cursor-pointer list-none rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-destructive">
                    Anular
                  </summary>
                  <form
                    action={anularVenta}
                    className="absolute right-4 z-10 mt-1 flex w-64 flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-lg"
                  >
                    <input type="hidden" name="venta_id" value={v.id} />
                    <input type="hidden" name="redireccion" value="/red/equipo" />
                    <textarea
                      name="motivo"
                      required
                      placeholder="Motivo de la anulación"
                      rows={2}
                      className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-md bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20"
                    >
                      Confirmar anulación
                    </button>
                  </form>
                </details>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Link href="/ranking" className="text-sm font-medium text-primary hover:underline">
        Ver ranking completo →
      </Link>
    </main>
  )
}
