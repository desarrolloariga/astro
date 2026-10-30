import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FileSpreadsheet, FileText, Plus, ReceiptText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { hoyGuatemala, rangoMes } from '@/lib/contabilidad'
import { clasesCampo, esFecha, montoContable } from '@/lib/contabilidad-general'
import { ESTADOS_PAGO, TIPOS_DOCUMENTO_CXP, documentoProveedor, type ConsultaCxp } from '@/lib/cxp'
import { Encabezado, Mensajes } from '@/components/contabilidad/comunes'
import { facturaDesdeOrden } from './acciones'

export const metadata = { title: 'Cuentas por pagar — ASTRO' }

const POR_PAGINA = 100

export default async function CxpPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; estado?: string; proveedor?: string; q?: string; pagina?: string; ok?: string; error?: string }>
}) {
  const sp = await searchParams
  const hoy = hoyGuatemala()
  const desde = esFecha(sp.desde) ? sp.desde : `${hoy.slice(0, 4)}-01-01`
  const hasta = esFecha(sp.hasta) ? sp.hasta : rangoMes(hoy).hasta
  const pagina = Math.max(1, Number(sp.pagina) || 1)
  const filtros = {
    desde,
    hasta,
    ...(sp.estado ? { estado: sp.estado } : {}),
    ...(sp.proveedor ? { proveedor: sp.proveedor } : {}),
    ...(sp.q ? { q: sp.q } : {}),
  }
  const url = (extra: Record<string, string>) => `?${new URLSearchParams({ ...filtros, ...extra }).toString()}`

  const supabase = await createClient()
  const [puedeVer, puedeRegistrar, { data, error }, { data: extra }, { data: sinFactura }] = await Promise.all([
    tienePermiso('contabilidad', 'ver'),
    tienePermiso('contabilidad', 'registrar'),
    supabase.rpc('fn_cxp_consulta', {
      p_desde: desde,
      p_hasta: hasta,
      p_estado: sp.estado || null,
      p_proveedor_id: Number(sp.proveedor) || null,
      p_buscar: sp.q || null,
      p_offset: (pagina - 1) * POR_PAGINA,
      p_limit: POR_PAGINA,
    }),
    supabase.rpc('fn_cxp_catalogos'),
    supabase.rpc('fn_cxp_ordenes_sin_factura'),
  ])
  if (!puedeVer) redirect('/inicio')
  const c = (data as ConsultaCxp | null) ?? { total: 0, totales: { total: 0, iva_credito: 0, pagado: 0, saldo: 0, vencido: 0 }, filas: [] }
  const proveedores = ((extra as { proveedores?: { id: number; nombre: string }[] } | null)?.proveedores ?? [])
  const ordenes = (sinFactura ?? []) as { id: number; proveedor: string | null; estado: string; total: number; fecha: string }[]
  const exportar = (formato: string) => `/contabilidad/cxp/exportar${url({ formato, reporte: 'documentos' })}`

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={ReceiptText}
        titulo="Cuentas por pagar"
        descripcion="Facturas de proveedores y sus pagos. Cada factura se contabiliza contra Proveedores y cada pago sale del libro de bancos. Reemplaza el registro de Gastos."
      >
        <Link href="/contabilidad/cxp/antiguedad" className="text-sm font-semibold text-primary hover:underline">
          Cartera por pagar →
        </Link>
        {puedeRegistrar && (
          <Link
            href="/contabilidad/cxp/nueva"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Nueva factura
          </Link>
        )}
      </Encabezado>
      <Mensajes ok={sp.ok} error={sp.error ?? error?.message} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { e: 'Documentos', v: c.totales.total },
          { e: 'Pagado', v: c.totales.pagado },
          { e: 'Saldo por pagar', v: c.totales.saldo },
          { e: 'Vencido', v: c.totales.vencido, alerta: true },
        ].map((k) => (
          <div key={k.e} className={cn('rounded-xl border bg-card px-4 py-3', k.alerta && Number(k.v) > 0 ? 'border-destructive/40' : 'border-border')}>
            <p className="text-xs text-muted-foreground">{k.e}</p>
            <p className={cn('text-lg font-bold tabular-nums', k.alerta && Number(k.v) > 0 && 'text-destructive')}>Q {montoContable(k.v)}</p>
          </div>
        ))}
      </div>

      {ordenes.length > 0 && puedeRegistrar && (
        <details className="rounded-xl border border-amber-500/40 bg-amber-500/5">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-amber-800 dark:text-amber-300">
            {ordenes.length} orden(es) de compra recibida(s) sin factura de proveedor
          </summary>
          <ul className="divide-y divide-border/60 px-4 pb-3 text-sm">
            {ordenes.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <Link href={`/compras/${o.id}`} className="font-semibold text-primary hover:underline">
                    OC #{o.id}
                  </Link>{' '}
                  · {o.proveedor ?? '—'} · {o.fecha?.split('-').reverse().join('/')} · Q {montoContable(o.total)}
                </span>
                <form action={facturaDesdeOrden}>
                  <input type="hidden" name="orden_compra_id" value={o.id} />
                  <button type="submit" className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                    Registrar su factura
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Del
          <input name="desde" type="date" defaultValue={desde} className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Al
          <input name="hasta" type="date" defaultValue={hasta} className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Estado
          <select name="estado" defaultValue={sp.estado ?? ''} className={clasesCampo}>
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="parcial">Pago parcial</option>
            <option value="vencida">Vencidas</option>
            <option value="pagada">Liquidadas</option>
            <option value="anulada">Anuladas</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Proveedor
          <select name="proveedor" defaultValue={sp.proveedor ?? ''} className={clasesCampo}>
            <option value="">Todos</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-semibold">
          Buscar
          <input name="q" defaultValue={sp.q ?? ''} placeholder="Número, NIT, proveedor o correlativo" className={clasesCampo} />
        </label>
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          Consultar
        </button>
        <a href={exportar('xlsx')} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          Excel
        </a>
        <a href={exportar('pdf')} target="_blank" className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
          <FileText className="h-4 w-4 text-primary" />
          PDF
        </a>
      </form>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Documento</th>
              <th className="px-3 py-2">Proveedor</th>
              <th className="px-3 py-2">Emisión / vence</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">IVA crédito</th>
              <th className="px-3 py-2 text-right">Pagado</th>
              <th className="px-3 py-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {c.filas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  No hay documentos con esos filtros.
                </td>
              </tr>
            )}
            {c.filas.map((f) => (
              <tr key={f.id} className={cn('border-b border-border/60 last:border-0 hover:bg-muted/30', f.estado === 'anulada' && 'opacity-60')}>
                <td className="px-3 py-2">
                  <Link href={`/contabilidad/cxp/${f.id}`} className="font-mono text-xs font-semibold text-primary hover:underline">
                    {documentoProveedor(f.serie, f.numero)}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    #{f.correlativo} · {TIPOS_DOCUMENTO_CXP[f.tipo_documento]?.etiqueta ?? f.tipo_documento}
                    {f.origen === 'orden_compra' ? ` · OC #${f.orden_compra_id}` : ''}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {f.nombre}
                  <span className="block font-mono text-xs text-muted-foreground">NIT {f.nit}</span>
                </td>
                <td className="px-3 py-2 text-xs">
                  {f.fecha_emision.split('-').reverse().join('/')}
                  {f.fecha_vencimiento && (
                    <span className={cn('block', f.dias_vencida ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                      vence {f.fecha_vencimiento.split('-').reverse().join('/')}
                      {f.dias_vencida ? ` · ${f.dias_vencida} días de atraso` : ''}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', ESTADOS_PAGO[f.estado_pago]?.clase)}>
                    {ESTADOS_PAGO[f.estado_pago]?.etiqueta ?? f.estado_pago}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{montoContable(f.total)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(f.iva_credito) ? montoContable(f.iva_credito) : ''}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(f.pagado) ? montoContable(f.pagado) : ''}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{Number(f.saldo) ? montoContable(f.saldo) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {c.total > POR_PAGINA && (
        <div className="flex items-center justify-center gap-3 text-sm">
          {pagina > 1 && (
            <Link href={url({ pagina: String(pagina - 1) })} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
              ← Anterior
            </Link>
          )}
          <span className="text-muted-foreground">
            Página {pagina} de {Math.ceil(c.total / POR_PAGINA)}
          </span>
          {pagina * POR_PAGINA < c.total && (
            <Link href={url({ pagina: String(pagina + 1) })} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
              Siguiente →
            </Link>
          )}
        </div>
      )}
    </main>
  )
}
