import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PackagePlus, Upload, CheckCircle2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { formatearNumero } from '@/lib/formato'
import { Paginacion } from '@/components/inventario/paginacion'
import { parsearFiltrosInventario, construirQueryStringInventario, calcularRango, calcularTotalPaginas } from '@/lib/inventario'
import { TablaProduccion, type FilaProduccion } from '@/components/app/tabla-produccion'

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
      'id, codigo, nombre, estado, modo_inventario, nivel_ganancia, fecha_creacion, fecha_publicacion, categorias(nombre), producto_imagenes(url, es_principal, orden)',
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

  // Último snapshot de precio por pieza — se pide todo el historial de
  // esta página ordenado por fecha desc y se toma solo el primero por
  // producto_id (más simple que una vista SQL nueva para un listado).
  const idsPagina = lista.map((p) => p.id)
  const { data: historialData } = await supabase
    .from('producto_precio_historial')
    .select('producto_id, costo_base, costo_logistico, precio_antes_embajador, base_comisionable, impuesto, precio_final, fecha_creacion')
    .in('producto_id', idsPagina.length > 0 ? idsPagina : [-1])
    .order('fecha_creacion', { ascending: false })

  const ultimoPrecioPorProducto = new Map<number, NonNullable<typeof historialData>[number]>()
  for (const h of historialData ?? []) {
    if (!ultimoPrecioPorProducto.has(h.producto_id)) ultimoPrecioPorProducto.set(h.producto_id, h)
  }

  const filasTabla: FilaProduccion[] = lista.map((p) => {
    const h = ultimoPrecioPorProducto.get(p.id)
    return {
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      estado: p.estado,
      fecha_creacion: p.fecha_creacion,
      nivel_ganancia: p.nivel_ganancia,
      categoriaNombre: (p.categorias as unknown as { nombre: string } | null)?.nombre ?? null,
      imagenes: (p.producto_imagenes ?? []) as FilaProduccion['imagenes'],
      desglose: h
        ? {
            costo_base: h.costo_base,
            costo_logistico: h.costo_logistico,
            precio_antes_embajador: h.precio_antes_embajador,
            base_comisionable: h.base_comisionable,
            impuesto: h.impuesto,
            precio_final: h.precio_final,
          }
        : null,
    }
  })

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
          <TablaProduccion filas={filasTabla} />
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
