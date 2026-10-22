import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { formatearPrecio } from '@/lib/formato'
import { FormularioEnvioPago } from '@/components/app/formulario-envio-pago'
import type { ItemCarrito } from '@/lib/publico/carrito'
import { confirmarMiCarrito } from '../acciones'
import { obtenerModoCompra, obtenerPreciosEmbajador } from '@/lib/modo-compra'
import { obtenerPoliticaMayorista } from '@/lib/mayorista'
import { obtenerPoliticaEnvio } from '@/lib/envio-servidor'
import { cargarEntregaCheckout } from '@/lib/entrega-servidor'

export const metadata = { title: 'Realizar compra — ASTRO' }

export default async function CheckoutBackofficePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const supabase = await createClient()
  // Primera ola: contexto de sesión junto con todo lo que no depende del usuario ni del carrito.
  const [permitido, { data }, { data: parametroTope }, politicaEnvio] = await Promise.all([
    tienePermiso('catalogo', 'ver'),
    supabase.rpc('fn_ver_mi_carrito'),
    supabase.from('parametros').select('valor').eq('clave', 'pct_max_billetera').maybeSingle(),
    obtenerPoliticaEnvio(supabase),
  ])
  if (!permitido) redirect('/inicio')
  const { error } = await searchParams
  const usuario = await obtenerUsuarioActual()

  const items = (data ?? []) as ItemCarrito[]
  if (items.length === 0) redirect('/carrito')

  const total = items.reduce((acc, i) => acc + (i.precio_venta ?? 0) * i.cantidad, 0)
  const modo = await obtenerModoCompra()
  const productoIds = items.map((i) => i.producto_id)
  // Segunda ola: lo que necesita los ids del carrito o el rol del usuario.
  // Solo el embajador recibe filas: su total "para mí" con precio embajador.
  const [preciosEmbajador, { data: bolsaData }, entrega] = await Promise.all([
    usuario.rol === 'embajador' || usuario.rol === 'mayorista'
      ? obtenerPreciosEmbajador(supabase, productoIds)
      : Promise.resolve(new Map<number, number>()),
    usuario.rol === 'embajador' ? supabase.rpc('fn_mi_bolsa') : Promise.resolve({ data: null }),
    cargarEntregaCheckout(supabase, productoIds),
  ])
  const totalParaMi = items.reduce(
    (acc, i) => acc + (preciosEmbajador.get(i.producto_id) ?? i.precio_venta ?? 0) * i.cantidad,
    0,
  )
  const esMayorista = usuario.rol === 'mayorista'
  const politica = esMayorista ? await obtenerPoliticaMayorista(supabase) : null
  const totalModo = modo === 'mi' || esMayorista ? totalParaMi : total
  const faltaMinimo = politica ? Math.max(0, politica.minimo_compra - totalParaMi) : 0
  const saldoBolsa = Number((bolsaData as { disponible: number }[] | null)?.[0]?.disponible ?? 0)
  const pctMaxBilletera = Math.min(100, Math.max(0, Number(parametroTope?.valor ?? 95) || 95))

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6">
      <Link
        href="/carrito"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al carrito
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Realizar compra</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {items.length} artículo{items.length !== 1 ? 's' : ''} · productos {formatearPrecio(totalModo)} (el envío se calcula abajo)
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <FormularioEnvioPago
        action={confirmarMiCarrito}
        total={total}
        totalParaMi={totalParaMi}
        paraClienteInicial={!esMayorista && modo === 'cliente'}
        soloParaMi={esMayorista}
        aviso={
          esMayorista && !politica
            ? 'Tu cuenta mayorista aún no tiene una política de precios asignada. Escríbele a administración.'
            : faltaMinimo > 0
              ? `La compra mínima mayorista es de ${formatearPrecio(politica?.minimo_compra ?? 0)}: te faltan ${formatearPrecio(faltaMinimo)}.`
              : null
        }
        saldoBolsa={saldoBolsa}
        pctMaxBilletera={pctMaxBilletera}
        politicaEnvio={politicaEnvio}
        entrega={entrega}
        permitirCompraPropia
        nombreUsuario={usuario.nombre}
      />
    </main>
  )
}
