import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FileSpreadsheet, FileText, HandCoins } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { hoyGuatemala, rangoMes } from '@/lib/contabilidad'
import { clasesCampo, esFecha, montoContable } from '@/lib/contabilidad-general'
import { ESTADOS_COBRO, METODOS_COBRO, documentoFel, type ConsultaCxc } from '@/lib/cxc'
import { Encabezado, Mensajes } from '@/components/contabilidad/comunes'

export const metadata = { title: 'Cuentas por cobrar — ASTRO' }

const POR_PAGINA = 100

export default async function CxcPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; estado?: string; metodo?: string; factura?: string; q?: string; pagina?: string; ok?: string; error?: string }>
}) {
  const sp = await searchParams
  const mes = rangoMes(hoyGuatemala())
  const desde = esFecha(sp.desde) ? sp.desde : mes.desde
  const hasta = esFecha(sp.hasta) ? sp.hasta : mes.hasta
  const pagina = Math.max(1, Number(sp.pagina) || 1)
  const filtros = {
    desde,
    hasta,
    ...(sp.estado ? { estado: sp.estado } : {}),
    ...(sp.metodo ? { metodo: sp.metodo } : {}),
    ...(sp.factura ? { factura: sp.factura } : {}),
    ...(sp.q ? { q: sp.q } : {}),
  }
  const consultaUrl = (extra: Record<string, string>) => `?${new URLSearchParams({ ...filtros, ...extra }).toString()}`

  const supabase = await createClient()
  const [puedeVer, { data, error }] = await Promise.all([
    tienePermiso('contabilidad', 'ver'),
    supabase.rpc('fn_cxc_consulta', {
      p_desde: desde,
      p_hasta: hasta,
      p_estado: sp.estado || null,
      p_metodo: sp.metodo || null,
      p_factura: sp.factura || null,
      p_buscar: sp.q || null,
      p_offset: (pagina - 1) * POR_PAGINA,
      p_limit: POR_PAGINA,
    }),
  ])
  if (!puedeVer) redirect('/inicio')
  const c = (data as ConsultaCxc | null) ?? { total: 0, totales: { total: 0, cobrado: 0, en_transito: 0, saldo: 0 }, filas: [] }
  const exportar = (formato: string) => `/contabilidad/cxc/exportar${consultaUrl({ formato, reporte: 'facturas' })}`

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={HandCoins}
        titulo="Cuentas por cobrar"
        descripcion="Ventas con su factura FEL, forma de pago y estado del cobro. Liquidada: el dinero está en bancos. En tránsito: cobro confirmado que aún no se deposita o liquida. Pendiente: con saldo."
      >
        <Link href="/contabilidad/cxc/antiguedad" className="text-sm font-semibold text-primary hover:underline">
          Antigüedad de saldos →
        </Link>
      </Encabezado>
      <Mensajes ok={sp.ok} error={sp.error ?? error?.message} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { e: 'Ventas', v: c.totales.total },
          { e: 'Cobrado', v: c.totales.cobrado },
          { e: 'En tránsito', v: c.totales.en_transito },
          { e: 'Saldo por cobrar', v: c.totales.saldo },
        ].map((k) => (
          <div key={k.e} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{k.e}</p>
            <p className="text-lg font-bold tabular-nums text-foreground">Q {montoContable(k.v)}</p>
          </div>
        ))}
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Del
          <input name="desde" type="date" defaultValue={desde} className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Al
          <input name="hasta" type="date" defaultValue={hasta} className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Estado
          <select name="estado" defaultValue={sp.estado ?? ''} className={clasesCampo}>
            <option value="">Todos</option>
            {Object.entries(ESTADOS_COBRO).map(([v, e]) => (
              <option key={v} value={v}>
                {e.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Forma de pago
          <select name="metodo" defaultValue={sp.metodo ?? ''} className={clasesCampo}>
            <option value="">Todas</option>
            {Object.entries(METODOS_COBRO).map(([v, e]) => (
              <option key={v} value={v}>
                {e}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Factura
          <select name="factura" defaultValue={sp.factura ?? ''} className={clasesCampo}>
            <option value="">Todas</option>
            <option value="con">Con factura</option>
            <option value="sin">Sin factura</option>
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-semibold text-foreground">
          Buscar
          <input name="q" defaultValue={sp.q ?? ''} placeholder="No. FEL, NIT, cliente o no. de venta" className={clasesCampo} />
        </label>
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          Consultar
        </button>
        <div className="flex gap-2">
          <a href={exportar('xlsx')} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Excel
          </a>
          <a href={exportar('pdf')} target="_blank" className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
            <FileText className="h-4 w-4 text-primary" />
            PDF
          </a>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Factura FEL</th>
              <th className="px-3 py-2">Venta</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Forma de pago</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2 text-right">Monto</th>
              <th className="px-3 py-2 text-right">En tránsito</th>
              <th className="px-3 py-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {c.filas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  No hay ventas con esos filtros.
                </td>
              </tr>
            )}
            {c.filas.map((f) => (
              <tr key={f.venta_id} className={cn('border-b border-border/60 last:border-0 hover:bg-muted/30', f.estado_venta === 'anulada' && 'opacity-60')}>
                <td className="px-3 py-2">
                  {f.factura_id ? (
                    <>
                      <span className="font-mono text-xs font-semibold">{documentoFel(f.serie, f.numero)}</span>
                      <span className="block text-xs text-muted-foreground">
                        #{f.correlativo} · {f.fecha_factura?.split('-').reverse().join('/')}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sin factura</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/contabilidad/cxc/${f.venta_id}`} className="font-semibold text-primary hover:underline">
                    #{f.venta_id}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {f.fecha.split('-').reverse().join('/')} · {f.canal}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {f.cliente}
                  <span className="block font-mono text-xs text-muted-foreground">NIT {f.nit}</span>
                </td>
                <td className="px-3 py-2 text-xs">{f.metodos.map((m) => METODOS_COBRO[m] ?? m).join(' · ') || '—'}</td>
                <td className="px-3 py-2">
                  <span
                    title={ESTADOS_COBRO[f.estado_cobro]?.detalle}
                    className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', ESTADOS_COBRO[f.estado_cobro]?.clase)}
                  >
                    {ESTADOS_COBRO[f.estado_cobro]?.etiqueta ?? f.estado_cobro}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{montoContable(f.total)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(f.en_transito) ? montoContable(f.en_transito) : ''}</td>
                <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', Number(f.saldo) > 0 && 'text-amber-700 dark:text-amber-300')}>
                  {Number(f.saldo) ? montoContable(f.saldo) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {c.total > POR_PAGINA && (
        <div className="flex items-center justify-center gap-3 text-sm">
          {pagina > 1 && (
            <Link href={consultaUrl({ pagina: String(pagina - 1) })} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
              ← Anterior
            </Link>
          )}
          <span className="text-muted-foreground">
            Página {pagina} de {Math.ceil(c.total / POR_PAGINA)} · {c.total} ventas
          </span>
          {pagina * POR_PAGINA < c.total && (
            <Link href={consultaUrl({ pagina: String(pagina + 1) })} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
              Siguiente →
            </Link>
          )}
        </div>
      )}
    </main>
  )
}
