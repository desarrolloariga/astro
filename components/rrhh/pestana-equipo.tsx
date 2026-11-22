import Link from 'next/link'
import { FileText, Printer } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { hoyGuatemala } from '@/lib/contabilidad'
import { clasesCampo, montoContable } from '@/lib/contabilidad-general'
import { CATEGORIAS_ASIGNACION, ESTADOS_ASIGNACION, dias, fechaCorta } from '@/lib/rrhh'
import { urlsFirmadas } from '@/lib/rrhh-servidor'
import { devolverAsignacion, guardarAsignacion, subirResponsiva } from '@/app/(app)/rrhh/acciones'

export type Asignacion = {
  id: number
  categoria: string
  descripcion: string
  talla: string | null
  cantidad: number
  marca_modelo: string | null
  numero_serie: string | null
  valor: number | null
  fecha_entrega: string
  entregado_por: string | null
  responsiva_url: string | null
  estado: string
  fecha_devolucion: string | null
  recibido_por: string | null
  notas: string | null
  notas_devolucion: string | null
  activo: { codigo: string; descripcion: string } | null
}

export const SELECT_ASIGNACION =
  'id, categoria, descripcion, talla, cantidad, marca_modelo, numero_serie, valor, fecha_entrega, entregado_por, responsiva_url, estado, fecha_devolucion, recibido_por, notas, notas_devolucion, activo:activo_fijo_id ( codigo, descripcion )'

export async function PestanaEquipo({
  colaborador,
  puedeEditar,
}: {
  colaborador: { id: number; estado: string; talla_camisa: string | null; talla_pantalon: string | null; talla_calzado: string | null; usuario_id: number | null }
  puedeEditar: boolean
}) {
  const supabase = await createClient()
  const [{ data }, { data: activosData }, { data: ocupados }] = await Promise.all([
    supabase.from('colaborador_asignaciones').select(SELECT_ASIGNACION).eq('colaborador_id', colaborador.id).order('fecha_entrega', { ascending: false }),
    puedeEditar ? supabase.from('activos_fijos').select('id, codigo, descripcion').eq('estado', 'activo').order('codigo') : Promise.resolve({ data: [] }),
    puedeEditar ? supabase.from('colaborador_asignaciones').select('activo_fijo_id').eq('estado', 'asignado').not('activo_fijo_id', 'is', null) : Promise.resolve({ data: [] }),
  ])
  const lista = (data ?? []) as unknown as Asignacion[]
  const usados = new Set(((ocupados ?? []) as { activo_fijo_id: number }[]).map((o) => o.activo_fijo_id))
  const activos = ((activosData ?? []) as { id: number; codigo: string; descripcion: string }[]).filter((a) => !usados.has(a.id))
  const urls = await urlsFirmadas(lista.map((a) => a.responsiva_url))
  const vigentes = lista.filter((a) => a.estado === 'asignado')
  const valor = vigentes.reduce((s, a) => s + Number(a.valor ?? 0), 0)
  const mini = cn(clasesCampo, 'py-1.5 text-xs')

  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <span className="flex flex-wrap gap-4">
          <span>
            <span className="text-xs text-muted-foreground">Camisa </span>
            <span className="font-semibold">{colaborador.talla_camisa ?? '—'}</span>
          </span>
          <span>
            <span className="text-xs text-muted-foreground">Pantalón </span>
            <span className="font-semibold">{colaborador.talla_pantalon ?? '—'}</span>
          </span>
          <span>
            <span className="text-xs text-muted-foreground">Calzado </span>
            <span className="font-semibold">{colaborador.talla_calzado ?? '—'}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            · {vigentes.length} artículo{vigentes.length === 1 ? '' : 's'} a su cargo{valor ? ` por Q${montoContable(valor)}` : ''}
          </span>
        </span>
        {vigentes.length > 0 && (
          <Link href={`/rrhh/${colaborador.id}/responsiva`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            <Printer className="h-4 w-4" /> Imprimir responsiva
          </Link>
        )}
      </section>

      {puedeEditar && colaborador.estado !== 'baja' && (
        <form action={guardarAsignacion} encType="multipart/form-data" className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="colaborador_id" value={colaborador.id} />
          <p className="text-sm font-semibold sm:col-span-2 lg:col-span-4">Entregar uniforme o equipo</p>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Categoría
            <select name="categoria" defaultValue="uniforme" className={clasesCampo}>
              {Object.entries(CATEGORIAS_ASIGNACION).map(([v, e]) => (
                <option key={v} value={v}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
            Descripción
            <input name="descripcion" required placeholder="Ej. Camisa polo con logo, laptop, celular…" className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Fecha de entrega
            <input name="fecha_entrega" type="date" defaultValue={hoyGuatemala()} className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Talla
            <input name="talla" className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Cantidad
            <input name="cantidad" inputMode="decimal" defaultValue="1" className={cn(clasesCampo, 'text-right')} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Marca y modelo
            <input name="marca_modelo" className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Número de serie / IMEI
            <input name="numero_serie" className={cn(clasesCampo, 'font-mono')} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
            Activo fijo (si está en el registro contable)
            <select name="activo_fijo_id" defaultValue="" className={clasesCampo}>
              <option value="">No es activo fijo</option>
              {activos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigo} · {a.descripcion}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Valor (Q)
            <input name="valor" inputMode="decimal" className={cn(clasesCampo, 'text-right')} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Entregado por
            <input name="entregado_por" className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
            Notas
            <input name="notas" placeholder="Estado del equipo, accesorios incluidos…" className={clasesCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Responsiva firmada (opcional)
            <input name="responsiva" type="file" accept="application/pdf,image/*" className="text-xs" />
          </label>
          <div className="flex items-end">
            <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Registrar entrega
            </button>
          </div>
          {colaborador.usuario_id == null && (
            <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
              Este colaborador no tiene usuario del sistema: si eliges un activo fijo, la entrega queda aquí pero en Activos fijos no cambia el responsable.
            </p>
          )}
        </form>
      )}

      <section className="rounded-xl border border-border bg-card">
        <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">Uniformes y equipo entregado</p>
        {lista.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">No se le ha entregado nada todavía.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {lista.map((a) => (
              <li key={a.id} className={cn('flex flex-col gap-2 px-4 py-3 text-sm', a.estado !== 'asignado' && 'opacity-70')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold uppercase text-muted-foreground">{CATEGORIAS_ASIGNACION[a.categoria]}</span>
                    <span className="font-semibold">
                      {dias(a.cantidad)} × {a.descripcion}
                    </span>
                    {a.talla && <span className="text-xs text-muted-foreground">talla {a.talla}</span>}
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', ESTADOS_ASIGNACION[a.estado]?.clase)}>{ESTADOS_ASIGNACION[a.estado]?.etiqueta}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Entregado {fechaCorta(a.fecha_entrega)}
                    {a.entregado_por ? ` por ${a.entregado_por}` : ''}
                    {a.valor ? ` · Q${montoContable(a.valor)}` : ''}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {[a.marca_modelo, a.numero_serie && `serie ${a.numero_serie}`, a.activo && `activo ${a.activo.codigo}`, a.notas].filter(Boolean).join(' · ')}
                    {a.estado !== 'asignado' &&
                      ` · ${ESTADOS_ASIGNACION[a.estado]?.etiqueta} el ${fechaCorta(a.fecha_devolucion)}${a.recibido_por ? `, recibió ${a.recibido_por}` : ''}${a.notas_devolucion ? ` (${a.notas_devolucion})` : ''}`}
                    {a.responsiva_url ? (
                      <a href={urls.get(a.responsiva_url)} target="_blank" className="ml-2 inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                        <FileText className="h-3.5 w-3.5" /> Responsiva
                      </a>
                    ) : (
                      a.estado === 'asignado' && <span className="ml-2 text-amber-600">Sin responsiva firmada</span>
                    )}
                  </span>
                  {puedeEditar && a.estado === 'asignado' && (
                    <span className="flex flex-wrap items-center gap-3">
                      {!a.responsiva_url && (
                        <form action={subirResponsiva} encType="multipart/form-data" className="flex items-center gap-1.5">
                          <input type="hidden" name="colaborador_id" value={colaborador.id} />
                          <input type="hidden" name="asignacion_id" value={a.id} />
                          <input name="responsiva" type="file" required accept="application/pdf,image/*" className="w-44 text-[11px]" />
                          <button type="submit" className="font-semibold text-primary hover:underline">
                            Adjuntar
                          </button>
                        </form>
                      )}
                      <details className="relative">
                        <summary className="cursor-pointer font-semibold text-foreground">Registrar devolución</summary>
                        <form action={devolverAsignacion} className="mt-2 flex flex-wrap items-center gap-1.5">
                          <input type="hidden" name="colaborador_id" value={colaborador.id} />
                          <input type="hidden" name="asignacion_id" value={a.id} />
                          <select name="estado" defaultValue="devuelto" className={cn(mini, 'w-28')}>
                            <option value="devuelto">Devuelto</option>
                            <option value="danado">Dañado</option>
                            <option value="extraviado">Extraviado</option>
                          </select>
                          <input name="fecha_devolucion" type="date" defaultValue={hoyGuatemala()} className={cn(mini, 'w-36')} />
                          <input name="recibido_por" placeholder="Recibió" className={cn(mini, 'w-28')} />
                          <input name="notas_devolucion" placeholder="Notas" className={cn(mini, 'w-36')} />
                          <button type="submit" className="rounded-lg border border-border px-2.5 py-1 font-semibold hover:bg-muted">
                            Guardar
                          </button>
                        </form>
                      </details>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
