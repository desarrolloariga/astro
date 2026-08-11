import { Fragment } from 'react'
import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, Percent, Users, Lock, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { formatearPrecio, formatearFecha } from '@/lib/formato'
import { EstadoBadge, type ConfigEstado } from '@/components/app/estado-badge'
import {
  crearReglaComision,
  alternarReglaComision,
  cerrarPeriodo,
  aprobarLiquidacion,
  pagarLiquidacion,
} from './acciones'

export const metadata = { title: 'Comisiones — ASTRO' }

const estadosLiquidacion: ConfigEstado = {
  calculada: { etiqueta: 'Calculada', clases: 'bg-accent text-accent-foreground' },
  aprobada: { etiqueta: 'Aprobada', clases: 'bg-brand-deep-muted/40 text-brand-deep' },
  pagada: { etiqueta: 'Pagada', clases: 'bg-primary/10 text-primary' },
}

const tiposRegla = [
  { valor: 'por_venta', etiqueta: 'Comisión directa por venta', ayuda: '{"categoria_id": 3} para acotar a una categoría (opcional)' },
  { valor: 'liderazgo', etiqueta: 'Liderazgo (red de supervisión)', ayuda: 'rol_id define quién en la cadena de mando la recibe' },
  { valor: 'meta', etiqueta: 'Bono por cumplimiento de meta', ayuda: 'Se evalúa al cerrar el período' },
  { valor: 'crecimiento', etiqueta: 'Bono por crecimiento', ayuda: '{"umbral_crecimiento": 10} en % (se evalúa al cerrar el período)' },
  { valor: 'capacitacion', etiqueta: 'Por capacitación completada', ayuda: 'Se activará con la Academia Virtual' },
  { valor: 'fidelizacion', etiqueta: 'Por fidelización de clientes', ayuda: 'Reservado para una fase posterior' },
]

type ReglaComision = {
  id: number
  nombre: string
  tipo: string
  porcentaje: number | null
  monto_fijo: number | null
  condiciones: Record<string, unknown>
  activo: boolean
  version: number
  roles: { nombre: string } | null
}
type Periodo = { id: number; nombre: string; estado: string }
type Liquidacion = {
  id: number
  usuario_id: number
  total: number
  estado: string
  usuarios: { nombre: string } | null
}
type ComisionDetalle = {
  id: number
  usuario_id: number
  venta_id: number | null
  monto: number
  estado: string
  motivo: string | null
  fecha_creacion: string
}

export default async function AdminComisionesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; periodo_id?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'admin') redirect('/inicio')

  const sp = await searchParams
  const supabase = await createClient()

  const [{ data: reglas }, { data: roles }, { data: periodos }] = await Promise.all([
    supabase.from('reglas_comision').select('*, roles ( nombre )').order('fecha_creacion', { ascending: false }),
    supabase.from('roles').select('id, nombre').order('nombre'),
    supabase.from('periodos').select('id, nombre, estado').order('fecha_inicio', { ascending: false }).limit(12),
  ])

  const listaReglas = (reglas ?? []) as unknown as ReglaComision[]
  const listaPeriodos = (periodos ?? []) as Periodo[]
  const periodoActivoId = sp.periodo_id ? Number(sp.periodo_id) : listaPeriodos[0]?.id
  const periodoActivo = listaPeriodos.find((p) => p.id === periodoActivoId)

  const { data: liquidaciones } = periodoActivoId
    ? await supabase
        .from('liquidaciones')
        .select('id, usuario_id, total, estado, usuarios ( nombre )')
        .eq('periodo_id', periodoActivoId)
        .order('total', { ascending: false })
    : { data: [] }

  const listaLiquidaciones = (liquidaciones ?? []) as unknown as Liquidacion[]

  // Ledger real detrás de cada liquidación — línea por línea, no solo el
  // total consolidado.
  const { data: comisionesPeriodo } = periodoActivoId
    ? await supabase
        .from('comisiones')
        .select('id, usuario_id, venta_id, monto, estado, motivo, fecha_creacion')
        .eq('periodo_id', periodoActivoId)
        .order('fecha_creacion', { ascending: false })
    : { data: [] }

  const comisionesPorUsuario = new Map<number, ComisionDetalle[]>()
  for (const c of (comisionesPeriodo ?? []) as ComisionDetalle[]) {
    const lista = comisionesPorUsuario.get(c.usuario_id) ?? []
    lista.push(c)
    comisionesPorUsuario.set(c.usuario_id, lista)
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Comisiones</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Reglas de comisión, cierre de período y liquidaciones — separado de los puntos: los
          puntos motivan, las comisiones pagan.
        </p>
      </div>

      {sp.ok && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{sp.ok}</span>
        </div>
      )}
      {sp.error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{sp.error}</span>
        </div>
      )}

      {/* Reglas de comisión */}
      <section className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <Percent className="h-4 w-4 text-primary" /> Reglas de comisión
        </h2>

        <div className="flex flex-col gap-2">
          {listaReglas.length === 0 && (
            <p className="text-sm text-muted-foreground">Aún no hay reglas configuradas.</p>
          )}
          {listaReglas.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {r.nombre}{' '}
                  <span className="font-normal text-muted-foreground">
                    · {tiposRegla.find((t) => t.valor === r.tipo)?.etiqueta ?? r.tipo}
                    {r.roles && ` · ${r.roles.nombre}`}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.porcentaje != null && `${r.porcentaje}%`}
                  {r.porcentaje != null && r.monto_fijo != null && ' + '}
                  {r.monto_fijo != null && formatearPrecio(r.monto_fijo)}
                  {' · v'}{r.version}
                  {Object.keys(r.condiciones ?? {}).length > 0 && ` · ${JSON.stringify(r.condiciones)}`}
                </p>
              </div>
              <form action={alternarReglaComision}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="activo" value={r.activo ? '1' : '0'} />
                <button
                  type="submit"
                  className={
                    r.activo
                      ? 'rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary'
                      : 'rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground'
                  }
                >
                  {r.activo ? 'Activa' : 'Inactiva'}
                </button>
              </form>
            </div>
          ))}
        </div>

        <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">
            + Nueva regla de comisión
          </summary>
          <form action={crearReglaComision} className="flex flex-col gap-3 px-4 pb-4">
            <input
              name="nombre"
              required
              placeholder="Nombre de la regla"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <select
              name="tipo"
              required
              defaultValue=""
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="" disabled>
                Tipo de regla
              </option>
              {tiposRegla.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-3">
              <select
                name="rol_id"
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">Cualquier rol</option>
                {(roles ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
              <input
                name="porcentaje"
                type="number"
                step="0.01"
                placeholder="% comisión"
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <input
                name="monto_fijo"
                type="number"
                step="0.01"
                placeholder="Monto fijo $"
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <textarea
              name="condiciones"
              rows={2}
              placeholder='Condiciones JSON según el tipo (ej. {"umbral_crecimiento": 10})'
              className="rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              className="mt-1 w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
            >
              Crear regla
            </button>
          </form>
        </details>
      </section>

      {/* Liquidaciones por período */}
      <section className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <Users className="h-4 w-4 text-primary" /> Liquidaciones
        </h2>

        <form className="flex flex-wrap items-center gap-3">
          <select
            name="periodo_id"
            defaultValue={periodoActivoId}
            className="rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
          >
            {listaPeriodos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} {p.estado === 'cerrado' ? '(cerrado)' : '(abierto)'}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            Ver período
          </button>

          {periodoActivo?.estado === 'abierto' && (
            <form action={cerrarPeriodo}>
              <input type="hidden" name="periodo_id" value={periodoActivoId} />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
              >
                <Lock className="h-4 w-4" />
                Cerrar período y generar liquidaciones
              </button>
            </form>
          )}

          {periodoActivoId && listaLiquidaciones.length > 0 && (
            <a
              href={`/admin/comisiones/exportar?periodo_id=${periodoActivoId}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </a>
          )}
        </form>

        {listaLiquidaciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {periodoActivo?.estado === 'abierto'
              ? 'Este período sigue abierto; ciérralo para generar las liquidaciones.'
              : 'Sin liquidaciones para este período.'}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-semibold">Vendedor</th>
                  <th className="px-4 py-2 font-semibold">Estado</th>
                  <th className="px-4 py-2 text-right font-semibold">Total</th>
                  <th className="px-4 py-2 text-right font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody>
                {listaLiquidaciones.map((l) => {
                  const detalle = comisionesPorUsuario.get(l.usuario_id) ?? []
                  return (
                    <Fragment key={l.id}>
                      <tr className="border-b border-border last:border-0">
                        <td className="px-4 py-2.5 text-foreground">{l.usuarios?.nombre}</td>
                        <td className="px-4 py-2.5">
                          <EstadoBadge estado={l.estado} config={estadosLiquidacion} />
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-foreground">
                          {formatearPrecio(l.total)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {l.estado === 'calculada' && (
                            <form action={aprobarLiquidacion} className="inline">
                              <input type="hidden" name="id" value={l.id} />
                              <button type="submit" className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary">
                                Aprobar
                              </button>
                            </form>
                          )}
                          {l.estado === 'aprobada' && (
                            <form action={pagarLiquidacion} className="inline">
                              <input type="hidden" name="id" value={l.id} />
                              <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90">
                                Marcar pagada
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                      {detalle.length > 0 && (
                        <tr key={`${l.id}-detalle`} className="border-b border-border last:border-0 bg-secondary/20">
                          <td colSpan={4} className="px-4 py-2">
                            <details>
                              <summary className="w-fit cursor-pointer list-none text-xs font-semibold text-primary">
                                Ver {detalle.length} comisión{detalle.length > 1 ? 'es' : ''} que componen este total
                              </summary>
                              <div className="mt-2 flex flex-col gap-1.5">
                                {detalle.map((c) => (
                                  <div
                                    key={c.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs"
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-foreground">{c.motivo ?? 'Comisión'}</p>
                                      <p className="text-muted-foreground">
                                        {formatearFecha(c.fecha_creacion)}
                                        {c.venta_id && (
                                          <>
                                            {' · '}
                                            <a
                                              href={`/ventas#venta-${c.venta_id}`}
                                              className="font-medium text-primary hover:underline"
                                            >
                                              venta #{c.venta_id}
                                            </a>
                                          </>
                                        )}
                                      </p>
                                    </div>
                                    <span className="shrink-0 font-semibold text-foreground">
                                      {formatearPrecio(c.monto)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
