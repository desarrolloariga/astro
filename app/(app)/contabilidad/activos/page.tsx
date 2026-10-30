import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Armchair, FileSpreadsheet, FileText, Plus, Settings2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { hoyGuatemala } from '@/lib/contabilidad'
import { clasesCampo, esFecha, montoContable } from '@/lib/contabilidad-general'
import { type ConsultaActivos, type TipoActivo } from '@/lib/activos'
import { BotonConfirmar } from '@/components/app/boton-confirmar'
import { Encabezado, Mensajes } from '@/components/contabilidad/comunes'
import { depreciarMes, registrarDesdeFactura, registrarManual, revertirDepreciacion } from './acciones'

export const metadata = { title: 'Activos fijos — ASTRO' }

type Pendiente = {
  linea_id: number
  factura_id: number
  documento: string
  proveedor: string
  fecha: string
  cuenta: string
  descripcion: string | null
  monto: number
  tipo_sugerido: number | null
}

const fecha = (f: string) => f.split('-').reverse().join('/')

export default async function ActivosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; q?: string; tipo?: string; estado?: string; hasta?: string }>
}) {
  const sp = await searchParams
  const hoy = hoyGuatemala()
  const hasta = esFecha(sp.hasta) ? sp.hasta : hoy
  const supabase = await createClient()
  const [puedeVer, puedeRegistrar, puedeConfigurar, { data, error }, { data: tiposData }, { data: pendData }, { data: tiendas }, { data: centros }, { data: usuarios }] =
    await Promise.all([
      tienePermiso('contabilidad', 'ver'),
      tienePermiso('contabilidad', 'registrar'),
      tienePermiso('contabilidad', 'configurar'),
      supabase.rpc('fn_af_consulta', { p_hasta: hasta, p_buscar: sp.q || null, p_tipo_id: Number(sp.tipo) || null, p_estado: sp.estado || null }),
      supabase.from('tipos_activo').select('*').order('nombre'),
      supabase.rpc('fn_af_lineas_pendientes'),
      supabase.from('tiendas').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('centros_costo').select('id, codigo, nombre').eq('activo', true).order('codigo'),
      supabase.from('usuarios').select('id, nombre').eq('activo', true).order('nombre').limit(500),
    ])
  if (!puedeVer) redirect('/inicio')
  const c = (data as ConsultaActivos | null) ?? { hasta, filas: [], totales: { activos: 0, costo: 0, acumulada: 0, valor_libros: 0 } }
  const tipos = ((tiposData ?? []) as TipoActivo[]).filter((t) => t.activo)
  const pendientes = (pendData ?? []) as Pendiente[]
  const listaTiendas = (tiendas ?? []) as { id: number; nombre: string }[]
  const listaCentros = (centros ?? []) as { id: number; codigo: string; nombre: string }[]
  const listaUsuarios = (usuarios ?? []) as { id: number; nombre: string }[]
  const exportar = (formato: string) =>
    `/contabilidad/reportes/exportar?${new URLSearchParams({ reporte: 'activos_fijos', desde: hasta, hasta, formato })}`

  const camposUbicacion = (
    <>
      <select name="tienda_id" defaultValue="" className={cn(clasesCampo, 'py-1.5 text-xs')}>
        <option value="">Ubicación…</option>
        {listaTiendas.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nombre}
          </option>
        ))}
      </select>
      <select name="responsable_id" defaultValue="" className={cn(clasesCampo, 'py-1.5 text-xs')}>
        <option value="">Responsable…</option>
        {listaUsuarios.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nombre}
          </option>
        ))}
      </select>
      <select name="centro_costo_id" defaultValue="" className={cn(clasesCampo, 'py-1.5 text-xs')}>
        <option value="">Centro de costo del tipo</option>
        {listaCentros.map((cc) => (
          <option key={cc.id} value={cc.id}>
            {cc.codigo} · {cc.nombre}
          </option>
        ))}
      </select>
    </>
  )

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={Armchair}
        titulo="Activos fijos"
        descripcion="Registro de activos con número por tipo, depreciación mensual en línea recta (se calcula sola al cerrar el mes) y bajas por desecho, venta, donación o pérdida."
      >
        {puedeConfigurar && (
          <Link href="/contabilidad/activos/tipos" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            <Settings2 className="h-4 w-4" /> Tipos de activo
          </Link>
        )}
      </Encabezado>
      <Mensajes ok={sp.ok} error={sp.error ?? error?.message} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { e: 'Activos vigentes', v: String(c.totales.activos) },
          { e: 'Costo', v: `Q ${montoContable(c.totales.costo)}` },
          { e: 'Depreciación acumulada', v: `Q ${montoContable(c.totales.acumulada)}` },
          { e: 'Valor en libros', v: `Q ${montoContable(c.totales.valor_libros)}` },
        ].map((k) => (
          <div key={k.e} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{k.e}</p>
            <p className="text-lg font-bold tabular-nums">{k.v}</p>
          </div>
        ))}
      </div>

      {pendientes.length > 0 && puedeRegistrar && (
        <section className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            {pendientes.length} compra(s) cargada(s) a activo fijo en Cuentas por pagar sin registrar como activo
          </p>
          {pendientes.map((p) => (
            <form key={p.linea_id} action={registrarDesdeFactura} className="grid grid-cols-1 gap-2 rounded-lg bg-card p-3 text-sm md:grid-cols-6">
              <input type="hidden" name="linea_id" value={p.linea_id} />
              <div className="md:col-span-6">
                <Link href={`/contabilidad/cxp/${p.factura_id}`} className="font-semibold text-primary hover:underline">
                  {p.documento}
                </Link>{' '}
                · {p.proveedor} · {fecha(p.fecha)} · {p.cuenta} · <span className="font-semibold">Q {montoContable(p.monto)}</span>
              </div>
              <select name="tipo_id" required defaultValue={p.tipo_sugerido ?? ''} className={cn(clasesCampo, 'py-1.5 text-xs')}>
                <option value="" disabled>
                  Tipo…
                </option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.prefijo} · {t.nombre}
                  </option>
                ))}
              </select>
              <input name="descripcion" defaultValue={p.descripcion ?? ''} placeholder="Descripción" className={cn(clasesCampo, 'py-1.5 text-xs md:col-span-2')} />
              <input name="cantidad" type="number" min="1" defaultValue="1" title="Unidades (se crea un activo por unidad)" className={cn(clasesCampo, 'py-1.5 text-xs')} />
              <input name="serie" placeholder="Serie (si es una unidad)" className={cn(clasesCampo, 'py-1.5 text-xs')} />
              <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                Registrar activo
              </button>
              {camposUbicacion}
            </form>
          ))}
        </section>
      )}

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {puedeRegistrar && (
          <details className="rounded-xl border border-dashed border-primary/40 bg-card p-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-primary">
              <Plus className="h-4 w-4" /> Registrar activo existente (sin factura en el sistema)
            </summary>
            <form action={registrarManual} className="mt-3 grid grid-cols-2 gap-2">
              <select name="tipo_id" required defaultValue="" className={cn(clasesCampo, 'py-1.5 text-xs')}>
                <option value="" disabled>
                  Tipo…
                </option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.prefijo} · {t.nombre}
                  </option>
                ))}
              </select>
              <input name="descripcion" required placeholder="Descripción" className={cn(clasesCampo, 'py-1.5 text-xs')} />
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
                Fecha de adquisición
                <input name="fecha_adquisicion" type="date" required className={cn(clasesCampo, 'py-1.5 text-xs')} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
                Costo de adquisición
                <input name="costo" required inputMode="decimal" className={cn(clasesCampo, 'py-1.5 text-xs')} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
                Depreciación acumulada a la fecha
                <input name="depreciacion_inicial" inputMode="decimal" defaultValue="0" className={cn(clasesCampo, 'py-1.5 text-xs')} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
                Depreciar desde el mes
                <input name="fecha_inicio_depreciacion" type="month" defaultValue={hoy.slice(0, 7)} className={cn(clasesCampo, 'py-1.5 text-xs')} />
              </label>
              <input name="marca" placeholder="Marca" className={cn(clasesCampo, 'py-1.5 text-xs')} />
              <input name="serie" placeholder="Serie" className={cn(clasesCampo, 'py-1.5 text-xs')} />
              {camposUbicacion}
              <p className="col-span-2 text-[11px] text-muted-foreground">
                No genera partida: su costo y depreciación deben estar en la partida de apertura o registrarse con una partida manual.
              </p>
              <button type="submit" className="col-span-2 rounded-lg bg-primary py-1.5 text-xs font-semibold text-primary-foreground">
                Registrar activo
              </button>
            </form>
          </details>
        )}
        {puedeRegistrar && (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-sm">
            <p className="font-semibold">Depreciación del mes</p>
            <p className="text-xs text-muted-foreground">
              Se calcula y contabiliza sola al cerrar el mes en Cierre de mes. Aquí puedes adelantarla o revertirla para recalcular.
            </p>
            <div className="flex flex-wrap gap-2">
              <form action={depreciarMes} className="flex gap-2">
                <input name="mes" type="month" required defaultValue={hoy.slice(0, 7)} className={cn(clasesCampo, 'w-40 py-1.5 text-xs')} />
                <button type="submit" className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                  Depreciar
                </button>
              </form>
              <form action={revertirDepreciacion} className="flex gap-2">
                <input name="mes" type="month" required defaultValue={hoy.slice(0, 7)} className={cn(clasesCampo, 'w-40 py-1.5 text-xs')} />
                <BotonConfirmar mensaje="¿Revertir la depreciación de ese mes?" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10">
                  Revertir
                </BotonConfirmar>
              </form>
            </div>
          </div>
        )}
      </section>

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-semibold">
          Número de activo o descripción
          <input name="q" defaultValue={sp.q ?? ''} placeholder="COMP-0001, laptop, serie…" className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Tipo
          <select name="tipo" defaultValue={sp.tipo ?? ''} className={clasesCampo}>
            <option value="">Todos</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Estado
          <select name="estado" defaultValue={sp.estado ?? ''} className={clasesCampo}>
            <option value="">Todos</option>
            <option value="activo">Vigentes</option>
            <option value="baja">Dados de baja</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Valores al
          <input name="hasta" type="date" defaultValue={hasta} className={clasesCampo} />
        </label>
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          Consultar
        </button>
        <a href={exportar('xlsx')} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
          <FileSpreadsheet className="h-4 w-4 text-primary" /> Excel
        </a>
        <a href={exportar('pdf')} target="_blank" className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
          <FileText className="h-4 w-4 text-primary" /> PDF
        </a>
      </form>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Activo</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Ubicación / responsable</th>
              <th className="px-3 py-2">Adquisición</th>
              <th className="px-3 py-2 text-right">Costo</th>
              <th className="px-3 py-2 text-right">Dep. acumulada</th>
              <th className="px-3 py-2 text-right">Valor en libros</th>
            </tr>
          </thead>
          <tbody>
            {c.filas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  No hay activos con esos filtros.
                </td>
              </tr>
            )}
            {c.filas.map((a) => (
              <tr key={a.id} className={cn('border-b border-border/60 last:border-0 hover:bg-muted/30', a.estado === 'baja' && 'opacity-60')}>
                <td className="px-3 py-2">
                  <Link href={`/contabilidad/activos/${a.id}`} className="font-mono text-xs font-semibold text-primary hover:underline">
                    {a.codigo}
                  </Link>
                  <span className="block">{a.descripcion}</span>
                  {a.estado === 'baja' && (
                    <span className="text-xs text-destructive">
                      Baja ({a.tipo_baja}) {a.fecha_baja ? fecha(a.fecha_baja) : ''}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">{a.tipo}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {[a.ubicacion, a.responsable, a.centro_costo].filter(Boolean).join(' · ') || '—'}
                </td>
                <td className="px-3 py-2 text-xs">{fecha(a.fecha_adquisicion)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{montoContable(a.costo)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{montoContable(a.acumulada)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{montoContable(a.valor_libros)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
