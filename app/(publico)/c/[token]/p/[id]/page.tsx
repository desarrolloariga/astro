import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Gem } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerCarrito } from '@/lib/publico/carrito'
import type { PiezaCatalogo } from '@/components/catalogo/tipos'
import { CatalogoMovil } from '@/components/catalogo-movil/catalogo-movil'
import { adaptarLinea, adaptarProducto, calcularRangosPrecio } from '@/lib/catalogo-movil/datos'
import { adaptarLineaWeb } from '@/lib/catalogo-web/datos'
import { cargarFicha } from '@/lib/producto-detalle/datos'
import { COOKIE_ENTREGA, parsearEleccion } from '@/lib/entrega'
import { obtenerUrlBase } from '@/lib/url-publica'
import { ProductoDetalle } from '@/components/producto-detalle/producto-detalle'
import { JsonLdProducto } from '@/components/producto-detalle/json-ld'
import { agregarPublicoWeb, linkPiezaPublicaWeb } from '../../acciones-web'

export async function generateMetadata({ params }: { params: Promise<{ token: string; id: string }> }): Promise<Metadata> {
  const { token, id } = await params
  const supabase = await createClient()
  const { data } = await supabase.rpc('fn_catalogo_por_token', { p_token: token })
  const pieza = ((data ?? []) as PiezaCatalogo[]).find((p) => String(p.id) === id)
  if (!pieza) return { title: 'Pieza — ASTRO' }
  return {
    title: `${pieza.nombre} — ASTRO`,
    description: pieza.descripcion ?? undefined,
    openGraph: {
      title: pieza.nombre,
      description: pieza.descripcion ?? undefined,
      images: pieza.imagen_principal ? [pieza.imagen_principal] : undefined,
    },
  }
}

export default async function PiezaPublicaPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; id: string }>
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const [{ token, id }, { ok, error }, supabase, galletas] = await Promise.all([params, searchParams, createClient(), cookies()])
  const productoId = Number(id) || 0

  const [{ data: infoData }, { data: piezasData }, { items: carrito }, datos] = await Promise.all([
    supabase.rpc('fn_link_info', { p_token: token }),
    supabase.rpc('fn_catalogo_por_token', { p_token: token }),
    obtenerCarrito(token),
    cargarFicha(supabase, 'publico', productoId, token),
  ])

  const info = infoData?.[0] as { vendedor_nombre: string; tipo: string; vigente: boolean; nombre: string | null } | undefined
  if (!info?.vigente) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col items-center gap-3 px-4 py-20 text-center">
        <Gem className="h-12 w-12 text-muted-foreground" strokeWidth={1.2} />
        <h1 className="text-lg font-bold text-foreground">Este enlace ya no está disponible</h1>
      </main>
    )
  }
  if (!datos) notFound()

  const productosMovil = ((piezasData ?? []) as PiezaCatalogo[]).map(adaptarProducto)
  const rutaBase = `/c/${token}`

  return (
    <>
      {/* Celular: app móvil abierta en esta pieza. Computador: ficha nueva. */}
      <CatalogoMovil
        info={{ token, vendedor: info.vendedor_nombre, titulo: info.nombre && info.tipo !== 'catalogo' ? info.nombre : 'Catálogo' }}
        productos={productosMovil}
        rangos={calcularRangosPrecio(productosMovil)}
        politicaEnvio={datos.politica}
        lineas={carrito.map(adaptarLinea)}
        pantallaInicial="detail"
        productoInicial={productoId}
      />
      <div className="hidden md:block">
        <JsonLdProducto producto={datos.producto} url={`${await obtenerUrlBase()}${rutaBase}/p/${productoId}`} />
        <ProductoDetalle
          contexto="publico"
          datos={datos}
          conPrecioEmbajador={false}
          modoInicial="cliente"
          lineasIniciales={carrito.map(adaptarLineaWeb)}
          preciosEmbCarrito={{}}
          acciones={{ agregar: agregarPublicoWeb.bind(null, token) }}
          entregaInicial={parsearEleccion(galletas.get(COOKIE_ENTREGA)?.value)}
          rutaCatalogo={rutaBase}
          rutaFicha={`${rutaBase}/p`}
          rutaCarrito={`${rutaBase}/checkout`}
          obtenerLink={linkPiezaPublicaWeb.bind(null, token, productoId)}
          puedeLink={false}
          aviso={error ? { text: error, error: true } : ok ? { text: ok } : null}
        />
      </div>
    </>
  )
}
