'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Truck, User, CreditCard, Users, Sparkles } from 'lucide-react'
import { Campo, SeccionFormulario, clasesInput } from '@/components/app/formulario'
import { formatearPrecio } from '@/lib/formato'
import { MapaUbicacion } from '@/components/app/mapa-ubicacion'
import { NOMBRE_BILLETERA, fondoBilletera } from '@/components/app/billetera-astro'
import { calcularEnvio, faltaParaEnvioGratis, type PoliticaEnvio, type TipoCompraEnvio } from '@/lib/envio'

export const DEPARTAMENTOS = [
  'Guatemala', 'Alta Verapaz', 'Baja Verapaz', 'Chimaltenango', 'Chiquimula', 'El Progreso', 'Escuintla',
  'Huehuetenango', 'Izabal', 'Jalapa', 'Jutiapa', 'Petén', 'Quetzaltenango', 'Quiché', 'Retalhuleu',
  'Sacatepéquez', 'San Marcos', 'Santa Rosa', 'Sololá', 'Suchitepéquez', 'Totonicapán', 'Zacapa',
]

const CLAVE_BORRADOR = 'astro_checkout_borrador'

function BotonConfirmar({ texto = 'Confirmar pedido y enviar comprobante' }: { texto?: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Enviando pedido…' : texto}
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
  totalParaMi,
  paraClienteInicial,
  saldoBolsa = 0,
  pctMaxBilletera = 95,
  politicaEnvio = null,
}: {
  action: (formData: FormData) => void | Promise<void>
  camposOcultos?: Record<string, string>
  total: number
  /** Backoffice: el usuario puede comprar para sí mismo o para un cliente. */
  permitirCompraPropia?: boolean
  nombreUsuario?: string
  /** Total cuando compra para sí (embajador: precio embajador). Por defecto, `total`. */
  totalParaMi?: number
  /** Opción marcada al abrir (modo elegido en el catálogo). */
  paraClienteInicial?: boolean
  /** Saldo de bolsa del embajador: solo se ofrece al comprar para sí. */
  saldoBolsa?: number
  /** % máximo de la compra que se puede pagar con la Billetera (parámetro pct_max_billetera). */
  pctMaxBilletera?: number
  /** Política de envío vigente (fn_politica_envio_vigente). */
  politicaEnvio?: PoliticaEnvio | null
}) {
  const [paraCliente, setParaCliente] = useState(permitirCompraPropia ? Boolean(paraClienteInicial) : true)
  const totalProductos = !paraCliente && totalParaMi != null ? totalParaMi : total
  // Envío según la política vigente (la base calcula lo mismo al confirmar).
  const tipoCompra: TipoCompraEnvio = !permitirCompraPropia ? 'publico' : paraCliente ? 'backoffice_cliente' : 'propio'
  const envio = calcularEnvio(politicaEnvio, totalProductos, tipoCompra)
  const faltaGratis = faltaParaEnvioGratis(politicaEnvio, totalProductos, tipoCompra)
  const totalVigente = Math.round((totalProductos + envio) * 100) / 100
  const ofreceBolsa = Boolean(permitirCompraPropia) && !paraCliente && saldoBolsa > 0
  const [usarBolsa, setUsarBolsa] = useState(true)
  const conBolsa = ofreceBolsa && usarBolsa
  // Tope: la Billetera paga como máximo pctMaxBilletera% del total (igual que la base).
  const topeBilletera = Math.round(totalVigente * pctMaxBilletera) / 100
  const deBolsa = conBolsa ? Math.min(saldoBolsa, topeBilletera) : 0
  const restante = Math.max(0, Math.round((totalVigente - deBolsa) * 100) / 100)

  // Si el servidor devuelve un error, la página se recarga con ?error=…: se
  // restaura lo que la persona había escrito (guardado al enviar) para no
  // obligarla a llenar todo otra vez. El archivo del comprobante no se puede
  // restaurar por seguridad del navegador.
  const formRef = useRef<HTMLFormElement>(null)
  const [borrador, setBorrador] = useState<Record<string, string> | null>(null)

  useEffect(() => {
    try {
      const guardado = sessionStorage.getItem(CLAVE_BORRADOR)
      if (!guardado) return
      sessionStorage.removeItem(CLAVE_BORRADOR)
      if (!new URLSearchParams(window.location.search).has('error')) return
      const datos = JSON.parse(guardado) as Record<string, string>
      if (permitirCompraPropia && datos.para_cliente) setParaCliente(datos.para_cliente === 'si')
      if (datos.usar_bolsa) setUsarBolsa(datos.usar_bolsa === 'si')
      setBorrador(datos)
    } catch {
      // sin almacenamiento disponible: se sigue sin restaurar
    }
  }, [permitirCompraPropia])

  // Se aplica después de pintar (los campos de cliente/pago dependen del estado restaurado).
  useEffect(() => {
    const form = formRef.current
    if (!borrador || !form) return
    for (const [nombre, valor] of Object.entries(borrador)) {
      const campo = form.elements.namedItem(nombre)
      if (
        (campo instanceof HTMLInputElement && !['hidden', 'file'].includes(campo.type)) ||
        campo instanceof HTMLSelectElement ||
        campo instanceof HTMLTextAreaElement
      ) {
        campo.value = valor
      }
    }
  }, [borrador])

  function guardarBorrador() {
    const form = formRef.current
    if (!form) return
    const datos: Record<string, string> = {}
    new FormData(form).forEach((valor, nombre) => {
      if (typeof valor === 'string') datos[nombre] = valor
    })
    try {
      sessionStorage.setItem(CLAVE_BORRADOR, JSON.stringify(datos))
    } catch {
      // sin almacenamiento disponible
    }
  }

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={guardarBorrador}
      encType="multipart/form-data"
      className="flex flex-col gap-5"
    >
      {Object.entries(camposOcultos ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="para_cliente" value={paraCliente ? 'si' : 'no'} />
      <input type="hidden" name="usar_bolsa" value={conBolsa ? 'si' : 'no'} />

      {permitirCompraPropia && (
        <SeccionFormulario icon={Users} titulo="¿Para quién es la compra?">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              {
                valor: false,
                titulo: 'Para mí',
                detalle:
                  totalParaMi != null && totalParaMi < total
                    ? `Precio embajador · ${formatearPrecio(totalParaMi)}`
                    : nombreUsuario
                      ? `A nombre de ${nombreUsuario}`
                      : 'A tu nombre',
              },
              {
                valor: true,
                titulo: 'Para un cliente',
                detalle: totalParaMi != null && totalParaMi < total ? `Precio público · ${formatearPrecio(total)}` : 'Capturas los datos de tu cliente',
              },
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

      <section className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Productos</span>
          <span className="text-foreground">{formatearPrecio(totalProductos)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Envío</span>
          <span className={envio === 0 ? 'font-semibold text-emerald-700' : 'text-foreground'}>
            {envio === 0 ? 'Gratis' : formatearPrecio(envio)}
          </span>
        </div>
        {faltaGratis != null && faltaGratis > 0 && (
          <p className="text-xs text-amber-700">Agrega {formatearPrecio(faltaGratis)} más en productos y el envío es gratis.</p>
        )}
        <div className="flex justify-between border-t border-border pt-1.5 font-bold text-foreground">
          <span>Total</span>
          <span>{formatearPrecio(totalVigente)}</span>
        </div>
      </section>

      {ofreceBolsa && (
        <section className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-[0_18px_40px_-14px_rgba(11,46,138,0.55)] ${fondoBilletera}`}>
          <div aria-hidden className="pointer-events-none absolute -right-8 -top-14 h-40 w-40 rounded-full bg-amber-300/25 blur-2xl" />
          <p className="relative flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
            <Sparkles className="h-3.5 w-3.5" />
            Pagar con mi {NOMBRE_BILLETERA}
          </p>
          <label className="relative mt-3 flex cursor-pointer items-start gap-3 rounded-xl bg-white/10 p-3 ring-1 ring-white/20 backdrop-blur-sm">
            <input
              type="checkbox"
              checked={usarBolsa}
              onChange={(e) => setUsarBolsa(e.target.checked)}
              className="mt-0.5 h-5 w-5 accent-amber-400"
            />
            <span className="text-sm">
              <span className="block font-semibold text-white">
                Usar mi saldo: <span className="text-amber-300">{formatearPrecio(saldoBolsa)}</span> disponible
              </span>
              <span className="block text-xs text-white/75">
                {usarBolsa
                  ? `Se usan ${formatearPrecio(deBolsa)} de tu Billetera; pagas ${formatearPrecio(restante)} con transferencia o depósito.`
                  : 'Pagarás todo con transferencia o depósito.'}
              </span>
            </span>
          </label>
          <p className="relative mt-2 text-[11px] text-white/70">
            Con la Billetera puedes pagar hasta el {pctMaxBilletera}% de la compra; el resto (al menos el {100 - pctMaxBilletera}%) se
            paga con transferencia o depósito y su comprobante.
          </p>
        </section>
      )}

      {restante > 0 && (
        <SeccionFormulario icon={CreditCard} titulo={deBolsa > 0 ? 'Pago del restante' : 'Pago'}>
          <p className="mb-3 text-xs text-muted-foreground">
            Realiza la transferencia o depósito por {formatearPrecio(restante)} y adjunta el comprobante — el pedido
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
              <input
                key={restante.toFixed(2)}
                name="monto_declarado"
                type="number"
                step="0.01"
                min="0"
                defaultValue={restante.toFixed(2)}
                className={clasesInput}
              />
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
      )}

      <BotonConfirmar texto={restante === 0 ? 'Confirmar pedido pagado con mi Billetera ASTRO' : undefined} />
    </form>
  )
}
