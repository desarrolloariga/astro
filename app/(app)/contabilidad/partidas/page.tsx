import Link from 'next/link'
import { redirect } from 'next/navigation'
import { NotebookPen, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { hoyGuatemala, rangoMes } from '@/lib/contabilidad'
import {
  ESTADOS_PARTIDA,
  TIPOS_PARTIDA,
  clasesCampo,
  montoContable,
  numeroPartida,
} from '@/lib/contabilidad-general'
import { Encabezado, Mensajes } from '@/components/contabilidad/comunes'

export const metadata = { title: 'Partidas contables — ASTRO' }

type Partida = {
  id: number
  anio: number
  numero: number | null
  fecha: string
  tipo: string
  origen: string
  descripcion: string
  estado: string
  total_debe: number
  total_haber: number
  revertida_por_id: number | null
}

const estiloEstado: Record<string, string> = {
  borrador: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  contabilizada: 'bg-primary/10 text-primary',
  anulada: 'bg-muted text-muted-foreground',
}

export default async function PartidasPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; mes?: string; estado?: string; tipo?: string; q?: string }>
}) {
  const sp = await searchParams
  const hoy = hoyGuatemala()
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? '') ? (sp.mes as string) : hoy.slice(0, 7)
  const { desde, hasta } = rangoMes(`${mes}-01`)

  const supabase = await createClient()
  let consulta = supabase
    .from('partidas')
    .select('id, anio, numero, fecha, tipo, origen, descripcion, estado, total_debe, total_haber, revertida_por_id')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })
    .order('id', { ascending: false })
    .limit(500)
  if (sp.estado) consulta = consulta.eq('estado', sp.estado)
  if (sp.tipo) consulta = consulta.eq('tipo', sp.tipo)
  if (sp.q?.trim()) consulta = consulta.ilike('descripcion', `%${sp.q.trim()}%`)

  const [puedeVer, puedeRegistrar, { data }, { count: borradores }] = await Promise.all([
    tienePermiso('contabilidad', 'ver'),
    tienePermiso('contabilidad', 'registrar'),
    consulta,
    supabase.from('partidas').select('id', { count: 'exact', head: true }).eq('estado', 'borrador'),
  ])
  if (!puedeVer) redirect('/inicio')

  const partidas = (data ?? []) as Partida[]
  const contabilizadas = partidas.filter((p) => p.estado === 'contabilizada')
  const totalDebe = contabilizadas.reduce((a, p) => a + Number(p.total_debe), 0)

  const [a, m] = mes.split('-').map(Number)
  const mesPrevio = new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7)
  const mesSiguiente = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 7)
  const nombreMes = new Intl.DateTimeFormat('es-GT', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(a, m - 1, 1)),
  )
  const conMes = (mesDestino: string) => {
    const p = new URLSearchParams({ mes: mesDestino })
    if (sp.estado) p.set('estado', sp.estado)
    if (sp.tipo) p.set('tipo', sp.tipo)
    if (sp.q) p.set('q', sp.q)
    return `/contabilidad/partidas?${p.toString()}`
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={NotebookPen}
        titulo="Partidas contables"
        descripcion="Registro de partidas de diario. Las partidas manuales sirven para depreciaciones, provisiones y ajustes; las automáticas llegarán desde las operaciones del sistema."
      >
        {puedeRegistrar && (
          <Link
            href="/contabilidad/partidas/nueva"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Nueva partida
          </Link>
        )}
      </Encabezado>

      <Mensajes ok={sp.ok} error={sp.error} />

      {(borradores ?? 0) > 0 && (
        <Link
          href={`/contabilidad/partidas?mes=${mes}&estado=borrador`}
          className="rounded-lg bg-amber-500/10 px-3 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-500/15 dark:text-amber-300"
        >
          Hay {borradores} partida(s) en borrador. Los borradores no afectan saldos y deben contabilizarse o descartarse antes de cerrar el mes.
        </Link>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Link href={conMes(mesPrevio)} className="rounded-lg border border-border px-2.5 py-1.5 hover:bg-muted">
            ←
          </Link>
          <span className="min-w-36 text-center font-semibold capitalize text-foreground">{nombreMes}</span>
          <Link href={conMes(mesSiguiente)} className="rounded-lg border border-border px-2.5 py-1.5 hover:bg-muted">
            →
          </Link>
        </div>
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="mes" value={mes} />
          <select name="estado" defaultValue={sp.estado ?? ''} className={cn(clasesCampo, 'w-auto')}>
            <option value="">Todos los estados</option>
            {Object.entries(ESTADOS_PARTIDA).map(([v, e]) => (
              <option key={v} value={v}>
                {e}
              </option>
            ))}
          </select>
          <select name="tipo" defaultValue={sp.tipo ?? ''} className={cn(clasesCampo, 'w-auto')}>
            <option value="">Todos los tipos</option>
            {Object.entries(TIPOS_PARTIDA).map(([v, e]) => (
              <option key={v} value={v}>
                {e}
              </option>
            ))}
          </select>
          <input name="q" defaultValue={sp.q ?? ''} placeholder="Buscar concepto" className={cn(clasesCampo, 'w-44')} />
          <button type="submit" className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
            Filtrar
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Partida</th>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Concepto</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2 text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {partidas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No hay partidas en este mes con esos filtros.
                </td>
              </tr>
            )}
            {partidas.map((p) => {
              const descuadrada = Number(p.total_debe) !== Number(p.total_haber)
              return (
                <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link href={`/contabilidad/partidas/${p.id}`} className="font-mono text-xs font-semibold text-primary hover:underline">
                      {numeroPartida(p.anio, p.numero)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{p.fecha.split('-').reverse().join('/')}</td>
                  <td className="px-3 py-2">
                    <Link href={`/contabilidad/partidas/${p.id}`} className="text-foreground hover:underline">
                      {p.descripcion}
                    </Link>
                    {p.revertida_por_id && <span className="ml-2 text-xs text-muted-foreground">(revertida)</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{TIPOS_PARTIDA[p.tipo] ?? p.tipo}</td>
                  <td className="px-3 py-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', estiloEstado[p.estado])}>
                      {ESTADOS_PARTIDA[p.estado] ?? p.estado}
                    </span>
                    {p.estado === 'borrador' && descuadrada && (
                      <span className="ml-1.5 text-xs font-semibold text-destructive">descuadrada</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{montoContable(p.total_debe)}</td>
                </tr>
              )
            })}
          </tbody>
          {contabilizadas.length > 0 && (
            <tfoot className="border-t border-border bg-muted/30 text-sm font-semibold">
              <tr>
                <td colSpan={5} className="px-3 py-2 text-right">
                  Total contabilizado ({contabilizadas.length} partidas)
                </td>
                <td className="px-3 py-2 text-right tabular-nums">Q {montoContable(totalDebe)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </main>
  )
}
