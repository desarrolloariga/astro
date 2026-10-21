'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { adaptarLinea } from '@/lib/catalogo-movil/datos'
import { filtrarProductos } from '@/lib/catalogo-movil/filtrar'
import {
  FILTROS_INICIALES,
  type Filtros,
  type InfoCatalogo,
  type LineaCarrito,
  type Pantalla,
  type Producto,
  type RangoPrecio,
} from '@/lib/catalogo-movil/tipos'
import {
  agregarMovil,
  cambiarCantidadMovil,
  confirmarMovil,
  quitarMovil,
  verCarritoMovil,
  type ResultadoCarrito,
} from '@/app/(publico)/c/[token]/acciones-movil'
import { TOAST_MS } from './tokens'

type Toast = { texto: string; tipo: 'ok' | 'error' }
export type MetodoPago = 'transferencia' | 'deposito'

type Estado = {
  screen: Pantalla
  history: Pantalla[]
  query: string
  filtros: Filtros
  borrador: Filtros
  hojaAbierta: boolean
  seleccionado: number | null
  cantidad: number
  favs: number[]
  recientes: string[]
  metodoPago: MetodoPago
  toast: Toast | null
  lineas: LineaCarrito[]
  /** Momento (ms) en que se leyeron las líneas: base del contador de apartado. */
  lineasEn: number
  ocupado: boolean
  ventaId: number | null
  /** Piezas únicas ya compradas en esta visita: se ocultan del catálogo. */
  vendidos: number[]
}

type Accion =
  | { type: 'go'; to: Pantalla }
  | { type: 'tab'; to: Pantalla }
  | { type: 'back' }
  | { type: 'detalle'; id: number }
  | { type: 'categoria'; cat: string }
  | { type: 'query'; q: string }
  | { type: 'filtros'; patch: Partial<Filtros> }
  | { type: 'limpiar' }
  | { type: 'abrirHoja' }
  | { type: 'borrador'; f: Filtros }
  | { type: 'aplicarHoja' }
  | { type: 'cerrarHoja' }
  | { type: 'cantidad'; n: number }
  | { type: 'fav'; id: number }
  | { type: 'cargarLocal'; favs: number[]; recientes: string[] }
  | { type: 'reciente'; q: string }
  | { type: 'metodo'; m: MetodoPago }
  | { type: 'toast'; t: Toast | null }
  | { type: 'lineas'; lineas: LineaCarrito[] }
  | { type: 'ocupado'; v: boolean }
  | { type: 'exito'; ventaId: number }

function reducer(s: Estado, a: Accion): Estado {
  switch (a.type) {
    case 'go':
      if (a.to === s.screen) return s
      return { ...s, history: [...s.history, s.screen], screen: a.to, hojaAbierta: false }
    case 'tab':
      return { ...s, screen: a.to, history: a.to === 'home' ? [] : ['home'], hojaAbierta: false }
    case 'back': {
      const h = [...s.history]
      const prev = h.pop() ?? 'home'
      return { ...s, history: h, screen: prev }
    }
    case 'detalle':
      return {
        ...s,
        seleccionado: a.id,
        cantidad: 1,
        history: s.screen !== 'detail' ? [...s.history, s.screen] : s.history,
        screen: 'detail',
      }
    case 'categoria':
      return { ...s, filtros: { ...s.filtros, cat: a.cat }, screen: 'home', history: [], hojaAbierta: false }
    case 'query':
      return { ...s, query: a.q }
    case 'filtros':
      return { ...s, filtros: { ...s.filtros, ...a.patch } }
    case 'limpiar':
      return { ...s, query: '', filtros: FILTROS_INICIALES }
    case 'abrirHoja':
      return { ...s, borrador: s.filtros, hojaAbierta: true }
    case 'borrador':
      return { ...s, borrador: a.f }
    case 'aplicarHoja':
      return { ...s, filtros: s.borrador, hojaAbierta: false }
    case 'cerrarHoja':
      return { ...s, hojaAbierta: false }
    case 'cantidad':
      return { ...s, cantidad: a.n }
    case 'fav':
      return { ...s, favs: s.favs.includes(a.id) ? s.favs.filter((x) => x !== a.id) : [...s.favs, a.id] }
    case 'cargarLocal':
      return { ...s, favs: a.favs, recientes: a.recientes }
    case 'reciente': {
      const q = a.q.trim()
      if (!q) return s
      return { ...s, recientes: [q, ...s.recientes.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 6) }
    }
    case 'metodo':
      return { ...s, metodoPago: a.m }
    case 'toast':
      return { ...s, toast: a.t }
    case 'lineas':
      return { ...s, lineas: a.lineas, lineasEn: Date.now() }
    case 'ocupado':
      return { ...s, ocupado: a.v }
    case 'exito':
      return {
        ...s,
        lineas: [],
        screen: 'success',
        history: [],
        ventaId: a.ventaId,
        vendidos: [...s.vendidos, ...s.lineas.filter((l) => l.modo === 'pieza_unica').map((l) => l.producto_id)],
      }
  }
}

export type Chip = { key: string; label: string; remove: () => void }

type Contexto = {
  estado: Estado
  info: InfoCatalogo
  productos: Producto[]
  rangos: RangoPrecio[]
  resultados: Producto[]
  chips: Chip[]
  cartCount: number
  subtotal: number
  producto: (id: number | null) => Producto | null
  enCarrito: (id: number) => LineaCarrito | undefined
  go: (to: Pantalla) => void
  tab: (to: Pantalla) => void
  back: () => void
  openDetail: (id: number) => void
  goCategory: (cat: string) => void
  setQuery: (q: string) => void
  patchFilters: (patch: Partial<Filtros>) => void
  clearAll: () => void
  openSheet: () => void
  setDraft: (f: Filtros) => void
  applySheet: () => void
  closeSheet: () => void
  setQty: (n: number) => void
  toggleFav: (id: number) => void
  setPayMethod: (m: MetodoPago) => void
  addToCart: (id: number, n?: number) => Promise<void>
  changeQty: (id: number, delta: number) => Promise<void>
  removeLine: (id: number) => Promise<void>
  refreshCart: () => Promise<void>
  placeOrder: (formData: FormData) => Promise<string | null>
}

const Ctx = createContext<Contexto | null>(null)

export function useCatalogo() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useCatalogo fuera de CatalogoProvider')
  return c
}

function leerLocal<T>(clave: string, defecto: T): T {
  try {
    const v = window.localStorage.getItem(clave)
    return v ? (JSON.parse(v) as T) : defecto
  } catch {
    return defecto
  }
}

function guardarLocal(clave: string, valor: unknown) {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    // modo privado o almacenamiento bloqueado: se sigue sin persistir
  }
}

export function CatalogoProvider({
  info,
  productos,
  rangos,
  lineasIniciales,
  pantallaInicial = 'home',
  productoInicial = null,
  children,
}: {
  info: InfoCatalogo
  productos: Producto[]
  rangos: RangoPrecio[]
  lineasIniciales: LineaCarrito[]
  pantallaInicial?: Pantalla
  productoInicial?: number | null
  children: ReactNode
}) {
  const [estado, dispatch] = useReducer(reducer, null, () => ({
    screen: pantallaInicial,
    history: (pantallaInicial === 'home' ? [] : pantallaInicial === 'checkout' ? ['home', 'cart'] : ['home']) as Pantalla[],
    query: '',
    filtros: FILTROS_INICIALES,
    borrador: FILTROS_INICIALES,
    hojaAbierta: false,
    seleccionado: productoInicial,
    cantidad: 1,
    favs: [],
    recientes: [],
    metodoPago: 'transferencia' as MetodoPago,
    toast: null,
    lineas: lineasIniciales,
    lineasEn: Date.now(),
    ocupado: false,
    ventaId: null,
    vendidos: [],
  }))

  // Favoritos y búsquedas recientes: por enlace, en el navegador.
  const claveFavs = `astro_favs_${info.token}`
  const claveRecientes = `astro_recientes_${info.token}`
  const cargado = useRef(false)
  useEffect(() => {
    dispatch({ type: 'cargarLocal', favs: leerLocal<number[]>(claveFavs, []), recientes: leerLocal<string[]>(claveRecientes, []) })
    cargado.current = true
  }, [claveFavs, claveRecientes])
  useEffect(() => {
    if (cargado.current) guardarLocal(claveFavs, estado.favs)
  }, [claveFavs, estado.favs])
  useEffect(() => {
    if (cargado.current) guardarLocal(claveRecientes, estado.recientes)
  }, [claveRecientes, estado.recientes])

  useEffect(() => {
    if (!estado.toast) return
    const t = setTimeout(() => dispatch({ type: 'toast', t: null }), TOAST_MS)
    return () => clearTimeout(t)
  }, [estado.toast])

  const visibles = useMemo(
    () => (estado.vendidos.length ? productos.filter((p) => !estado.vendidos.includes(p.id)) : productos),
    [productos, estado.vendidos],
  )
  const porId = useMemo(() => new Map(visibles.map((p) => [p.id, p])), [visibles])

  const aplicarResultado = useCallback((r: ResultadoCarrito, mensajeOk?: string) => {
    dispatch({ type: 'lineas', lineas: r.items.map(adaptarLinea) })
    if (!r.ok) dispatch({ type: 'toast', t: { texto: r.error ?? 'No se pudo actualizar el carrito', tipo: 'error' } })
    else if (mensajeOk) dispatch({ type: 'toast', t: { texto: mensajeOk, tipo: 'ok' } })
  }, [])

  const conOcupado = useCallback(async <R,>(fn: () => Promise<R>) => {
    dispatch({ type: 'ocupado', v: true })
    try {
      return await fn()
    } finally {
      dispatch({ type: 'ocupado', v: false })
    }
  }, [])

  const valor = useMemo<Contexto>(() => {
    const resultados = filtrarProductos(visibles, estado.filtros, estado.query, rangos)
    const cartCount = estado.lineas.reduce((a, l) => a + l.cantidad, 0)
    const subtotal = estado.lineas.reduce((a, l) => a + l.precio * l.cantidad, 0)
    const patchFilters = (patch: Partial<Filtros>) => dispatch({ type: 'filtros', patch })

    const chips: Chip[] = []
    const f = estado.filtros
    if (f.cat !== 'all') chips.push({ key: 'cat', label: f.cat, remove: () => patchFilters({ cat: 'all' }) })
    if (f.precio !== 'all')
      chips.push({
        key: 'precio',
        label: rangos.find((r) => r.id === f.precio)?.label ?? 'Precio',
        remove: () => patchFilters({ precio: 'all' }),
      })
    if (f.material !== 'all') chips.push({ key: 'material', label: f.material, remove: () => patchFilters({ material: 'all' }) })
    if (f.kilataje !== 'all') chips.push({ key: 'kilataje', label: f.kilataje, remove: () => patchFilters({ kilataje: 'all' }) })

    // Una pieza que el cliente ya apartó no viene en el catálogo (queda
    // retenida); se arma desde la línea del carrito para poder abrirla.
    const producto = (id: number | null): Producto | null => {
      if (id == null) return null
      const p = porId.get(id)
      if (p) return p
      const l = estado.lineas.find((x) => x.producto_id === id)
      if (!l) return null
      return {
        id: l.producto_id,
        codigo: l.codigo,
        nombre: l.nombre,
        descripcion: null,
        categoria: null,
        material: null,
        peso: null,
        kilataje: null,
        piedras: null,
        precio: l.precio,
        imagenes: l.imagen ? [l.imagen] : [],
        modo: l.modo,
        stock: l.stock,
        disponible: true,
      }
    }

    return {
      estado,
      info,
      productos: visibles,
      rangos,
      resultados,
      chips,
      cartCount,
      subtotal,
      producto,
      enCarrito: (id) => estado.lineas.find((l) => l.producto_id === id),
      go: (to) => dispatch({ type: 'go', to }),
      tab: (to) => dispatch({ type: 'tab', to }),
      back: () => dispatch({ type: 'back' }),
      openDetail: (id) => {
        if (estado.screen === 'search' && estado.query.trim()) dispatch({ type: 'reciente', q: estado.query })
        dispatch({ type: 'detalle', id })
      },
      goCategory: (cat) => dispatch({ type: 'categoria', cat }),
      setQuery: (q) => dispatch({ type: 'query', q }),
      patchFilters,
      clearAll: () => dispatch({ type: 'limpiar' }),
      openSheet: () => dispatch({ type: 'abrirHoja' }),
      setDraft: (fl) => dispatch({ type: 'borrador', f: fl }),
      applySheet: () => dispatch({ type: 'aplicarHoja' }),
      closeSheet: () => dispatch({ type: 'cerrarHoja' }),
      setQty: (n) => dispatch({ type: 'cantidad', n }),
      toggleFav: (id) => dispatch({ type: 'fav', id }),
      setPayMethod: (m) => dispatch({ type: 'metodo', m }),
      addToCart: async (id, n = 1) => {
        if (estado.ocupado) return
        const nombre = producto(id)?.nombre ?? 'Pieza'
        const r = await conOcupado(() => agregarMovil(info.token, id, n))
        aplicarResultado(r, `${nombre} agregado`)
      },
      changeQty: async (id, delta) => {
        const l = estado.lineas.find((x) => x.producto_id === id)
        if (!l || estado.ocupado) return
        const nueva = Math.max(1, l.cantidad + delta)
        if (nueva === l.cantidad) return
        const r = await conOcupado(() => cambiarCantidadMovil(info.token, id, l.cantidad, nueva))
        aplicarResultado(r)
      },
      removeLine: async (id) => {
        if (estado.ocupado) return
        const r = await conOcupado(() => quitarMovil(info.token, id))
        aplicarResultado(r)
      },
      refreshCart: async () => {
        const r = await verCarritoMovil(info.token)
        aplicarResultado(r)
      },
      placeOrder: async (formData) => {
        formData.set('token', info.token)
        formData.set('metodo_pago', estado.metodoPago)
        const r = await conOcupado(() => confirmarMovil(formData))
        if (r.ok) {
          dispatch({ type: 'exito', ventaId: r.ventaId })
          return null
        }
        return r.error
      },
    }
  }, [estado, info, visibles, rangos, porId, aplicarResultado, conOcupado])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}
