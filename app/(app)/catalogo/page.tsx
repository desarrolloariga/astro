import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Link2 } from 'lucide-react'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { parsearFiltros, calcularOpcionesFacetas, TAMANO_PAGINA } from '@/lib/catalogo'
import { FiltrosPanel } from '@/components/catalogo/filtros-panel'
import { FiltroDrawer } from '@/components/catalogo/filtro-drawer'
import { RejillaPiezas } from '@/components/catalogo/rejilla-piezas'
import { Paginacion } from '@/components/catalogo/paginacion'
import type { PiezaCatalogo } from '@/components/catalogo/tipos'
import { SelectorModoCompra } from '@/components/app/selector-modo-compra'
import { obtenerModoCompra, obtenerPreciosEmbajador } from '@/lib/modo-compra'
import '@/app/catalogo-tema.css'

export const metadata = { title: 'Catálogo — ASTRO' }

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!(await tienePermiso('catalogo', 'ver'))) redirect('/inicio')

  const usuario = await obtenerUsuarioActual()
  const puedeGenerarLink = ['tienda', 'asesor', 'embajador', 'admin'].includes(usuario.rol)
  const sp = await searchParams
  const filtros = parsearFiltros(sp)
  const supabase = await createClient()

  let consulta = supabase
    .from('vw_catalogo')
    .select(
      'id, codigo, nombre, categoria, material, peso_gramos, kilataje, precio_venta, estado, tienda, imagen_principal, modo_inventario, stock_disponible',
      { count: 'exact' },
    )

  if (filtros.buscar) {
    consulta = consulta.or(`nombre.ilike.%${filtros.buscar}%,codigo.ilike.%${filtros.buscar}%`)
  }
  if (filtros.categoria) consulta = consulta.eq('categoria', filtros.categoria)
  if (filtros.material) consulta = consulta.eq('material', filtros.material)
  if (filtros.kilataje) consulta = consulta.eq('kilataje', filtros.kilataje)
  if (filtros.precioMax != null) consulta = consulta.lte('precio_venta', filtros.precioMax)

  if (filtros.orden === 'precio_asc') {
    consulta = consulta
      .order('precio_venta', { ascending: true, nullsFirst: false })
      .order('id', { ascending: false })
  } else if (filtros.orden === 'precio_desc') {
    consulta = consulta
      .order('precio_venta', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
  } else {
    consulta = consulta.order('id', { ascending: false })
  }

  const desde = (filtros.pagina - 1) * TAMANO_PAGINA
  consulta = consulta.range(desde, desde + TAMANO_PAGINA - 1)

  const [{ data: piezas, count }, { data: facetaData, count: totalSinFiltrar }, { data: carritoData }] = await Promise.all([
    consulta,
    supabase.from('vw_catalogo').select('categoria, material, kilataje, precio_venta', { count: 'exact' }),
    supabase.rpc('fn_ver_mi_carrito'),
  ])
  const idsEnCarrito = new Set(((carritoData ?? []) as { producto_id: number }[]).map((c) => c.producto_id))
  const ok = typeof sp.ok === 'string' ? sp.ok : undefined
  const error = typeof sp.error === 'string' ? sp.error : undefined

  const esEmbajador = usuario.rol === 'embajador'
  const modo = await obtenerModoCompra()
  // Embajador comprando para sí: precio público – precio embajador.
  const preciosEmbajador =
    esEmbajador && modo === 'mi'
      ? await obtenerPreciosEmbajador(supabase, (piezas ?? []).map((p) => p.id as number))
      : new Map<number, number>()
  const lista = ((piezas ?? []) as PiezaCatalogo[]).map((p) => ({
    ...p,
    precio_embajador: preciosEmbajador.get(p.id) ?? null,
  }))
  const facetas = calcularOpcionesFacetas(facetaData ?? [])
  const totalConFiltro = count ?? 0
  const totalPaginas = Math.max(1, Math.ceil(totalConFiltro / TAMANO_PAGINA))
  const filtrosPaginados = { ...filtros, pagina: Math.min(filtros.pagina, totalPaginas) }

  const rutaBase = '/catalogo'
  const panelFiltros = (
    <FiltrosPanel
      filtros={filtros}
      facetas={facetas}
      rutaBase={rutaBase}
      totalSinFiltrar={totalSinFiltrar ?? 0}
      totalConFiltro={totalConFiltro}
    />
  )

  return (
    <div className="catalogo-tema">
      <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-[22px] px-4 pb-20 pt-[26px] md:px-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl text-[var(--cat-tinta)]">Catálogo</h1>
            <p className="mt-1 text-[13px] text-[var(--cat-texto)]">
              Piezas disponibles en tiempo real en toda la red.
            </p>
          </div>
          {puedeGenerarLink && (
            <Link
              href="/catalogo/generar-link"
              className="inline-flex items-center gap-2 rounded-[4px] bg-[var(--cat-primario)] px-4 py-2.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            >
              <Link2 className="h-4 w-4" />
              Generar link
            </Link>
          )}
        </div>

        <SelectorModoCompra modo={modo} volver="/catalogo" esEmbajador={esEmbajador} />

        {ok && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[4px] bg-[var(--cat-surface)] px-4 py-2.5 text-[13px] text-[var(--cat-tinta)]">
            <span>{ok}</span>
            <a href="/carrito" className="font-medium text-[var(--cat-primario)] hover:underline">
              Ver carrito →
            </a>
          </div>
        )}
        {error && (
          <div className="rounded-[4px] bg-destructive/10 px-4 py-2.5 text-[13px] text-destructive">{error}</div>
        )}

        <FiltroDrawer panel={panelFiltros} />
        <div className="hidden lg:block">{panelFiltros}</div>

        <RejillaPiezas
          piezas={lista}
          rutaDetalle={(id) => `/catalogo/${id}`}
          rutaLimpiar={rutaBase}
          accionesPublicas={{ idsEnCarrito, volver: '/catalogo' }}
        />

        <Paginacion filtros={filtrosPaginados} totalPaginas={totalPaginas} rutaBase={rutaBase} />
      </main>
    </div>
  )
}
