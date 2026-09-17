import Link from 'next/link'
import { redirect } from 'next/navigation'
import { UploadCloud, CheckCircle2, AlertCircle, Layers, PlusCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { formatearNumero } from '@/lib/formato'
import { EstadoPieza } from '@/components/app/estado-pieza'
import { Paginacion } from '@/components/inventario/paginacion'
import {
  parsearFiltrosInventario,
  construirQueryStringInventario,
  calcularRango,
  calcularTotalPaginas,
} from '@/lib/inventario'
import { sumarInventarioUnitario } from './acciones'

export const metadata = { title: 'Existencias — ASTRO' }

const TAMANO_PAGINA = 25
const ESTADOS = ['en_produccion', 'disponible_cedi', 'disponible_tienda', 'baja']
const ETIQUETAS_ESTADO: Record<string, string> = {
  en_produccion: 'Borrador',
  disponible_cedi: 'Publicado (CEDI)',
  disponible_tienda: 'Publicado (tienda)',
  baja: 'De baja',
}

const clasesCampo =
  'rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'

type Categoria = { id: number; nombre: string }

export default async function ExistenciasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol !== 'produccion' && usuario.rol !== 'admin') redirect('/inicio')

  const sp = await searchParams
  const ok = typeof sp.ok === 'string' ? sp.ok : undefined
  const error = typeof sp.error === 'string' ? sp.error : undefined
  const filtros = parsearFiltrosInventario(sp)
  const supabase = await createClient()

  const { data: categoriasData } = await supabase
    .from('categorias')
    .select('id, nombre')
    .eq('activo', true)
    .order('orden')
  const categorias = (categoriasData ?? []) as Categoria[]

  // RLS: producción ve solo lo suyo; admin lo ve todo — mismo alcance
  // que el listado de Artículos, esta es la misma vista sin costos.
  let consulta = supabase
    .from('productos')
    .select(
      'id, codigo, nombre, estado, modo_inventario, cantidad_inicial, tienda_id, categorias(nombre)',
      { count: 'exact' },
    )
    .eq('activo', true)
    .order('nombre')

  if (filtros.categoriaId != null) consulta = consulta.eq('categoria_id', filtros.categoriaId)
  if (filtros.estado && ESTADOS.includes(filtros.estado)) {
    consulta = consulta.eq('estado', filtros.estado)
  } else {
    consulta = consulta.in('estado', ESTADOS)
  }
  const buscarSeguro = filtros.buscar.replace(/[,()]/g, ' ').trim()
  if (buscarSeguro) {
    consulta = consulta.or(`nombre.ilike.%${buscarSeguro}%,codigo.ilike.%${buscarSeguro}%`)
  }
  const { desde, hasta } = calcularRango(filtros.pagina, TAMANO_PAGINA)
  consulta = consulta.range(desde, hasta)

  const { data: piezasData, count: total } = await consulta
  const piezas = piezasData ?? []

  // Cantidad viva de las piezas ya publicadas (por_cantidad) —
  // cantidad_inicial solo aplica antes de publicar, después vive en
  // inventario_cantidad (ver comentario en 20260814100001).
  const publicadasPorCantidad = piezas.filter(
    (p) => p.modo_inventario === 'por_cantidad' && p.estado !== 'en_produccion' && p.tienda_id != null,
  )
  const { data: inventarioData } =
    publicadasPorCantidad.length > 0
      ? await supabase
          .from('inventario_cantidad')
          .select('producto_id, tienda_id, cantidad_disponible')
          .in(
            'producto_id',
            publicadasPorCantidad.map((p) => p.id),
          )
      : { data: [] as { producto_id: number; tienda_id: number; cantidad_disponible: number }[] }

  const cantidadViva = new Map<number, number>()
  for (const p of publicadasPorCantidad) {
    const fila = (inventarioData ?? []).find((i) => i.producto_id === p.id && i.tienda_id === p.tienda_id)
    if (fila) cantidadViva.set(p.id, fila.cantidad_disponible)
  }

  const totalPaginas = calcularTotalPaginas(total ?? 0, TAMANO_PAGINA)
  const construirHref = (pagina: number) => `/existencias?${construirQueryStringInventario(filtros, { pagina })}`

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Existencias</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatearNumero(total ?? 0)} artículos · solo cantidades, sin costos ni precios
          </p>
        </div>
        <Link
          href="/existencias/cargar"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          <UploadCloud className="h-4 w-4" />
          Cargar inventario
        </Link>
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
        <select name="estado" defaultValue={filtros.estado} className={clasesCampo}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {ETIQUETAS_ESTADO[e]}
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

      {piezas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Layers className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Sin artículos para estos filtros</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Artículo</th>
                  <th className="px-4 py-3 font-semibold">Categoría</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold text-right">Cantidad</th>
                  <th className="px-4 py-3 font-semibold text-right">Sumar inventario</th>
                </tr>
              </thead>
              <tbody>
                {piezas.map((p) => {
                  const categoria = p.categorias as unknown as { nombre: string } | null
                  const esPorCantidad = p.modo_inventario === 'por_cantidad'
                  const cantidad = esPorCantidad
                    ? (p.estado === 'en_produccion' ? p.cantidad_inicial : cantidadViva.get(p.id))
                    : null
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground">{p.nombre}</p>
                        <p className="text-xs text-muted-foreground">{p.codigo}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{categoria?.nombre ?? '—'}</td>
                      <td className="px-4 py-3">
                        <EstadoPieza estado={p.estado} />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">
                        {esPorCantidad ? formatearNumero(cantidad ?? 0) : 'Pieza única'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {esPorCantidad ? (
                          <details className="inline-block text-left">
                            <summary className="ml-auto inline-flex w-fit cursor-pointer list-none items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-foreground">
                              <PlusCircle className="h-3.5 w-3.5" />
                              Agregar
                            </summary>
                            <form
                              action={sumarInventarioUnitario}
                              className="absolute z-10 mt-1 flex w-48 flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-lg"
                            >
                              <input type="hidden" name="producto_id" value={p.id} />
                              <input
                                name="cantidad"
                                type="number"
                                step="1"
                                min="1"
                                required
                                placeholder="Cantidad"
                                className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                              />
                              <button
                                type="submit"
                                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                              >
                                Sumar
                              </button>
                            </form>
                          </details>
                        ) : (
                          <span className="text-xs text-muted-foreground">No aplica</span>
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
            total={total ?? 0}
            construirHref={construirHref}
          />
        </>
      )}
    </main>
  )
}
