import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Armchair } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { hoyGuatemala } from '@/lib/contabilidad'
import { MESES, clasesCampo, montoContable } from '@/lib/contabilidad-general'
import { TIPOS_BAJA } from '@/lib/activos'
import { BotonConfirmar } from '@/components/app/boton-confirmar'
import { Encabezado, EnlaceVolver, Mensajes } from '@/components/contabilidad/comunes'
import { actualizarActivo, darDeBaja } from '../acciones'

export const metadata = { title: 'Activo fijo — ASTRO' }

type Ficha = {
  activo: {
    id: number
    codigo: string
    descripcion: string
    marca: string | null
    modelo: string | null
    serie: string | null
    tienda_id: number | null
    responsable_id: number | null
    centro_costo_id: number
    fecha_adquisicion: string
    fecha_inicio_depreciacion: string
    costo: number
    valor_residual: number
    vida_util_meses: number
    depreciacion_inicial: number
    factura_proveedor_id: number | null
    estado: 'activo' | 'baja'
    fecha_baja: string | null
    tipo_baja: string | null
    motivo_baja: string | null
    precio_venta: number | null
    notas: string | null
    tipo: { nombre: string; prefijo: string; porcentaje_anual: number }
    ubicacion: string | null
    responsable: string | null
    centro_costo: string | null
    factura: string | null
  }
  cuota_mensual: number
  acumulada: number
  valor_libros: number
  pendiente: number
  meses_restantes: number
  depreciaciones: { anio: number; mes: number; monto: number; partida_id: number | null }[]
  partida_baja: number | null
}

const fecha = (f: string | null) => (f ? f.split('-').reverse().join('/') : '—')

export default async function ActivoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const activoId = Number(id)
  if (!Number.isInteger(activoId) || activoId <= 0) notFound()
  const supabase = await createClient()
  const [puedeVer, puedeRegistrar, { data, error }, { data: tiendas }, { data: centros }, { data: usuarios }, { data: cuentasCobro }] = await Promise.all([
    tienePermiso('contabilidad', 'ver'),
    tienePermiso('contabilidad', 'registrar'),
    supabase.rpc('fn_af_activo', { p_id: activoId }),
    supabase.from('tiendas').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('centros_costo').select('id, codigo, nombre').eq('activo', true).order('codigo'),
    supabase.from('usuarios').select('id, nombre').eq('activo', true).order('nombre').limit(500),
    supabase.from('cuentas_contables').select('id, codigo, nombre').eq('es_detalle', true).eq('activo', true).like('codigo', '1.01.%').order('codigo'),
  ])
  if (!puedeVer) redirect('/inicio')
  const ficha = data as Ficha | null
  if (!ficha) notFound()
  const a = ficha.activo
  const vigente = a.estado === 'activo'

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado icono={Armchair} titulo={`${a.codigo} · ${a.descripcion}`} descripcion={`${a.tipo.nombre} · depreciación ${a.tipo.porcentaje_anual}% anual en línea recta`}>
        <EnlaceVolver href="/contabilidad/activos">← Activos fijos</EnlaceVolver>
      </Encabezado>
      <Mensajes ok={sp.ok} error={sp.error ?? error?.message} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { e: 'Costo', v: a.costo },
          { e: 'Depreciación acumulada', v: ficha.acumulada },
          { e: 'Valor en libros', v: ficha.valor_libros },
          { e: 'Cuota mensual', v: ficha.cuota_mensual },
          { e: 'Por depreciar', v: ficha.pendiente },
        ].map((k) => (
          <div key={k.e} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{k.e}</p>
            <p className="text-lg font-bold tabular-nums">Q {montoContable(k.v)}</p>
          </div>
        ))}
      </div>

      <section className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-3">
        <p><span className="text-muted-foreground">Adquisición: </span>{fecha(a.fecha_adquisicion)}</p>
        <p><span className="text-muted-foreground">Deprecia desde: </span>{fecha(a.fecha_inicio_depreciacion).slice(3)}</p>
        <p><span className="text-muted-foreground">Vida útil: </span>{a.vida_util_meses} meses ({ficha.meses_restantes} por depreciar)</p>
        <p><span className="text-muted-foreground">Ubicación: </span>{a.ubicacion ?? '—'}</p>
        <p><span className="text-muted-foreground">Responsable: </span>{a.responsable ?? '—'}</p>
        <p><span className="text-muted-foreground">Centro de costo: </span>{a.centro_costo ?? '—'}</p>
        <p><span className="text-muted-foreground">Marca / modelo: </span>{[a.marca, a.modelo].filter(Boolean).join(' · ') || '—'}</p>
        <p><span className="text-muted-foreground">Serie: </span>{a.serie ?? '—'}</p>
        <p>
          <span className="text-muted-foreground">Origen: </span>
          {a.factura_proveedor_id ? (
            <Link href={`/contabilidad/cxp/${a.factura_proveedor_id}`} className="text-primary hover:underline">
              {a.factura}
            </Link>
          ) : (
            `Alta manual${Number(a.depreciacion_inicial) ? ` (con Q${montoContable(a.depreciacion_inicial)} de depreciación previa)` : ''}`
          )}
        </p>
        {!vigente && (
          <p className="text-destructive sm:col-span-3">
            Dado de baja el {fecha(a.fecha_baja)} por {TIPOS_BAJA[a.tipo_baja ?? ''] ?? a.tipo_baja}
            {a.precio_venta ? ` (vendido en Q${montoContable(a.precio_venta)})` : ''}: {a.motivo_baja}
            {ficha.partida_baja && (
              <Link href={`/contabilidad/partidas/${ficha.partida_baja}`} className="ml-2 font-semibold text-primary hover:underline">
                Ver partida
              </Link>
            )}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card">
        <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">Depreciación registrada</p>
        {ficha.depreciaciones.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Aún no se ha depreciado (se registra al cerrar cada mes).</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 px-4 py-2 text-sm sm:grid-cols-4">
            {ficha.depreciaciones.map((d) => (
              <span key={`${d.anio}-${d.mes}`} className="flex justify-between border-b border-border/40 py-1">
                <span className="text-muted-foreground">
                  {MESES[d.mes - 1].slice(0, 3)} {d.anio}
                </span>
                {d.partida_id ? (
                  <Link href={`/contabilidad/partidas/${d.partida_id}`} className="tabular-nums hover:underline">
                    {montoContable(d.monto)}
                  </Link>
                ) : (
                  <span className="tabular-nums">{montoContable(d.monto)}</span>
                )}
              </span>
            ))}
          </div>
        )}
      </section>

      {vigente && puedeRegistrar && (
        <details className="rounded-xl border border-border bg-card px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold">Editar datos (ubicación, responsable, centro de costo…)</summary>
          <form action={actualizarActivo} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input type="hidden" name="id" value={a.id} />
            <input name="descripcion" defaultValue={a.descripcion} className={clasesCampo} />
            <input name="marca" defaultValue={a.marca ?? ''} placeholder="Marca" className={clasesCampo} />
            <input name="modelo" defaultValue={a.modelo ?? ''} placeholder="Modelo" className={clasesCampo} />
            <input name="serie" defaultValue={a.serie ?? ''} placeholder="Serie" className={clasesCampo} />
            <select name="tienda_id" defaultValue={a.tienda_id ?? ''} className={clasesCampo}>
              <option value="">Sin ubicación</option>
              {((tiendas ?? []) as { id: number; nombre: string }[]).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
            <select name="responsable_id" defaultValue={a.responsable_id ?? ''} className={clasesCampo}>
              <option value="">Sin responsable</option>
              {((usuarios ?? []) as { id: number; nombre: string }[]).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
            <select name="centro_costo_id" defaultValue={a.centro_costo_id} className={clasesCampo}>
              {((centros ?? []) as { id: number; codigo: string; nombre: string }[]).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} · {c.nombre}
                </option>
              ))}
            </select>
            <input name="notas" defaultValue={a.notas ?? ''} placeholder="Notas" className={cn(clasesCampo, 'sm:col-span-2')} />
            <div className="sm:col-span-3">
              <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">
                Guardar
              </button>
            </div>
          </form>
        </details>
      )}

      {vigente && puedeRegistrar && (
        <details className="rounded-xl border border-destructive/30 bg-card px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-destructive">Dar de baja</summary>
          <form action={darDeBaja} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input type="hidden" name="id" value={a.id} />
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Fecha
              <input name="fecha" type="date" required defaultValue={hoyGuatemala()} className={clasesCampo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Tipo de baja
              <select name="tipo_baja" defaultValue="desecho" className={clasesCampo}>
                {Object.entries(TIPOS_BAJA).map(([v, e]) => (
                  <option key={v} value={v}>
                    {e}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Motivo
              <input name="motivo" required className={clasesCampo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Precio de venta (solo venta)
              <input name="precio_venta" inputMode="decimal" className={clasesCampo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
              Cuenta donde se cobró (solo venta)
              <select name="cuenta_cobro_id" defaultValue="" className={clasesCampo}>
                <option value="">—</option>
                {((cuentasCobro ?? []) as { id: number; codigo: string; nombre: string }[]).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-muted-foreground sm:col-span-3">
              Se dan de baja el costo (Q{montoContable(a.costo)}) y la depreciación acumulada (Q{montoContable(ficha.acumulada)}); el valor en
              libros menos lo cobrado queda como pérdida o ganancia. Si la fecha es posterior al último mes depreciado, deprecia antes ese mes.
            </p>
            <div className="sm:col-span-3">
              <BotonConfirmar
                mensaje={`¿Dar de baja ${a.codigo}? Se genera su partida y ya no se depreciará.`}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white"
              >
                Dar de baja
              </BotonConfirmar>
            </div>
          </form>
        </details>
      )}
    </main>
  )
}
