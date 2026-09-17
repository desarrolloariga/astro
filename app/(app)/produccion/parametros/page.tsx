import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, CheckCircle2, AlertCircle, SlidersHorizontal, Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { actualizarParametrosArticulo } from './acciones'

export const metadata = { title: 'Parámetros de artículos — ASTRO' }

type Producto = {
  id: number
  codigo: string
  nombre: string
  punto_reorden: number | null
  dias_sin_venta_descuento: number | null
  descuento_automatico_pct: number | null
  precio_descuento: number | null
  nivel_ganancia: string
  estado: string
  categorias: { nombre: string } | null
}

type Categoria = { id: number; nombre: string }
type Material = { id: number; nombre: string }
type Proveedor = { id: number; nombre: string }

const clasesInputCompacto =
  'w-24 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none'
const clasesCampoFiltro =
  'rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'

const ESTADOS = ['en_produccion', 'disponible_cedi', 'disponible_tienda']
const ETIQUETAS_ESTADO: Record<string, string> = {
  en_produccion: 'Borrador',
  disponible_cedi: 'Publicado (CEDI)',
  disponible_tienda: 'Publicado (tienda)',
}
const NIVELES_GANANCIA = [
  { valor: 'introduccion', etiqueta: 'Introducción' },
  { valor: 'socio_comercial', etiqueta: 'Socio Comercial' },
  { valor: 'importacion', etiqueta: 'Importación' },
]
const ETIQUETAS_NIVEL_GANANCIA: Record<string, string> = Object.fromEntries(
  NIVELES_GANANCIA.map((n) => [n.valor, n.etiqueta]),
)

type FiltrosParametros = {
  buscar: string
  categoriaId: number | null
  materialId: number | null
  proveedorId: number | null
  nivelGanancia: string
  estado: string
  subcategoria: string
  marca: string
  coleccion: string
  origen: string
}

function unoSolo(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] : valor
}

export default async function ParametrosArticulosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'produccion' && usuario.rol !== 'admin') redirect('/inicio')

  const sp = await searchParams
  const ok = typeof sp.ok === 'string' ? sp.ok : undefined
  const error = typeof sp.error === 'string' ? sp.error : undefined

  const filtros: FiltrosParametros = {
    buscar: (unoSolo(sp.buscar) ?? '').trim(),
    categoriaId: unoSolo(sp.categoria_id) ? Number(unoSolo(sp.categoria_id)) : null,
    materialId: unoSolo(sp.material_id) ? Number(unoSolo(sp.material_id)) : null,
    proveedorId: unoSolo(sp.proveedor_id) ? Number(unoSolo(sp.proveedor_id)) : null,
    nivelGanancia: (unoSolo(sp.nivel_ganancia) ?? '').trim(),
    estado: (unoSolo(sp.estado) ?? '').trim(),
    subcategoria: (unoSolo(sp.subcategoria) ?? '').trim(),
    marca: (unoSolo(sp.marca) ?? '').trim(),
    coleccion: (unoSolo(sp.coleccion) ?? '').trim(),
    origen: (unoSolo(sp.origen) ?? '').trim(),
  }

  const supabase = await createClient()

  const [{ data: categoriasData }, { data: materialesData }, { data: proveedoresData }] = await Promise.all([
    supabase.from('categorias').select('id, nombre').eq('activo', true).order('orden'),
    supabase.from('materiales').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
  ])
  const categorias = (categoriasData ?? []) as Categoria[]
  const materiales = (materialesData ?? []) as Material[]
  const proveedores = (proveedoresData ?? []) as Proveedor[]

  let consulta = supabase
    .from('productos')
    .select(
      'id, codigo, nombre, punto_reorden, dias_sin_venta_descuento, descuento_automatico_pct, precio_descuento, nivel_ganancia, estado, categorias ( nombre )',
    )
    .eq('activo', true)
    .in('estado', ESTADOS)
    .order('nombre')

  if (filtros.buscar) {
    const seguro = filtros.buscar.replace(/[,()]/g, ' ').trim()
    consulta = consulta.or(`nombre.ilike.%${seguro}%,codigo.ilike.%${seguro}%`)
  }
  if (filtros.categoriaId != null) consulta = consulta.eq('categoria_id', filtros.categoriaId)
  if (filtros.materialId != null) consulta = consulta.eq('material_id', filtros.materialId)
  if (filtros.proveedorId != null) consulta = consulta.eq('proveedor_id', filtros.proveedorId)
  if (filtros.nivelGanancia) consulta = consulta.eq('nivel_ganancia', filtros.nivelGanancia)
  if (filtros.estado && ESTADOS.includes(filtros.estado)) consulta = consulta.eq('estado', filtros.estado)
  if (filtros.marca) consulta = consulta.ilike('marca', `%${filtros.marca.replace(/[,()%]/g, ' ').trim()}%`)
  if (filtros.coleccion) consulta = consulta.ilike('coleccion', `%${filtros.coleccion.replace(/[,()%]/g, ' ').trim()}%`)
  if (filtros.origen) consulta = consulta.ilike('origen', `%${filtros.origen.replace(/[,()%]/g, ' ').trim()}%`)
  if (filtros.subcategoria) {
    consulta = consulta.ilike('atributos->>subcategoria', `%${filtros.subcategoria.replace(/[,()%]/g, ' ').trim()}%`)
  }

  const { data } = await consulta.limit(200)
  const productos = (data ?? []) as unknown as Producto[]

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <Link
          href="/produccion"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Artículos
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <SlidersHorizontal className="h-5 w-5 text-primary" />
          Parámetros de artículos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Punto de reorden y regla de descuento automático por días sin venta, artículo por
          artículo. El descuento automático corre solo una vez al día — indica días sin venta y %
          de descuento juntos, o deja ambos vacíos para desactivar la regla.
        </p>
      </div>

      {ok && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{ok}</span>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form className="flex flex-wrap items-center gap-2">
        <input
          name="buscar"
          defaultValue={filtros.buscar}
          placeholder="Buscar por nombre o código…"
          className={`${clasesCampoFiltro} min-w-48 flex-1`}
        />
        <select name="categoria_id" defaultValue={filtros.categoriaId ?? ''} className={clasesCampoFiltro}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <input
          name="subcategoria"
          defaultValue={filtros.subcategoria}
          placeholder="Subcategoría…"
          className={`${clasesCampoFiltro} w-40`}
        />
        <select name="material_id" defaultValue={filtros.materialId ?? ''} className={clasesCampoFiltro}>
          <option value="">Todos los materiales</option>
          {materiales.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
        <select name="proveedor_id" defaultValue={filtros.proveedorId ?? ''} className={clasesCampoFiltro}>
          <option value="">Todos los proveedores</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <select name="nivel_ganancia" defaultValue={filtros.nivelGanancia} className={clasesCampoFiltro}>
          <option value="">Todos los niveles</option>
          {NIVELES_GANANCIA.map((n) => (
            <option key={n.valor} value={n.valor}>
              {n.etiqueta}
            </option>
          ))}
        </select>
        <select name="estado" defaultValue={filtros.estado} className={clasesCampoFiltro}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {ETIQUETAS_ESTADO[e]}
            </option>
          ))}
        </select>
        <input
          name="origen"
          defaultValue={filtros.origen}
          placeholder="Origen (país)…"
          className={`${clasesCampoFiltro} w-36`}
        />
        <input
          name="marca"
          defaultValue={filtros.marca}
          placeholder="Marca…"
          className={`${clasesCampoFiltro} w-32`}
        />
        <input
          name="coleccion"
          defaultValue={filtros.coleccion}
          placeholder="Colección…"
          className={`${clasesCampoFiltro} w-32`}
        />
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          Filtrar
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-semibold">Artículo</th>
              <th className="px-4 py-3 font-semibold">Categoría</th>
              <th className="px-4 py-3 font-semibold">Nivel</th>
              <th className="px-4 py-3 font-semibold">Parámetros</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5">
                  <p className="font-semibold text-foreground">{p.nombre}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {p.codigo}
                    {p.precio_descuento != null && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                        <Tag className="h-2.5 w-2.5" />
                        Con descuento activo
                      </span>
                    )}
                  </p>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{p.categorias?.nombre ?? '—'}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {ETIQUETAS_NIVEL_GANANCIA[p.nivel_ganancia] ?? p.nivel_ganancia}
                </td>
                <td className="px-4 py-2.5">
                  <form action={actualizarParametrosArticulo} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="producto_id" value={p.id} />
                    <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                      Punto de reorden
                      <input
                        name="punto_reorden"
                        type="number"
                        step="1"
                        min="0"
                        defaultValue={p.punto_reorden ?? ''}
                        className={clasesInputCompacto}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                      Días sin venta
                      <input
                        name="dias_sin_venta_descuento"
                        type="number"
                        step="1"
                        min="1"
                        placeholder="ej. 90"
                        defaultValue={p.dias_sin_venta_descuento ?? ''}
                        className={clasesInputCompacto}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] text-muted-foreground">
                      % descuento auto.
                      <input
                        name="descuento_automatico_pct"
                        type="number"
                        step="0.01"
                        min="0.01"
                        max="99.99"
                        placeholder="ej. 30"
                        defaultValue={p.descuento_automatico_pct ?? ''}
                        className={clasesInputCompacto}
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary"
                    >
                      Guardar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {productos.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  Sin artículos para esta búsqueda
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
