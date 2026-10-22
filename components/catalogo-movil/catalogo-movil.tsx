'use client'

import { Plus_Jakarta_Sans } from 'next/font/google'
import { useEffect, useMemo } from 'react'
import type { ConfigCatalogo, ProductoWeb } from '@/lib/catalogo-web/tipos'
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
import { CLAVE_NOVEDADES_MUTE, CLAVE_NOVEDADES_SESION, PopupNovedades } from './overlays/novedades'

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], display: 'swap' })

function Pantallas() {
  const { estado, cartCount, config, openNews } = useCatalogo()
  const { screen, toast, hojaAbierta, novedadesAbiertas } = estado
  const showTabs = ['home', 'search', 'favs', 'cart'].includes(screen)
  const showMini = ['home', 'search', 'favs'].includes(screen) && cartCount > 0 && !toast

  // Popup de novedades 1,2 s después de entrar al inicio (una vez por sesión y
  // salvo "No volver a mostrar hoy"). Solo en celular: en computador este
  // componente está oculto y el popup lo muestra el catálogo web.
  useEffect(() => {
    if (screen !== 'home' || !config?.general.popup_novedades || !config.novedades.length) return
    if (window.matchMedia('(min-width: 768px)').matches) return
    try {
      if (localStorage.getItem(CLAVE_NOVEDADES_MUTE) === new Date().toDateString()) return
      if (sessionStorage.getItem(CLAVE_NOVEDADES_SESION) === '1') return
    } catch {}
    const t = setTimeout(() => {
      openNews()
      try {
        sessionStorage.setItem(CLAVE_NOVEDADES_SESION, '1')
      } catch {}
    }, 1200)
    return () => clearTimeout(t)
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      {novedadesAbiertas && <PopupNovedades />}
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
  config?: ConfigCatalogo | null
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
          config={props.config ?? null}
        >
          <Pantallas />
        </CatalogoProvider>
      </div>
    </div>
  )
}
