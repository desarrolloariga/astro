'use client'

import { Plus_Jakarta_Sans } from 'next/font/google'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { slug } from '@/lib/catalogo-web/slug'
import type {
  CategoriaWeb,
  ConfigCatalogo,
  Contexto,
  Cta,
  LineaWeb,
  ModoWeb,
  ProductoWeb,
  ResultadoCarritoWeb,
} from '@/lib/catalogo-web/tipos'
import { FILTROS_VACIOS, type AppCatalogo, type Filtros, type Overlay } from './app-tipo'
import { Toast } from './basicos'
import { CategoryView } from './categoria'
import { AnnouncementBar, Footer, Header } from './encabezado'
import { HomeView } from './inicio'
import { CLAVE_NOVEDADES, CartDrawer, NewsModal, QuickViewModal } from './overlays'
import { GLOBAL_CSS, PAGE_SIZE, SORTS, T, TOAST_MS, type Sort } from './tokens'

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], display: 'swap' })

export type AccionesCarritoWeb = {
  agregar: (productoId: number, cantidad: number) => Promise<ResultadoCarritoWeb>
  quitar: (productoId: number) => Promise<ResultadoCarritoWeb>
  cambiar: (productoId: number, actual: number, nueva: number) => Promise<ResultadoCarritoWeb>
}

type Props = {
  contexto: Contexto
  vendedor?: string | null
  conPrecioEmbajador: boolean
  /** Cuenta mayorista (precio de su política, sin modo "para un cliente"). */
  mayorista?: { politica: string; minimo: number } | null
  puedeLink: boolean
  config: ConfigCatalogo
  productos: ProductoWeb[]
  categorias: CategoriaWeb[]
  lineasIniciales: LineaWeb[]
  modoInicial: ModoWeb
  acciones: AccionesCarritoWeb
  /** '/catalogo' o '/c/[token]'. */
  rutaBase: string
  rutaCheckout: string
  /** Prefijo de la ficha de producto: `${rutaFicha}/${id}`. */
  rutaFicha: string
  /** Query string de la petición, para pintar en el servidor la misma vista que pide la URL. */
  parametros: string
  /** Mensaje que llega en la URL (?ok= / ?error=) desde otras pantallas. */
  aviso?: { text: string; error?: boolean } | null
  /** El catálogo solo se muestra en computador (en el celular está la app móvil). */
  soloEscritorio?: boolean
}

type EstadoUrl = { view: 'home' | 'category'; cat: string; query: string; filters: Filtros; sort: Sort }

const ORDENES = new Set<string>(SORTS.map((s) => s.id))

/** Lee la vista y los filtros de la URL (acepta también los parámetros del catálogo anterior). */
function leerUrl(params: URLSearchParams, categorias: CategoriaWeb[]): EstadoUrl {
  let cat = params.get('cat') ?? ''
  const anterior = params.get('categoria')
  if (!cat && anterior) cat = slug(anterior)
  if (!cat && params.get('ver') === 'todo') cat = 'todo'
  const q = params.get('q') ?? params.get('buscar') ?? ''
  let orden = params.get('orden') ?? 'new'
  if (orden === 'precio_asc') orden = 'asc'
  if (orden === 'precio_desc') orden = 'desc'
  const max = Number(params.get('max') ?? params.get('precio_max') ?? '')
  const view = cat || q ? 'category' : 'home'
  const valido = cat && cat !== 'todo' && categorias.some((c) => c.id === cat)
  return {
    view,
    cat: valido ? cat : 'all',
    query: q,
    filters: {
      mat: params.get('mat') ?? params.get('material') ?? 'all',
      kil: params.get('kil') ?? params.get('kilataje') ?? 'all',
      maxPrice: Number.isFinite(max) && max > 0 ? max : null,
      onlyStock: params.get('disp') === '1',
    },
    sort: (ORDENES.has(orden) ? orden : 'new') as Sort,
  }
}

function escribirUrl(e: EstadoUrl) {
  const p = new URLSearchParams()
  if (e.view === 'category') {
    p.set('cat', e.cat === 'all' ? 'todo' : e.cat)
    if (e.query.trim()) p.set('q', e.query.trim())
    if (e.filters.mat !== 'all') p.set('mat', e.filters.mat)
    if (e.filters.kil !== 'all') p.set('kil', e.filters.kil)
    if (e.filters.maxPrice != null) p.set('max', String(e.filters.maxPrice))
    if (e.filters.onlyStock) p.set('disp', '1')
    if (e.sort !== 'new') p.set('orden', e.sort)
  }
  return p.toString()
}

function unicos(valores: (string | null)[]) {
  return [...new Set(valores.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
}

export function CatalogoWeb(props: Props) {
  const { contexto, config, productos, categorias, acciones, rutaBase } = props
  const router = useRouter()

  const [estado, setEstado] = useState<EstadoUrl>(() => leerUrl(new URLSearchParams(props.parametros), categorias))
  const [mode, setModeState] = useState<ModoWeb>(props.modoInicial)
  const [cols, setCols] = useState<3 | 4>(4)
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [favs, setFavs] = useState<number[]>([])
  const [lineas, setLineas] = useState<LineaWeb[]>(props.lineasIniciales)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [toast, setToast] = useState<{ text: string; error?: boolean; cart?: boolean } | null>(
    props.aviso ? { ...props.aviso, cart: !props.aviso.error } : null,
  )
  const [cartBusy, startCart] = useTransition()
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const claveFavs = `cw-favs-${contexto}`

  // URL ↔ estado: cada cambio se refleja en la barra de direcciones; atrás/adelante lo restaura.
  const actualizar = useCallback(
    (cambio: Partial<EstadoUrl>, push = false) => {
      setEstado((prev) => {
        const sig = { ...prev, ...cambio }
        const qs = escribirUrl(sig)
        const url = qs ? `${rutaBase}?${qs}` : rutaBase
        if (url !== window.location.pathname + window.location.search) {
          window.history[push ? 'pushState' : 'replaceState'](null, '', url)
        }
        return sig
      })
    },
    [rutaBase],
  )

  useEffect(() => {
    const onPop = () => {
      setEstado(leerUrl(new URLSearchParams(window.location.search), categorias))
      setVisible(PAGE_SIZE)
      setOverlay(null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [categorias])

  useEffect(() => {
    try {
      const guardados = JSON.parse(localStorage.getItem(claveFavs) ?? '[]')
      if (Array.isArray(guardados)) setFavs(guardados.filter((x) => typeof x === 'number'))
    } catch {}
  }, [claveFavs])

  // Popup de novedades: 1,2 s después de entrar al inicio, una vez por sesión y salvo "No volver a mostrar hoy".
  useEffect(() => {
    if (estado.view !== 'home' || !config.general.popup_novedades || config.novedades.length === 0) return
    if (props.soloEscritorio && !window.matchMedia('(min-width: 768px)').matches) return
    try {
      if (localStorage.getItem(CLAVE_NOVEDADES) === new Date().toDateString()) return
      if (sessionStorage.getItem('cw-news-seen') === '1') return
    } catch {}
    const t = setTimeout(() => {
      setOverlay((o) => o ?? { type: 'news' })
      try {
        sessionStorage.setItem('cw-news-seen', '1')
      } catch {}
    }, 1200)
    return () => clearTimeout(t)
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (props.aviso) toastT.current = setTimeout(() => setToast(null), TOAST_MS * 2)
    return () => {
      if (toastT.current) clearTimeout(toastT.current)
    }
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showToast = (text: string, opciones: { error?: boolean; cart?: boolean } = {}) => {
    setToast({ text, ...opciones })
    if (toastT.current) clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(null), TOAST_MS)
  }

  const scrollTop = () => {
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {}
  }

  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos])
  const conEmb = props.conPrecioEmbajador && contexto === 'backoffice'
  const unitPrice = useCallback((p: ProductoWeb) => (mode === 'mi' && conEmb && p.emb != null ? p.emb : p.pub), [mode, conEmb])
  const gain = useCallback((p: ProductoWeb) => (conEmb && p.emb != null ? Math.max(0, p.pub - p.emb) : null), [conEmb])

  const lines = lineas.map((l) => ({ ...l, p: porId.get(l.producto_id) }))
  const cartCount = lines.reduce((a, l) => a + l.cantidad, 0)
  const cartTotal = lines.reduce((a, l) => a + (l.p ? unitPrice(l.p) : l.precio) * l.cantidad, 0)
  const cartGain = lines.reduce((a, l) => a + (l.p ? (gain(l.p) ?? 0) : 0) * l.cantidad, 0)

  const { precioMin, precioMax } = useMemo(() => {
    const precios = productos.map(unitPrice).filter((n) => n > 0)
    if (precios.length === 0) return { precioMin: 0, precioMax: 0 }
    return { precioMin: Math.floor(Math.min(...precios) / 10) * 10, precioMax: Math.ceil(Math.max(...precios) / 10) * 10 }
  }, [productos, unitPrice])
  const materiales = useMemo(() => unicos(productos.map((p) => p.material)), [productos])
  const kilatajes = useMemo(() => unicos(productos.map((p) => p.kilataje)), [productos])

  const resultadoCarrito = (r: ResultadoCarritoWeb, ok?: string) => {
    setLineas(r.items)
    if (!r.ok) showToast(r.error ?? 'No se pudo actualizar el carrito', { error: true })
    else if (ok) showToast(ok, { cart: true })
    // En el backoffice el contador del carrito del menú vive en el layout.
    if (contexto === 'backoffice') router.refresh()
  }

  const goCategory = (id: string) => {
    setVisible(PAGE_SIZE)
    setOverlay(null)
    actualizar({ view: 'category', cat: id }, true)
    scrollTop()
  }

  const openLink = (scope: 'all' | 'cat' | 'sel' = 'all', valor?: string | number[]) => {
    const p = new URLSearchParams()
    if (scope === 'cat' && typeof valor === 'string' && valor !== 'all') {
      const c = categorias.find((x) => x.id === valor)
      if (c) {
        p.set('modo', 'filtrado')
        p.set('categoria', c.nombre)
      }
    } else if (scope === 'sel') {
      const ids = Array.isArray(valor) && valor.length ? valor : lineas.map((l) => l.producto_id)
      p.set('modo', 'subconjunto')
      if (ids.length) p.set('piezas', ids.join(','))
    }
    const qs = p.toString()
    router.push(qs ? `/catalogo/generar-link?${qs}` : '/catalogo/generar-link')
  }

  const app: AppCatalogo = {
    contexto,
    vendedor: props.vendedor ?? null,
    conPrecioEmbajador: conEmb,
    mayorista: props.mayorista ?? null,
    puedeLink: props.puedeLink && contexto === 'backoffice',
    config,
    productos,
    categorias,
    materiales,
    kilatajes,
    precioMin,
    precioMax,

    view: estado.view,
    mode,
    setMode: (m) => {
      if (props.mayorista) return
      setModeState(m)
      // La cookie define qué opción viene marcada en el checkout y el precio que se cobra.
      void fetch('/carrito/modo', { method: 'POST', body: new URLSearchParams({ modo: m }) })
    },
    query: estado.query,
    setQuery: (q) => {
      setVisible(PAGE_SIZE)
      actualizar({ query: q })
    },
    cat: estado.cat,
    setCat: (id) => {
      setVisible(PAGE_SIZE)
      actualizar({ cat: id, view: 'category' }, true)
    },
    filters: estado.filters,
    setFilters: (f) => {
      setVisible(PAGE_SIZE)
      actualizar({ filters: f })
    },
    sort: estado.sort,
    setSort: (s) => actualizar({ sort: s }),
    cols,
    setCols,
    visible,
    setVisible,

    favs,
    toggleFav: (id) =>
      setFavs((f) => {
        const sig = f.includes(id) ? f.filter((x) => x !== id) : [...f, id]
        try {
          localStorage.setItem(claveFavs, JSON.stringify(sig))
        } catch {}
        return sig
      }),

    lines,
    cartCount,
    cartTotal,
    cartGain,
    cartBusy,

    goHome: () => {
      setOverlay(null)
      actualizar({ view: 'home', cat: 'all', query: '', filters: FILTROS_VACIOS, sort: 'new' }, true)
      scrollTop()
    },
    goCategory,
    goOffers: () => {
      setVisible(PAGE_SIZE)
      setOverlay(null)
      actualizar({ view: 'category', cat: 'all', sort: 'off' }, true)
      scrollTop()
    },
    clearFilters: () => {
      setVisible(PAGE_SIZE)
      actualizar({ filters: FILTROS_VACIOS, query: '' })
    },

    overlay,
    setOverlay,
    closeOverlay: () => setOverlay(null),
    openQuick: (id) => setOverlay({ type: 'quick', id }),
    openLink,
    runCta: (cta: Cta) => {
      if (cta.tipo === 'ofertas') app.goOffers()
      else if (cta.tipo === 'generar_link') openLink()
      else if (cta.tipo === 'categoria' && cta.valor) {
        const id = slug(cta.valor)
        goCategory(categorias.some((c) => c.id === id) ? id : 'all')
      } else if (cta.tipo === 'url' && cta.valor) {
        if (/^https?:\/\//i.test(cta.valor)) window.open(cta.valor, '_blank', 'noopener')
        else router.push(cta.valor)
      } else goCategory('all')
    },

    addToCart: (id, qty) => {
      const p = porId.get(id)
      startCart(async () => {
        const r = await acciones.agregar(id, qty)
        resultadoCarrito(r, `${p?.nombre ?? 'La pieza'} se agregó al carrito`)
      })
    },
    setQty: (id, qty) => {
      const actual = lineas.find((l) => l.producto_id === id)?.cantidad ?? 0
      if (qty === actual) return
      startCart(async () => resultadoCarrito(await acciones.cambiar(id, actual, qty)))
    },
    removeLine: (id) => startCart(async () => resultadoCarrito(await acciones.quitar(id))),
    checkout: () => {
      setOverlay(null)
      router.push(props.rutaCheckout)
    },

    unitPrice,
    gain,
    categoriaNombre: (id) => categorias.find((c) => c.id === id)?.nombre ?? 'Todo el catálogo',
    rutaFicha: (id) => `${props.rutaFicha}/${id}`,
  }

  return (
    <div className={`cw ${jakarta.className}`} style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: `${jakarta.style.fontFamily}, system-ui, -apple-system, sans-serif` }}>
      <style>{GLOBAL_CSS}</style>
      <AnnouncementBar anuncios={config.anuncios} />
      <Header app={app} />

      {estado.view === 'home' ? <HomeView app={app} /> : <CategoryView app={app} />}

      <Footer app={app} />

      {toast && (
        <Toast
          text={toast.text}
          error={toast.error}
          onAction={
            toast.cart
              ? () => {
                  setToast(null)
                  setOverlay({ type: 'cart' })
                }
              : undefined
          }
        />
      )}
      {overlay?.type === 'news' && <NewsModal app={app} startIndex={overlay.index} />}
      {overlay?.type === 'quick' && <QuickViewModal key={overlay.id} app={app} productId={overlay.id} />}
      {overlay?.type === 'cart' && <CartDrawer app={app} />}
    </div>
  )
}
