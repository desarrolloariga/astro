'use client'

import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { DEPARTAMENTOS } from '@/components/app/formulario-envio-pago'
import { MapaUbicacion } from '@/components/app/mapa-ubicacion'
import { Icon, type NombreIcono } from '../iconos'
import { T, btn, card, scrollY, sectionTitle } from '../tokens'
import { useCatalogo, type MetodoPago } from '../store'
import { BackButton, SummaryRow } from '../ui/basicos'
import { money } from '../ui/producto'

const METODOS: { id: MetodoPago; label: string; sub: string; icon: NombreIcono }[] = [
  { id: 'transferencia', label: 'Transferencia bancaria', sub: 'Adjunta la captura de la transferencia', icon: 'bank' },
  { id: 'deposito', label: 'Depósito en banco', sub: 'Adjunta la foto de la boleta', icon: 'cash' },
]

const campo: CSSProperties = {
  width: '100%',
  height: 50,
  boxSizing: 'border-box',
  padding: '0 14px',
  borderRadius: 14,
  border: `1px solid ${T.border}`,
  background: T.surface,
  color: T.text,
  fontFamily: 'inherit',
  fontSize: 16,
  outline: 'none',
}

function Campo({ label, children, opcional = false }: { label: string; children: ReactNode; opcional?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700, color: T.text }}>
      <span>
        {label}
        {opcional && <span style={{ fontWeight: 600, color: T.muted }}> (opcional)</span>}
      </span>
      {children}
    </label>
  )
}

function Seccion({ titulo, icono, children }: { titulo: string; icono: NombreIcono; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={sectionTitle}>{titulo}</span>
      <div style={{ ...card, borderRadius: 18, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span
          aria-hidden="true"
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: T.primarySoft,
            color: T.primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icono} size={22} stroke={1.8} />
        </span>
        {children}
      </div>
    </div>
  )
}

function Step({ n, label, state }: { n: number; label: string; state: 'done' | 'active' | 'todo' }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: state === 'todo' ? T.muted : state === 'done' ? T.primary : T.text }}>
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          background: state === 'done' ? T.primary : 'transparent',
          color: state === 'done' ? '#fff' : state === 'active' ? T.primary : T.muted,
          border: state === 'done' ? 'none' : `2px solid ${state === 'active' ? T.primary : T.radioOff}`,
        }}
      >
        {state === 'done' ? <Icon name="check" size={12} stroke={3} /> : n}
      </span>
      {label}
    </span>
  )
}

export function CheckoutScreen() {
  const app = useCatalogo()
  const { lineas, metodoPago, ocupado } = app.estado
  const total = app.subtotal
  const [error, setError] = useState('')
  const [archivo, setArchivo] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const fd = new FormData(e.currentTarget)
    const fallo = await app.placeOrder(fd)
    if (fallo) {
      setError(fallo)
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <form onSubmit={enviar} encType="multipart/form-data" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 20px 8px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BackButton onClick={app.back} label="Volver al carrito" style={{ marginLeft: -10 }} />
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>Confirmar pedido</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700 }}>
          <Step n={1} label="Carrito" state="done" />
          <span style={{ flex: 1, height: 2, background: T.primary }} />
          <Step n={2} label="Pago" state="active" />
          <span style={{ flex: 1, height: 2, background: T.border }} />
          <Step n={3} label="Listo" state="todo" />
        </div>
      </div>

      <div ref={scrollRef} className="cat-noscroll" style={{ ...scrollY, padding: '8px 20px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {error && (
          <div
            role="alert"
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              padding: 12,
              borderRadius: 14,
              background: '#FDECEA',
              color: T.danger,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            <Icon name="alert" size={20} />
            <span>{error}</span>
          </div>
        )}

        {lineas.length === 0 && (
          <div role="alert" style={{ ...card, borderRadius: 14, padding: 12, fontSize: 14, fontWeight: 700 }}>
            Tu carrito quedó vacío (el apartado venció). Vuelve a agregar las piezas.
          </div>
        )}

        <Seccion titulo="Tus datos" icono="user">
          <Campo label="Nombre completo">
            <input name="cliente_nombre" required autoComplete="name" style={campo} />
          </Campo>
          <Campo label="Teléfono">
            <input name="cliente_telefono" required inputMode="tel" autoComplete="tel" style={campo} />
          </Campo>
          <Campo label="Correo" opcional>
            <input name="cliente_correo" type="email" autoComplete="email" style={campo} />
          </Campo>
        </Seccion>

        <Seccion titulo="Envío a" icono="pin">
          <Campo label="Quién recibe" opcional>
            <input name="nombre_destinatario" placeholder="Si lo dejas vacío, a tu nombre" style={campo} />
          </Campo>
          <Campo label="Teléfono de quien recibe" opcional>
            <input name="telefono_destinatario" inputMode="tel" style={campo} />
          </Campo>
          <Campo label="Departamento">
            <select name="departamento" required defaultValue="Guatemala" style={campo}>
              {DEPARTAMENTOS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Ciudad / municipio">
            <input name="ciudad" required autoComplete="address-level2" style={campo} />
          </Campo>
          <Campo label="Dirección">
            <input name="direccion" required placeholder="Calle, número, zona, colonia" autoComplete="street-address" style={campo} />
          </Campo>
          <Campo label="Referencias para llegar" opcional>
            <input name="referencia_entrega" placeholder="Frente al parque, portón negro…" style={campo} />
          </Campo>
          <MapaUbicacion />
        </Seccion>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={sectionTitle}>Método de pago</span>
          <div role="radiogroup" aria-label="Método de pago" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {METODOS.map((m) => {
              const on = metodoPago === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => app.setPayMethod(m.id)}
                  style={{
                    ...btn,
                    justifyContent: 'flex-start',
                    gap: 12,
                    padding: 12,
                    borderRadius: 18,
                    textAlign: 'left',
                    color: T.text,
                    background: on ? T.primaryTint : T.surface,
                    border: `2px solid ${on ? T.primary : T.borderSoft}`,
                  }}
                >
                  <span
                    style={{
                      flex: 'none',
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      background: T.surface,
                      color: T.primary,
                      border: `1px solid ${T.borderSoft}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name={m.icon} size={22} stroke={1.8} />
                  </span>
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{m.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.muted }}>{m.sub}</span>
                  </span>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      boxSizing: 'border-box',
                      border: `2px solid ${on ? T.primary : T.radioOff}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: on ? T.primary : 'transparent' }} />
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <Seccion titulo="Comprobante de pago" icono="upload">
          <span style={{ fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
            Paga {money(total)} y adjunta el comprobante. Tu pedido se envía cuando confirmemos el pago.
          </span>
          <label
            style={{
              ...btn,
              position: 'relative',
              minHeight: 56,
              gap: 10,
              padding: '10px 14px',
              borderRadius: 14,
              border: `2px dashed ${archivo ? T.primary : T.border}`,
              background: archivo ? T.primaryTint : T.surface,
              color: archivo ? T.primaryDeep : T.text,
              fontSize: 14,
              fontWeight: 700,
              textAlign: 'center',
            }}
          >
            <Icon name={archivo ? 'check' : 'upload'} size={20} stroke={2.2} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {archivo || 'Subir foto o PDF del comprobante'}
            </span>
            <input
              name="comprobante"
              type="file"
              required
              accept="image/*,application/pdf"
              onChange={(e) => setArchivo(e.target.files?.[0]?.name ?? '')}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
            />
          </label>
          <Campo label="Número de referencia / boleta" opcional>
            <input name="referencia_pago" style={campo} />
          </Campo>
          <Campo label="Banco" opcional>
            <input name="banco_origen" style={campo} />
          </Campo>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <Campo label="Fecha del pago">
              <input name="fecha_pago" type="date" style={campo} />
            </Campo>
            <Campo label="Monto pagado">
              <input name="monto_declarado" type="number" step="0.01" min="0" inputMode="decimal" defaultValue={total.toFixed(2)} style={campo} />
            </Campo>
          </div>
        </Seccion>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={sectionTitle}>Resumen</span>
          <div style={{ ...card, borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lineas.map((l) => (
              <SummaryRow key={l.producto_id} label={`${l.nombre} × ${l.cantidad}`} value={money(l.precio * l.cantidad)} />
            ))}
            <div style={{ height: 1, background: T.borderSoft }} />
            <SummaryRow label="Envío" value="Se coordina contigo" />
            <SummaryRow label="Total" value={money(total)} strong />
          </div>
        </div>
      </div>

      <div style={{ flex: 'none', padding: '12px 20px 24px', background: T.surface, borderTop: `1px solid ${T.borderSoft}` }}>
        <button
          type="submit"
          disabled={ocupado || lineas.length === 0}
          style={{
            ...btn,
            width: '100%',
            height: 56,
            borderRadius: 18,
            background: lineas.length === 0 ? T.disabledBg : T.primary,
            color: lineas.length === 0 ? T.disabledFg : '#fff',
            fontSize: 16,
            fontWeight: 800,
            opacity: ocupado ? 0.7 : 1,
          }}
        >
          {ocupado ? 'Enviando pedido…' : `Confirmar pedido · ${money(total)}`}
        </button>
      </div>
    </form>
  )
}
