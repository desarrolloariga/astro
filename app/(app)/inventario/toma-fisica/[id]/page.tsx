import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AlertTriangle, ClipboardList, Printer } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { formatearFechaHora } from '@/lib/formato'
import { clasesCampo, montoContable } from '@/lib/contabilidad-general'
import { ESTADOS_TOMA, type LineaToma } from '@/lib/toma-fisica'
import { BotonConfirmar } from '@/components/app/boton-confirmar'
import { Encabezado, EnlaceVolver, Mensajes } from '@/components/contabilidad/comunes'
import { CapturaConteo } from '@/components/inventario/captura-conteo'
import { actualizarSistema, aprobarToma, cancelarToma, cerrarConteo, reabrirConteo } from '../acciones'

export const metadata = { title: 'Toma física — ASTRO' }

type Toma = {
  id: number
  bodega_id: number
  ciega: boolean
  estado: string
  notas: string | null
  total_faltante: number
  total_sobrante: number
  fecha_creacion: string
  fecha_cierre: string | null
  fecha_aprobacion: string | null
  motivo_cancelacion: string | null
  bodega: { nombre: string } | null
  categoria: { nombre: string } | null
  creador: { nombre: string } | null
  aprobador: { nombre: string } | null
}

const cant = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('es-GT', { maximumFractionDigits: 3 }))

export default async function TomaFisicaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ok?: string; error?: string; ver?: string }>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const tomaId = Number(id)
  if (!Number.isInteger(tomaId) || tomaId <= 0) notFound()
  const supabase = await createClient()
  const [puedeContar, puedeCrear, puedeAprobar, { data }, { data: lineasData, error: errorLineas }, { data: partida }] = await Promise.all([
    tienePermiso('toma_fisica', 'contar'),
    tienePermiso('toma_fisica', 'crear'),
    tienePermiso('toma_fisica', 'aprobar'),
    supabase
      .from('tomas_fisicas')
      .select(
        `id, bodega_id, ciega, estado, notas, total_faltante, total_sobrante, fecha_creacion, fecha_cierre, fecha_aprobacion, motivo_cancelacion,
         bodega:bodega_id ( nombre ), categoria:categoria_id ( nombre ), creador:creado_por ( nombre ), aprobador:aprobado_por ( nombre )`,
      )
      .eq('id', tomaId)
      .maybeSingle(),
    supabase.rpc('fn_toma_lineas', { p_toma_id: tomaId }),
    supabase.from('partidas').select('id').eq('origen', 'toma').eq('origen_id', tomaId).is('revertida_por_id', null).maybeSingle(),
  ])
  if (!puedeContar && !puedeAprobar) redirect('/inicio')
  if (!data) notFound()
  const toma = data as unknown as Toma
  const lineas = (lineasData ?? []) as LineaToma[]
  const verSistema = lineas.some((l) => l.cantidad_sistema != null)
  const dif = (l: LineaToma) => (l.cantidad_sistema == null ? null : Number(l.cantidad_contada ?? 0) - Number(l.cantidad_sistema))
  const contadas = lineas.filter((l) => l.cantidad_contada != null).length
  const conDiferencia = lineas.filter((l) => (dif(l) ?? 0) !== 0)
  const cambiadas = lineas.filter((l) => l.cantidad_actual != null && Number(l.cantidad_actual) !== Number(l.cantidad_sistema))
  const valor = (l: LineaToma) => (dif(l) ?? 0) * Number(l.costo_unitario ?? 0)
  const faltanteEst = conDiferencia.filter((l) => (dif(l) ?? 0) < 0).reduce((a, l) => a - valor(l), 0)
  const sobranteEst = conDiferencia.filter((l) => (dif(l) ?? 0) > 0).reduce((a, l) => a + valor(l), 0)

  const ver = sp.ver ?? (toma.estado === 'en_conteo' ? 'pendientes' : verSistema ? 'diferencias' : 'todas')
  const visibles = lineas.filter((l) =>
    ver === 'pendientes' ? l.cantidad_contada == null : ver === 'diferencias' ? (dif(l) ?? 0) !== 0 : true,
  )
  const abierta = toma.estado === 'en_conteo' || toma.estado === 'en_revision'

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={ClipboardList}
        titulo={`Toma física #${toma.id} · ${toma.bodega?.nombre ?? ''}`}
        descripcion={`${toma.ciega ? 'Hoja a ciegas' : 'Hoja con existencias'}${toma.categoria ? ` · ${toma.categoria.nombre}` : ' · toda la bodega'}${toma.notas ? ` · ${toma.notas}` : ''}`}
      >
        <EnlaceVolver href="/inventario/toma-fisica">← Tomas físicas</EnlaceVolver>
      </Encabezado>
      <Mensajes ok={sp.ok} error={sp.error ?? errorLineas?.message} />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', ESTADOS_TOMA[toma.estado]?.clase)}>
          {ESTADOS_TOMA[toma.estado]?.etiqueta ?? toma.estado}
        </span>
        <span>
          <span className="text-muted-foreground">Contadas: </span>
          <span className="font-semibold tabular-nums">
            {contadas} de {lineas.length}
          </span>
        </span>
        {verSistema && (
          <span>
            <span className="text-muted-foreground">Con diferencia: </span>
            <span className={cn('font-semibold', conDiferencia.length ? 'text-destructive' : 'text-primary')}>{conDiferencia.length}</span>
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          Iniciada {formatearFechaHora(toma.fecha_creacion)} por {toma.creador?.nombre ?? '—'}
          {toma.fecha_aprobacion && ` · aprobada ${formatearFechaHora(toma.fecha_aprobacion)} por ${toma.aprobador?.nombre ?? '—'}`}
        </span>
        <span className="ml-auto flex gap-3">
          <Link href={`/inventario/toma-fisica/${toma.id}/hoja?modo=ciega`} target="_blank" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            <Printer className="h-3.5 w-3.5" />
            Hoja a ciegas
          </Link>
          {verSistema && (
            <Link href={`/inventario/toma-fisica/${toma.id}/hoja?modo=existencias`} target="_blank" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              <Printer className="h-3.5 w-3.5" />
              Hoja con existencias
            </Link>
          )}
        </span>
      </div>

      {toma.estado === 'en_conteo' && puedeContar && (
        <>
          <CapturaConteo tomaId={toma.id} />
          <form action={cerrarConteo}>
            <input type="hidden" name="toma_id" value={toma.id} />
            <BotonConfirmar
              mensaje={`¿Cerrar el conteo? ${lineas.length - contadas} artículo(s) sin contar se tomarán como no encontrados (0).`}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              Cerrar conteo y pasar a revisión
            </BotonConfirmar>
          </form>
        </>
      )}

      {toma.estado === 'en_revision' && puedeAprobar && (
        <section className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-card p-4">
          <p className="text-sm font-semibold text-foreground">Revisión de diferencias</p>
          <div className="flex flex-wrap gap-6 text-sm">
            <span>
              Faltantes estimados: <span className="font-semibold tabular-nums text-destructive">Q {montoContable(faltanteEst)}</span>
            </span>
            <span>
              Sobrantes estimados: <span className="font-semibold tabular-nums text-primary">Q {montoContable(sobranteEst)}</span>
            </span>
          </div>
          {cambiadas.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                La existencia del sistema cambió durante el conteo en {cambiadas.length} artículo(s) ({cambiadas.slice(0, 5).map((l) => l.codigo).join(', ')}
                {cambiadas.length > 5 ? '…' : ''}). Reabre el conteo para recontarlos o actualiza la existencia del sistema si el conteo ya
                refleja esos movimientos.
              </p>
              <form action={actualizarSistema}>
                <input type="hidden" name="toma_id" value={toma.id} />
                <button type="submit" className="rounded-lg border border-amber-600/40 px-3 py-1.5 text-xs font-semibold hover:bg-amber-500/10">
                  Actualizar existencias del sistema
                </button>
              </form>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <form action={aprobarToma}>
              <input type="hidden" name="toma_id" value={toma.id} />
              <BotonConfirmar
                mensaje="¿Aprobar la toma? Se ajustarán las existencias (bajas y sobrantes), el Kardex PEPS y se generará la partida de ajuste. No se puede deshacer."
                disabled={cambiadas.length > 0}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Aprobar y ajustar inventario
              </BotonConfirmar>
            </form>
            <form action={reabrirConteo}>
              <input type="hidden" name="toma_id" value={toma.id} />
              <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">
                Reabrir conteo
              </button>
            </form>
          </div>
        </section>
      )}

      {toma.estado === 'aprobada' && (
        <section className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm">
          <span>
            Faltantes: <span className="font-semibold tabular-nums">Q {montoContable(toma.total_faltante)}</span>
          </span>
          <span>
            Sobrantes: <span className="font-semibold tabular-nums">Q {montoContable(toma.total_sobrante)}</span>
          </span>
          {partida ? (
            <Link href={`/contabilidad/partidas/${(partida as { id: number }).id}`} className="font-semibold text-primary hover:underline">
              Ver partida de ajuste
            </Link>
          ) : (
            Number(toma.total_faltante) + Number(toma.total_sobrante) > 0 && (
              <span className="text-xs text-muted-foreground">
                La partida de ajuste se genera con las partidas automáticas activas (o revisa Pendientes de contabilizar).
              </span>
            )
          )}
        </section>
      )}
      {toma.estado === 'cancelada' && toma.motivo_cancelacion && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Cancelada: {toma.motivo_cancelacion}</p>
      )}

      <div className="flex flex-wrap gap-2 text-sm">
        {[
          { v: 'pendientes', e: `Sin contar (${lineas.length - contadas})` },
          ...(verSistema ? [{ v: 'diferencias', e: `Con diferencia (${conDiferencia.length})` }] : []),
          { v: 'todas', e: `Todas (${lineas.length})` },
        ].map((f) => (
          <Link
            key={f.v}
            href={`/inventario/toma-fisica/${toma.id}?ver=${f.v}`}
            className={cn('rounded-lg px-3 py-1.5 font-semibold', ver === f.v ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}
          >
            {f.e}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Artículo</th>
              {verSistema && <th className="px-3 py-2 text-right">Sistema</th>}
              <th className="px-3 py-2 text-right">Contado</th>
              {verSistema && <th className="px-3 py-2 text-right">Diferencia</th>}
              {puedeAprobar && <th className="px-3 py-2 text-right">Valor dif. (PEPS)</th>}
              <th className="px-3 py-2">Contó</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  {ver === 'pendientes' ? 'Todo está contado.' : ver === 'diferencias' ? 'Sin diferencias.' : 'Sin artículos.'}
                </td>
              </tr>
            )}
            {visibles.map((l) => {
              const d = dif(l)
              return (
                <tr key={l.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-1.5 font-mono text-xs">{l.codigo}</td>
                  <td className="px-3 py-1.5">
                    {l.nombre}
                    <span className="block text-xs text-muted-foreground">
                      {l.categoria ?? ''}
                      {l.modo_inventario === 'pieza_unica' ? ' · pieza única' : ''}
                      {l.agregada ? ' · no estaba en la lista' : ''}
                      {l.comentario ? ` · ${l.comentario}` : ''}
                    </span>
                  </td>
                  {verSistema && <td className="px-3 py-1.5 text-right tabular-nums">{cant(l.cantidad_sistema)}</td>}
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{l.cantidad_contada == null ? <span className="text-muted-foreground">—</span> : cant(l.cantidad_contada)}</td>
                  {verSistema && (
                    <td className={cn('px-3 py-1.5 text-right font-semibold tabular-nums', d && d < 0 && 'text-destructive', d && d > 0 && 'text-primary')}>
                      {d ? (d > 0 ? `+${cant(d)}` : cant(d)) : '0'}
                    </td>
                  )}
                  {puedeAprobar && <td className="px-3 py-1.5 text-right tabular-nums">{d ? montoContable(valor(l)) : ''}</td>}
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">
                    {l.contado_por ?? ''}
                    {l.fecha_conteo && <span className="block">{formatearFechaHora(l.fecha_conteo)}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {abierta && puedeCrear && (
        <details className="rounded-xl border border-border bg-card px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">Cancelar esta toma</summary>
          <form action={cancelarToma} className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="toma_id" value={toma.id} />
            <input name="motivo" required placeholder="Motivo de la cancelación" className={cn(clasesCampo, 'w-80')} />
            <button type="submit" className="rounded-lg px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10">
              Cancelar toma
            </button>
          </form>
        </details>
      )}
    </main>
  )
}
