import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Lock, NotebookPen } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { formatearFechaHora } from '@/lib/formato'
import { hoyGuatemala } from '@/lib/contabilidad'
import { ESTADOS_PARTIDA, ORIGENES_CONTABLES, TIPOS_PARTIDA, montoContable, numeroPartida } from '@/lib/contabilidad-general'
import { cargarCatalogosCaptura, enlacesOrigen, fechaBloqueo } from '@/lib/contabilidad-servidor'
import { Encabezado, EnlaceVolver, Mensajes } from '@/components/contabilidad/comunes'
import { FormularioPartida } from '@/components/contabilidad/formulario-partida'
import { FormularioDescartar, FormularioReversion } from '@/components/contabilidad/acciones-partida'

export const metadata = { title: 'Partida contable — ASTRO' }

type Linea = {
  linea: number
  cuenta_id: number
  centro_costo_id: number | null
  debe: number
  haber: number
  descripcion: string | null
  cuenta: { codigo: string; nombre: string } | null
  centro: { codigo: string; nombre: string } | null
}

type Partida = {
  id: number
  anio: number
  numero: number | null
  fecha: string
  tipo: string
  origen: string
  origen_id: number | null
  descripcion: string
  estado: string
  total_debe: number
  total_haber: number
  partida_revertida_id: number | null
  revertida_por_id: number | null
  fecha_creacion: string
  fecha_contabilizacion: string | null
  creador: { nombre: string } | null
  contabilizador: { nombre: string } | null
  partida_lineas: Linea[]
}

export default async function PartidaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const partidaId = Number(id)
  if (!Number.isInteger(partidaId) || partidaId <= 0) notFound()

  const supabase = await createClient()
  const [puedeVer, puedeRegistrar, puedeAutorizar, { data }, bloqueo, { data: autorizacionesData }] = await Promise.all([
    tienePermiso('contabilidad', 'ver'),
    tienePermiso('contabilidad', 'registrar'),
    tienePermiso('contabilidad', 'autorizar_cierre'),
    supabase
      .from('partidas')
      .select(
        `id, anio, numero, fecha, tipo, origen, origen_id, descripcion, estado, total_debe, total_haber,
         partida_revertida_id, revertida_por_id, fecha_creacion, fecha_contabilizacion,
         creador:creado_por ( nombre ), contabilizador:contabilizado_por ( nombre ),
         partida_lineas ( linea, cuenta_id, centro_costo_id, debe, haber, descripcion,
           cuenta:cuenta_id ( codigo, nombre ), centro:centro_costo_id ( codigo, nombre ) )`,
      )
      .eq('id', partidaId)
      .maybeSingle(),
    fechaBloqueo(supabase),
    supabase
      .from('autorizaciones_cierre')
      .select('id, motivo, fecha_uso, usuario:usuario_id ( nombre )')
      .eq('partida_id', partidaId)
      .not('fecha_uso', 'is', null)
      .order('fecha_uso'),
  ])
  if (!puedeVer) redirect('/inicio')
  if (!data) notFound()

  const partida = data as unknown as Partida
  const lineas = [...partida.partida_lineas].sort((a, b) => a.linea - b.linea)
  const esBorrador = partida.estado === 'borrador'
  const enMesCerrado = Boolean(bloqueo && partida.fecha <= bloqueo)
  const autorizaciones = (autorizacionesData ?? []) as unknown as {
    id: number
    motivo: string
    fecha_uso: string
    usuario: { nombre: string } | null
  }[]
  const [catalogos, enlaces] = await Promise.all([
    esBorrador && puedeRegistrar ? cargarCatalogosCaptura(supabase) : Promise.resolve(null),
    partida.origen_id && partida.origen !== 'reversion' ? enlacesOrigen(supabase, [partida]) : Promise.resolve(new Map<string, string>()),
  ])
  const enlaceOrigen = enlaces.get(`${partida.origen}:${partida.origen_id}`)

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={NotebookPen}
        titulo={`Partida ${numeroPartida(partida.anio, partida.numero)}`}
        descripcion={partida.descripcion}
      >
        <EnlaceVolver href={`/contabilidad/partidas?mes=${partida.fecha.slice(0, 7)}`}>← Partidas</EnlaceVolver>
      </Encabezado>

      <Mensajes ok={sp.ok} error={sp.error} />

      <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <span>
          <span className="text-muted-foreground">Fecha: </span>
          <span className="font-semibold">{partida.fecha.split('-').reverse().join('/')}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Tipo: </span>
          <span className="font-semibold">{TIPOS_PARTIDA[partida.tipo] ?? partida.tipo}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Estado: </span>
          <span className={cn('font-semibold', esBorrador ? 'text-amber-700 dark:text-amber-300' : 'text-primary')}>
            {ESTADOS_PARTIDA[partida.estado] ?? partida.estado}
          </span>
        </span>
        {partida.origen_id && !['reversion', 'apertura'].includes(partida.origen) && (
          <span>
            <span className="text-muted-foreground">Origen: </span>
            <span className="font-semibold">
              {ORIGENES_CONTABLES[partida.origen] ?? partida.origen} #{partida.origen_id}
            </span>
            {enlaceOrigen && (
              <Link href={enlaceOrigen} className="ml-2 text-xs font-semibold text-primary hover:underline">
                Ver operación
              </Link>
            )}
          </span>
        )}
        {enMesCerrado && (
          <span className="flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300">
            <Lock className="h-3.5 w-3.5" />
            Mes cerrado
          </span>
        )}
        <span className="text-muted-foreground">
          Creada por {partida.creador?.nombre ?? 'el sistema'} · {formatearFechaHora(partida.fecha_creacion)}
          {partida.fecha_contabilizacion &&
            ` · contabilizada por ${partida.contabilizador?.nombre ?? 'el sistema'} el ${formatearFechaHora(partida.fecha_contabilizacion)}`}
        </span>
      </div>

      {partida.partida_revertida_id && (
        <Link
          href={`/contabilidad/partidas/${partida.partida_revertida_id}`}
          className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground hover:underline"
        >
          Esta partida revierte a la partida original → ver partida original
        </Link>
      )}
      {partida.revertida_por_id && (
        <Link
          href={`/contabilidad/partidas/${partida.revertida_por_id}`}
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:underline"
        >
          Esta partida fue revertida → ver la partida de reversión
        </Link>
      )}

      {esBorrador && catalogos ? (
        <>
          <FormularioPartida
            cuentas={catalogos.cuentas}
            centros={catalogos.centros}
            hoy={hoyGuatemala()}
            fechaBloqueo={bloqueo}
            puedeAutorizar={puedeAutorizar}
            inicial={{
              id: partida.id,
              fecha: partida.fecha,
              tipo: partida.tipo,
              descripcion: partida.descripcion,
              lineas: lineas.map((l) => ({
                cuenta_id: l.cuenta_id,
                centro_costo_id: l.centro_costo_id,
                debe: Number(l.debe),
                haber: Number(l.haber),
                descripcion: l.descripcion,
              })),
            }}
          />
          <FormularioDescartar partidaId={partida.id} fecha={partida.fecha} cerrada={enMesCerrado && puedeAutorizar} />
        </>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Cuenta</th>
                <th className="px-3 py-2">C. costo</th>
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2 text-right">Debe</th>
                <th className="px-3 py-2 text-right">Haber</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.linea} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{l.cuenta?.codigo}</td>
                  <td className={cn('px-3 py-2', Number(l.haber) > 0 && 'pl-8')}>{l.cuenta?.nombre}</td>
                  <td className="px-3 py-2 font-mono text-xs">{l.centro?.codigo ?? ''}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{l.descripcion}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(l.debe) > 0 ? montoContable(l.debe) : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(l.haber) > 0 ? montoContable(l.haber) : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border bg-muted/30 font-semibold">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right">
                  Sumas iguales
                </td>
                <td className="px-3 py-2 text-right tabular-nums">Q {montoContable(partida.total_debe)}</td>
                <td className="px-3 py-2 text-right tabular-nums">Q {montoContable(partida.total_haber)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {partida.estado === 'contabilizada' && !partida.revertida_por_id && partida.tipo !== 'reversion' && puedeRegistrar && (
        <FormularioReversion partidaId={partida.id} hoy={hoyGuatemala()} fechaBloqueo={bloqueo} puedeAutorizar={puedeAutorizar} />
      )}

      {autorizaciones.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <p className="mb-2 flex items-center gap-2 font-semibold text-foreground">
            <Lock className="h-4 w-4 text-amber-600" />
            Cambios autorizados en mes cerrado
          </p>
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {autorizaciones.map((a) => (
              <li key={a.id}>
                {formatearFechaHora(a.fecha_uso)} · {a.usuario?.nombre ?? 'Usuario'} · {a.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  )
}
