import { Gem } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerCarrito } from '@/lib/publico/carrito'
import type { PiezaCatalogo } from '@/components/catalogo/tipos'
import { CatalogoMovil } from '@/components/catalogo-movil/catalogo-movil'
import { adaptarLinea, adaptarProducto, calcularRangosPrecio } from '@/lib/catalogo-movil/datos'
import { obtenerPoliticaEnvio } from '@/lib/envio-servidor'
import { adaptarLineaWeb, cargarCatalogoWeb } from '@/lib/catalogo-web/datos'
import { CatalogoWeb } from '@/components/catalogo-web/catalogo-web'
import { agregarPublicoWeb, cambiarPublicoWeb, quitarPublicoWeb } from './acciones-web'

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
  const ok = typeof sp.ok === 'string' ? sp.ok : null
  const error = typeof sp.error === 'string' ? sp.error : null
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

  const [{ data: piezasData }, { items: carrito }, politicaEnvio, web] = await Promise.all([
    supabase.rpc('fn_catalogo_por_token', { p_token: token }),
    obtenerCarrito(token),
    obtenerPoliticaEnvio(supabase),
    cargarCatalogoWeb(supabase, 'publico', token),
  ])

  const productosMovil = ((piezasData ?? []) as PiezaCatalogo[]).map(adaptarProducto)
  const rutaBase = `/c/${token}`
  const query = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) =>
      k === 'ok' || k === 'error' || v == null ? [] : (Array.isArray(v) ? v : [v]).map((x) => [k, x] as [string, string]),
    ),
  ).toString()

  return (
    <>
      {/* Celular: app móvil del catálogo. Computador: catálogo web. */}
      <CatalogoMovil
        info={{ token, vendedor: info.vendedor_nombre, titulo: info.nombre && info.tipo !== 'catalogo' ? info.nombre : 'Catálogo' }}
        productos={productosMovil}
        rangos={calcularRangosPrecio(productosMovil)}
        politicaEnvio={politicaEnvio}
        lineas={carrito.map(adaptarLinea)}
      />
      <div className="hidden md:block">
        <CatalogoWeb
          contexto="publico"
          vendedor={info.nombre && info.tipo !== 'catalogo' ? `${info.vendedor_nombre} · ${info.nombre}` : info.vendedor_nombre}
          conPrecioEmbajador={false}
          puedeLink={false}
          config={web.config}
          productos={web.productos}
          categorias={web.categorias}
          lineasIniciales={carrito.map(adaptarLineaWeb)}
          modoInicial="cliente"
          acciones={{
            agregar: agregarPublicoWeb.bind(null, token),
            quitar: quitarPublicoWeb.bind(null, token),
            cambiar: cambiarPublicoWeb.bind(null, token),
          }}
          rutaBase={rutaBase}
          rutaCheckout={`${rutaBase}/checkout`}
          rutaFicha={`${rutaBase}/p`}
          parametros={query}
          aviso={error ? { text: error, error: true } : ok ? { text: ok } : null}
          soloEscritorio
        />
      </div>
    </>
  )
}
