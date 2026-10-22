'use client'

import { ImagenProducto } from '@/components/app/imagen-producto'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { ProductoFicha, ExistenciaRed } from '@/lib/producto-detalle/datos'
import {
  horaLegible,
  textoEta,
  type ConfigEntrega,
  type DiaEntrega,
  type EleccionEntrega,
} from '@/lib/entrega'
import type { PoliticaEnvio } from '@/lib/envio'
import { ProductImage, RadioRow, Segmented, UnderlineTabs } from './basicos'
import { Icon, REL_CARD_W, REL_GAP, T, btn, h2, quetzal, sectionTop } from './tokens'

/* ---------------- Galería ---------------- */

export function Gallery({
  product,
  fav,
  onToggleFav,
  badge,
}: {
  product: ProductoFicha
  fav: boolean
  onToggleFav: () => void
  badge: string | null
}) {
  const [i, setI] = useState(0)
  const imagenes: (string | null)[] = product.imagenes.length ? product.imagenes : [null]
  const n = imagenes.length
  return (
    <section className="pd-gallery" aria-label="Galería" style={{ flex: '1 1 460px', minWidth: 0, display: 'flex', gap: 14, position: 'sticky', top: 16, alignSelf: 'flex-start' }}>
      {n > 1 && (
        <div className="pd-thumbs" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {imagenes.map((src, k) => (
            <button
              key={`${src}-${k}`}
              type="button"
              onClick={() => setI(k)}
              aria-label={`Ver imagen ${k + 1}`}
              aria-pressed={k === i}
              style={{
                ...btn, position: 'relative', flex: 'none', width: 64, height: 64, borderRadius: 14, overflow: 'hidden',
                border: `2px solid ${k === i ? T.blue : 'transparent'}`, background: T.tints[k % 4], opacity: k === i ? 1 : 0.75, color: T.iconBlue,
              }}
            >
              {src ? <ImagenProducto src={src} alt="" sizes="64px" /> : <Icon name="gem" size={26} stroke={1.2} />}
            </button>
          ))}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <ProductImage
          src={imagenes[i]}
          alt={`${product.nombre}, imagen ${i + 1} de ${n}`}
          size={200}
          stroke={0.6}
          radius={28}
          bg={T.tints[i % 4]}
          sizes="(max-width: 760px) 100vw, 560px"
          priority
          calidad="completa"
        />
        {badge && (
          <span style={{ position: 'absolute', left: 20, top: 20, padding: '5px 10px', borderRadius: 999, background: '#fff', color: T.ink, fontSize: 12, fontWeight: 600 }}>
            {badge}
          </span>
        )}
        <button
          type="button"
          onClick={onToggleFav}
          aria-pressed={fav}
          aria-label={fav ? 'Quitar de favoritos' : 'Guardar en favoritos'}
          style={{ ...btn, position: 'absolute', top: 14, right: 14, width: 44, height: 44, borderRadius: 22, background: '#fff' }}
        >
          <Icon name="heart" size={19} color={fav ? T.heart : T.ink} fill={fav ? T.heart : 'none'} />
        </button>
        {n > 1 && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <button
              type="button"
              onClick={() => setI((i + n - 1) % n)}
              aria-label="Imagen anterior"
              style={{ ...btn, width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.85)', color: T.ink }}
            >
              <Icon name="back" size={16} stroke={2} />
            </button>
            <div aria-hidden="true" style={{ display: 'flex', gap: 6 }}>
              {imagenes.map((_, k) => (
                <span key={k} style={{ width: k === i ? 18 : 6, height: 6, borderRadius: 3, background: k === i ? T.ink : T.radioOff, transition: 'width .25s' }} />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setI((i + 1) % n)}
              aria-label="Imagen siguiente"
              style={{ ...btn, width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.85)', color: T.ink }}
            >
              <Icon name="next" size={16} stroke={2} />
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

/* ---------------- Entrega ---------------- */

export function DeliverySection({
  product,
  config,
  d,
  setD,
  days,
  envio,
  ahora,
}: {
  product: ProductoFicha
  config: ConfigEntrega
  d: EleccionEntrega
  setD: (e: EleccionEntrega) => void
  days: DiaEntrega[]
  /** Costo del domicilio según la política vigente. */
  envio: number
  ahora: { fecha: string; minutos: number } | null
}) {
  const isHome = d.metodo === 'domicilio'
  const sched = d.tipo === 'programada'
  const lugar = product.ubicacion ?? 'el CEDI'
  const recogida = [config.cedi_direccion, config.cedi_horario ? `Horario ${config.cedi_horario}` : ''].filter(Boolean).join('. ')
  const corte = horaLegible(config.hora_corte)

  return (
    <div style={{ ...sectionTop, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>Entrega</span>
        <Segmented
          label="Forma de entrega"
          value={d.metodo}
          onChange={(metodo) => setD({ ...d, metodo })}
          options={[
            { id: 'domicilio', label: 'A domicilio' },
            { id: 'recoger', label: 'Recoger en CEDI' },
          ]}
        />
      </div>

      {isHome ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, color: T.muted }}>Envío a todo el país</span>
          <span style={{ fontSize: 14, color: T.muted }}>
            Domicilio <span style={{ fontWeight: 700, color: envio === 0 ? T.green : T.ink }}>{envio === 0 ? 'gratis' : quetzal(envio)}</span>
          </span>
        </div>
      ) : (
        <span style={{ fontSize: 14, lineHeight: 1.55, color: T.muted }}>
          Recoge sin costo en <span style={{ color: T.ink, fontWeight: 600 }}>{lugar}</span>
          {recogida ? `, ${recogida}` : ''}.
        </span>
      )}

      <div role="radiogroup" aria-label="Cuándo entregar" style={{ display: 'flex', flexDirection: 'column' }}>
        {product.inmediata && (
          <RadioRow
            checked={!sched}
            onSelect={() => setD({ ...d, tipo: 'inmediata', fecha: null, franja: null })}
            title="Entrega inmediata"
            subtitle={isHome ? `Llega hoy · confirma antes de las ${corte}` : 'Recoge hoy en CEDI'}
          />
        )}
        <RadioRow
          checked={sched}
          onSelect={() => setD({ ...d, tipo: 'programada', fecha: d.fecha ?? days[0]?.key ?? null, franja: d.franja ?? config.franjas[0]?.id ?? null })}
          title="Entrega programada"
          subtitle="Elige el día y la franja horaria"
        />
      </div>

      {sched && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 34, animation: 'pd-fade .2s' }}>
          <div role="radiogroup" aria-label="Día de entrega" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {days.map((dy) => {
              const on = d.fecha === dy.key
              return (
                <button
                  key={dy.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={dy.full}
                  onClick={() => setD({ ...d, fecha: dy.key })}
                  style={{ ...btn, flexDirection: 'column', gap: 2, width: 64, height: 64, borderRadius: 16, background: on ? T.navy : T.soft, color: on ? '#fff' : T.ink }}
                >
                  <span style={{ fontSize: 11, fontWeight: 500 }}>{dy.weekday}</span>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>{dy.day}</span>
                </button>
              )
            })}
          </div>
          <div role="radiogroup" aria-label="Franja horaria" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {config.franjas.map((s) => {
              const on = d.franja === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setD({ ...d, franja: s.id })}
                  style={{
                    ...btn, height: 40, padding: '0 16px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                    background: on ? T.blueSoft : T.soft, color: on ? T.navy : T.muted,
                  }}
                >
                  {s.etiqueta} · {s.inicio} – {s.fin}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div
        aria-live="polite"
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 14, background: T.greenSoft, color: T.green, fontSize: 14, fontWeight: 500 }}
      >
        <Icon name="clock" size={18} /> {ahora ? textoEta(d, config, ahora) : ' '}
      </div>
    </div>
  )
}

/* ---------------- Disponibilidad en la red ---------------- */

export function NetworkList({ red }: { red: ExistenciaRed[] }) {
  if (red.length === 0) {
    return <span style={{ fontSize: 14, color: T.muted, padding: '10px 0' }}>Sin existencias registradas en la red.</span>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', animation: 'pd-fade .2s' }}>
      {red.map((n) => (
        <div
          key={n.tienda}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `1px solid ${T.lineSoft}`, fontSize: 14 }}
        >
          <span>
            {n.tienda}{' '}
            <span style={{ color: T.muted }}>
              · {n.cantidad <= 0 ? 'sin existencias' : n.tipo === 'cedi' ? 'entrega inmediata' : 'entrega programada'}
            </span>
          </span>
          <span style={{ fontWeight: 600, color: n.cantidad > 0 ? T.ink : T.danger }}>{n.cantidad} u.</span>
        </div>
      ))}
    </div>
  )
}

/* ---------------- Pestañas de detalle ---------------- */

type PestanaDetalle = 'desc' | 'specs' | 'ship'

export function DetailsTabs({
  product,
  config,
  politica,
}: {
  product: ProductoFicha
  config: ConfigEntrega
  politica: PoliticaEnvio | null
}) {
  const [tab, setTab] = useState<PestanaDetalle>('desc')
  const highlights = [
    product.kilataje && { value: product.kilataje, label: 'Kilataje' },
    product.peso && { value: `${product.peso} g`, label: 'Peso' },
    product.material && { value: product.material, label: 'Material' },
    product.piedras && { value: product.piedras, label: 'Piedras' },
  ].filter(Boolean) as { value: string; label: string }[]
  const specs: [string, string][] = [
    ['Categoría', product.categoria],
    ...(product.material ? [['Material', product.material] as [string, string]] : []),
    ...(product.kilataje ? [['Kilataje', product.kilataje] as [string, string]] : []),
    ...(product.peso ? [['Peso', `${product.peso} g`] as [string, string]] : []),
    ...(product.piedras ? [['Piedras', product.piedras] as [string, string]] : []),
    ['Inventario', product.modo === 'pieza_unica' ? 'Pieza única' : 'Por cantidad'],
    ['SKU', product.codigo],
  ]
  const costo = !politica
    ? 'Se calcula al finalizar el pedido.'
    : `Domicilio ${Number(politica.tarifa) > 0 ? quetzal(Number(politica.tarifa)) : 'gratis'}${
        politica.envio_gratis_desde != null ? `, gratis en compras desde ${quetzal(Number(politica.envio_gratis_desde))}` : ''
      }. Recoger en CEDI no tiene costo.`

  return (
    <section aria-label="Detalles del producto" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <UnderlineTabs
        label="Detalles del producto"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'desc', label: 'Descripción' },
          { id: 'specs', label: 'Especificaciones' },
          { id: 'ship', label: 'Entrega y garantía' },
        ]}
      />
      <div role="tabpanel">
        {tab === 'desc' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 48, alignItems: 'flex-start' }}>
            <p style={{ flex: '2 1 420px', maxWidth: 640, margin: 0, fontSize: 16, lineHeight: 1.75, color: T.body, whiteSpace: 'pre-line' }}>
              {product.descripcion || 'Esta pieza aún no tiene descripción.'}
            </p>
            {highlights.length > 0 && (
              <div style={{ flex: '1 1 260px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '24px 32px' }}>
                {highlights.map((h) => (
                  <div key={h.label} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 26, fontWeight: 700, color: T.blue, overflowWrap: 'anywhere' }}>{h.value}</span>
                    <span style={{ fontSize: 13, color: T.muted }}>{h.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {tab === 'specs' && (
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: '0 56px' }}>
            {specs.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderBottom: `1px solid ${T.lineSoft}` }}>
                <dt style={{ fontSize: 14, color: T.muted }}>{k}</dt>
                <dd style={{ margin: 0, fontSize: 14, fontWeight: 600, textAlign: 'right' }}>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {tab === 'ship' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 32 }}>
            {[
              ['Entrega inmediata', `Para piezas con existencia en CEDI. Sale el mismo día si confirmas antes de las ${horaLegible(config.hora_corte)}.`],
              ['Entrega programada', 'Eliges el día y la franja horaria. Ideal para regalos o cuando tu cliente no está hoy.'],
              ['Costo de domicilio', costo],
              ['Cambios y garantía', [config.garantia, config.cambios].filter(Boolean).join(' ') || 'Consulta la política de cambios y garantía con tu asesor.'],
            ].map(([t, txt]) => (
              <div key={t} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{t}</span>
                <span style={{ fontSize: 14, lineHeight: 1.6, color: T.muted }}>{txt}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/* ---------------- Relacionados ---------------- */

export function RelatedSection({
  items,
  precio,
  ganancia,
  rutaFicha,
  onAdd,
  busy,
  enCarrito,
}: {
  items: ProductoFicha[]
  precio: (p: ProductoFicha) => number
  ganancia: (p: ProductoFicha) => number | null
  rutaFicha: (id: number) => string
  onAdd: (p: ProductoFicha) => void
  busy: boolean
  enCarrito: (id: number) => boolean
}) {
  const [idx, setIdx] = useState(0)
  const [porVista, setPorVista] = useState(4)
  const pista = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = pista.current
    if (!el) return
    const medir = () => setPorVista(Math.max(1, Math.floor((el.clientWidth + REL_GAP) / (REL_CARD_W + REL_GAP))))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  if (items.length === 0) return null
  const maxIdx = Math.max(0, items.length - porVista)
  const cur = Math.min(idx, maxIdx)
  const arrow = (dir: -1 | 1) => {
    const off = dir < 0 ? cur === 0 : cur === maxIdx
    return (
      <button
        type="button"
        onClick={() => setIdx(dir < 0 ? Math.max(0, cur - 1) : Math.min(maxIdx, cur + 1))}
        aria-label={dir < 0 ? 'Anteriores' : 'Siguientes'}
        disabled={off}
        style={{ ...btn, width: 40, height: 40, borderRadius: 20, border: `1px solid ${T.input}`, background: '#fff', color: T.ink, opacity: off ? 0.4 : 1 }}
      >
        <Icon name={dir < 0 ? 'back' : 'next'} size={16} stroke={2} />
      </button>
    )
  }
  return (
    <section aria-labelledby="pd-rel" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <h2 id="pd-rel" style={h2}>
          También te puede interesar
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {arrow(-1)}
          {arrow(1)}
        </div>
      </div>
      <div ref={pista} style={{ overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex', gap: REL_GAP, transition: 'transform .45s cubic-bezier(.2,.8,.2,1)',
            transform: `translateX(-${cur * (REL_CARD_W + REL_GAP)}px)`,
          }}
        >
          {items.map((r, i) => {
            const off = r.was ? Math.round(((r.was - r.pub) / r.was) * 100) : 0
            const gana = ganancia(r)
            const yaEsta = enCarrito(r.id)
            return (
              <article key={r.id} className="pd-rel" style={{ flex: 'none', width: REL_CARD_W, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="pd-rel-img" style={{ position: 'relative' }}>
                  <Link href={rutaFicha(r.id)} aria-label={r.nombre} style={{ display: 'block' }}>
                    <ProductImage src={r.imagenes[0]} alt={r.nombre} size={76} height={240} bg={T.tints[i % 4]} sizes="256px" />
                  </Link>
                  {off > 0 && (
                    <span style={{ position: 'absolute', top: 14, left: 14, padding: '4px 10px', borderRadius: 999, background: '#fff', fontSize: 12, fontWeight: 600 }}>
                      -{off}%
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onAdd(r)}
                    disabled={busy || yaEsta}
                    aria-label={yaEsta ? `${r.nombre} ya está en tu carrito` : `Agregar ${r.nombre} al carrito`}
                    style={{
                      ...btn, position: 'absolute', right: 12, bottom: 12, width: 44, height: 44, borderRadius: 22, background: '#fff',
                      color: yaEsta ? T.green : T.blue, boxShadow: '0 4px 14px rgba(20,33,61,0.10)',
                    }}
                  >
                    <Icon name={yaEsta ? 'check' : 'plus'} size={18} stroke={2.2} />
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 4px' }}>
                  <Link href={rutaFicha(r.id)} style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.35, color: T.ink, textDecoration: 'none' }}>
                    {r.nombre}
                  </Link>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>
                    {quetzal(precio(r))}
                    {gana != null && <span style={{ fontSize: 13, fontWeight: 400, color: T.muted }}> · ganas {quetzal(gana)}</span>}
                  </span>
                  <span style={{ fontSize: 13, color: r.inmediata ? T.green : T.muted }}>
                    {r.inmediata ? 'Entrega inmediata' : 'Entrega programada'}
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
