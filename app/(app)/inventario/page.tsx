import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Gem, Tag, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearPrecio, formatearNumero, formatearFecha } from '@/lib/formato'
import { EstadoPieza } from '@/components/app/estado-pieza'
import { Paginacion } from '@/components/inventario/paginacion'
import {
  parsearFiltrosInventario,
  construirQueryStringInventario,
  calcularRango,
  calcularTotalPaginas,
} from '@/lib/inventario'
import { marcarDescuento, quitarDescuento } from './acciones'
import {
  ESTADOS_INVENTARIO,
  ETIQUETAS_ESTADO,
  SeccionPanorama,
  EsqueletoPanorama,
  SeccionPorEstado,
  EsqueletoPorEstado,
} from './secciones'

export const metadata = { title: 'Inventario — ASTRO' }

const clasesCampo =
  'rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'

type Pieza = {
  id: number
  codigo: string
  nombre: string
  categoria: string | null
  material: string | null
  kilataje: string | null
  peso_gramos: number | null
  estado: string
  precio_venta: number | null
  precio_lista: number | null
  en_descuento: boolean
  costo_produccion?: number | null
  tienda_id: number | null
  tienda: string | null
  tienda_tipo: string | null
  fecha_actualizacion: string | null
  modo_inventario: 'pieza_unica' | 'por_cantidad'
  cantidad_disponible: number | null
}

type Tienda = { id: number; nombre: string; tipo: string }
type Categoria = { id: number; nombre: string }
type Material = { id: number; nombre: string }

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!(await tienePermiso('inventario', 'ver'))) redirect('/inicio')

  const verFinanzas = await tienePermiso('finanzas', 'ver')
  const puedeDescontar = await tienePermiso('inventario', 'marcar_descuento')
  const sp = await searchParams
  const filtros = parsearFiltrosInventario(sp)
  const supabase = await createClient()

  // Todo el inventario vive en el CEDI por defecto — las tiendas ya no
  // tienen bodega propia, así que el rol tienda ve la red completa
  // igual que coordinador/supervisor/contabilidad (en la práctica, eso
  // siempre será "lo que hay en el CEDI").
  const tiendaFiltro = filtros.tiendaId

  // Tabla: consulta paginada respetando todos los filtros activos.
  let consultaPiezas = supabase
    .from('vw_inventario_tienda')
    .select(
      'id, codigo, nombre, categoria, material, kilataje, peso_gramos, estado, precio_venta, precio_lista, en_descuento, costo_produccion, tienda_id, tienda, tienda_tipo, fecha_actualizacion, modo_inventario, cantidad_disponible',
      { count: 'exact' },
    )
    .order('tienda', { ascending: true })
    .order('nombre', { ascending: true })

  if (tiendaFiltro) consultaPiezas = consultaPiezas.eq('tienda_id', tiendaFiltro)
  if (filtros.estado && ESTADOS_INVENTARIO.includes(filtros.estado)) {
    consultaPiezas = consultaPiezas.eq('estado', filtros.estado)
  } else {
    consultaPiezas = consultaPiezas.in('estado', ESTADOS_INVENTARIO)
  }
  if (filtros.categoriaId != null) consultaPiezas = consultaPiezas.eq('categoria_id', filtros.categoriaId)
  if (filtros.materialId != null) consultaPiezas = consultaPiezas.eq('material_id', filtros.materialId)
  const buscarSeguro = filtros.buscar.replace(/[,()]/g, ' ').trim()
  if (buscarSeguro) {
    consultaPiezas = consultaPiezas.or(`nombre.ilike.%${buscarSeguro}%,codigo.ilike.%${buscarSeguro}%`)
  }
  const { desde, hasta } = calcularRango(filtros.pagina)
  consultaPiezas = consultaPiezas.range(desde, hasta)

  // Catálogos de los filtros y tabla en una sola tanda: ninguna consulta
  // depende de otra. Los agregados (KPIs, gráficas) se transmiten aparte.
  const [
    { data: categoriasData },
    { data: materialesData },
    { data: tiendasData },
    { data: piezasData, count: totalPiezas },
  ] = await Promise.all([
    supabase.from('categorias').select('id, nombre').eq('activo', true).order('orden'),
    supabase.from('materiales').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('tiendas').select('id, nombre, tipo').eq('activo', true).order('nombre'),
    consultaPiezas,
  ])

  const categorias = (categoriasData ?? []) as Categoria[]
  const materiales = (materialesData ?? []) as Material[]
  const tiendas = (tiendasData ?? []) as Tienda[]
  const piezas = (piezasData ?? []) as Pieza[]

  const totalPaginas = calcularTotalPaginas(totalPiezas ?? 0)
  const construirHref = (pagina: number) =>
    `/inventario?${construirQueryStringInventario(filtros, { pagina })}`

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Inventario</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Piezas por bodega, valoración y costo en toda la red. Todo el inventario vive en el
            CEDI y se despacha directamente desde ahí.
          </p>
        </div>
        <Link
          href="/inventario/por-bodega"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary/60"
        >
          Ver existencias por bodega →
        </Link>
      </div>

      <form className="flex flex-wrap items-center gap-2">
        <input
          name="buscar"
          defaultValue={filtros.buscar}
          placeholder="Buscar por nombre o código…"
          className={`${clasesCampo} min-w-48 flex-1`}
        />
        <select name="categoria_id" defaultValue={filtros.categoriaId ?? ''} className={clasesCampo}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <select name="material_id" defaultValue={filtros.materialId ?? ''} className={clasesCampo}>
          <option value="">Todos los materiales</option>
          {materiales.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
        <select name="estado" defaultValue={filtros.estado} className={clasesCampo}>
          <option value="">Todos los estados</option>
          {ESTADOS_INVENTARIO.map((e) => (
            <option key={e} value={e}>
              {ETIQUETAS_ESTADO[e]}
            </option>
          ))}
        </select>
        <select name="tienda_id" defaultValue={filtros.tiendaId ?? ''} className={clasesCampo}>
          <option value="">Todas las bodegas</option>
          {tiendas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          Filtrar
        </button>
      </form>

      {verFinanzas && (
        <Suspense fallback={<EsqueletoPanorama />}>
          <SeccionPanorama tiendaFiltro={tiendaFiltro} />
        </Suspense>
      )}

      <Suspense fallback={<EsqueletoPorEstado />}>
        <SeccionPorEstado tiendaFiltro={tiendaFiltro} />
      </Suspense>

      {piezas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Gem className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Sin piezas para estos filtros</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-semibold">Pieza</th>
                  <th className="px-4 py-2 font-semibold">Bodega</th>
                  <th className="px-4 py-2 text-right font-semibold">Existencias</th>
                  <th className="px-4 py-2 font-semibold">Estado</th>
                  <th className="px-4 py-2 text-right font-semibold">Precio</th>
                  {verFinanzas && <th className="px-4 py-2 text-right font-semibold">Costo</th>}
                  <th className="px-4 py-2 text-right font-semibold">Actualizado</th>
                  {puedeDescontar && <th className="px-4 py-2 text-right font-semibold">Descuento</th>}
                </tr>
              </thead>
              <tbody>
                {piezas.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <Link
                        href={`/inventario/movimientos?buscar=${encodeURIComponent(p.codigo)}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                        title="Ver historial de movimientos de esta pieza"
                      >
                        {p.nombre}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {[p.codigo, p.categoria, p.material, p.kilataje].filter(Boolean).join(' · ')}
                      </p>
                    </td>
                    <td className="px-4 py-2 text-foreground">{p.tienda ?? 'Sin asignar'}</td>
                    <td className="px-4 py-2 text-right font-semibold text-foreground">
                      {p.modo_inventario === 'por_cantidad' ? formatearNumero(p.cantidad_disponible ?? 0) : '1'}
                    </td>
                    <td className="px-4 py-2">
                      <EstadoPieza estado={p.estado} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="font-semibold text-foreground">
                        {p.precio_venta != null ? formatearPrecio(p.precio_venta) : '—'}
                      </span>
                      {p.en_descuento && p.precio_lista != null && (
                        <span className="ml-1.5 text-xs text-muted-foreground line-through">
                          {formatearPrecio(p.precio_lista)}
                        </span>
                      )}
                    </td>
                    {verFinanzas && (
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {p.costo_produccion != null ? formatearPrecio(p.costo_produccion) : '—'}
                      </td>
                    )}
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                      {p.fecha_actualizacion ? formatearFecha(p.fecha_actualizacion) : '—'}
                    </td>
                    {puedeDescontar && (
                      <td className="px-4 py-2 text-right">
                        {p.en_descuento ? (
                          <form action={quitarDescuento} className="inline">
                            <input type="hidden" name="producto_id" value={p.id} />
                            <button
                              type="submit"
                              className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive hover:bg-destructive/20"
                            >
                              <X className="h-3 w-3" />
                              Quitar
                            </button>
                          </form>
                        ) : (
                          <details className="inline-block text-left">
                            <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-foreground">
                              <Tag className="h-3 w-3" />
                              Marcar
                            </summary>
                            <form
                              action={marcarDescuento}
                              className="absolute z-10 mt-1 flex w-56 flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-lg"
                            >
                              <input type="hidden" name="producto_id" value={p.id} />
                              <input
                                name="precio_descuento"
                                type="number"
                                step="0.01"
                                min="0"
                                required
                                placeholder="Nuevo precio"
                                className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                              />
                              <input
                                name="motivo"
                                placeholder="Motivo (opcional)"
                                className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                              />
                              <button
                                type="submit"
                                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                              >
                                Aplicar
                              </button>
                            </form>
                          </details>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginacion
            paginaActual={filtros.pagina}
            totalPaginas={totalPaginas}
            total={totalPiezas ?? 0}
            construirHref={construirHref}
          />
        </>
      )}
    </main>
  )
}
