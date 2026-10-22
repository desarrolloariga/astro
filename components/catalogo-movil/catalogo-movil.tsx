'use client'

import { Plus_Jakarta_Sans } from 'next/font/google'
import { useMemo } from 'react'
import type { ProductoWeb } from '@/lib/catalogo-web/tipos'
import { adaptarDesdeWeb, calcularRangosPrecio } from '@/lib/catalogo-movil/datos'
import type { InfoCatalogo, LineaCarrito, Pantalla, Producto, RangoPrecio } from '@/lib/catalogo-movil/tipos'
import type { PoliticaEnvio } from '@/lib/envio'
import { GLOBAL_CSS, T } from './tokens'
import { CatalogoProvider, useCatalogo } from './store'
import { HomeScreen } from './pantallas/inicio'
import { SearchScreen } from './pantallas/busqueda'
import { FavsScreen } from './pantallas/favoritos'
import { DetailScreen } from './pantallas/detalle'
import { CartScreen } from './pantallas/carrito'
import { CheckoutScreen } from './pantallas/checkout'
import { SuccessScreen } from './pantallas/exito'
import { FilterSheet, MiniCart, TabBar, Toast } from './overlays/overlays'

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], display: 'swap' })

function Pantallas() {
  const { estado, cartCount } = useCatalogo()
  const { screen, toast, hojaAbierta } = estado
  const showTabs = ['home', 'search', 'favs', 'cart'].includes(screen)
  const showMini = ['home', 'search', 'favs'].includes(screen) && cartCount > 0 && !toast

  return (
    <>
      {screen === 'home' && <HomeScreen />}
      {screen === 'search' && <SearchScreen />}
      {screen === 'favs' && <FavsScreen />}
      {screen === 'detail' && <DetailScreen />}
      {screen === 'cart' && <CartScreen />}
      {screen === 'checkout' && <CheckoutScreen />}
      {screen === 'success' && <SuccessScreen />}

      {showMini && <MiniCart />}
      {showTabs && <TabBar />}
      <Toast />
      {hojaAbierta && <FilterSheet />}
    </>
  )
}

/**
 * Catálogo público en móvil (diseño aprobado de CatalogApp.jsx) conectado
 * al enlace real: piezas de fn_catalogo_por_token, carrito con apartado en
 * la base y checkout con comprobante. Ocupa toda la pantalla por encima del
 * layout público; en escritorio se sigue usando la vista actual.
 */
export function CatalogoMovil(props: {
  info: InfoCatalogo
  /** Piezas ya adaptadas, o las del catálogo web (se adaptan aquí para no enviarlas dos veces). */
  productos?: Producto[]
  productosWeb?: ProductoWeb[]
  rangos?: RangoPrecio[]
  lineas: LineaCarrito[]
  pantallaInicial?: Pantalla
  productoInicial?: number | null
  politicaEnvio?: PoliticaEnvio | null
}) {
  const productos = useMemo(() => props.productos ?? (props.productosWeb ?? []).map(adaptarDesdeWeb), [props.productos, props.productosWeb])
  const rangos = useMemo(() => props.rangos ?? calcularRangosPrecio(productos), [props.rangos, productos])
  return (
    <div className="fixed inset-0 z-50 md:hidden" style={{ background: T.bg }}>
      <div
        className={`cat-app ${jakarta.className}`}
        style={{
          width: '100%',
          maxWidth: 430,
          height: '100dvh',
          maxHeight: 932,
          margin: '0 auto',
          position: 'relative',
          overflow: 'hidden',
          background: T.bg,
          color: T.text,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <style>{GLOBAL_CSS}</style>
        <CatalogoProvider
          info={props.info}
          productos={productos}
          rangos={rangos}
          lineasIniciales={props.lineas}
          pantallaInicial={props.pantallaInicial}
          productoInicial={props.productoInicial}
          politicaEnvio={props.politicaEnvio}
        >
          <Pantallas />
        </CatalogoProvider>
      </div>
    </div>
  )
}
