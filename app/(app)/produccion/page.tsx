import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PackagePlus, Upload, CheckCircle2, AlertCircle, ImageOff, Camera, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { formatearPrecio, formatearFecha, formatearNumero } from '@/lib/formato'
import { EstadoPieza } from '@/components/app/estado-pieza'
import { Paginacion } from '@/components/inventario/paginacion'
import { parsearFiltrosInventario, construirQueryStringInventario, calcularRango, calcularTotalPaginas } from '@/lib/inventario'
import { publicarPieza } from './acciones'

export const metadata = { title: 'Producción — ASTRO' }

const TAMANO_PAGINA_PRODUCCION = 25

const ESTADOS_PRODUCCION = ['en_produccion', 'disponible_cedi', 'disponible_tienda', 'baja']
const ETIQUETAS_ESTADO_PRODUCCION: Record<string, string> = {
  en_produccion: 'Borrador',
  disponible_cedi: 'Publicado (CEDI)',
  disponible_tienda: 'Publicado (tienda)',
  baja: 'De baja',
}

const clasesCampo =
  'rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'

type Categoria = { id: number; nombre: string }
type Material = { id: number; nombre: string }

export default async function ProduccionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'produccion' && usuario.rol !== 'admin') redirect('/inicio')

  const sp = await searchParams
  const ok = typeof sp.ok === 'string' ? sp.ok : undefined
  const aviso = typeof sp.aviso === 'string' ? sp.aviso : undefined
  const filtros = parsearFiltrosInventario(sp)
  const supabase = await createClient()

  const [{ data: categoriasData }, { data: materialesData }] = await Promise.all([
    supabase.from('categorias').select('id, nombre').eq('activo', true).order('orden'),
    supabase.from('materiales').select('id, nombre').eq('activo', true).order('nombre'),
  ])
  const categorias = (categoriasData ?? []) as Categoria[]
  const materiales = (materialesData ?? []) as Material[]

  // RLS: producción ve sus artículos; admin los ve todos
  let consulta = supabase
    .from('productos')
    .select(
      'id, codigo, nombre, estado, precio_venta, costo_produccion, modo_inventario, fecha_creacion, fecha_publicacion, categorias(nombre), producto_imagenes(url, es_principal, orden), usuarios:creado_por(nombre)',
      { count: 'exact' },
    )
    .eq('activo', true)
    .order('fecha_creacion', { ascending: false })

  if (filtros.categoriaId != null) consulta = consulta.eq('categoria_id', filtros.categoriaId)
  if (filtros.materialId != null) consulta = consulta.eq('material_id', filtros.materialId)
  if (filtros.estado && ESTADOS_PRODUCCION.includes(filtros.estado)) {
    consulta = consulta.eq('estado', filtros.estado)
  }
  const buscarSeguro = filtros.buscar.replace(/[,()]/g, ' ').trim()
  if (buscarSeguro) {
    consulta = consulta.or(`nombre.ilike.%${buscarSeguro}%,codigo.ilike.%${buscarSeguro}%`)
  }
  const { desde, hasta } = calcularRango(filtros.pagina, TAMANO_PAGINA_PRODUCCION)
  consulta = consulta.range(desde, hasta)

  const [{ data: piezas, count: totalArticulos }, { count: totalBorradores }] = await Promise.all([
    consulta,
    supabase.from('productos').select('id', { count: 'exact', head: true }).eq('activo', true).eq('estado', 'en_produccion'),
  ])

  const lista = piezas ?? []
  const totalPaginas = calcularTotalPaginas(totalArticulos ?? 0, TAMANO_PAGINA_PRODUCCION)
  const construirHref = (pagina: number) =>
    `/produccion?${construirQueryStringInventario(filtros, { pagina })}`

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Producción</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatearNumero(totalArticulos ?? 0)} artículos · {formatearNumero(totalBorradores ?? 0)} en borrador
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/produccion/carga-masiva"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            <Upload className="h-4 w-4" />
            Carga masiva
          </Link>
          <Link
            href="/produccion/nueva"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
          >
            <PackagePlus className="h-4 w-4" />
            Nuevo artículo
          </Link>
        </div>
      </div>

      {ok && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{ok}</span>
        </div>
      )}
      {aviso && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{aviso}</span>
        </div>
      )}

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
          {ESTADOS_PRODUCCION.map((e) => (
            <option key={e} value={e}>
              {ETIQUETAS_ESTADO_PRODUCCION[e]}
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

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <p className="text-sm font-semibold text-foreground">Sin artículos para estos filtros</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Crea el primer artículo con su ficha técnica y fotos; al publicarlo ingresará al
            inventario central (CEDI).
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Artículo</th>
                  <th className="px-4 py-3 font-semibold">Categoría</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold text-right">Precio</th>
                  <th className="px-4 py-3 font-semibold">Creado</th>
                  <th className="px-4 py-3 font-semibold text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => {
                  const imagenes = (p.producto_imagenes ?? []) as {
                    url: string
                    es_principal: boolean
                    orden: number
                  }[]
                  const portada =
                    imagenes.find((i) => i.es_principal)?.url ?? imagenes[0]?.url ?? null
                  const categoria = p.categorias as unknown as { nombre: string } | null
                  const creadoPor = p.usuarios as unknown as { nombre: string } | null
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {portada ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={portada}
                              alt=""
                              className="h-10 w-10 rounded-lg border border-border object-cover"
                            />
                          ) : (
                            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                              <ImageOff className="h-4 w-4" />
                            </span>
                          )}
                          <div className="leading-tight">
                            <Link
                              href={`/inventario/movimientos?buscar=${encodeURIComponent(p.codigo)}`}
                              className="font-semibold text-foreground hover:text-primary hover:underline"
                              title="Ver historial de movimientos de este artículo"
                            >
                              {p.nombre}
                            </Link>
                            <p className="text-xs text-muted-foreground">{p.codigo}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {categoria?.nombre ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <EstadoPieza estado={p.estado} />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">
                        {p.precio_venta != null ? formatearPrecio(p.precio_venta) : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <p>{formatearFecha(p.fecha_creacion)}</p>
                        {creadoPor && <p className="text-xs">{creadoPor.nombre}</p>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.estado === 'en_produccion' && (
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/produccion/${p.id}/fotos`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
                            >
                              <Camera className="h-3.5 w-3.5" />
                              Fotos
                            </Link>
                            <form action={publicarPieza} className="inline">
                              <input type="hidden" name="producto_id" value={p.id} />
                              <button
                                type="submit"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
                              >
                                <Send className="h-3.5 w-3.5" />
                                Publicar al CEDI
                              </button>
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Paginacion
            paginaActual={filtros.pagina}
            totalPaginas={totalPaginas}
            total={totalArticulos ?? 0}
            construirHref={construirHref}
          />
        </>
      )}
    </main>
  )
}
