import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChartColumn as IconoReportes, FileSpreadsheet, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { hoyGuatemala } from '@/lib/contabilidad'
import { clasesCampo, esFecha } from '@/lib/contabilidad-general'
import { REPORTES, construirReporte, type ClaveReporte } from '@/lib/reportes/contables'
import { Encabezado, Mensajes } from '@/components/contabilidad/comunes'
import { TablaReporte } from '@/components/contabilidad/tabla-reporte'

export const metadata = { title: 'Estados financieros — ASTRO' }

const PESTANAS: { clave: ClaveReporte; etiqueta: string }[] = [
  { clave: 'balance_general', etiqueta: 'Balance general' },
  { clave: 'estado_resultados_cc', etiqueta: 'Resultados por centro de costo' },
  { clave: 'flujo_directo', etiqueta: 'Flujo de efectivo (directo)' },
  { clave: 'flujo_indirecto', etiqueta: 'Flujo de efectivo (indirecto)' },
]

export default async function EstadosFinancierosPage({
  searchParams,
}: {
  searchParams: Promise<{ reporte?: string; desde?: string; hasta?: string; nivel?: string }>
}) {
  const sp = await searchParams
  if (!(await tienePermiso('contabilidad', 'ver'))) redirect('/inicio')
  const clave = (PESTANAS.some((p) => p.clave === sp.reporte) ? sp.reporte : 'balance_general') as ClaveReporte
  const hoy = hoyGuatemala()
  const desde = esFecha(sp.desde) ? sp.desde : `${hoy.slice(0, 4)}-01-01`
  const hasta = esFecha(sp.hasta) ? sp.hasta : hoy
  const nivel = Math.min(4, Math.max(1, Number(sp.nivel) || 3))
  const def = REPORTES[clave]

  const supabase = await createClient()
  let error: string | undefined
  const reporte = await construirReporte(supabase, clave, { desde, hasta, nivel }).catch((e: Error) => {
    error = e.message
    return null
  })
  const parametros = new URLSearchParams({ reporte: clave, desde, hasta, nivel: String(nivel) })

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={IconoReportes}
        titulo="Estados financieros"
        descripcion="Generados desde la contabilidad (partidas contabilizadas), con el encabezado de 4 líneas que pide la SAT. Descárgalos en Excel o PDF."
      />
      <nav className="flex gap-1 overflow-x-auto border-b border-border">
        {PESTANAS.map((p) => (
          <Link
            key={p.clave}
            href={`/contabilidad/reportes?${new URLSearchParams({ reporte: p.clave, desde, hasta, nivel: String(nivel) })}`}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold',
              clave === p.clave ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {p.etiqueta}
          </Link>
        ))}
      </nav>
      <Mensajes error={error} />

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
        <input type="hidden" name="reporte" value={clave} />
        {!def.corte && (
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Del
            <input name="desde" type="date" defaultValue={desde} className={clasesCampo} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs font-semibold">
          {def.corte ? 'Al' : 'Al'}
          <input name="hasta" type="date" defaultValue={hasta} className={clasesCampo} />
        </label>
        {(clave === 'balance_general' || clave === 'estado_resultados_cc') && (
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Detalle
            <select name="nivel" defaultValue={String(nivel)} className={clasesCampo}>
              <option value="2">Subgrupos</option>
              <option value="3">Cuentas de mayor</option>
              <option value="4">Cuentas de detalle</option>
            </select>
          </label>
        )}
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          Consultar
        </button>
        <a href={`/contabilidad/reportes/exportar?${parametros}&formato=xlsx`} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
          <FileSpreadsheet className="h-4 w-4 text-primary" /> Excel
        </a>
        <a href={`/contabilidad/reportes/exportar?${parametros}&formato=pdf`} target="_blank" className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
          <FileText className="h-4 w-4 text-primary" /> PDF
        </a>
      </form>

      {reporte && <TablaReporte r={reporte} />}
      {clave.startsWith('flujo') && (
        <p className="text-xs text-muted-foreground">
          Efectivo y equivalentes: caja, bancos y transferencias entre cuentas propias en tránsito. En el método directo, cada entrada o
          salida se clasifica según la cuenta de contrapartida de su partida; ambos métodos llegan a la misma variación del efectivo.
        </p>
      )}
    </main>
  )
}
