import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft, Gem } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { obtenerUrlBase } from '@/lib/url-publica'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { obtenerModoCompra, obtenerPreciosEmbajador } from '@/lib/modo-compra'
import { adaptarLineaWeb } from '@/lib/catalogo-web/datos'
import { cargarFicha } from '@/lib/producto-detalle/datos'
import { COOKIE_ENTREGA, parsearEleccion } from '@/lib/entrega'
import type { ItemCarrito } from '@/lib/publico/carrito'
import { ProductoDetalle } from '@/components/producto-detalle/producto-detalle'
import { JsonLdProducto } from '@/components/producto-detalle/json-ld'
import { separarPieza, venderPieza } from '../acciones'
import { agregarMiCarritoWeb, generarLinkPiezaWeb } from '../acciones-web'

const ROLES_LINK = ['tienda', 'asesor', 'embajador', 'admin']

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('vw_catalogo')
    .select('nombre, descripcion, imagen_principal')
    .eq('id', Number(id) || 0)
    .maybeSingle<{ nombre: string; descripcion: string | null; imagen_principal: string | null }>()
  if (!data) return { title: 'Pieza — ASTRO' }
  return {
    title: `${data.nombre} — ASTRO`,
    description: data.descripcion ?? undefined,
    openGraph: { title: data.nombre, description: data.descripcion ?? undefined, images: data.imagen_principal ? [data.imagen_principal] : undefined },
  }
}

export default async function FichaPiezaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; ok?: string }>
}) {
  const [{ id }, supabase] = await Promise.all([params, createClient()])
  const productoId = Number(id) || 0

  // Ficha, carrito y contexto de sesión salen en una sola ola de red; el
  // permiso se revisa antes de usar los datos.
  const [puede, { error, ok }, usuario, modo, galletas, urlBase, datos, { data: carrito }, puedeSeparar, puedeVender, puedeDescuento] =
    await Promise.all([
      tienePermiso('catalogo', 'ver'),
      searchParams,
      obtenerUsuarioActual(),
      obtenerModoCompra(),
      cookies(),
      obtenerUrlBase(),
      cargarFicha(supabase, 'backoffice', productoId),
      supabase.rpc('fn_ver_mi_carrito'),
      tienePermiso('separados', 'crear'),
      tienePermiso('ventas', 'crear'),
      tienePermiso('ventas', 'descuento_embajador'),
    ])
  if (!puede) redirect('/inicio')

  if (!datos) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
        <Link href="/catalogo" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Volver al catálogo
        </Link>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <Gem className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Esta pieza ya no está disponible</p>
          <p className="max-w-sm text-sm text-muted-foreground">Puede haberse vendido, separado o estar en tránsito.</p>
        </div>
      </main>
    )
  }

  const items = (carrito ?? []) as ItemCarrito[]
  // Precio embajador de lo que ya está en el carrito (solo si no viene en la ficha).
  const conocidos = new Map([datos.producto, ...datos.relacionados].filter((p) => p.emb != null).map((p) => [p.id, p.emb as number]))
  const faltantes = items.map((i) => i.producto_id).filter((pid) => !conocidos.has(pid))
  const preciosCarrito =
    usuario.rol === 'embajador' && faltantes.length > 0 ? await obtenerPreciosEmbajador(supabase, faltantes) : new Map<number, number>()
  for (const [pid, precio] of conocidos) preciosCarrito.set(pid, precio)

  return (
    <>
      <JsonLdProducto producto={datos.producto} url={`${urlBase}/catalogo/${productoId}`} />
      <ProductoDetalle
        contexto="backoffice"
        datos={datos}
        conPrecioEmbajador={usuario.rol === 'embajador' && datos.producto.emb != null}
        modoInicial={modo}
        lineasIniciales={items.map(adaptarLineaWeb)}
        preciosEmbCarrito={Object.fromEntries(preciosCarrito)}
        acciones={{ agregar: agregarMiCarritoWeb }}
        entregaInicial={parsearEleccion(galletas.get(COOKIE_ENTREGA)?.value)}
        rutaCatalogo="/catalogo"
        rutaFicha="/catalogo"
        rutaCarrito="/carrito"
        obtenerLink={generarLinkPiezaWeb.bind(null, productoId)}
        urlPieza={`${urlBase}/catalogo/${productoId}`}
        puedeLink={ROLES_LINK.includes(usuario.rol)}
        vender={{
          puedeVender,
          puedeSeparar,
          puedeDescuento,
          venderAccion: venderPieza,
          separarAccion: separarPieza,
        }}
        aviso={error ? { text: error, error: true } : ok ? { text: ok } : null}
      />
    </>
  )
}
