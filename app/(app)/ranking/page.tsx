import { redirect } from 'next/navigation'
import { Trophy, Medal, Award } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Ranking — ASTRO' }

const nombresRol: Record<string, string> = {
  admin: 'Administración',
  coordinador: 'Coordinación',
  supervisor: 'Supervisor',
  asesor: 'Asesor',
  embajador: 'Embajador',
  tienda: 'Tienda',
}

type Periodo = { id: number; nombre: string; tipo: string }
type FilaRanking = {
  usuario_id: number
  nombre: string
  rol: string
  tienda: string | null
  puntos_totales: number
  posicion: number
}
type Premio = { posicion_desde: number; posicion_hasta: number; descripcion: string }
type Nivel = { usuario_id: number; niveles: { nombre: string } | null }
type PuntoDetalle = {
  id: number
  cantidad: number
  motivo: string | null
  venta_id: number | null
  fecha_creacion: string
}

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo_id?: string; rol?: string; tienda_id?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol === 'produccion' || usuario.rol === 'contabilidad') redirect('/inicio')

  const { periodo_id, rol, tienda_id } = await searchParams
  const supabase = await createClient()

  const { data: periodos } = await supabase
    .from('periodos')
    .select('id, nombre, tipo')
    .order('fecha_inicio', { ascending: false })
    .limit(12)

  const listaPeriodos = (periodos ?? []) as Periodo[]
  const periodoActivoId = periodo_id ? Number(periodo_id) : listaPeriodos[0]?.id

  if (!periodoActivoId) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 px-4 py-16 text-center">
        <Trophy className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
        <p className="text-sm font-semibold text-foreground">Aún no hay períodos con actividad</p>
        <p className="text-sm text-muted-foreground">El ranking aparecerá con la primera venta registrada.</p>
      </main>
    )
  }

  let consulta = supabase
    .from('vw_ranking')
    .select('usuario_id, nombre, rol, tienda, tienda_id, puntos_totales, posicion')
    .eq('periodo_id', periodoActivoId)
    .order('posicion', { ascending: true })

  if (rol) consulta = consulta.eq('rol', rol)
  if (tienda_id) consulta = consulta.eq('tienda_id', Number(tienda_id))

  const [{ data: filas }, { data: premiosData }, { data: tiendas }] = await Promise.all([
    consulta,
    supabase
      .from('premios')
      .select('posicion_desde, posicion_hasta, descripcion')
      .eq('periodo_id', periodoActivoId)
      .order('posicion_desde'),
    supabase.from('tiendas').select('id, nombre').eq('activo', true).order('nombre'),
  ])

  const ranking = (filas ?? []) as FilaRanking[]
  const premios = (premiosData ?? []) as Premio[]

  const { data: nivelesData } = ranking.length
    ? await supabase
        .from('usuario_niveles')
        .select('usuario_id, niveles ( nombre )')
        .eq('periodo_id', periodoActivoId)
        .in('usuario_id', ranking.map((f) => f.usuario_id))
    : { data: [] }

  const nivelPorUsuario = new Map(
    ((nivelesData ?? []) as unknown as Nivel[]).map((n) => [n.usuario_id, n.niveles?.nombre]),
  )

  // El ledger de puntos (venta, regla, cantidad) nunca se mostraba en
  // ningún lado pese a tener trazabilidad completa — se expone aquí,
  // acotado al propio usuario y período para no saturar la pantalla.
  const { data: misPuntosData } = await supabase
    .from('puntos')
    .select('id, cantidad, motivo, venta_id, fecha_creacion')
    .eq('usuario_id', usuario.id)
    .eq('periodo_id', periodoActivoId)
    .order('fecha_creacion', { ascending: false })
  const misPuntos = (misPuntosData ?? []) as PuntoDetalle[]

  function premioDe(posicion: number) {
    return premios.find((p) => posicion >= p.posicion_desde && posicion <= p.posicion_hasta)?.descripcion
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Ranking</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Posiciones del período por puntos acumulados. Se reinicia cada ciclo.
        </p>
      </div>

      <form className="flex flex-wrap items-center gap-3">
        <select
          name="periodo_id"
          defaultValue={periodoActivoId}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
        >
          {listaPeriodos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <select
          name="rol"
          defaultValue={rol ?? ''}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
        >
          <option value="">Todos los roles</option>
          <option value="supervisor">Supervisor</option>
          <option value="asesor">Asesor</option>
          <option value="embajador">Embajador</option>
          <option value="tienda">Tienda</option>
        </select>
        <select
          name="tienda_id"
          defaultValue={tienda_id ?? ''}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
        >
          <option value="">Todas las tiendas</option>
          {(tiendas ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          Filtrar
        </button>
      </form>

      {misPuntos.length > 0 && (
        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="w-fit cursor-pointer list-none text-sm font-semibold text-primary">
            Ver el detalle de tus {misPuntos.length} punto{misPuntos.length > 1 ? 's' : ''} este período
          </summary>
          <div className="mt-3 flex flex-col gap-1.5">
            {misPuntos.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate text-foreground">{p.motivo ?? 'Puntos otorgados'}</p>
                  <p className="text-muted-foreground">
                    {new Date(p.fecha_creacion).toLocaleDateString('es-GT', {
                      day: '2-digit',
                      month: 'short',
                    })}
                    {p.venta_id && (
                      <>
                        {' · '}
                        <a href={`/ventas#venta-${p.venta_id}`} className="font-medium text-primary hover:underline">
                          venta #{p.venta_id}
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <span className="shrink-0 font-bold text-foreground">+{p.cantidad}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {ranking.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Trophy className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Sin puntos todavía en este período</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Vendedor</th>
                <th className="px-4 py-3 font-semibold">Rol</th>
                <th className="px-4 py-3 font-semibold">Tienda</th>
                <th className="px-4 py-3 font-semibold">Nivel</th>
                <th className="px-4 py-3 text-right font-semibold">Puntos</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((fila) => {
                const premio = premioDe(fila.posicion)
                const podio = fila.posicion <= 3
                return (
                  <tr key={fila.usuario_id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                          podio ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {fila.posicion === 1 ? (
                          <Trophy className="h-3.5 w-3.5" />
                        ) : fila.posicion <= 3 ? (
                          <Medal className="h-3.5 w-3.5" />
                        ) : (
                          fila.posicion
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground">
                        {fila.nombre}
                        {fila.usuario_id === usuario.id && (
                          <span className="ml-1.5 text-xs font-normal text-primary">(tú)</span>
                        )}
                      </p>
                      {premio && (
                        <p className="flex items-center gap-1 text-xs text-primary">
                          <Award className="h-3 w-3" /> {premio}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {nombresRol[fila.rol] ?? fila.rol}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{fila.tienda ?? '—'}</td>
                    <td className="px-4 py-3">
                      {nivelPorUsuario.get(fila.usuario_id) ? (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
                          {nivelPorUsuario.get(fila.usuario_id)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-foreground">
                      {fila.puntos_totales}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
