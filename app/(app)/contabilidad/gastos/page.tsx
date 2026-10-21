import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, FileText, Plus, Receipt } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tienePermiso } from '@/lib/permisos'
import { formatearPrecio, formatearFecha } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { BotonConfirmar } from '@/components/app/boton-confirmar'
import {
  CATEGORIAS_GASTO,
  CLASIFICACIONES_GASTO,
  METODOS_GASTO,
  etiquetaCategoria,
  hoyGuatemala,
  rangoMes,
} from '@/lib/contabilidad'
import { anularGasto, registrarGasto } from './acciones'

export const metadata = { title: 'Gastos — ASTRO' }

const clasesCampo =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'

type Gasto = {
  id: number
  fecha: string
  clasificacion: string
  categoria: string
  descripcion: string
  monto: number
  metodo_pago: string | null
  referencia: string | null
  soporte_url: string | null
  anulado: boolean
  motivo_anulacion: string | null
  proveedor: { nombre: string } | null
  registrador: { nombre: string } | null
}

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; mes?: string }>
}) {
  const [puedeRegistrar, puedeVer] = await Promise.all([
    tienePermiso('gastos', 'registrar'),
    tienePermiso('estado_resultados', 'ver'),
  ])
  if (!puedeRegistrar && !puedeVer) redirect('/inicio')

  const { ok, error, mes } = await searchParams
  const hoy = hoyGuatemala()
  const mesActual = /^\d{4}-\d{2}$/.test(mes ?? '') ? (mes as string) : hoy.slice(0, 7)
  const { desde, hasta } = rangoMes(`${mesActual}-01`)
  const rutaActual = `/contabilidad/gastos?mes=${mesActual}`

  const supabase = await createClient()
  const [{ data }, { data: proveedores }, { data: cuentasData }] = await Promise.all([
    supabase
      .from('gastos')
      .select(
        'id, fecha, clasificacion, categoria, descripcion, monto, metodo_pago, referencia, soporte_url, anulado, motivo_anulacion, proveedor:proveedor_id ( nombre ), registrador:registrado_por ( nombre )',
      )
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false }),
    supabase.from('proveedores').select('id, nombre').order('nombre'),
    supabase.from('cuentas_bancarias').select('id, nombre').eq('activa', true).order('nombre'),
  ])
  const cuentas = (cuentasData ?? []) as { id: number; nombre: string }[]
  const gastos = (data ?? []) as unknown as Gasto[]
  const vigentes = gastos.filter((g) => !g.anulado)
  const total = (c: string) => vigentes.filter((g) => g.clasificacion === c).reduce((a, g) => a + Number(g.monto), 0)

  const firmadas = new Map<string, string>()
  const rutas = gastos.map((g) => g.soporte_url).filter((r): r is string => Boolean(r))
  if (rutas.length > 0) {
    const { data: urls } = await createAdminClient().storage.from('astro-gastos').createSignedUrls(rutas, 3600)
    urls?.forEach((u) => u.signedUrl && firmadas.set(u.path ?? '', u.signedUrl))
  }

  const [a, m] = mesActual.split('-').map(Number)
  const mesPrevio = new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7)
  const mesSiguiente = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 7)
  const nombreMes = new Intl.DateTimeFormat('es-GT', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(a, m - 1, 1)),
  )

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Receipt className="h-5 w-5 text-primary" />
            Gastos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gastos de la empresa que alimentan el estado de resultados. Adjunta la factura o recibo como soporte.
          </p>
        </div>
        <Link href={`/contabilidad/estado-resultados?desde=${desde}&hasta=${hasta}`} className="text-sm font-semibold text-primary hover:underline">
          Ver estado de resultados →
        </Link>
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

      {puedeRegistrar && (
        <details className="rounded-xl border border-dashed border-primary/40 bg-card" open={gastos.length === 0}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-primary">
            <Plus className="h-4 w-4" />
            Registrar gasto
          </summary>
          <form action={registrarGasto} encType="multipart/form-data" className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="volver" value={rutaActual} />
            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
              Fecha
              <input name="fecha" type="date" required defaultValue={hoy} className={clasesCampo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
              Tipo
              <select name="clasificacion" defaultValue="operativo" className={clasesCampo}>
                {CLASIFICACIONES_GASTO.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
              Categoría
              <select name="categoria" required defaultValue="" className={clasesCampo}>
                <option value="" disabled>
                  Elige…
                </option>
                {CATEGORIAS_GASTO.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
              Monto (Q)
              <input name="monto" type="number" step="0.01" min="0.01" required className={clasesCampo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground sm:col-span-2">
              Descripción
              <input name="descripcion" required placeholder="Ej. Alquiler de oficina octubre" className={clasesCampo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
              Proveedor <span className="font-normal text-muted-foreground">(opcional)</span>
              <select name="proveedor_id" defaultValue="" className={clasesCampo}>
                <option value="">—</option>
                {(proveedores ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
              Método de pago
              <select name="metodo_pago" defaultValue="transferencia" className={clasesCampo}>
                {METODOS_GASTO.map((mt) => (
                  <option key={mt.valor} value={mt.valor}>
                    {mt.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            {cuentas.length > 0 && (
              <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
                Pagado desde la cuenta
                <select name="cuenta_id" defaultValue="" className={clasesCampo}>
                  <option value="">Registrar en bancos después</option>
                  {cuentas.map((ct) => (
                    <option key={ct.id} value={ct.id}>
                      {ct.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground sm:col-span-2">
              Referencia / No. de factura <span className="font-normal text-muted-foreground">(opcional)</span>
              <input name="referencia" className={clasesCampo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground sm:col-span-2">
              Soporte (factura o recibo, imagen o PDF)
              <input
                name="soporte"
                type="file"
                accept="image/*,application/pdf"
                className="w-full rounded-lg border border-dashed border-input bg-background px-3 py-2 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-semibold file:text-primary-foreground"
              />
            </label>
            <div className="flex justify-end sm:col-span-2 lg:col-span-4">
              <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
                Registrar gasto
              </button>
            </div>
          </form>
        </details>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/contabilidad/gastos?mes=${mesPrevio}`} className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-secondary">
            ←
          </Link>
          <span className="min-w-40 text-center text-sm font-semibold capitalize text-foreground">{nombreMes}</span>
          <Link href={`/contabilidad/gastos?mes=${mesSiguiente}`} className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-secondary">
            →
          </Link>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <span>
            Operativos: <span className="font-bold text-foreground">{formatearPrecio(total('operativo'))}</span>
          </span>
          <span>
            Financieros: <span className="font-bold text-foreground">{formatearPrecio(total('financiero'))}</span>
          </span>
          <span>
            Otros ingresos: <span className="font-bold text-emerald-700">{formatearPrecio(total('otro_ingreso'))}</span>
          </span>
        </div>
      </div>

      {gastos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Receipt className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Sin gastos registrados este mes</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Fecha</th>
                <th className="px-3 py-2 font-semibold">Gasto</th>
                <th className="px-3 py-2 font-semibold">Categoría</th>
                <th className="px-3 py-2 font-semibold">Pago</th>
                <th className="px-3 py-2 text-right font-semibold">Monto</th>
                <th className="px-3 py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {gastos.map((g) => (
                <tr key={g.id} className={cn('border-b border-border last:border-0 align-top', g.anulado && 'opacity-50')}>
                  <td className="px-3 py-2 text-muted-foreground">{formatearFecha(`${g.fecha}T12:00:00`)}</td>
                  <td className="px-3 py-2">
                    <p className={cn('font-medium text-foreground', g.anulado && 'line-through')}>{g.descripcion}</p>
                    <p className="text-xs text-muted-foreground">
                      {[g.proveedor?.nombre, g.referencia && `Ref. ${g.referencia}`, g.registrador?.nombre && `por ${g.registrador.nombre}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {g.anulado && <p className="text-xs text-destructive">Anulado: {g.motivo_anulacion}</p>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="text-foreground">{etiquetaCategoria(g.categoria)}</span>
                    {g.clasificacion !== 'operativo' && (
                      <span className="block text-muted-foreground">
                        {CLASIFICACIONES_GASTO.find((c) => c.valor === g.clasificacion)?.etiqueta}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{g.metodo_pago ?? '—'}</td>
                  <td
                    className={cn(
                      'px-3 py-2 text-right font-semibold',
                      g.clasificacion === 'otro_ingreso' ? 'text-emerald-700' : 'text-foreground',
                    )}
                  >
                    {formatearPrecio(Number(g.monto))}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col items-end gap-1.5">
                      {g.soporte_url && firmadas.get(g.soporte_url) && (
                        <a
                          href={firmadas.get(g.soporte_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Soporte
                        </a>
                      )}
                      {puedeRegistrar && !g.anulado && (
                        <details className="text-right">
                          <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-destructive">Anular</summary>
                          <form action={anularGasto} className="mt-1 flex items-center gap-1">
                            <input type="hidden" name="gasto_id" value={g.id} />
                            <input type="hidden" name="volver" value={rutaActual} />
                            <input name="motivo" required placeholder="Motivo" className="w-28 rounded-md border border-input bg-background px-2 py-1 text-xs" />
                            <BotonConfirmar
                              mensaje="¿Anular este gasto? Dejará de contar en el estado de resultados."
                              className="rounded-md bg-destructive px-2 py-1 text-xs font-semibold text-white"
                            >
                              Anular
                            </BotonConfirmar>
                          </form>
                        </details>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
