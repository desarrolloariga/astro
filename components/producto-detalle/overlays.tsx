'use client'

import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { CloseButton, Fondo, Segmented, SummaryRow, useModal } from './basicos'
import { Icon, T, btn, h2, linkBtn, quetzal, sectionTop } from './tokens'

/* ---------------- Compartir + QR ---------------- */

type Destino = 'cliente' | 'pieza'

export function ShareModal({
  nombre,
  codigo,
  obtenerUrl,
  urlPieza,
  onClose,
  onToast,
}: {
  nombre: string
  codigo: string
  /** Link para el cliente (el del embajador). Puede generarse al abrir. */
  obtenerUrl: () => Promise<{ url?: string; error?: string }>
  /** QR para pegar en la pieza física (abre la ficha interna). Solo backoffice. */
  urlPieza?: string
  onClose: () => void
  onToast: (t: string, error?: boolean) => void
}) {
  const caja = useModal(onClose)
  const [destino, setDestino] = useState<Destino>('cliente')
  const [urlCliente, setUrlCliente] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pedido = useRef(false)

  useEffect(() => {
    if (pedido.current) return
    pedido.current = true
    obtenerUrl().then((r) => {
      if (r.url) setUrlCliente(r.url)
      else setError(r.error ?? 'No se pudo generar el link')
    })
  }, [obtenerUrl])
  useEffect(() => () => {
    if (t.current) clearTimeout(t.current)
  }, [])

  const url = destino === 'pieza' && urlPieza ? urlPieza : urlCliente
  useEffect(() => {
    if (!url) return
    let vivo = true
    QRCode.toDataURL(url, { width: 480, margin: 1, color: { dark: T.ink, light: '#FFFFFF' } }).then((d) => vivo && setQr(d))
    return () => {
      vivo = false
    }
  }, [url])

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard?.writeText(url)
    } catch {}
    setCopied(true)
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(() => setCopied(false), 2000)
  }
  const shareLink = { ...linkBtn, height: 40, textDecoration: 'none' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box' }}>
      <Fondo onClose={onClose} />
      <div
        ref={caja as React.RefObject<HTMLDivElement>}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Compartir pieza"
        style={{
          position: 'relative', width: '100%', maxWidth: 480, maxHeight: 'calc(100vh - 48px)', overflow: 'auto', background: '#fff', borderRadius: 28, padding: 32,
          display: 'flex', flexDirection: 'column', gap: 22, boxSizing: 'border-box', boxShadow: '0 24px 60px rgba(20,33,61,0.22)', animation: 'pd-pop .22s ease-out', outline: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 style={{ ...h2, fontSize: 20 }}>Compartir esta pieza</h2>
            <span style={{ fontSize: 14, color: T.muted, lineHeight: 1.5 }}>
              {destino === 'pieza'
                ? 'Imprime este QR y pégalo en la pieza física: al escanearlo se abre su ficha en ASTRO.'
                : urlPieza
                  ? 'Tu cliente verá el precio público y el pedido quedará asociado a ti.'
                  : 'Comparte esta pieza con quien quieras.'}
            </span>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        {urlPieza && (
          <Segmented
            label="Qué QR mostrar"
            value={destino}
            onChange={setDestino}
            options={[
              { id: 'cliente', label: 'Link para tu cliente' },
              { id: 'pieza', label: 'QR de la pieza física' },
            ]}
          />
        )}

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div
            role="img"
            aria-label={url ? `Código QR de ${url}` : 'Generando código QR'}
            style={{ width: 168, height: 168, borderRadius: 20, background: T.soft, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.ink, overflow: 'hidden' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qr && url ? <img src={qr} alt="" width={152} height={152} /> : <Icon name="qr" size={110} stroke={1.3} color={T.radioOff} />}
          </div>
        </div>

        {error && destino === 'cliente' ? (
          <span style={{ fontSize: 14, color: T.danger, textAlign: 'center' }}>{error}</span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px 6px 16px', borderRadius: 999, background: T.soft }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {url ? url.replace(/^https?:\/\//, '') : 'Generando tu link…'}
            </span>
            <button
              type="button"
              onClick={copy}
              disabled={!url}
              style={{
                ...btn, height: 40, padding: '0 16px', gap: 6, borderRadius: 999, background: copied ? T.greenLive : T.blue, color: '#fff',
                fontSize: 13, fontWeight: 600, opacity: url ? 1 : 0.5,
              }}
            >
              <Icon name={copied ? 'check' : 'copy'} size={15} stroke={2} /> {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 28, flexWrap: 'wrap' }}>
          {url && destino === 'cliente' && (
            <>
              <a href={`https://wa.me/?text=${encodeURIComponent(`${nombre}: ${url}`)}`} target="_blank" rel="noreferrer" style={shareLink}>
                WhatsApp
              </a>
              <a href={`mailto:?subject=${encodeURIComponent(nombre)}&body=${encodeURIComponent(url)}`} style={shareLink}>
                Correo
              </a>
            </>
          )}
          {qr && (
            <a
              href={qr}
              download={`qr-${destino === 'pieza' ? 'pieza' : 'link'}-${codigo}.png`}
              onClick={() => onToast('QR descargado')}
              style={shareLink}
            >
              Descargar QR
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------------- Vender directamente / Separar ---------------- */

export const METODOS_VENTA = [
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'deposito', label: 'Depósito' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'pasarela', label: 'Pasarela' },
] as const
type MetodoVenta = (typeof METODOS_VENTA)[number]['id']

function BotonEnviar({ texto, habilitado }: { texto: string; habilitado: boolean }) {
  const { pending } = useFormStatus()
  const on = habilitado && !pending
  return (
    <button
      type="submit"
      disabled={!on}
      style={{
        ...btn, width: '100%', height: 52, borderRadius: 999, background: on ? T.navy : T.input, color: on ? '#fff' : T.muted, fontSize: 15, fontWeight: 600,
      }}
    >
      {pending ? 'Registrando…' : texto}
    </button>
  )
}

export function SellDrawer({
  modo,
  productoId,
  nombre,
  qty,
  etaShort,
  precioPublico,
  ganancia,
  puedeDescuento,
  accion,
  onClose,
}: {
  modo: 'vender' | 'separar'
  productoId: number
  nombre: string
  qty: number
  etaShort: string
  precioPublico: number
  /** Ganancia por unidad (solo embajador). */
  ganancia: number | null
  puedeDescuento: boolean
  accion: (formData: FormData) => void | Promise<void>
  onClose: () => void
}) {
  const caja = useModal(onClose)
  const [form, setForm] = useState({ name: '', phone: '', pay: 'transferencia' as MetodoVenta, ref: '', monto: (precioPublico * qty).toFixed(2), desc: '' })
  const vender = modo === 'vender'
  const sub = precioPublico * qty
  const gain = ganancia != null ? ganancia * qty : null
  const canSubmit = Boolean(form.name.trim() && form.phone.trim() && (!vender || (form.pay && Number(form.monto) > 0)))
  const campo = { height: 46, padding: '0 14px', borderRadius: 12, border: `1px solid ${T.input}`, fontFamily: 'inherit', fontSize: 16, color: T.ink }
  const etiqueta = { display: 'flex', flexDirection: 'column' as const, gap: 6, fontSize: 13, color: T.muted }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', justifyContent: 'flex-end' }}>
      <Fondo onClose={onClose} />
      <aside
        ref={caja as React.RefObject<HTMLElement>}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={vender ? 'Vender directamente' : 'Separar para un cliente'}
        style={{
          position: 'relative', width: 440, maxWidth: '100%', height: '100%', background: '#fff', display: 'flex', flexDirection: 'column',
          boxShadow: '-16px 0 48px rgba(20,33,61,0.16)', animation: 'pd-slide .28s cubic-bezier(.2,.8,.2,1)', outline: 'none',
        }}
      >
        <form action={accion} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <input type="hidden" name="producto_id" value={productoId} />
          <input type="hidden" name="cantidad" value={qty} />
          <input type="hidden" name="metodo_pago" value={form.pay} />
          <div style={{ padding: '28px 28px 8px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{vender ? 'Vender directamente' : 'Separar para un cliente'}</span>
              <span style={{ fontSize: 14, color: T.muted }}>
                {nombre} × {qty}
                {vender ? ` · ${etaShort}` : ''}
              </span>
            </div>
            <CloseButton onClick={onClose} />
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <label style={etiqueta}>
              Nombre del cliente
              <input name="cliente_nombre" value={form.name} placeholder="Nombre y apellido" onChange={(e) => setForm({ ...form, name: e.target.value })} style={campo} />
            </label>
            <label style={etiqueta}>
              Teléfono
              <input
                name="cliente_telefono"
                type="tel"
                value={form.phone}
                placeholder="0000 0000"
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                style={campo}
              />
            </label>
            {vender && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 13, color: T.muted }}>Método de pago</span>
                  <Segmented label="Método de pago" value={form.pay} onChange={(pay) => setForm({ ...form, pay })} options={[...METODOS_VENTA]} size={38} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label style={etiqueta}>
                    Monto recibido
                    <input name="monto" type="number" step="0.01" min="0" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} style={campo} />
                  </label>
                  <label style={etiqueta}>
                    Referencia (opcional)
                    <input name="referencia" value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} style={campo} />
                  </label>
                </div>
                {puedeDescuento && (
                  <label style={etiqueta}>
                    Tu descuento personal (%) — sale de tu comisión, opcional
                    <input
                      name="descuento_embajador_pct"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={form.desc}
                      placeholder="0"
                      onChange={(e) => setForm({ ...form, desc: e.target.value })}
                      style={campo}
                    />
                  </label>
                )}
                <div style={{ ...sectionTop, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
                  <SummaryRow label={`Precio público × ${qty}`} value={quetzal(sub)} />
                  {gain != null && <SummaryRow label="Tu ganancia" value={quetzal(gain)} color={T.green} />}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 18, fontWeight: 700 }}>
                    <span>Cobrar al cliente</span>
                    <span>{quetzal(sub)}</span>
                  </div>
                  <span style={{ fontSize: 12, color: T.muted }}>Después de registrarla, sube el comprobante de pago en Ventas.</span>
                </div>
              </>
            )}
            {!vender && (
              <span style={{ fontSize: 13, lineHeight: 1.55, color: T.muted }}>
                La pieza queda apartada a nombre de tu cliente y la ves en Separados.
              </span>
            )}
          </div>
          <div style={{ padding: '16px 28px 28px' }}>
            <BotonEnviar texto={vender ? 'Registrar venta' : 'Confirmar separado'} habilitado={canSubmit} />
          </div>
        </form>
      </aside>
    </div>
  )
}
