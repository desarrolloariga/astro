'use client'

import { Plus_Jakarta_Sans } from 'next/font/google'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { Contexto, LineaWeb, ModoWeb, ResultadoCarritoWeb } from '@/lib/catalogo-web/tipos'
import type { DatosFicha, ProductoFicha } from '@/lib/producto-detalle/datos'
import {
  COOKIE_ENTREGA,
  ahoraGuatemala,
  diasProgramados,
  normalizarEleccion,
  serializarEleccion,
  textoEtaCorto,
  type EleccionEntrega,
} from '@/lib/entrega'
import { calcularEnvio, type TipoCompraEnvio } from '@/lib/envio'
import { QtyStepper, SummaryRow, Toast, UnderlineTabs } from './basicos'
import { SellDrawer, ShareModal } from './overlays'
import { DeliverySection, DetailsTabs, Gallery, NetworkList, RelatedSection } from './secciones'
import { GLOBAL_CSS, Icon, T, TOAST_MS, btn, linkBtn, quetzal, sectionTop } from './tokens'

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap' })

export type AccionesCarritoFicha = {
  agregar: (productoId: number, cantidad: number) => Promise<ResultadoCarritoWeb>
}

type Props = {
  contexto: Contexto
  datos: DatosFicha
  conPrecioEmbajador: boolean
  modoInicial: ModoWeb
  lineasIniciales: LineaWeb[]
  /** Precio embajador de lo que ya está en el carrito (para el total del encabezado). */
  preciosEmbCarrito: Record<number, number>
  acciones: AccionesCarritoFicha
  entregaInicial: Partial<EleccionEntrega> | null
  rutaCatalogo: string
  rutaFicha: string
  rutaCarrito: string
  /** Link para compartir (backoffice: genera el link real del embajador). */
  obtenerLink: () => Promise<{ url?: string; error?: string }>
  urlPieza?: string
  puedeLink: boolean
  vender?: {
    puedeVender: boolean
    puedeSeparar: boolean
    puedeDescuento: boolean
    venderAccion: (formData: FormData) => void | Promise<void>
    separarAccion: (formData: FormData) => void | Promise<void>
  }
  aviso?: { text: string; error?: boolean } | null
}

type Overlay = 'share' | 'vender' | 'separar' | null

export function ProductoDetalle(props: Props) {
  const { contexto, datos, acciones } = props
  const { producto: p, entrega: config, politica, general } = datos
  const router = useRouter()

  const [mode, setModeState] = useState<ModoWeb>(props.modoInicial)
  const [fav, setFav] = useState(false)
  const [qty, setQty] = useState(1)
  const [skuCopied, setSkuCopied] = useState(false)
  const [netOpen, setNetOpen] = useState(false)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [lineas, setLineas] = useState<LineaWeb[]>(props.lineasIniciales)
  const [toast, setToast] = useState<{ text: string; error?: boolean; cart?: boolean } | null>(props.aviso ?? null)
  const [busy, startCart] = useTransition()
  const [query, setQuery] = useState('')
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skuT = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fecha/hora de Guatemala solo en el navegador (evita diferencias entre servidor y cliente).
  const [ahora, setAhora] = useState<ReturnType<typeof ahoraGuatemala> | null>(null)
  useEffect(() => {
    const tick = () => setAhora(ahoraGuatemala())
    tick()
    const t = setInterval(tick, 60_000)
    return () => clearInterval(t)
  }, [])
  const days = useMemo(() => (ahora ? diasProgramados(config, ahora) : []), [config, ahora])
  const [delivery, setDeliveryState] = useState<EleccionEntrega>(() => normalizarEleccion(props.entregaInicial, config, p.inmediata, []))
  useEffect(() => {
    if (days.length) setDeliveryState((d) => normalizarEleccion(d, config, p.inmediata, days))
  }, [days, config, p.inmediata])

  // La entrega elegida viaja al checkout en una cookie.
  const setDelivery = (e: EleccionEntrega) => {
    setDeliveryState(e)
    document.cookie = `${COOKIE_ENTREGA}=${serializarEleccion(e)}; path=/; max-age=${60 * 60 * 24}; samesite=lax`
  }

  const claveFavs = `cw-favs-${contexto}`
  useEffect(() => {
    try {
      const guardados = JSON.parse(localStorage.getItem(claveFavs) ?? '[]')
      if (Array.isArray(guardados)) setFav(guardados.includes(p.id))
    } catch {}
  }, [claveFavs, p.id])

  useEffect(() => {
    if (props.aviso) toastT.current = setTimeout(() => setToast(null), TOAST_MS * 2)
    return () => {
      if (toastT.current) clearTimeout(toastT.current)
      if (skuT.current) clearTimeout(skuT.current)
    }
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showToast = (text: string, opciones: { error?: boolean; cart?: boolean } = {}) => {
    setToast({ text, ...opciones })
    if (toastT.current) clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(null), TOAST_MS)
  }

  /* ---------- Precios ---------- */
  const conEmb = props.conPrecioEmbajador && contexto === 'backoffice'
  const precio = useCallback(
    (x: ProductoFicha | { pub: number; emb: number | null }) => (mode === 'mi' && conEmb && x.emb != null ? x.emb : x.pub),
    [mode, conEmb],
  )
  const ganancia = useCallback((x: ProductoFicha) => (conEmb && mode === 'cliente' && x.emb != null ? Math.max(0, x.pub - x.emb) : null), [conEmb, mode])
  const me = mode === 'mi'
  const tieneEmb = conEmb && p.emb != null
  const unit = precio(p)
  const difEmb = tieneEmb ? Math.max(0, p.pub - (p.emb as number)) : 0
  const lineTotal = unit * qty
  const gain = difEmb * qty

  /* ---------- Carrito ---------- */
  const porId = useMemo(() => new Map([p, ...datos.relacionados].map((x) => [x.id, x])), [p, datos.relacionados])
  const precioLinea = (l: LineaWeb) => {
    const emb = porId.get(l.producto_id)?.emb ?? props.preciosEmbCarrito[l.producto_id] ?? null
    return mode === 'mi' && conEmb && emb != null ? emb : l.precio
  }
  const cartCount = lineas.reduce((a, l) => a + l.cantidad, 0)
  const cartTotal = lineas.reduce((a, l) => a + precioLinea(l) * l.cantidad, 0)
  const enCarrito = (id: number) => (porId.get(id)?.modo ?? 'pieza_unica') === 'pieza_unica' && lineas.some((l) => l.producto_id === id)
  const principalEnCarrito = p.modo === 'pieza_unica' && lineas.some((l) => l.producto_id === p.id)

  /* ---------- Entrega ---------- */
  const isHome = delivery.metodo === 'domicilio'
  const sched = delivery.tipo === 'programada'
  const tipoEnvio: TipoCompraEnvio = contexto === 'publico' ? 'publico' : me ? 'propio' : 'backoffice_cliente'
  // El envío se calcula sobre todo el pedido (lo que ya está en el carrito + esta pieza).
  const envioDomicilio = calcularEnvio(politica, cartTotal + (principalEnCarrito ? 0 : lineTotal), tipoEnvio)
  const shipCost = isHome ? envioDomicilio : 0
  const etaShort = ahora ? textoEtaCorto(delivery, config, ahora) : ''

  const maxQty = p.modo === 'pieza_unica' ? Math.min(1, p.stock) : Math.max(1, p.stock)
  const agotado = p.stock === 0

  const agregar = (id: number, cantidad: number, etiqueta: string) =>
    startCart(async () => {
      const r = await acciones.agregar(id, cantidad)
      setLineas(r.items)
      if (!r.ok) showToast(r.error ?? 'No se pudo agregar al carrito', { error: true })
      else showToast(etiqueta, { cart: true })
      if (contexto === 'backoffice') router.refresh()
    })

  const setMode = (m: ModoWeb) => {
    setModeState(m)
    void fetch('/carrito/modo', { method: 'POST', body: new URLSearchParams({ modo: m }) })
  }

  const copySku = async () => {
    try {
      await navigator.clipboard?.writeText(p.codigo)
    } catch {}
    setSkuCopied(true)
    if (skuT.current) clearTimeout(skuT.current)
    skuT.current = setTimeout(() => setSkuCopied(false), 1600)
  }

  const toggleFav = () => {
    const sig = !fav
    setFav(sig)
    try {
      const guardados: number[] = JSON.parse(localStorage.getItem(claveFavs) ?? '[]')
      const lista = Array.isArray(guardados) ? guardados.filter((x) => x !== p.id) : []
      localStorage.setItem(claveFavs, JSON.stringify(sig ? [...lista, p.id] : lista))
    } catch {}
    showToast(sig ? 'Guardado en favoritos' : 'Se quitó de favoritos')
  }

  const buscar = () => {
    const q = query.trim()
    router.push(q ? `${props.rutaCatalogo}?cat=todo&q=${encodeURIComponent(q)}` : props.rutaCatalogo)
  }

  const badge = p.was ? `-${Math.round(((p.was - p.pub) / p.was) * 100)}%` : null
  const disponibilidad = agotado
    ? p.proximamente
      ? 'Próximamente'
      : 'Sin existencias'
    : p.ubicacion
      ? `Disponible en ${p.ubicacion}`
      : 'Disponible en la red'
  const v = props.vender
  const puedeVender = contexto === 'backoffice' && v?.puedeVender && !agotado
  const puedeSeparar = contexto === 'backoffice' && v?.puedeSeparar && !agotado && p.modo === 'pieza_unica'

  return (
    <div className={`pd ${jakarta.className}`} style={{ minHeight: '100vh', background: T.bg, color: T.ink, fontFamily: `${jakarta.style.fontFamily}, system-ui, -apple-system, sans-serif` }}>
      <style>{GLOBAL_CSS}</style>

      {/* Encabezado */}
      <header style={{ borderBottom: `1px solid ${T.line}` }}>
        <div
          className="pd-header-in"
          style={{
            maxWidth: T.maxW, margin: '0 auto', padding: '16px 32px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px 28px', boxSizing: 'border-box',
          }}
        >
          <Link href={props.rutaCatalogo} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: T.ink }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: T.navy, color: T.gold, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="gem" size={19} />
            </span>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{general.marca}</span>
          </Link>
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              buscar()
            }}
            style={{ flex: '1 1 260px', maxWidth: 520 }}
          >
            <label style={{ height: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', background: T.soft, borderRadius: 999, color: T.muted }}>
              <Icon name="search" size={18} stroke={2} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar en el catálogo"
                aria-label="Buscar en el catálogo"
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 16, color: T.ink }}
              />
            </label>
          </form>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {props.puedeLink && (
              <button
                type="button"
                onClick={() => setOverlay('share')}
                style={{ ...btn, height: 44, padding: '0 14px', gap: 8, borderRadius: 999, color: T.ink, fontSize: 14, fontWeight: 600 }}
              >
                <Icon name="link" size={18} /> Generar link
              </button>
            )}
            <Link
              href={props.rutaCarrito}
              aria-label={`Carrito, ${cartCount} piezas`}
              style={{ ...btn, height: 44, padding: '0 16px', gap: 8, borderRadius: 999, background: T.blueSoft, color: T.navy, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}
            >
              <Icon name="cart" size={19} /> {quetzal(cartTotal)}
              {cartCount > 0 && (
                <span
                  style={{
                    minWidth: 20, height: 20, padding: '0 6px', boxSizing: 'border-box', borderRadius: 10, background: T.blue, color: '#fff',
                    fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {cartCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

      <main
        className="pd-main"
        style={{ maxWidth: T.maxW, margin: '0 auto', padding: '20px 32px 0', display: 'flex', flexDirection: 'column', gap: 72, boxSizing: 'border-box' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <nav aria-label="Ruta" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.muted, flexWrap: 'wrap' }}>
            <Link href={props.rutaCatalogo} style={{ color: T.muted, textDecoration: 'none' }}>
              Inicio
            </Link>
            <span aria-hidden="true">›</span>
            <Link href={`${props.rutaCatalogo}?cat=${p.catId}`} style={{ color: T.muted, textDecoration: 'none' }}>
              {p.categoria}
            </Link>
            <span aria-hidden="true">›</span>
            <span aria-current="page" style={{ color: T.ink }}>
              {p.nombre}
            </span>
          </nav>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 56, alignItems: 'flex-start' }}>
            <Gallery product={p} fav={fav} onToggleFav={toggleFav} badge={badge} />

            <section aria-label="Información del producto" style={{ flex: '1 1 440px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>
              {/* Encabezado del producto */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.muted }}>
                  <span style={{ width: 7, height: 7, borderRadius: 4, background: agotado ? T.danger : T.greenLive }} />
                  {disponibilidad}
                </span>
                <h1 className="pd-title" style={{ margin: 0, fontSize: 34, lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.02em' }}>
                  {p.nombre}
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.muted }}>
                  <span>SKU {p.codigo}</span>
                  <button
                    type="button"
                    onClick={copySku}
                    aria-label="Copiar SKU"
                    style={{ ...btn, height: 28, padding: '0 8px', gap: 4, borderRadius: 8, color: skuCopied ? T.green : T.blue, fontSize: 12, fontWeight: 600 }}
                  >
                    <Icon name={skuCopied ? 'check' : 'copy'} size={13} stroke={2} /> {skuCopied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>

              {/* Precio */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {contexto === 'backoffice' && (
                  <UnderlineTabs
                    label="Modo de compra"
                    value={mode}
                    onChange={setMode}
                    gap={22}
                    height={40}
                    fontSize={14}
                    tabs={[
                      { id: 'mi', label: 'Comprar para mí' },
                      { id: 'cliente', label: 'Para un cliente' },
                    ]}
                  />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 13, color: T.muted }}>
                    {contexto === 'publico'
                      ? 'Precio'
                      : tieneEmb
                        ? me
                          ? 'Tu precio de embajador'
                          : 'Precio público para tu cliente'
                        : me
                          ? 'Precio'
                          : 'Precio público para tu cliente'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                    <span className="pd-price" style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
                      {quetzal(unit)}
                    </span>
                    {tieneEmb && me ? (
                      <>
                        <span style={{ fontSize: 16, color: T.faint, textDecoration: 'line-through' }}>{quetzal(p.pub)}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: T.blue }}>Ahorras {quetzal(difEmb)}</span>
                      </>
                    ) : (
                      <>
                        {p.was != null && <span style={{ fontSize: 16, color: T.faint, textDecoration: 'line-through' }}>{quetzal(p.was)}</span>}
                        {tieneEmb ? (
                          <span style={{ fontSize: 14, fontWeight: 600, color: T.green }}>Ganas {quetzal(difEmb)}</span>
                        ) : (
                          p.was != null && <span style={{ fontSize: 14, fontWeight: 600, color: T.blue }}>Ahorras {quetzal(p.was - p.pub)}</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Resumen de entrega */}
              <div aria-live="polite" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 22px', fontSize: 14 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="bolt" size={17} color={sched ? T.blue : T.amber} /> {sched ? 'Entrega programada' : 'Entrega inmediata'}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: shipCost === 0 ? T.green : T.ink }}>
                  <Icon name="truck" size={17} />{' '}
                  {isHome ? (shipCost === 0 ? 'Domicilio gratis' : `Domicilio ${quetzal(shipCost)}`) : 'Recoger en CEDI sin costo'}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.muted }}>
                  <Icon name="box" size={17} /> {p.modo === 'pieza_unica' ? (agotado ? 'No disponible' : 'Pieza única') : `${p.stock} disponibles`}
                </span>
              </div>

              <DeliverySection product={p} config={config} d={delivery} setD={setDelivery} days={days} envio={envioDomicilio} ahora={ahora} />

              {/* Compra */}
              <div style={{ ...sectionTop, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {p.modo === 'por_cantidad' && <QtyStepper value={qty} onChange={setQty} max={maxQty} />}
                  {principalEnCarrito ? (
                    <Link
                      href={props.rutaCarrito}
                      style={{
                        ...btn, flex: '1 1 220px', height: 52, gap: 10, borderRadius: 999, background: T.blueSoft, color: T.navy, fontSize: 15, fontWeight: 600, textDecoration: 'none',
                      }}
                    >
                      <Icon name="check" size={18} stroke={2.2} /> Ya está en tu carrito · Ver carrito
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={agotado || busy}
                      onClick={() => agregar(p.id, qty, `${qty} ${qty === 1 ? 'pieza agregada' : 'piezas agregadas'} al carrito`)}
                      style={{
                        ...btn, flex: '1 1 220px', height: 52, gap: 10, borderRadius: 999, fontSize: 15, fontWeight: 600,
                        background: agotado ? T.input : T.blue, color: agotado ? T.muted : '#fff', opacity: busy ? 0.7 : 1,
                      }}
                    >
                      {agotado ? (p.proximamente ? 'Próximamente' : 'Sin existencias') : `Agregar al carrito · ${quetzal(lineTotal + shipCost)}`}
                    </button>
                  )}
                </div>
                {puedeVender && (
                  <button
                    type="button"
                    onClick={() => setOverlay('vender')}
                    style={{ ...btn, height: 52, borderRadius: 999, border: `1px solid ${T.btnLine}`, background: '#fff', color: T.navy, fontSize: 15, fontWeight: 600 }}
                  >
                    Vender directamente
                  </button>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                  <SummaryRow label={`${tieneEmb && me ? 'Precio embajador' : 'Precio público'} × ${qty}`} value={quetzal(lineTotal)} />
                  <SummaryRow
                    label={isHome ? 'Domicilio' : 'Recoger en CEDI'}
                    value={shipCost === 0 ? 'gratis' : quetzal(shipCost)}
                    color={shipCost === 0 ? T.green : undefined}
                  />
                  {tieneEmb && !me && <SummaryRow label="Tu ganancia" value={quetzal(gain)} color={T.green} />}
                </div>
                <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', paddingTop: 4 }}>
                  <button type="button" onClick={() => setOverlay('share')} style={linkBtn}>
                    <Icon name="share" size={16} /> Compartir pieza
                  </button>
                  <button type="button" onClick={() => setOverlay('share')} style={linkBtn}>
                    <Icon name="qr" size={16} /> Código QR
                  </button>
                  {puedeSeparar && (
                    <button type="button" onClick={() => setOverlay('separar')} style={linkBtn}>
                      <Icon name="bookmark" size={16} /> Separar para un cliente
                    </button>
                  )}
                  {contexto === 'backoffice' && (
                    <button type="button" onClick={() => setNetOpen(!netOpen)} aria-expanded={netOpen} style={linkBtn}>
                      Disponibilidad en la red
                      <Icon name="chevronDown" size={14} stroke={2} style={{ transform: `rotate(${netOpen ? 180 : 0}deg)`, transition: 'transform .2s' }} />
                    </button>
                  )}
                </div>
                {netOpen && <NetworkList red={datos.red} />}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 22px', fontSize: 13, color: T.muted }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="shield" size={15} /> Pieza original
                </span>
                {config.garantia && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="rotate" size={15} /> {config.garantia}
                  </span>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="truck" size={15} /> Envíos a todo el país
                </span>
              </div>
            </section>
          </div>
        </div>

        <DetailsTabs product={p} config={config} politica={politica} />
        <RelatedSection
          items={datos.relacionados}
          precio={precio}
          ganancia={ganancia}
          rutaFicha={(id) => `${props.rutaFicha}/${id}`}
          busy={busy}
          enCarrito={enCarrito}
          onAdd={(r) => agregar(r.id, 1, `${r.nombre} agregado al carrito`)}
        />
      </main>

      <footer style={{ marginTop: 88, borderTop: `1px solid ${T.line}` }}>
        <div
          className="pd-footer-in"
          style={{
            maxWidth: T.maxW, margin: '0 auto', padding: '28px 32px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, fontSize: 13,
            color: T.muted, boxSizing: 'border-box',
          }}
        >
          <span style={{ fontWeight: 700, color: T.ink }}>{general.marca}</span>
          <span>Catálogo en línea para embajadores y sus clientes.</span>
        </div>
      </footer>

      {toast && (
        <Toast
          text={toast.text}
          error={toast.error}
          action={
            toast.cart ? (
              <Link href={props.rutaCarrito} style={{ marginLeft: 6, color: '#9DB5F0', fontWeight: 700, textDecoration: 'none' }}>
                Ver carrito
              </Link>
            ) : undefined
          }
        />
      )}
      {overlay === 'share' && (
        <ShareModal
          nombre={p.nombre}
          codigo={p.codigo}
          obtenerUrl={props.obtenerLink}
          urlPieza={props.urlPieza}
          onClose={() => setOverlay(null)}
          onToast={(t, error) => showToast(t, { error })}
        />
      )}
      {(overlay === 'vender' || overlay === 'separar') && v && (
        <SellDrawer
          modo={overlay}
          productoId={p.id}
          nombre={p.nombre}
          qty={qty}
          etaShort={etaShort}
          precioPublico={p.pub}
          ganancia={tieneEmb ? difEmb : null}
          puedeDescuento={v.puedeDescuento}
          accion={overlay === 'vender' ? v.venderAccion : v.separarAccion}
          onClose={() => setOverlay(null)}
        />
      )}
    </div>
  )
}
