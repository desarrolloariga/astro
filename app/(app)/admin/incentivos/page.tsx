import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, Percent, Gauge, FlaskConical } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { crearReglaPuntaje, alternarReglaPuntaje, crearTope, crearEscala } from './acciones'

export const metadata = { title: 'Reglas de incentivos — ASTRO' }

const tiposRegla = [
  { valor: 'por_venta_fija', etiqueta: 'Puntos fijos por venta', ayuda: 'No necesita condiciones.' },
  { valor: 'por_monto', etiqueta: 'Puntos por monto vendido', ayuda: '{"por_cada": 100} → puntos por cada $100 del total' },
  { valor: 'por_categoria', etiqueta: 'Puntos por categoría', ayuda: '{"categoria_id": 3}' },
  { valor: 'por_margen', etiqueta: 'Puntos por margen', ayuda: '{"margen_minimo": 30} (porcentaje)' },
  { valor: 'primera_venta_mes', etiqueta: 'Primera venta del mes', ayuda: 'No necesita condiciones.' },
  { valor: 'cliente_nuevo', etiqueta: 'Venta a cliente nuevo', ayuda: 'No necesita condiciones.' },
  { valor: 'curso_completado', etiqueta: 'Curso completado (Academia)', ayuda: 'Se activará en la fase de Academia.' },
]

type ReglaPuntaje = {
  id: number
  nombre: string
  tipo: string
  condiciones: Record<string, unknown>
  valor: number
  multiplicador: number
  activo: boolean
  version: number
}
type TopeVenta = {
  id: number
  ambito: string
  monto_tope: number
  roles: { nombre: string } | null
  usuarios: { nombre: string } | null
  escalas_descuento: { id: number; desde_monto: number; porcentaje_descuento: number }[]
}
type Periodo = { id: number; nombre: string }
type Simulacion = { usuario_id: number; usuario_nombre: string; puntos_estimados: number }
type PuntoReal = { usuario_id: number; cantidad: number }

export default async function AdminIncentivosPage({
  searchParams,
}: {
  searchParams: Promise<{
    ok?: string
    error?: string
    sim_tipo?: string
    sim_valor?: string
    sim_multiplicador?: string
    sim_condiciones?: string
    sim_periodo_id?: string
  }>
}) {
  if (!(await tienePermiso('incentivos', 'editar'))) redirect('/inicio')

  const sp = await searchParams
  const supabase = await createClient()

  const [{ data: reglas }, { data: topes }, { data: roles }, { data: periodos }] = await Promise.all([
    supabase.from('reglas_puntaje').select('*').order('fecha_creacion', { ascending: false }),
    supabase
      .from('topes_venta')
      .select('id, ambito, monto_tope, roles ( nombre ), usuarios ( nombre ), escalas_descuento ( id, desde_monto, porcentaje_descuento )')
      .order('fecha_creacion', { ascending: false }),
    supabase.from('roles').select('id, nombre').order('nombre'),
    supabase.from('periodos').select('id, nombre').order('fecha_inicio', { ascending: false }).limit(12),
  ])

  const listaReglas = (reglas ?? []) as ReglaPuntaje[]
  const listaTopes = (topes ?? []) as unknown as TopeVenta[]
  const listaPeriodos = (periodos ?? []) as Periodo[]

  let simulacion: Simulacion[] | null = null
  let puntosRealesPorUsuario = new Map<number, number>()
  if (sp.sim_tipo && sp.sim_periodo_id) {
    let condiciones: object = {}
    try {
      condiciones = sp.sim_condiciones ? JSON.parse(sp.sim_condiciones) : {}
    } catch {
      condiciones = {}
    }
    const [{ data }, { data: puntosReales }] = await Promise.all([
      supabase.rpc('fn_simular_regla_puntaje', {
        p_tipo: sp.sim_tipo,
        p_valor: Number(sp.sim_valor ?? 0),
        p_multiplicador: Number(sp.sim_multiplicador ?? 1),
        p_condiciones: condiciones,
        p_periodo_id: Number(sp.sim_periodo_id),
      }),
      // Cruce contra lo realmente otorgado en el período — el simulador
      // mostraba puntos hipotéticos sin nada real con qué compararlos.
      supabase.from('puntos').select('usuario_id, cantidad').eq('periodo_id', Number(sp.sim_periodo_id)),
    ])
    simulacion = (data ?? []) as Simulacion[]
    for (const p of (puntosReales ?? []) as PuntoReal[]) {
      puntosRealesPorUsuario.set(p.usuario_id, (puntosRealesPorUsuario.get(p.usuario_id) ?? 0) + p.cantidad)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Reglas de incentivos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Puntaje, topes de venta y descuentos por desempeño — todo parametrizable, sin tocar la base de datos.
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

      {/* Reglas de puntaje */}
      <section className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <Gauge className="h-4 w-4 text-primary" /> Reglas de puntaje
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
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  valor {r.valor} · x{r.multiplicador} · v{r.version}
                  {Object.keys(r.condiciones ?? {}).length > 0 && ` · ${JSON.stringify(r.condiciones)}`}
                </p>
              </div>
              <form action={alternarReglaPuntaje}>
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
            + Nueva regla de puntaje
          </summary>
          <form action={crearReglaPuntaje} className="flex flex-col gap-3 px-4 pb-4">
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
            <div className="grid grid-cols-2 gap-3">
              <input
                name="valor"
                type="number"
                step="0.01"
                required
                placeholder="Valor (puntos)"
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <input
                name="multiplicador"
                type="number"
                step="0.01"
                defaultValue="1"
                placeholder="Multiplicador"
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <textarea
              name="condiciones"
              rows={2}
              placeholder='Condiciones JSON (según el tipo elegido, ej. {"categoria_id": 3})'
              className="rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Vigencia desde (opcional)
                <input
                  name="vigencia_inicio"
                  type="date"
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Vigencia hasta (opcional)
                <input
                  name="vigencia_fin"
                  type="date"
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </label>
            </div>
            <button
              type="submit"
              className="mt-1 w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
            >
              Crear regla
            </button>
          </form>
        </details>
      </section>

      {/* Topes y escalas de descuento */}
      <section className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <Percent className="h-4 w-4 text-primary" /> Topes de venta y descuentos por desempeño
        </h2>

        <div className="flex flex-col gap-3">
          {listaTopes.length === 0 && (
            <p className="text-sm text-muted-foreground">Aún no hay topes configurados.</p>
          )}
          {listaTopes.map((t) => (
            <div key={t.id} className="rounded-xl border border-border bg-card p-3">
              <p className="text-sm font-semibold text-foreground">
                {t.ambito === 'global' ? 'Global' : t.ambito === 'rol' ? `Rol: ${t.roles?.nombre}` : `Individual: ${t.usuarios?.nombre}`}
                {' '}
                <span className="font-normal text-muted-foreground">· tope ${t.monto_tope}</span>
              </p>
              <ul className="mt-1 flex flex-wrap gap-2">
                {t.escalas_descuento.map((e) => (
                  <li key={e.id} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                    +${e.desde_monto} → {e.porcentaje_descuento}%
                  </li>
                ))}
              </ul>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-primary">+ Agregar escala</summary>
                <form action={crearEscala} className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="tope_id" value={t.id} />
                  <input
                    name="desde_monto"
                    type="number"
                    step="0.01"
                    required
                    placeholder="Desde el excedente $"
                    className="w-40 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                  <input
                    name="porcentaje_descuento"
                    type="number"
                    step="0.01"
                    required
                    placeholder="% descuento"
                    className="w-32 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90"
                  >
                    Agregar
                  </button>
                </form>
              </details>
            </div>
          ))}
        </div>

        <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">
            + Nuevo tope de venta
          </summary>
          <form action={crearTope} className="flex flex-wrap items-end gap-3 px-4 pb-4">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Ámbito
              <select
                name="ambito"
                required
                defaultValue=""
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="" disabled>
                  Elige
                </option>
                <option value="global">Global</option>
                <option value="rol">Por rol</option>
                <option value="individual">Individual</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Rol (si aplica)
              <select
                name="rol_id"
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">—</option>
                {(roles ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              ID de usuario (si es individual)
              <input
                name="usuario_id"
                type="number"
                className="w-32 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Tope mensual $
              <input
                name="monto_tope"
                type="number"
                step="0.01"
                required
                className="w-36 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
            >
              Crear tope
            </button>
          </form>
        </details>
      </section>

      {/* Simulador */}
      <section className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <FlaskConical className="h-4 w-4 text-primary" /> Simulador de reglas
        </h2>
        <p className="text-xs text-muted-foreground">
          Prueba una regla en borrador contra las ventas ya registradas de un período, sin activarla ni guardar nada.
        </p>
        <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Tipo
            <select
              name="sim_tipo"
              defaultValue={sp.sim_tipo ?? ''}
              required
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="" disabled>
                Elige
              </option>
              {tiposRegla.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Valor
            <input
              name="sim_valor"
              type="number"
              step="0.01"
              defaultValue={sp.sim_valor ?? ''}
              required
              className="w-24 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Multiplicador
            <input
              name="sim_multiplicador"
              type="number"
              step="0.01"
              defaultValue={sp.sim_multiplicador ?? '1'}
              className="w-24 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </label>
          <label className="flex flex-1 min-w-48 flex-col gap-1 text-xs text-muted-foreground">
            Condiciones JSON
            <input
              name="sim_condiciones"
              defaultValue={sp.sim_condiciones ?? ''}
              placeholder='{"categoria_id": 3}'
              className="rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Período
            <select
              name="sim_periodo_id"
              defaultValue={sp.sim_periodo_id ?? ''}
              required
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="" disabled>
                Elige
              </option>
              {listaPeriodos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
          >
            Simular
          </button>
        </form>

        {simulacion && (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {simulacion.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                Esta regla no habría generado puntos en el período elegido.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-semibold">Vendedor</th>
                    <th className="px-4 py-2 text-right font-semibold">Puntos estimados (regla en borrador)</th>
                    <th className="px-4 py-2 text-right font-semibold">Puntos reales ya otorgados</th>
                  </tr>
                </thead>
                <tbody>
                  {simulacion.map((s) => {
                    const real = puntosRealesPorUsuario.get(s.usuario_id) ?? 0
                    return (
                      <tr key={s.usuario_id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 text-foreground">{s.usuario_nombre}</td>
                        <td className="px-4 py-2 text-right font-semibold text-foreground">{s.puntos_estimados}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{real}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
