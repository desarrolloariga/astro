import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FileSpreadsheet, FileText, Scale } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { hoyGuatemala, rangoMes } from '@/lib/contabilidad'
import { centavos, clasesCampo, esFecha, montoContable, textoPeriodo } from '@/lib/contabilidad-general'
import { Encabezado, Mensajes } from '@/components/contabilidad/comunes'
import { EncabezadoReporte, FiltroRango } from '@/components/contabilidad/filtro-rango'

export const metadata = { title: 'Balance de saldos — ASTRO' }

type Fila = {
  cuenta_id: number
  codigo: string
  nombre: string
  tipo: string
  naturaleza: string
  es_detalle: boolean
  nivel: number
  saldo_anterior: number
  debe: number
  haber: number
  saldo_final: number
}

type Cuadres = {
  activa: boolean
  bancos: { cuenta_bancaria: string; codigo: string | null; saldo_bancos: number; saldo_contable: number }[]
  billetera: { saldo_libro: number; saldo_contable: number }
  inventario?: { saldo_kardex: number; saldo_contable: number }
  pendientes: number
  borradores: number
}

/** Saldo con signo (positivo deudor) → columnas deudor / acreedor. */
const deudor = (n: number) => (n > 0 ? montoContable(n) : '')
const acreedor = (n: number) => (n < 0 ? montoContable(-n) : '')

export default async function BalanceSaldosPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; nivel?: string; cc?: string; ceros?: string }>
}) {
  const sp = await searchParams
  const mes = rangoMes(hoyGuatemala())
  const desde = esFecha(sp.desde) ? sp.desde : mes.desde
  const hasta = esFecha(sp.hasta) ? sp.hasta : mes.hasta
  const nivel = Math.min(4, Math.max(1, Number(sp.nivel) || 4))
  const cc = Number(sp.cc) > 0 ? Number(sp.cc) : null
  const mostrarCeros = sp.ceros === '1'

  const supabase = await createClient()
  const [puedeVer, { data, error }, { data: centros }, { data: empresa }, { data: cuadresData }] = await Promise.all([
    tienePermiso('contabilidad', 'ver'),
    supabase.rpc('fn_balance_saldos', { p_desde: desde, p_hasta: hasta, p_nivel: nivel, p_centro_costo_id: cc }),
    supabase.from('centros_costo').select('id, codigo, nombre').order('codigo'),
    supabase.from('empresa_contable').select('razon_social, nit').eq('id', 1).maybeSingle(),
    supabase.rpc('fn_ctb_cuadres', { p_hasta: hasta }),
  ])
  const cuadres = cuadresData as Cuadres | null
  if (!puedeVer) redirect('/inicio')

  const filas = ((data ?? []) as Fila[]).map((f) => ({
    ...f,
    saldo_anterior: Number(f.saldo_anterior),
    debe: Number(f.debe),
    haber: Number(f.haber),
    saldo_final: Number(f.saldo_final),
  }))
  const visibles = mostrarCeros
    ? filas
    : filas.filter((f) => f.saldo_anterior !== 0 || f.debe !== 0 || f.haber !== 0 || f.saldo_final !== 0)
  // Totales con las cuentas de primer nivel (ya acumulan todo; sumar detalle duplicaría).
  const raiz = filas.filter((f) => f.nivel === 1)
  const sumar = (fn: (f: Fila) => number) => raiz.reduce((a, f) => a + fn(f), 0)
  const totales = {
    antDeudor: sumar((f) => Math.max(f.saldo_anterior, 0)),
    antAcreedor: sumar((f) => Math.max(-f.saldo_anterior, 0)),
    debe: sumar((f) => f.debe),
    haber: sumar((f) => f.haber),
    finDeudor: sumar((f) => Math.max(f.saldo_final, 0)),
    finAcreedor: sumar((f) => Math.max(-f.saldo_final, 0)),
  }
  const cuadraMovimiento = centavos(totales.debe) === centavos(totales.haber)
  const cuadraSaldo = centavos(totales.finDeudor) === centavos(totales.finAcreedor)

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={Scale}
        titulo="Balance de saldos"
        descripcion="Saldo anterior, movimiento del período y saldo final de cada cuenta. Las cuentas Madre suman a sus subcuentas. Vista previa: el formato oficial con folio llega con los libros SAT."
      />
      <Mensajes error={error?.message} />

      <FiltroRango desde={desde} hasta={hasta}>
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Nivel
          <select name="nivel" defaultValue={String(nivel)} className={clasesCampo}>
            <option value="1">1 · Grupo</option>
            <option value="2">2 · Subgrupo</option>
            <option value="3">3 · Mayor</option>
            <option value="4">4 · Detalle</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Centro de costo
          <select name="cc" defaultValue={cc ? String(cc) : ''} className={clasesCampo}>
            <option value="">Todos</option>
            {((centros ?? []) as { id: number; codigo: string; nombre: string }[]).map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} · {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-foreground">
          <input type="checkbox" name="ceros" value="1" defaultChecked={mostrarCeros} className="h-4 w-4" />
          Incluir cuentas sin saldo
        </label>
        <a href={`/contabilidad/reportes/exportar?reporte=balance_saldos&desde=${desde}&hasta=${hasta}&nivel=${nivel}&formato=xlsx`} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
          <FileSpreadsheet className="h-4 w-4 text-primary" /> Excel
        </a>
        <a href={`/contabilidad/reportes/exportar?reporte=balance_saldos&desde=${desde}&hasta=${hasta}&nivel=${nivel}&formato=pdf`} target="_blank" className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
          <FileText className="h-4 w-4 text-primary" /> PDF
        </a>
      </FiltroRango>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <EncabezadoReporte
          razonSocial={(empresa as { razon_social: string } | null)?.razon_social ?? '—'}
          nit={(empresa as { nit: string } | null)?.nit ?? '—'}
          titulo={cc ? 'Balance de saldos por centro de costo' : 'Balance de saldos'}
          periodo={textoPeriodo(desde, hasta)}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th rowSpan={2} className="px-2 py-2 text-left">Código</th>
                <th rowSpan={2} className="px-2 py-2 text-left">Cuenta</th>
                <th colSpan={2} className="border-l border-border px-2 pt-2 text-center">Saldo anterior</th>
                <th colSpan={2} className="border-l border-border px-2 pt-2 text-center">Movimiento</th>
                <th colSpan={2} className="border-l border-border px-2 pt-2 text-center">Saldo final</th>
              </tr>
              <tr>
                <th className="border-l border-border px-2 py-1 text-right">Deudor</th>
                <th className="px-2 py-1 text-right">Acreedor</th>
                <th className="border-l border-border px-2 py-1 text-right">Debe</th>
                <th className="px-2 py-1 text-right">Haber</th>
                <th className="border-l border-border px-2 py-1 text-right">Deudor</th>
                <th className="px-2 py-1 text-right">Acreedor</th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-8 text-center text-muted-foreground">
                    No hay movimientos contabilizados en el período.
                  </td>
                </tr>
              )}
              {visibles.map((f) => (
                <tr key={f.cuenta_id} className={cn('border-b border-border/50', !f.es_detalle && 'font-semibold')}>
                  <td className="whitespace-nowrap px-2 py-1 font-mono text-xs text-muted-foreground">{f.codigo}</td>
                  <td className="px-2 py-1">
                    {f.es_detalle ? (
                      <Link
                        href={`/contabilidad/libro-mayor?cuenta=${f.cuenta_id}&desde=${desde}&hasta=${hasta}${cc ? `&cc=${cc}` : ''}`}
                        style={{ paddingLeft: `${(f.nivel - 1) * 0.9}rem` }}
                        className="block hover:text-primary hover:underline"
                      >
                        {f.nombre}
                      </Link>
                    ) : (
                      <span style={{ paddingLeft: `${(f.nivel - 1) * 0.9}rem` }} className="block">
                        {f.nombre}
                      </span>
                    )}
                  </td>
                  <td className="border-l border-border/50 px-2 py-1 text-right tabular-nums">{deudor(f.saldo_anterior)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{acreedor(f.saldo_anterior)}</td>
                  <td className="border-l border-border/50 px-2 py-1 text-right tabular-nums">{f.debe ? montoContable(f.debe) : ''}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{f.haber ? montoContable(f.haber) : ''}</td>
                  <td className="border-l border-border/50 px-2 py-1 text-right tabular-nums">{deudor(f.saldo_final)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{acreedor(f.saldo_final)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-foreground/40 font-bold">
              <tr>
                <td colSpan={2} className="px-2 py-2 text-right">
                  Sumas
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{montoContable(totales.antDeudor)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{montoContable(totales.antAcreedor)}</td>
                <td className={cn('px-2 py-2 text-right tabular-nums', !cuadraMovimiento && 'text-destructive')}>
                  {montoContable(totales.debe)}
                </td>
                <td className={cn('px-2 py-2 text-right tabular-nums', !cuadraMovimiento && 'text-destructive')}>
                  {montoContable(totales.haber)}
                </td>
                <td className={cn('px-2 py-2 text-right tabular-nums', !cuadraSaldo && !cc && 'text-destructive')}>
                  {montoContable(totales.finDeudor)}
                </td>
                <td className={cn('px-2 py-2 text-right tabular-nums', !cuadraSaldo && !cc && 'text-destructive')}>
                  {montoContable(totales.finAcreedor)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {!cc && (
          <p className={cn('text-xs font-semibold', cuadraMovimiento && cuadraSaldo ? 'text-primary' : 'text-destructive')}>
            {cuadraMovimiento && cuadraSaldo
              ? 'Sumas iguales: el movimiento y los saldos cuadran.'
              : !cuadraMovimiento
                ? 'El movimiento no cuadra: revisa las partidas del período.'
                : 'El movimiento cuadra, pero los saldos no: hay resultados de años anteriores sin partida de cierre (deben trasladarse a Utilidades acumuladas).'}
          </p>
        )}
        {cc && (
          <p className="text-xs text-muted-foreground">
            Filtrado por centro de costo: solo incluye líneas con ese centro, por eso las sumas no tienen que cuadrar.
          </p>
        )}
      </div>
      {cuadres?.activa && !cc && (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground">Cuadres al {hasta.split('-').reverse().join('/')}: contabilidad vs. libros del sistema</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-1">Concepto</th>
                  <th className="px-2 py-1 text-right">Libro del sistema</th>
                  <th className="px-2 py-1 text-right">Contabilidad</th>
                  <th className="px-2 py-1 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...cuadres.bancos.map((b) => ({
                    concepto: `${b.cuenta_bancaria}${b.codigo ? ` (${b.codigo})` : ''}`,
                    libro: Number(b.saldo_bancos),
                    contable: Number(b.saldo_contable),
                  })),
                  { concepto: 'Billetera ASTRO (saldo de embajadores)', libro: Number(cuadres.billetera.saldo_libro), contable: Number(cuadres.billetera.saldo_contable) },
                  ...(cuadres.inventario
                    ? [{ concepto: 'Inventario (Kardex PEPS)', libro: Number(cuadres.inventario.saldo_kardex), contable: Number(cuadres.inventario.saldo_contable) }]
                    : []),
                ].map((f) => {
                  const dif = centavos(f.libro) - centavos(f.contable)
                  return (
                    <tr key={f.concepto} className="border-t border-border/60">
                      <td className="px-2 py-1.5">{f.concepto}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{montoContable(f.libro)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{montoContable(f.contable)}</td>
                      <td className={cn('px-2 py-1.5 text-right font-semibold tabular-nums', dif === 0 ? 'text-primary' : 'text-destructive')}>
                        {dif === 0 ? 'Cuadra' : montoContable(dif / 100)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {cuadres.inventario && (
            <p className="text-xs text-muted-foreground">
              Inventario: el Kardex suma todas las entradas físicas; la contabilidad solo las compras, recepciones de metal y tomas
              físicas. Las altas de producción y las sumas de existencias sin compra se registran con una partida manual.
            </p>
          )}
          {(cuadres.pendientes > 0 || cuadres.borradores > 0) && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {cuadres.pendientes > 0 && (
                <Link href="/contabilidad/pendientes" className="font-semibold underline">
                  {cuadres.pendientes} operación(es) pendiente(s) de contabilizar
                </Link>
              )}
              {cuadres.pendientes > 0 && cuadres.borradores > 0 && ' · '}
              {cuadres.borradores > 0 && `${cuadres.borradores} partida(s) en borrador`} — pueden explicar diferencias.
            </p>
          )}
        </section>
      )}
    </main>
  )
}
