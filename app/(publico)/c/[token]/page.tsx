import { Gem, AlertCircle, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerCarrito } from '@/lib/publico/carrito'
import { parsearFiltros, calcularOpcionesFacetas, aplicarFiltrosPiezas, paginar } from '@/lib/catalogo'
import { RejillaPiezas } from '@/components/catalogo/rejilla-piezas'
import { FiltrosPanel } from '@/components/catalogo/filtros-panel'
import { FiltroDrawer } from '@/components/catalogo/filtro-drawer'
import { Paginacion } from '@/components/catalogo/paginacion'
import { TarjetasCategorias, VolverACategorias, esPortadaCategorias, resumirCategorias } from '@/components/catalogo/tarjetas-categorias'
import { PanelBolsa } from '@/components/catalogo/panel-bolsa'
import type { PiezaCatalogo } from '@/components/catalogo/tipos'
import { CatalogoMovil } from '@/components/catalogo-movil/catalogo-movil'
import { adaptarLinea, adaptarProducto, calcularRangosPrecio } from '@/lib/catalogo-movil/datos'
import '@/app/catalogo-tema.css'

export const metadata = { title: 'Catálogo — ASTRO' }

export default async function CatalogoPublicoPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { token } = await params
  const sp = await searchParams
  const { ok, error } = sp as { ok?: string; error?: string }
  const supabase = await createClient()

  const { data: infoData } = await supabase.rpc('fn_link_info', { p_token: token })
  const info = infoData?.[0] as { vendedor_nombre: string; tipo: string; vigente: boolean; nombre: string | null } | undefined

  if (!info?.vigente) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col items-center gap-3 px-4 py-20 text-center">
        <Gem className="h-12 w-12 text-muted-foreground" strokeWidth={1.2} />
        <h1 className="text-lg font-bold text-foreground">Este enlace ya no está disponible</h1>
        <p className="text-sm text-muted-foreground">
          Puede haber vencido o haber sido desactivado. Pide a tu asesor un nuevo enlace.
        </p>
      </main>
    )
  }

  const [{ data: piezasData }, { items: carrito }] = await Promise.all([
    supabase.rpc('fn_catalogo_por_token', { p_token: token }),
    obtenerCarrito(token),
  ])

  const todasLasPiezas = (piezasData ?? []) as PiezaCatalogo[]
  const productosMovil = todasLasPiezas.map(adaptarProducto)
  const idsEnCarrito = new Set(carrito.map((c) => c.producto_id))

  const filtros = parsearFiltros(sp)
  const facetas = calcularOpcionesFacetas(todasLasPiezas)
  const filtradas = aplicarFiltrosPiezas(todasLasPiezas, filtros)
  const { items: piezasPagina, paginaActual, totalPaginas } = paginar(filtradas, filtros.pagina)
  const filtrosPaginados = { ...filtros, pagina: paginaActual }

  const rutaBase = `/c/${token}`
  const categorias = resumirCategorias(todasLasPiezas)
  const portada = esPortadaCategorias(filtros, filtros.verTodo, categorias.length)
  // Tras agregar/quitar de la bolsa se vuelve a la misma categoría y página.
  const qs = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) =>
      k === 'ok' || k === 'error' || v == null ? [] : (Array.isArray(v) ? v : [v]).map((x) => [k, x] as [string, string]),
    ),
  ).toString()
  const volver = qs ? `${rutaBase}?${qs}` : rutaBase
  const panelFiltros = (
    <FiltrosPanel
      filtros={filtros}
      facetas={facetas}
      rutaBase={rutaBase}
      totalSinFiltrar={todasLasPiezas.length}
      totalConFiltro={filtradas.length}
    />
  )

  const movil = (
    <CatalogoMovil
      info={{ token, vendedor: info.vendedor_nombre, titulo: info.nombre && info.tipo !== 'catalogo' ? info.nombre : 'Catálogo' }}
      productos={productosMovil}
      rangos={calcularRangosPrecio(productosMovil)}
      lineas={carrito.map(adaptarLinea)}
    />
  )

  return (
    <>
      {movil}
      <div className="hidden md:block">
      <div className="catalogo-tema">
        <div className="sticky top-0 z-30 border-b border-[var(--cat-borde)] bg-[var(--cat-bg)]">
          <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center justify-between px-4 md:px-10">
            <p className="truncate text-[10px] font-medium uppercase tracking-[.14em] text-[var(--cat-primario)]">
              {info.nombre && info.tipo !== 'catalogo' ? `${info.nombre} · ` : ''}Catálogo de {info.vendedor_nombre}
            </p>
            <PanelBolsa token={token} items={carrito} abrirAlInicio={Boolean(ok)} />
          </div>
        </div>

        <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-[22px] px-4 pb-20 pt-[26px] md:px-10">
          <div>
            <h1 className="text-2xl text-[var(--cat-tinta)]">Encuentra tu próxima pieza</h1>
            <p className="mt-1 text-[13px] text-[var(--cat-texto)]">
              Agrega piezas a tu bolsa; se reservan por unos minutos mientras completas tu compra.
            </p>
          </div>

          {ok && (
            <div className="flex items-start gap-2 rounded-[3px] bg-[var(--cat-surface)] px-3 py-2.5 text-[13px] text-[var(--cat-primario)]">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{ok}</span>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-[3px] bg-red-50 px-3 py-2.5 text-[13px] text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {portada ? (
            <TarjetasCategorias categorias={categorias} rutaBase={rutaBase} totalPiezas={todasLasPiezas.length} />
          ) : (
            <>
              {categorias.length > 1 && <VolverACategorias rutaBase={rutaBase} categoria={filtros.categoria || undefined} />}

              <FiltroDrawer panel={panelFiltros} />
              <div className="hidden lg:block">{panelFiltros}</div>

              <RejillaPiezas
                piezas={piezasPagina}
                rutaDetalle={(id) => `${rutaBase}/p/${id}`}
                rutaLimpiar={rutaBase}
                accionesPublicas={{ idsEnCarrito, token, volver }}
              />

              <Paginacion filtros={filtrosPaginados} totalPaginas={totalPaginas} rutaBase={rutaBase} />
            </>
          )}
        </main>
      </div>
      </div>
    </>
  )
}
