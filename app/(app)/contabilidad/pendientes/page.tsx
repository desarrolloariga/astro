import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ListTodo, RotateCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { formatearFechaHora } from '@/lib/formato'
import { ORIGENES_CONTABLES, clasesCampo } from '@/lib/contabilidad-general'
import { enlacesOrigen } from '@/lib/contabilidad-servidor'
import { Encabezado, Mensajes } from '@/components/contabilidad/comunes'
import { descartarPendiente, reintentarPendientes } from './acciones'

export const metadata = { title: 'Pendientes de contabilizar — ASTRO' }

type Pendiente = {
  id: number
  origen: string
  origen_id: number
  accion: 'contabilizar' | 'revertir'
  mensaje: string
  intentos: number
  estado: string
  motivo_descarte: string | null
  fecha_creacion: string
  fecha_actualizacion: string
}

export default async function PendientesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; ver?: string }>
}) {
  const sp = await searchParams
  const verResueltos = sp.ver === 'historial'
  const supabase = await createClient()
  let consulta = supabase
    .from('contabilizacion_pendientes')
    .select('*')
    .order('fecha_creacion', { ascending: false })
    .limit(300)
  consulta = verResueltos ? consulta.neq('estado', 'pendiente') : consulta.eq('estado', 'pendiente')
  const [puedeVer, puedeRegistrar, { data }, { data: empresa }] = await Promise.all([
    tienePermiso('contabilidad', 'ver'),
    tienePermiso('contabilidad', 'registrar'),
    consulta,
    supabase.from('empresa_contable').select('contabilizacion_automatica').eq('id', 1).maybeSingle(),
  ])
  if (!puedeVer) redirect('/inicio')
  const pendientes = (data ?? []) as Pendiente[]
  const enlaces = await enlacesOrigen(supabase, pendientes)
  const activa = Boolean((empresa as { contabilizacion_automatica: boolean } | null)?.contabilizacion_automatica)

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={ListTodo}
        titulo="Pendientes de contabilizar"
        descripcion="Operaciones que se guardaron bien pero cuya partida automática no se pudo generar: falta una cuenta en el mapeo, el mes está cerrado o hay un dato incompleto. Corrige la causa y reintenta."
      >
        {!verResueltos && puedeRegistrar && activa && pendientes.length > 0 && (
          <form action={reintentarPendientes}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <RotateCw className="h-4 w-4" />
              Reintentar todos
            </button>
          </form>
        )}
      </Encabezado>

      <Mensajes ok={sp.ok} error={sp.error} />

      {!activa && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300">
          Las partidas automáticas están apagadas.{' '}
          <Link href="/contabilidad/configuracion?tab=automatica" className="font-semibold underline">
            Actívalas en Datos contables
          </Link>
          .
        </p>
      )}

      <div className="flex gap-2 text-sm">
        <Link
          href="/contabilidad/pendientes"
          className={cn('rounded-lg px-3 py-1.5 font-semibold', !verResueltos ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}
        >
          Pendientes
        </Link>
        <Link
          href="/contabilidad/pendientes?ver=historial"
          className={cn('rounded-lg px-3 py-1.5 font-semibold', verResueltos ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}
        >
          Resueltos y descartados
        </Link>
      </div>

      {pendientes.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {verResueltos ? 'Sin historial todavía.' : 'Todo está contabilizado. No hay pendientes.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pendientes.map((p) => {
            const href = enlaces.get(`${p.origen}:${p.origen_id}`)
            return (
              <li key={p.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-semibold text-foreground">
                    {p.accion === 'revertir' ? 'Anulación · ' : ''}
                    {ORIGENES_CONTABLES[p.origen] ?? p.origen} #{p.origen_id}
                  </span>
                  {href && (
                    <Link href={href} className="text-xs font-semibold text-primary hover:underline">
                      Ver operación
                    </Link>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {formatearFechaHora(p.fecha_creacion)} · {p.intentos} intento(s)
                  </span>
                  {verResueltos && (
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-semibold',
                        p.estado === 'resuelto' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {p.estado === 'resuelto' ? 'Contabilizado' : 'Descartado'}
                    </span>
                  )}
                </div>
                <p className={cn('text-sm', verResueltos ? 'text-muted-foreground' : 'text-destructive')}>{p.mensaje}</p>
                {p.motivo_descarte && <p className="text-xs text-muted-foreground">Motivo: {p.motivo_descarte}</p>}
                {!verResueltos && puedeRegistrar && (
                  <div className="flex flex-wrap items-center gap-2">
                    {activa && (
                      <form action={reintentarPendientes}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                          Reintentar
                        </button>
                      </form>
                    )}
                    <details>
                      <summary className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted">
                        Descartar
                      </summary>
                      <form action={descartarPendiente} className="mt-2 flex flex-wrap gap-2">
                        <input type="hidden" name="id" value={p.id} />
                        <input
                          name="motivo"
                          required
                          placeholder="Motivo (ej. registrado con partida manual)"
                          className={cn(clasesCampo, 'w-72 py-1.5 text-xs')}
                        />
                        <button type="submit" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10">
                          Confirmar descarte
                        </button>
                      </form>
                    </details>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
