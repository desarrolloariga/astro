'use client'

import { Icon } from '../iconos'
import { T, btn, card } from '../tokens'
import { useCatalogo } from '../store'

export function SuccessScreen() {
  const app = useCatalogo()
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 14,
        padding: '0 32px',
      }}
    >
      <div
        style={{
          width: 112,
          height: 112,
          borderRadius: 56,
          background: T.primarySoft,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            background: T.primary,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="check" size={38} stroke={2.6} />
        </div>
      </div>
      <h1 style={{ margin: '8px 0 0', fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>¡Pedido confirmado!</h1>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: T.muted }}>
        Recibimos tu comprobante. Lo revisamos y, una vez aprobado el pago, preparamos tu envío. {app.info.vendedor} te
        acompañará en el proceso.
      </p>
      {app.estado.ventaId != null && (
        <span style={{ ...card, padding: '8px 14px', borderRadius: 12, fontSize: 13, fontWeight: 700 }}>Pedido #{app.estado.ventaId}</span>
      )}
      <div style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        <button
          type="button"
          onClick={() => app.tab('home')}
          style={{ ...btn, height: 54, borderRadius: 16, background: T.primary, color: '#fff', fontSize: 15, fontWeight: 800 }}
        >
          Seguir comprando
        </button>
        <button
          type="button"
          onClick={() => app.tab('favs')}
          style={{
            ...btn,
            height: 54,
            borderRadius: 16,
            border: `1px solid ${T.border}`,
            background: T.surface,
            color: T.text,
            fontSize: 15,
            fontWeight: 800,
          }}
        >
          Ver mis favoritos
        </button>
      </div>
    </div>
  )
}
