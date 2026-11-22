import Link from 'next/link'
import { redirect } from 'next/navigation'
import { UserMinus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { montoContable } from '@/lib/contabilidad-general'
import { ESTADOS_FINALIZACION, TIPOS_FINALIZACION, fechaCorta } from '@/lib/rrhh'
import { Encabezado, EnlaceVolver, Mensajes } from '@/components/contabilidad/comunes'

export const metadata = { title: 'Bajas y liquidaciones — ASTRO' }

type Fila = {
  id: number
  colaborador_id: number
  estado: string
  tipo: string
  fecha_salida: string
  liquido: number
  indemnizacion_monto: number
  recontratable: boolean | null
  colaborador: { codigo: string; nombres: string; apellidos: string; puesto: { nombre: string } | null } | null
}

export default async function FinalizacionesPage({ searchParams }: { searchParams: Promise<{ anio?: string; ok?: string; error?: string }> }) {
  const sp = await searchParams
  const anioActual = new Date().getFullYear()
  const anio = Number(sp.anio) || anioActual
  const supabase = await createClient()
  const [puedeFinalizar, puedeVer, { data }] = await Promise.all([
    tienePermiso('rrhh', 'finalizar'),
    tienePermiso('planilla', 'ver'),
    supabase
      .from('rrhh_finalizaciones')
      .select('id, colaborador_id, estado, tipo, fecha_salida, liquido, indemnizacion_monto, recontratable, colaborador:colaborador_id ( codigo, nombres, apellidos, puesto:puesto_id ( nombre ) )')
      .gte('fecha_salida', `${anio}-01-01`)
      .lte('fecha_salida', `${anio}-12-31`)
      .order('fecha_salida', { ascending: false }),
  ])
  if (!puedeFinalizar && !puedeVer) redirect('/inicio')
  const lista = (data ?? []) as unknown as Fila[]
  const vigentes = lista.filter((f) => f.estado !== 'anulada')
  const kpis = [
    { e: `Salidas en ${anio}`, v: String(vigentes.length) },
    { e: 'Liquidaciones por pagar', v: `Q${montoContable(vigentes.filter((f) => f.estado === 'aprobada').reduce((s, f) => s + Number(f.liquido), 0))}` },
    { e: 'En borrador', v: String(vigentes.filter((f) => f.estado === 'borrador').length) },
    { e: `Indemnizaciones ${anio}`, v: `Q${montoContable(vigentes.filter((f) => f.estado !== 'borrador').reduce((s, f) => s + Number(f.indemnizacion_monto), 0))}` },
  ]

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={UserMinus}
        titulo="Bajas y liquidaciones"
        descripcion="Finalización de la relación laboral: liquidación, finiquito, devolución de equipo y entrevista de salida. Para registrar una salida entra al expediente del colaborador → Finalización."
      >
        <EnlaceVolver href="/rrhh">← Colaboradores</EnlaceVolver>
      </Encabezado>
      <Mensajes ok={sp.ok} error={sp.error} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.e} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{k.e}</p>
            <p className="text-xl font-bold tabular-nums">{k.v}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Salidas de {anio}</p>
        <span className="flex gap-3 text-xs font-semibold">
          <Link href={`/rrhh/finalizaciones?anio=${anio - 1}`} className="text-primary hover:underline">
            ← {anio - 1}
          </Link>
          {anio < anioActual && (
            <Link href={`/rrhh/finalizaciones?anio=${anio + 1}`} className="text-primary hover:underline">
              {anio + 1} →
            </Link>
          )}
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Colaborador</th>
              <th className="px-3 py-2">Tipo de salida</th>
              <th className="px-3 py-2">Salida</th>
              <th className="px-3 py-2 text-right">Líquido</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Recontratable</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                  No hay salidas registradas en {anio}.
                </td>
              </tr>
            )}
            {lista.map((f) => (
              <tr key={f.id} className={cn('border-b border-border/60 last:border-0 hover:bg-muted/30', f.estado === 'anulada' && 'opacity-60')}>
                <td className="px-3 py-2">
                  <Link href={`/rrhh/finalizaciones/${f.id}`} className="font-semibold hover:underline">
                    {f.colaborador?.apellidos}, {f.colaborador?.nombres}
                  </Link>
                  <span className="block font-mono text-xs text-muted-foreground">
                    {f.colaborador?.codigo}
                    {f.colaborador?.puesto ? ` · ${f.colaborador.puesto.nombre}` : ''}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">{TIPOS_FINALIZACION[f.tipo]}</td>
                <td className="px-3 py-2 text-xs tabular-nums">{fechaCorta(f.fecha_salida)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{montoContable(f.liquido)}</td>
                <td className="px-3 py-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', ESTADOS_FINALIZACION[f.estado]?.clase)}>{ESTADOS_FINALIZACION[f.estado]?.etiqueta}</span>
                </td>
                <td className="px-3 py-2 text-xs">{f.recontratable == null ? '—' : f.recontratable ? 'Sí' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
