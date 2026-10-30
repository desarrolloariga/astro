import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { FileSpreadsheet, FileText, Scale, Shuffle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { clasesCampo, montoContable } from '@/lib/contabilidad-general'
import { cargarCatalogosCaptura } from '@/lib/contabilidad-servidor'
import { BotonConfirmar } from '@/components/app/boton-confirmar'
import { Encabezado, EnlaceVolver, Mensajes } from '@/components/contabilidad/comunes'
import { cambiarLinea, cerrarEstado, cruzarAutomatico, cruzarLinea, registrarDesdeLinea } from '../acciones'

export const metadata = { title: 'Conciliación con estado de cuenta — ASTRO' }

type Linea = {
  id: number
  fila: number | null
  fecha: string
  descripcion: string | null
  referencia: string | null
  monto: number
  saldo: number | null
  movimiento_id: number | null
  estado: 'pendiente' | 'conciliada' | 'ignorada'
  nota: string | null
}
type Mov = { id: number; fecha: string; tipo: string; origen: string; monto: number; descripcion: string; referencia: string | null }
type ItemReporte = { id: number; fecha: string; descripcion: string | null; referencia: string | null; monto: number }
type Reporte = {
  cuenta: { nombre: string; banco: string | null; numero: string | null; moneda: string }
  desde: string
  hasta: string
  estado: string
  saldo_banco: number
  depositos_transito: number
  lista_transito: ItemReporte[]
  pagos_circulacion: number
  lista_circulacion: ItemReporte[]
  no_registradas: number
  lista_no_registradas: ItemReporte[]
  saldo_conciliado: number
  saldo_libros: number
  diferencia: number
  lineas: { total: number; conciliadas: number; pendientes: number; ignoradas: number }
}

const fecha = (f: string) => f.split('-').reverse().join('/')
const signado = (m: Mov) => (m.tipo === 'ingreso' ? Number(m.monto) : -Number(m.monto))
const dias = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000)

export default async function EstadoCuentaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ok?: string; error?: string; ver?: string }>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const estadoId = Number(id)
  if (!Number.isInteger(estadoId) || estadoId <= 0) notFound()
  const supabase = await createClient()
  const [puede, { data: estadoData }, { data: lineasData }, { data: repData, error: errorRep }, catalogos] = await Promise.all([
    tienePermiso('bancos', 'gestionar'),
    supabase.from('estados_cuenta').select('id, cuenta_id, desde, hasta, estado').eq('id', estadoId).maybeSingle(),
    supabase.from('estado_cuenta_lineas').select('*').eq('estado_cuenta_id', estadoId).order('fecha').order('id'),
    supabase.rpc('fn_banco_reporte_conciliacion', { p_estado_id: estadoId }),
    cargarCatalogosCaptura(supabase),
  ])
  if (!puede) redirect('/inicio')
  if (!estadoData || !repData) notFound()
  const estado = estadoData as { id: number; cuenta_id: number; desde: string; hasta: string; estado: string }
  const lineas = (lineasData ?? []) as Linea[]
  const rep = repData as Reporte
  const abierto = estado.estado === 'abierto'
  const moneda = rep.cuenta.moneda === 'USD' ? 'US$' : 'Q'

  // Movimientos del libro (para cruzar a mano y mostrar los ya cruzados).
  const desde = new Date(`${estado.desde}T12:00:00Z`)
  desde.setUTCDate(desde.getUTCDate() - 31)
  const hasta = new Date(`${estado.hasta}T12:00:00Z`)
  hasta.setUTCDate(hasta.getUTCDate() + 31)
  const { data: movData } = await supabase
    .from('movimientos_banco')
    .select('id, fecha, tipo, origen, monto, descripcion, referencia')
    .eq('cuenta_id', estado.cuenta_id)
    .eq('anulado', false)
    .gte('fecha', desde.toISOString().slice(0, 10))
    .lte('fecha', hasta.toISOString().slice(0, 10))
    .order('fecha')
  const movimientos = (movData ?? []) as Mov[]
  const porId = new Map(movimientos.map((m) => [m.id, m]))
  const usados = new Set(lineas.map((l) => l.movimiento_id).filter(Boolean))
  const libres = movimientos.filter((m) => !usados.has(m.id))
  const candidatos = (l: Linea) =>
    libres
      .filter((m) => Math.sign(signado(m)) === Math.sign(Number(l.monto)))
      .sort((a, b) => Number(signado(b) === Number(l.monto)) - Number(signado(a) === Number(l.monto)) || dias(a.fecha, l.fecha) - dias(b.fecha, l.fecha))
      .slice(0, 8)

  const ver = sp.ver ?? (rep.lineas.pendientes > 0 ? 'pendiente' : 'todas')
  const visibles = lineas.filter((l) => ver === 'todas' || l.estado === ver)
  const reporte = (formato: string) => `/contabilidad/bancos/estado-cuenta/${estadoId}/reporte?formato=${formato}`

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={Scale}
        titulo={`Conciliación · ${rep.cuenta.nombre}`}
        descripcion={`Estado de cuenta del ${fecha(rep.desde)} al ${fecha(rep.hasta)}${rep.cuenta.numero ? ` · cuenta ${rep.cuenta.numero}` : ''} · ${rep.cuenta.moneda}`}
      >
        <EnlaceVolver href="/contabilidad/bancos/estado-cuenta">← Estados de cuenta</EnlaceVolver>
      </Encabezado>
      <Mensajes ok={sp.ok} error={sp.error ?? errorRep?.message} />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-sm font-semibold">Reporte de conciliación al {fecha(rep.hasta)}</p>
          <table className="w-full text-sm">
            <tbody>
              {[
                { e: 'Saldo según estado de cuenta', v: rep.saldo_banco, b: true },
                { e: `(+) Depósitos en tránsito (${rep.lista_transito.length})`, v: rep.depositos_transito },
                { e: `(−) Pagos y cheques en circulación (${rep.lista_circulacion.length})`, v: -rep.pagos_circulacion },
                { e: `(±) Partidas del banco aún no registradas (${rep.lista_no_registradas.length})`, v: -rep.no_registradas },
                { e: 'Saldo conciliado', v: rep.saldo_conciliado, b: true },
                { e: 'Saldo según libro de bancos', v: rep.saldo_libros, b: true },
              ].map((f) => (
                <tr key={f.e} className={cn('border-b border-border/50', f.b && 'font-semibold')}>
                  <td className="py-1.5">{f.e}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {moneda} {montoContable(f.v)}
                  </td>
                </tr>
              ))}
              <tr className={cn('font-bold', Number(rep.diferencia) === 0 ? 'text-primary' : 'text-destructive')}>
                <td className="py-2">Diferencia</td>
                <td className="py-2 text-right tabular-nums">
                  {Number(rep.diferencia) === 0 ? 'Cuadra' : `${moneda} ${montoContable(rep.diferencia)}`}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="mt-2 flex gap-3 text-xs font-semibold">
            <a href={reporte('xlsx')} className="inline-flex items-center gap-1 text-primary hover:underline">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
            </a>
            <a href={reporte('pdf')} target="_blank" className="inline-flex items-center gap-1 text-primary hover:underline">
              <FileText className="h-3.5 w-3.5" /> PDF
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <p className="font-semibold">Avance</p>
          <p>
            {rep.lineas.conciliadas} cruzadas · {rep.lineas.pendientes} pendientes · {rep.lineas.ignoradas} ignoradas de {rep.lineas.total}
          </p>
          {abierto ? (
            <>
              <form action={cruzarAutomatico} className="flex items-center gap-2">
                <input type="hidden" name="estado_id" value={estadoId} />
                <label className="text-xs text-muted-foreground">
                  ±
                  <input name="dias" type="number" min="0" max="31" defaultValue="3" className="mx-1 w-12 rounded border border-input bg-background px-1 py-0.5 text-xs" />
                  días
                </label>
                <button type="submit" className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                  <Shuffle className="h-3.5 w-3.5" /> Cruzar automáticamente
                </button>
              </form>
              <form action={cerrarEstado} className="flex flex-col gap-2 border-t border-border pt-3">
                <input type="hidden" name="estado_id" value={estadoId} />
                <input name="notas" placeholder="Notas del cierre (opcional)" className={cn(clasesCampo, 'py-1.5 text-xs')} />
                <BotonConfirmar
                  mensaje="¿Cerrar la conciliación del mes? Los movimientos cruzados quedan amarrados a esta conciliación."
                  disabled={rep.lineas.pendientes > 0 || Number(rep.diferencia) !== 0}
                  className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  {rep.lineas.pendientes > 0 ? 'Resuelve las líneas pendientes para cerrar' : Number(rep.diferencia) !== 0 ? 'La conciliación no cuadra' : 'Cerrar conciliación del mes'}
                </BotonConfirmar>
              </form>
            </>
          ) : (
            <p className="rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">Conciliación cerrada.</p>
          )}
        </div>
      </section>

      <div className="flex gap-2 text-sm">
        {[
          { v: 'pendiente', e: `Pendientes (${rep.lineas.pendientes})` },
          { v: 'conciliada', e: `Cruzadas (${rep.lineas.conciliadas})` },
          { v: 'ignorada', e: `Ignoradas (${rep.lineas.ignoradas})` },
          { v: 'todas', e: `Todas (${rep.lineas.total})` },
        ].map((f) => (
          <Link
            key={f.v}
            href={`/contabilidad/bancos/estado-cuenta/${estadoId}?ver=${f.v}`}
            className={cn('rounded-lg px-3 py-1.5 font-semibold', ver === f.v ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}
          >
            {f.e}
          </Link>
        ))}
      </div>

      <ul className="flex flex-col gap-2">
        {visibles.length === 0 && (
          <li className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Sin líneas en esta vista.</li>
        )}
        {visibles.map((l) => {
          const mov = l.movimiento_id ? porId.get(l.movimiento_id) : undefined
          return (
            <li key={l.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="text-xs text-muted-foreground">{fecha(l.fecha)} · fila {l.fila}</span>
                  <span className="block font-medium">
                    {l.descripcion ?? '—'}
                    {l.referencia && <span className="ml-2 font-mono text-xs text-muted-foreground">{l.referencia}</span>}
                  </span>
                </span>
                <span className={cn('font-semibold tabular-nums', Number(l.monto) > 0 ? 'text-emerald-700' : 'text-foreground')}>
                  {Number(l.monto) > 0 ? '+' : '−'}
                  {moneda} {montoContable(Math.abs(Number(l.monto)))}
                </span>
              </div>

              {l.estado === 'conciliada' && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary/5 px-3 py-1.5 text-xs">
                  <span className="text-primary">
                    ✓ Cruzada con: {mov ? `${fecha(mov.fecha)} · ${mov.descripcion}${mov.referencia ? ` · ${mov.referencia}` : ''}` : `movimiento #${l.movimiento_id}`}
                  </span>
                  {abierto && (
                    <form action={cambiarLinea}>
                      <input type="hidden" name="estado_id" value={estadoId} />
                      <input type="hidden" name="linea_id" value={l.id} />
                      <input type="hidden" name="accion" value="descruzar" />
                      <button type="submit" className="font-semibold text-muted-foreground hover:text-destructive">
                        Descruzar
                      </button>
                    </form>
                  )}
                </div>
              )}
              {l.estado === 'ignorada' && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground">
                  <span>Ignorada: {l.nota}</span>
                  {abierto && (
                    <form action={cambiarLinea}>
                      <input type="hidden" name="estado_id" value={estadoId} />
                      <input type="hidden" name="linea_id" value={l.id} />
                      <input type="hidden" name="accion" value="pendiente" />
                      <button type="submit" className="font-semibold hover:text-foreground">
                        Volver a pendiente
                      </button>
                    </form>
                  )}
                </div>
              )}
              {l.estado === 'pendiente' && abierto && (
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
                  <form action={cruzarLinea} className="flex gap-1">
                    <input type="hidden" name="estado_id" value={estadoId} />
                    <input type="hidden" name="linea_id" value={l.id} />
                    <select name="movimiento_id" defaultValue="" className={cn(clasesCampo, 'py-1 text-xs')}>
                      <option value="">Cruzar con un movimiento del libro…</option>
                      {candidatos(l).map((m) => (
                        <option key={m.id} value={m.id}>
                          {signado(m) === Number(l.monto) ? '= ' : ''}
                          {fecha(m.fecha)} · {montoContable(m.monto)} · {m.descripcion.slice(0, 40)}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="rounded-lg border border-border px-2 text-xs font-semibold hover:bg-muted">
                      Cruzar
                    </button>
                  </form>
                  <details className="lg:col-span-1">
                    <summary className="cursor-pointer text-xs font-semibold text-primary">Registrar en libros (nota {Number(l.monto) > 0 ? 'de crédito' : 'de débito'})</summary>
                    <form action={registrarDesdeLinea} className="mt-1 flex flex-col gap-1">
                      <input type="hidden" name="estado_id" value={estadoId} />
                      <input type="hidden" name="linea_id" value={l.id} />
                      <select name="cuenta_contrapartida_id" required defaultValue="" className={cn(clasesCampo, 'py-1 text-xs')}>
                        <option value="" disabled>
                          Cuenta contable…
                        </option>
                        {catalogos.cuentas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.codigo} {c.nombre}
                          </option>
                        ))}
                      </select>
                      <select name="centro_costo_id" defaultValue="" className={cn(clasesCampo, 'py-1 text-xs')}>
                        <option value="">Centro de costo (gastos)</option>
                        {catalogos.centros.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.codigo}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">
                        Registrar y cruzar
                      </button>
                    </form>
                  </details>
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Ignorar</summary>
                    <form action={cambiarLinea} className="mt-1 flex gap-1">
                      <input type="hidden" name="estado_id" value={estadoId} />
                      <input type="hidden" name="linea_id" value={l.id} />
                      <input type="hidden" name="accion" value="ignorar" />
                      <input name="nota" required placeholder="Motivo (ej. cargo duplicado reclamado)" className={cn(clasesCampo, 'py-1 text-xs')} />
                      <button type="submit" className="rounded-lg border border-border px-2 text-xs font-semibold">
                        Ignorar
                      </button>
                    </form>
                  </details>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {(rep.lista_transito.length > 0 || rep.lista_circulacion.length > 0) && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[
            { t: 'Depósitos en tránsito (en libros, aún no en el banco)', l: rep.lista_transito },
            { t: 'Pagos y cheques en circulación (en libros, aún no en el banco)', l: rep.lista_circulacion },
          ].map((b) => (
            <div key={b.t} className="rounded-xl border border-border bg-card p-4 text-sm">
              <p className="mb-2 font-semibold">{b.t}</p>
              {b.l.length === 0 ? (
                <p className="text-xs text-muted-foreground">Ninguno.</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {b.l.map((i) => (
                    <li key={i.id} className="flex justify-between gap-2 py-1 text-xs">
                      <span>
                        {fecha(i.fecha)} · {i.descripcion}
                        {i.referencia ? ` · ${i.referencia}` : ''}
                      </span>
                      <span className="tabular-nums">{montoContable(i.monto)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  )
}
