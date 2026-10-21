'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Truck, User, CreditCard, Users } from 'lucide-react'
import { Campo, SeccionFormulario, clasesInput } from '@/components/app/formulario'
import { formatearPrecio } from '@/lib/formato'
import { MapaUbicacion } from '@/components/app/mapa-ubicacion'

export const DEPARTAMENTOS = [
  'Guatemala', 'Alta Verapaz', 'Baja Verapaz', 'Chimaltenango', 'Chiquimula', 'El Progreso', 'Escuintla',
  'Huehuetenango', 'Izabal', 'Jalapa', 'Jutiapa', 'Petén', 'Quetzaltenango', 'Quiché', 'Retalhuleu',
  'Sacatepéquez', 'San Marcos', 'Santa Rosa', 'Sololá', 'Suchitepéquez', 'Totonicapán', 'Zacapa',
]

function BotonConfirmar() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Enviando pedido…' : 'Confirmar pedido y enviar comprobante'}
    </button>
  )
}

/**
 * Checkout compartido (catálogo público y backoffice): datos del cliente,
 * envío con pin en mapa y pago con comprobante obligatorio. Los nombres
 * de campo los lee lib/checkout.ts (extraerDatosCheckout).
 */
export function FormularioEnvioPago({
  action,
  camposOcultos,
  total,
  permitirCompraPropia,
  nombreUsuario,
}: {
  action: (formData: FormData) => void | Promise<void>
  camposOcultos?: Record<string, string>
  total: number
  /** Backoffice: el usuario puede comprar para sí mismo o para un cliente. */
  permitirCompraPropia?: boolean
  nombreUsuario?: string
}) {
  const [paraCliente, setParaCliente] = useState(!permitirCompraPropia)

  return (
    <form action={action} encType="multipart/form-data" className="flex flex-col gap-5">
      {Object.entries(camposOcultos ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="para_cliente" value={paraCliente ? 'si' : 'no'} />

      {permitirCompraPropia && (
        <SeccionFormulario icon={Users} titulo="¿Para quién es la compra?">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { valor: false, titulo: 'Para mí', detalle: nombreUsuario ? `A nombre de ${nombreUsuario}` : 'A tu nombre' },
              { valor: true, titulo: 'Para un cliente', detalle: 'Capturas los datos de tu cliente' },
            ].map((op) => (
              <button
                key={op.titulo}
                type="button"
                onClick={() => setParaCliente(op.valor)}
                className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                  paraCliente === op.valor ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-secondary/50'
                }`}
              >
                <p className="text-sm font-semibold text-foreground">{op.titulo}</p>
                <p className="text-xs text-muted-foreground">{op.detalle}</p>
              </button>
            ))}
          </div>
        </SeccionFormulario>
      )}

      {paraCliente && (
        <SeccionFormulario icon={User} titulo={permitirCompraPropia ? 'Datos del cliente' : 'Tus datos'}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Nombre completo" required className="sm:col-span-2">
              <input name="cliente_nombre" required className={clasesInput} />
            </Campo>
            <Campo label="Teléfono" required>
              <input name="cliente_telefono" required inputMode="tel" className={clasesInput} />
            </Campo>
            <Campo label="Correo">
              <input name="cliente_correo" type="email" className={clasesInput} />
            </Campo>
          </div>
        </SeccionFormulario>
      )}

      <SeccionFormulario icon={Truck} titulo="Envío">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Quién recibe" helpText="Si lo dejas vacío, se usa el nombre del cliente.">
            <input name="nombre_destinatario" className={clasesInput} />
          </Campo>
          <Campo label="Teléfono de quien recibe" helpText="Si lo dejas vacío, se usa el del cliente.">
            <input name="telefono_destinatario" inputMode="tel" required={!paraCliente} className={clasesInput} />
          </Campo>
          <Campo label="Departamento" required>
            <select name="departamento" required defaultValue="Guatemala" className={clasesInput}>
              {DEPARTAMENTOS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Ciudad / municipio" required>
            <input name="ciudad" required className={clasesInput} />
          </Campo>
          <Campo label="Dirección" required className="sm:col-span-2">
            <input name="direccion" required placeholder="Calle, número, zona, colonia" className={clasesInput} />
          </Campo>
          <Campo label="Referencias para llegar" className="sm:col-span-2">
            <input name="referencia_entrega" placeholder="Frente al parque, portón negro…" className={clasesInput} />
          </Campo>
          <div className="sm:col-span-2">
            <MapaUbicacion />
          </div>
        </div>
      </SeccionFormulario>

      <SeccionFormulario icon={CreditCard} titulo="Pago">
        <p className="mb-3 text-xs text-muted-foreground">
          Realiza la transferencia o depósito por {formatearPrecio(total)} y adjunta el comprobante — el pedido
          se libera para envío cuando contabilidad lo aprueba.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo label="Método" required>
            <select name="metodo_pago" required defaultValue="" className={clasesInput}>
              <option value="" disabled>
                Elige un método
              </option>
              <option value="transferencia">Transferencia</option>
              <option value="deposito">Depósito</option>
            </select>
          </Campo>
          <Campo label="Número de referencia / boleta">
            <input name="referencia_pago" className={clasesInput} />
          </Campo>
          <Campo label="Banco">
            <input name="banco_origen" className={clasesInput} />
          </Campo>
          <Campo label="Fecha del pago">
            <input name="fecha_pago" type="date" className={clasesInput} />
          </Campo>
          <Campo label="Monto pagado (GTQ)">
            <input name="monto_declarado" type="number" step="0.01" min="0" defaultValue={total.toFixed(2)} className={clasesInput} />
          </Campo>
          <Campo label="Comprobante (foto o PDF)" required>
            <input
              name="comprobante"
              type="file"
              required
              accept="image/*,application/pdf"
              className="w-full rounded-lg border border-dashed border-input bg-background px-3 py-2 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-semibold file:text-primary-foreground"
            />
          </Campo>
        </div>
      </SeccionFormulario>

      <BotonConfirmar />
    </form>
  )
}
