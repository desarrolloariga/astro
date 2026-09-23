'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { ImageOff, Camera, Send, Trash2, PackageCheck, PackageX, Receipt } from 'lucide-react'
import { formatearPrecio, formatearFechaCorta } from '@/lib/formato'
import { EstadoPieza } from '@/components/app/estado-pieza'
import { FormularioConConfirmacion } from '@/components/app/boton-eliminar'
import { publicarPieza, eliminarPiezaBorrador, publicarPiezasMasivo, rechazarPiezasMasivo } from '@/app/(app)/produccion/acciones'

const ETIQUETAS_NIVEL_GANANCIA: Record<string, string> = {
  introduccion: 'Introducción',
  socio_comercial: 'Socio Comercial',
  importacion: 'Importación',
  descuento: 'Descuento',
}

type Imagen = { url: string; es_principal: boolean; orden: number }

export type FilaProduccion = {
  id: number
  codigo: string
  nombre: string
  estado: string
  fecha_creacion: string
  nivel_ganancia: string
  categoriaNombre: string | null
  imagenes: Imagen[]
  costoBase: number | null
}

const celda = 'px-2.5 py-1.5 whitespace-nowrap'

export function TablaProduccion({ filas }: { filas: FilaProduccion[] }) {
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())
  const [pending, startTransition] = useTransition()

  const elegibles = useMemo(() => filas.filter((f) => f.estado === 'en_produccion'), [filas])
  const todosSeleccionados = elegibles.length > 0 && elegibles.every((f) => seleccion.has(f.id))

  function alternar(id: number) {
    setSeleccion((prev) => {
      const siguiente = new Set(prev)
      if (siguiente.has(id)) siguiente.delete(id)
      else siguiente.add(id)
      return siguiente
    })
  }

  function alternarTodos() {
    setSeleccion((prev) => {
      if (todosSeleccionados) return new Set()
      return new Set(elegibles.map((f) => f.id))
    })
  }

  function pasarACedi() {
    const ids = Array.from(seleccion)
    if (ids.length === 0) return
    if (!window.confirm(`¿Publicar ${ids.length} artículo(s) al CEDI?`)) return
    startTransition(async () => {
      await publicarPiezasMasivo(ids)
    })
  }

  function rechazar() {
    const ids = Array.from(seleccion)
    if (ids.length === 0) return
    if (!window.confirm(`¿Eliminar ${ids.length} artículo(s) sin publicar? No se pueden recuperar desde la app.`)) return
    startTransition(async () => {
      await rechazarPiezasMasivo(ids)
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {seleccion.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs font-semibold text-foreground">{seleccion.size} seleccionado(s)</span>
          <button
            type="button"
            disabled={pending}
            onClick={pasarACedi}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
          >
            <PackageCheck className="h-3.5 w-3.5" />
            Pasar a CEDI
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={rechazar}
            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-card px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            <PackageX className="h-3.5 w-3.5" />
            Rechazar
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[1100px] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className={celda}>
                <input
                  type="checkbox"
                  checked={todosSeleccionados}
                  onChange={alternarTodos}
                  disabled={elegibles.length === 0}
                  aria-label="Seleccionar todos los borradores"
                />
              </th>
              <th className={`${celda} font-semibold`}>Artículo</th>
              <th className={`${celda} font-semibold`}>Categoría</th>
              <th className={`${celda} font-semibold`}>Nivel</th>
              <th className={`${celda} font-semibold`}>Estado</th>
              <th className={`${celda} font-semibold text-right`}>Costo base</th>
              <th className={`${celda} font-semibold`}>Creado</th>
              <th className={`${celda} font-semibold text-right`}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const portada = f.imagenes.find((i) => i.es_principal)?.url ?? f.imagenes[0]?.url ?? null
              return (
                <tr key={f.id} className="border-b border-border last:border-0">
                  <td className={celda}>
                    <input
                      type="checkbox"
                      checked={seleccion.has(f.id)}
                      onChange={() => alternar(f.id)}
                      disabled={f.estado !== 'en_produccion'}
                    />
                  </td>
                  <td className={celda}>
                    <div className="flex items-center gap-2">
                      {portada ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={portada} alt="" className="h-7 w-7 rounded-md border border-border object-cover" />
                      ) : (
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                          <ImageOff className="h-3 w-3" />
                        </span>
                      )}
                      <div className="leading-tight">
                        <Link
                          href={`/inventario/movimientos?buscar=${encodeURIComponent(f.codigo)}`}
                          className="font-semibold text-foreground hover:text-primary hover:underline"
                          title="Ver historial de movimientos de este artículo"
                        >
                          {f.nombre}
                        </Link>
                        <p className="text-[10px] text-muted-foreground">{f.codigo}</p>
                      </div>
                    </div>
                  </td>
                  <td className={`${celda} text-muted-foreground`}>{f.categoriaNombre ?? '—'}</td>
                  <td className={`${celda} text-muted-foreground`}>
                    {ETIQUETAS_NIVEL_GANANCIA[f.nivel_ganancia] ?? f.nivel_ganancia}
                  </td>
                  <td className={celda}>
                    <EstadoPieza estado={f.estado} />
                  </td>
                  <td className={`${celda} text-right font-semibold text-foreground`}>
                    {f.costoBase != null ? formatearPrecio(f.costoBase) : '—'}
                  </td>
                  <td className={`${celda} text-muted-foreground`}>{formatearFechaCorta(f.fecha_creacion)}</td>
                  <td className={celda}>
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/produccion/${f.id}/costos`}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary"
                        title="Ver hoja de costos"
                      >
                        <Receipt className="h-3 w-3" />
                        Costos
                      </Link>
                      {f.estado === 'en_produccion' && (
                        <>
                          <Link
                            href={`/produccion/${f.id}/fotos`}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary"
                          >
                            <Camera className="h-3 w-3" />
                            Fotos
                          </Link>
                          <form action={publicarPieza} className="inline">
                            <input type="hidden" name="producto_id" value={f.id} />
                            <button
                              type="submit"
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary"
                            >
                              <Send className="h-3 w-3" />
                              Publicar
                            </button>
                          </form>
                          <FormularioConConfirmacion
                            action={eliminarPiezaBorrador}
                            mensaje={`¿Eliminar "${f.nombre}"? Esta acción no se puede deshacer desde la app.`}
                            className="inline"
                          >
                            <input type="hidden" name="producto_id" value={f.id} />
                            <button
                              type="submit"
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-semibold text-destructive transition-colors hover:bg-destructive/10"
                              title="Eliminar borrador"
                            >
                              <Trash2 className="h-3 w-3" />
                              Eliminar
                            </button>
                          </FormularioConConfirmacion>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
