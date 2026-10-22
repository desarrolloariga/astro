import { redirect } from 'next/navigation'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { obtenerModoCompra } from '@/lib/modo-compra'
import { adaptarLineaWeb, cargarCatalogoWeb } from '@/lib/catalogo-web/datos'
import type { ItemCarrito } from '@/lib/publico/carrito'
import { CatalogoWeb } from '@/components/catalogo-web/catalogo-web'
import { agregarMiCarritoWeb, cambiarMiCarritoWeb, quitarMiCarritoWeb } from './acciones-web'

export const metadata = { title: 'Catálogo — ASTRO' }

const ROLES_LINK = ['tienda', 'asesor', 'embajador', 'admin']

/** Convierte los searchParams en query string (sin los avisos ok/error). */
function aQuery(sp: Record<string, string | string[] | undefined>) {
  return new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) =>
      k === 'ok' || k === 'error' || v == null ? [] : (Array.isArray(v) ? v : [v]).map((x) => [k, x] as [string, string]),
    ),
  ).toString()
}

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()
  // Catálogo, carrito y contexto de sesión salen en una sola ola de red
  // (las consultas de Supabase arrancan al entrar al Promise.all); el
  // permiso se revisa antes de usar los datos.
  const [puede, usuario, sp, modo, { config, productos, categorias }, { data: carrito }] = await Promise.all([
    tienePermiso('catalogo', 'ver'),
    obtenerUsuarioActual(),
    searchParams,
    obtenerModoCompra(),
    cargarCatalogoWeb(supabase, 'backoffice'),
    supabase.rpc('fn_ver_mi_carrito'),
  ])
  if (!puede) redirect('/inicio')
  const ok = typeof sp.ok === 'string' ? sp.ok : null
  const error = typeof sp.error === 'string' ? sp.error : null

  return (
    <CatalogoWeb
      contexto="backoffice"
      conPrecioEmbajador={usuario.rol === 'embajador' && productos.some((p) => p.emb != null)}
      puedeLink={ROLES_LINK.includes(usuario.rol)}
      config={config}
      productos={productos}
      categorias={categorias}
      lineasIniciales={((carrito ?? []) as ItemCarrito[]).map(adaptarLineaWeb)}
      modoInicial={modo}
      acciones={{ agregar: agregarMiCarritoWeb, quitar: quitarMiCarritoWeb, cambiar: cambiarMiCarritoWeb }}
      rutaBase="/catalogo"
      rutaCheckout="/carrito/checkout"
      rutaFicha="/catalogo"
      parametros={aQuery(sp)}
      aviso={error ? { text: error, error: true } : ok ? { text: ok } : null}
    />
  )
}
