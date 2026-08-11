import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { parsearFiltros, calcularOpcionesFacetas, TAMANO_PAGINA } from '@/lib/catalogo'
import { FiltrosPanel } from '@/components/catalogo/filtros-panel'
import { FiltroDrawer } from '@/components/catalogo/filtro-drawer'
import { RejillaPiezas } from '@/components/catalogo/rejilla-piezas'
import { Paginacion } from '@/components/catalogo/paginacion'
import type { PiezaCatalogo } from '@/components/catalogo/tipos'
import '@/app/catalogo-tema.css'

export const metadata = { title: 'Catálogo — ASTRO' }

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!(await tienePermiso('catalogo', 'ver'))) redirect('/inicio')

  const sp = await searchParams
  const filtros = parsearFiltros(sp)
  const supabase = await createClient()

  let consulta = supabase
    .from('vw_catalogo')
    .select(
      'id, codigo, nombre, categoria, material, peso_gramos, kilataje, precio_venta, estado, tienda, imagen_principal',
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

  const [{ data: piezas, count }, { data: facetaData, count: totalSinFiltrar }] = await Promise.all([
    consulta,
    supabase.from('vw_catalogo').select('categoria, material, kilataje, precio_venta', { count: 'exact' }),
  ])

  const lista = (piezas ?? []) as PiezaCatalogo[]
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
        <div>
          <h1 className="text-2xl text-[var(--cat-tinta)]">Catálogo</h1>
          <p className="mt-1 text-[13px] text-[var(--cat-texto)]">
            Piezas disponibles en tiempo real en toda la red.
          </p>
        </div>

        <FiltroDrawer panel={panelFiltros} />
        <div className="hidden lg:block">{panelFiltros}</div>

        <RejillaPiezas piezas={lista} rutaDetalle={(id) => `/catalogo/${id}`} rutaLimpiar={rutaBase} />

        <Paginacion filtros={filtrosPaginados} totalPaginas={totalPaginas} rutaBase={rutaBase} />
      </main>
    </div>
  )
}
