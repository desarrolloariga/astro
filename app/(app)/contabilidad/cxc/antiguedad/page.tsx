import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FileSpreadsheet, FileText, Hourglass } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { hoyGuatemala } from '@/lib/contabilidad'
import { clasesCampo, esFecha, montoContable, textoAlCorte } from '@/lib/contabilidad-general'
import { documentoFel, type Antiguedad } from '@/lib/cxc'
import { Encabezado, EnlaceVolver, Mensajes } from '@/components/contabilidad/comunes'
import { EncabezadoReporte } from '@/components/contabilidad/filtro-rango'

export const metadata = { title: 'Antigüedad de saldos — ASTRO' }

const TRAMOS = [
  { clave: 'tramo_0_30', titulo: '0–30 días' },
  { clave: 'tramo_31_60', titulo: '31–60 días' },
  { clave: 'tramo_61_90', titulo: '61–90 días' },
  { clave: 'tramo_90', titulo: 'Más de 90' },
] as const

export default async function AntiguedadPage({ searchParams }: { searchParams: Promise<{ corte?: string }> }) {
  const sp = await searchParams
  const corte = esFecha(sp.corte) ? sp.corte : hoyGuatemala()
  const supabase = await createClient()
  const [puedeVer, { data, error }, { data: empresa }] = await Promise.all([
    tienePermiso('contabilidad', 'ver'),
    supabase.rpc('fn_cxc_antiguedad', { p_corte: corte }),
    supabase.from('empresa_contable').select('razon_social, nit').eq('id', 1).maybeSingle(),
  ])
  if (!puedeVer) redirect('/inicio')
  const a = (data as Antiguedad | null) ?? {
    corte,
    filas: [],
    totales: { total: 0, saldo: 0, tramo_0_30: 0, tramo_31_60: 0, tramo_61_90: 0, tramo_90: 0, documentos: 0 },
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={Hourglass}
        titulo="Antigüedad de saldos"
        descripcion="Saldos por cobrar a la fecha de corte, por tramos de días desde la factura (o la venta si aún no tiene factura)."
      >
        <EnlaceVolver href="/contabilidad/cxc">← Cuentas por cobrar</EnlaceVolver>
      </Encabezado>
      <Mensajes error={error?.message} />

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Fecha de corte
          <input name="corte" type="date" defaultValue={corte} className={clasesCampo} />
        </label>
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          Consultar
        </button>
        <a href={`/contabilidad/cxc/exportar?reporte=antiguedad&formato=xlsx&corte=${corte}`} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          Excel
        </a>
        <a href={`/contabilidad/cxc/exportar?reporte=antiguedad&formato=pdf&corte=${corte}`} target="_blank" className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
          <FileText className="h-4 w-4 text-primary" />
          PDF
        </a>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TRAMOS.map((t, i) => (
          <div key={t.clave} className={cn('rounded-xl border bg-card px-4 py-3', i === 3 && Number(a.totales[t.clave]) > 0 ? 'border-destructive/40' : 'border-border')}>
            <p className="text-xs text-muted-foreground">{t.titulo}</p>
            <p className="text-lg font-bold tabular-nums">Q {montoContable(a.totales[t.clave])}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <EncabezadoReporte
          razonSocial={(empresa as { razon_social: string } | null)?.razon_social ?? '—'}
          nit={(empresa as { nit: string } | null)?.nit ?? '—'}
          titulo="Antigüedad de saldos de cuentas por cobrar"
          periodo={textoAlCorte(corte)}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2">Correlativo</th>
                <th className="px-2 py-2">Serie-Número FEL</th>
                <th className="px-2 py-2">NIT</th>
                <th className="px-2 py-2">Cliente</th>
                <th className="px-2 py-2 text-right">Monto</th>
                <th className="px-2 py-2 text-right">Saldo</th>
                <th className="px-2 py-2 text-right">Días</th>
                {TRAMOS.map((t) => (
                  <th key={t.clave} className="px-2 py-2 text-right">
                    {t.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {a.filas.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-2 py-8 text-center text-muted-foreground">
                    No hay saldos por cobrar a esa fecha.
                  </td>
                </tr>
              )}
              {a.filas.map((f) => (
                <tr key={f.venta_id} className="border-b border-border/50">
                  <td className="px-2 py-1.5 tabular-nums">{f.correlativo ?? '—'}</td>
                  <td className="px-2 py-1.5">
                    <Link href={`/contabilidad/cxc/${f.venta_id}`} className="font-mono text-xs font-semibold text-primary hover:underline">
                      {documentoFel(f.serie, f.numero) || `Venta #${f.venta_id} (sin factura)`}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs">{f.nit}</td>
                  <td className="px-2 py-1.5">{f.cliente}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{montoContable(f.total)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{montoContable(f.saldo)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{f.dias}</td>
                  {TRAMOS.map((t) => (
                    <td key={t.clave} className="px-2 py-1.5 text-right tabular-nums">
                      {Number(f[t.clave]) ? montoContable(f[t.clave]) : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-foreground/40 font-bold">
              <tr>
                <td colSpan={4} className="px-2 py-2 text-right">
                  Total ({a.totales.documentos} documentos)
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{montoContable(a.totales.total)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{montoContable(a.totales.saldo)}</td>
                <td />
                {TRAMOS.map((t) => (
                  <td key={t.clave} className="px-2 py-2 text-right tabular-nums">
                    {montoContable(a.totales[t.clave])}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </main>
  )
}
