import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { hoyGuatemala, rangoMes } from '@/lib/contabilidad'
import { TIPOS_PARTIDA, esFecha, montoContable, numeroPartida, textoPeriodo } from '@/lib/contabilidad-general'
import { Encabezado, Mensajes } from '@/components/contabilidad/comunes'
import { EncabezadoReporte, FiltroRango } from '@/components/contabilidad/filtro-rango'

export const metadata = { title: 'Libro diario — ASTRO' }

const POR_PAGINA = 50

type PartidaDiario = {
  id: number
  anio: number
  numero: number
  fecha: string
  tipo: string
  descripcion: string
  total_debe: number
  total_haber: number
  revertida: boolean
  lineas: { codigo: string; cuenta: string; centro_costo: string | null; debe: number; haber: number; descripcion: string | null }[]
}

type Diario = { total: number; totales: { debe: number; haber: number }; partidas: PartidaDiario[] }

export default async function LibroDiarioPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; pagina?: string }>
}) {
  const sp = await searchParams
  const mes = rangoMes(hoyGuatemala())
  const desde = esFecha(sp.desde) ? sp.desde : mes.desde
  const hasta = esFecha(sp.hasta) ? sp.hasta : mes.hasta
  const pagina = Math.max(1, Number(sp.pagina) || 1)

  const supabase = await createClient()
  const [puedeVer, { data, error }, { data: empresa }] = await Promise.all([
    tienePermiso('contabilidad', 'ver'),
    supabase.rpc('fn_libro_diario', { p_desde: desde, p_hasta: hasta, p_offset: (pagina - 1) * POR_PAGINA, p_limit: POR_PAGINA }),
    supabase.from('empresa_contable').select('razon_social, nit').eq('id', 1).maybeSingle(),
  ])
  if (!puedeVer) redirect('/inicio')

  const diario = (data as Diario | null) ?? { total: 0, totales: { debe: 0, haber: 0 }, partidas: [] }
  const paginas = Math.max(1, Math.ceil(diario.total / POR_PAGINA))
  const enlacePagina = (p: number) => `/contabilidad/libro-diario?desde=${desde}&hasta=${hasta}&pagina=${p}`

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={BookOpen}
        titulo="Libro diario"
        descripcion="Partidas contabilizadas en orden cronológico. Vista previa: la impresión oficial con folio llega con los libros SAT."
      />
      <Mensajes error={error?.message} />
      <FiltroRango desde={desde} hasta={hasta} />

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <EncabezadoReporte
          razonSocial={(empresa as { razon_social: string } | null)?.razon_social ?? '—'}
          nit={(empresa as { nit: string } | null)?.nit ?? '—'}
          titulo="Libro diario"
          periodo={textoPeriodo(desde, hasta)}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-28 px-2 py-2 text-left">Código</th>
                <th className="px-2 py-2 text-left">Cuenta / concepto</th>
                <th className="w-20 px-2 py-2 text-left">C. costo</th>
                <th className="w-32 px-2 py-2 text-right">Debe</th>
                <th className="w-32 px-2 py-2 text-right">Haber</th>
              </tr>
            </thead>
            {diario.partidas.length === 0 && (
              <tbody>
                <tr>
                  <td colSpan={5} className="px-2 py-8 text-center text-muted-foreground">
                    No hay partidas contabilizadas en el período.
                  </td>
                </tr>
              </tbody>
            )}
            {diario.partidas.map((p) => (
              <tbody key={p.id} className="border-b border-border">
                <tr className="bg-muted/30">
                  <td colSpan={5} className="px-2 py-1.5 text-xs">
                    <Link href={`/contabilidad/partidas/${p.id}`} className="font-mono font-semibold text-primary hover:underline">
                      Partida {numeroPartida(p.anio, p.numero)}
                    </Link>
                    <span className="ml-3 font-semibold">{p.fecha.split('-').reverse().join('/')}</span>
                    <span className="ml-3 text-muted-foreground">{TIPOS_PARTIDA[p.tipo] ?? p.tipo}</span>
                    {p.revertida && <span className="ml-3 text-destructive">revertida</span>}
                  </td>
                </tr>
                {p.lineas.map((l, i) => (
                  <tr key={i}>
                    <td className="px-2 py-0.5 font-mono text-xs text-muted-foreground">{l.codigo}</td>
                    <td className={cn('px-2 py-0.5', Number(l.haber) > 0 && 'pl-10')}>
                      {l.cuenta}
                      {l.descripcion && <span className="ml-2 text-xs text-muted-foreground">· {l.descripcion}</span>}
                    </td>
                    <td className="px-2 py-0.5 font-mono text-xs">{l.centro_costo ?? ''}</td>
                    <td className="px-2 py-0.5 text-right tabular-nums">{Number(l.debe) > 0 ? montoContable(l.debe) : ''}</td>
                    <td className="px-2 py-0.5 text-right tabular-nums">{Number(l.haber) > 0 ? montoContable(l.haber) : ''}</td>
                  </tr>
                ))}
                <tr>
                  <td />
                  <td colSpan={2} className="px-2 pb-2 pt-0.5 text-xs italic text-muted-foreground">
                    {p.descripcion}
                  </td>
                  <td className="border-t border-border/60 px-2 pb-2 pt-0.5 text-right text-xs font-semibold tabular-nums">
                    {montoContable(p.total_debe)}
                  </td>
                  <td className="border-t border-border/60 px-2 pb-2 pt-0.5 text-right text-xs font-semibold tabular-nums">
                    {montoContable(p.total_haber)}
                  </td>
                </tr>
              </tbody>
            ))}
            {diario.total > 0 && (
              <tfoot className="border-t-2 border-foreground/40 font-bold">
                <tr>
                  <td colSpan={3} className="px-2 py-2 text-right">
                    Total del período ({diario.total} partidas)
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{montoContable(diario.totales.debe)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{montoContable(diario.totales.haber)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {paginas > 1 && (
          <div className="flex items-center justify-center gap-3 text-sm">
            {pagina > 1 && (
              <Link href={enlacePagina(pagina - 1)} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
                ← Anterior
              </Link>
            )}
            <span className="text-muted-foreground">
              Página {pagina} de {paginas}
            </span>
            {pagina < paginas && (
              <Link href={enlacePagina(pagina + 1)} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
                Siguiente →
              </Link>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
