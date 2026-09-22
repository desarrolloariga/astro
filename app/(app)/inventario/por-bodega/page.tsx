import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Table2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearNumero } from '@/lib/formato'
import { EstadoPieza } from '@/components/app/estado-pieza'

export const metadata = { title: 'Existencias por bodega — ASTRO' }

const clasesCampo =
  'rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'

const ESTADOS = ['disponible_cedi', 'en_transito', 'disponible_tienda', 'separada']
const ETIQUETAS_ESTADO: Record<string, string> = {
  disponible_cedi: 'Disponible CEDI',
  en_transito: 'En tránsito',
  disponible_tienda: 'Disponible en tienda',
  separada: 'Separada',
}
const NIVELES_GANANCIA = [
  { valor: 'introduccion', etiqueta: 'Introducción' },
  { valor: 'socio_comercial', etiqueta: 'Socio Comercial' },
  { valor: 'importacion', etiqueta: 'Importación' },
  { valor: 'descuento', etiqueta: 'Descuento' },
]
const ETIQUETAS_NIVEL_GANANCIA: Record<string, string> = Object.fromEntries(
  NIVELES_GANANCIA.map((n) => [n.valor, n.etiqueta]),
)

type Fila = {
  producto_id: number
  codigo: string
  nombre: string
  modo_inventario: 'pieza_unica' | 'por_cantidad'
  estado: string
  categoria: string | null
  material: string | null
  proveedor: string | null
  nivel_ganancia: string
  marca: string | null
  coleccion: string | null
  origen: string | null
  subcategoria: string | null
  tienda_id: number
  tienda: string
  cantidad: number
}

type Tienda = { id: number; nombre: string }
type Categoria = { id: number; nombre: string }
type Material = { id: number; nombre: string }
type Proveedor = { id: number; nombre: string }

function unoSolo(valor: string | string[] | undefined) {
  return Array.isArray(valor) ? valor[0] : valor
}

export default async function InventarioPorBodegaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!(await tienePermiso('inventario', 'ver'))) redirect('/inicio')

  const sp = await searchParams
  const filtros = {
    buscar: (unoSolo(sp.buscar) ?? '').trim(),
    tiendaId: unoSolo(sp.tienda_id) ? Number(unoSolo(sp.tienda_id)) : null,
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

  const [{ data: tiendasData }, { data: categoriasData }, { data: materialesData }, { data: proveedoresData }] =
    await Promise.all([
      supabase.from('tiendas').select('id, nombre').eq('tipo', 'cedi').eq('activo', true).order('nombre'),
      supabase.from('categorias').select('id, nombre').eq('activo', true).order('orden'),
      supabase.from('materiales').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
    ])
  const tiendas = (tiendasData ?? []) as Tienda[]
  const categorias = (categoriasData ?? []) as Categoria[]
  const materiales = (materialesData ?? []) as Material[]
  const proveedores = (proveedoresData ?? []) as Proveedor[]

  let consulta = supabase
    .from('vw_inventario_por_bodega')
    .select(
      'producto_id, codigo, nombre, modo_inventario, estado, categoria, material, proveedor, nivel_ganancia, marca, coleccion, origen, subcategoria, tienda_id, tienda, cantidad',
    )
    .order('tienda', { ascending: true })
    .order('nombre', { ascending: true })

  if (filtros.tiendaId != null) consulta = consulta.eq('tienda_id', filtros.tiendaId)
  if (filtros.categoriaId != null) consulta = consulta.eq('categoria_id', filtros.categoriaId)
  if (filtros.materialId != null) consulta = consulta.eq('material_id', filtros.materialId)
  if (filtros.proveedorId != null) consulta = consulta.eq('proveedor_id', filtros.proveedorId)
  if (filtros.nivelGanancia) consulta = consulta.eq('nivel_ganancia', filtros.nivelGanancia)
  if (filtros.estado && ESTADOS.includes(filtros.estado)) consulta = consulta.eq('estado', filtros.estado)
  if (filtros.marca) consulta = consulta.ilike('marca', `%${filtros.marca.replace(/[,()%]/g, ' ').trim()}%`)
  if (filtros.coleccion) consulta = consulta.ilike('coleccion', `%${filtros.coleccion.replace(/[,()%]/g, ' ').trim()}%`)
  if (filtros.origen) consulta = consulta.ilike('origen', `%${filtros.origen.replace(/[,()%]/g, ' ').trim()}%`)
  if (filtros.subcategoria) {
    consulta = consulta.ilike('subcategoria', `%${filtros.subcategoria.replace(/[,()%]/g, ' ').trim()}%`)
  }
  const buscarSeguro = filtros.buscar.replace(/[,()]/g, ' ').trim()
  if (buscarSeguro) {
    consulta = consulta.or(`nombre.ilike.%${buscarSeguro}%,codigo.ilike.%${buscarSeguro}%`)
  }

  const { data } = await consulta.limit(1000)
  const filas = (data ?? []) as Fila[]

  const totalUnidades = filas.reduce((acc, f) => acc + f.cantidad, 0)
  const bodegasConStock = new Set(filas.map((f) => f.tienda_id)).size

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <Link
          href="/inventario"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Inventario
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <Table2 className="h-5 w-5 text-primary" />
          Existencias por bodega
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatearNumero(totalUnidades)} unidades en {formatearNumero(bodegasConStock)} bodega
          {bodegasConStock !== 1 ? 's' : ''} · una fila por artículo y bodega donde tiene existencia
          real (sin costos ni precios)
        </p>
      </div>

      <form className="flex flex-wrap items-center gap-2">
        <input
          name="buscar"
          defaultValue={filtros.buscar}
          placeholder="Buscar por nombre o código…"
          className={`${clasesCampo} min-w-48 flex-1`}
        />
        <select name="tienda_id" defaultValue={filtros.tiendaId ?? ''} className={clasesCampo}>
          <option value="">Todas las bodegas</option>
          {tiendas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <select name="categoria_id" defaultValue={filtros.categoriaId ?? ''} className={clasesCampo}>
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
          className={`${clasesCampo} w-40`}
        />
        <select name="material_id" defaultValue={filtros.materialId ?? ''} className={clasesCampo}>
          <option value="">Todos los materiales</option>
          {materiales.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
        <select name="proveedor_id" defaultValue={filtros.proveedorId ?? ''} className={clasesCampo}>
          <option value="">Todos los proveedores</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <select name="nivel_ganancia" defaultValue={filtros.nivelGanancia} className={clasesCampo}>
          <option value="">Todos los niveles</option>
          {NIVELES_GANANCIA.map((n) => (
            <option key={n.valor} value={n.valor}>
              {n.etiqueta}
            </option>
          ))}
        </select>
        <select name="estado" defaultValue={filtros.estado} className={clasesCampo}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {ETIQUETAS_ESTADO[e]}
            </option>
          ))}
        </select>
        <input
          name="marca"
          defaultValue={filtros.marca}
          placeholder="Marca…"
          className={`${clasesCampo} w-32`}
        />
        <input
          name="coleccion"
          defaultValue={filtros.coleccion}
          placeholder="Colección…"
          className={`${clasesCampo} w-32`}
        />
        <input
          name="origen"
          defaultValue={filtros.origen}
          placeholder="Origen…"
          className={`${clasesCampo} w-28`}
        />
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          Filtrar
        </button>
      </form>

      {filas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Table2 className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Sin existencias para estos filtros</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Artículo</th>
                <th className="px-4 py-3 font-semibold">Categoría</th>
                <th className="px-4 py-3 font-semibold">Material</th>
                <th className="px-4 py-3 font-semibold">Bodega</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={`${f.producto_id}-${f.tienda_id}`} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{f.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.codigo}
                      {f.marca && ` · ${f.marca}`}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {f.categoria ?? '—'}
                    {f.subcategoria && <span className="text-xs"> / {f.subcategoria}</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{f.material ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{f.tienda}</td>
                  <td className="px-4 py-3">
                    <EstadoPieza estado={f.estado} />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">
                    {f.modo_inventario === 'pieza_unica' ? 'Pieza única' : formatearNumero(f.cantidad)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
