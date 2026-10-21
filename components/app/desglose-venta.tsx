import { CheckCircle2, AlertTriangle, Wallet, Landmark } from 'lucide-react'
import { formatearPrecio } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { ChipBilletera } from '@/components/app/billetera-astro'

export type VentaDesglose = {
  id: number
  subtotal: number
  descuento_desempeno: number | null
  descuento_embajador: number | null
  total: number
  precio_embajador: boolean | null
  venta_detalles: { cantidad: number; precio: number; productos: { codigo: string; nombre: string } | null }[]
  pagos: { id: number; metodo: string; monto: number; estado: string }[]
}

/** Columnas a pedir a Supabase para armar el desglose (anidado bajo ventas). */
export const SELECT_DESGLOSE =
  'id, subtotal, descuento_desempeno, descuento_embajador, total, precio_embajador, venta_detalles ( cantidad, precio, productos ( codigo, nombre ) ), pagos ( id, metodo, monto, estado )'

const nombresMetodo: Record<string, string> = {
  bolsa: 'Billetera ASTRO',
  transferencia: 'Transferencia',
  deposito: 'Depósito',
  tarjeta: 'Tarjeta',
  pasarela: 'Pasarela',
}

const nombresEstado: Record<string, string> = {
  confirmado: 'confirmado',
  pendiente: 'por aprobar',
  rechazado: 'rechazado',
}

const redondear = (n: number) => Math.round(n * 100) / 100

/** Pagos con bolsa de una venta: total pagado con bolsa y si cubrió todo. */
export function resumenBolsa(v: VentaDesglose) {
  const bolsa = v.pagos.filter((p) => p.metodo === 'bolsa' && p.estado !== 'rechazado').reduce((a, p) => a + Number(p.monto), 0)
  const otros = v.pagos.filter((p) => p.metodo !== 'bolsa' && p.estado !== 'rechazado').reduce((a, p) => a + Number(p.monto), 0)
  return { bolsa: redondear(bolsa), otros: redondear(otros), conBolsa: bolsa > 0, total: bolsa > 0 && otros === 0 }
}

/** Etiqueta "Compra con bolsa · total/parcial" para la cabecera de la tarjeta. */
export function EtiquetaBolsa({ venta }: { venta: VentaDesglose | null | undefined }) {
  if (!venta) return null
  const r = resumenBolsa(venta)
  if (!r.conBolsa) return null
  return <ChipBilletera>{r.total ? 'Pagada 100% con Billetera ASTRO' : 'Pago mixto con Billetera ASTRO'}</ChipBilletera>
}

/**
 * Desglose para contabilidad: cómo se pagó (bolsa vs dinero), qué se
 * vendió (producto, cantidad, precio, subtotal) y si todo cuadra con el
 * total de la venta y con el monto declarado del comprobante.
 */
export function DesgloseVenta({
  venta,
  montoDeclarado,
  pagoRevisadoId,
}: {
  venta: VentaDesglose
  /** Monto que la persona declaró en el comprobante (si aplica). */
  montoDeclarado?: number | null
  /** Pago al que pertenece el comprobante que se está revisando. */
  pagoRevisadoId?: number
}) {
  const lineas = venta.venta_detalles
  const sumaLineas = redondear(lineas.reduce((a, l) => a + Number(l.precio) * l.cantidad, 0))
  const descDesempeno = Number(venta.descuento_desempeno ?? 0)
  const descEmbajador = Number(venta.descuento_embajador ?? 0)
  const totalCalculado = redondear(sumaLineas - descDesempeno - descEmbajador)
  const cuadraTotal = Math.abs(totalCalculado - Number(venta.total)) < 0.01

  const r = resumenBolsa(venta)
  const pagoRevisado = venta.pagos.find((p) => p.id === pagoRevisadoId)
  const esperado = pagoRevisado ? Number(pagoRevisado.monto) : r.otros
  const cuadraDeclarado = montoDeclarado == null || Math.abs(Number(montoDeclarado) - esperado) < 0.01
  const cuadraPagos = Math.abs(r.bolsa + r.otros - Number(venta.total)) < 0.01

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-3">
      {/* Cómo se pagó */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Desglose del pago</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-secondary/60 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total de la venta</p>
            <p className="text-base font-bold text-foreground">{formatearPrecio(Number(venta.total))}</p>
            {venta.precio_embajador && <p className="text-[11px] text-primary">a precio embajador</p>}
          </div>
          <div
            className={cn(
              'rounded-lg px-3 py-2',
              r.bolsa > 0 ? 'bg-gradient-to-br from-[#0B2E8A] via-[#1D4ED8] to-[#F59E0B] text-white' : 'bg-secondary/60',
            )}
          >
            <p className={cn('flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide', r.bolsa > 0 ? 'text-amber-200' : 'text-muted-foreground')}>
              <Wallet className="h-3 w-3" /> Billetera ASTRO
            </p>
            <p className={cn('text-base font-bold', r.bolsa > 0 ? 'text-white' : 'text-foreground')}>{formatearPrecio(r.bolsa)}</p>
            <p className={cn('text-[11px]', r.bolsa > 0 ? 'text-white/80' : 'text-muted-foreground')}>
              {r.bolsa > 0 ? 'descontado del saldo, ya confirmado' : 'no usó Billetera'}
            </p>
          </div>
          <div className={cn('rounded-lg px-3 py-2', r.otros > 0 ? 'bg-amber-500/10' : 'bg-secondary/60')}>
            <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Landmark className="h-3 w-3" /> Con dinero
            </p>
            <p className="text-base font-bold text-foreground">{formatearPrecio(r.otros)}</p>
            <p className="text-[11px] text-muted-foreground">{r.otros > 0 ? 'transferencia / depósito' : 'sin pago en dinero'}</p>
          </div>
        </div>

        <ul className="flex flex-col gap-1 text-xs">
          {venta.pagos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className={cn('text-muted-foreground', p.id === pagoRevisadoId && 'font-semibold text-foreground')}>
                {nombresMetodo[p.metodo] ?? p.metodo} · {nombresEstado[p.estado] ?? p.estado}
                {p.id === pagoRevisadoId && ' · este comprobante'}
              </span>
              <span className="font-semibold text-foreground">{formatearPrecio(Number(p.monto))}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-1 text-xs">
          <Verificacion ok={cuadraPagos} texto={cuadraPagos ? 'Billetera + dinero = total de la venta' : `Billetera + dinero (${formatearPrecio(r.bolsa + r.otros)}) no suma el total`} />
          {montoDeclarado != null && (
            <Verificacion
              ok={cuadraDeclarado}
              texto={
                cuadraDeclarado
                  ? `Monto declarado en el comprobante (${formatearPrecio(Number(montoDeclarado))}) coincide con lo que debía pagar en dinero`
                  : `Declaró ${formatearPrecio(Number(montoDeclarado))} pero debía pagar ${formatearPrecio(esperado)} en dinero`
              }
            />
          )}
        </div>
      </div>

      {/* Qué se vendió */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Productos ({lineas.length})</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-xs">
            <thead>
              <tr className="border-b border-border text-left uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pr-2 font-semibold">Código</th>
                <th className="py-1.5 pr-2 font-semibold">Producto</th>
                <th className="py-1.5 pr-2 text-right font-semibold">Cant.</th>
                <th className="py-1.5 pr-2 text-right font-semibold">Precio unit.</th>
                <th className="py-1.5 text-right font-semibold">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="py-1.5 pr-2 font-mono text-muted-foreground">{l.productos?.codigo ?? '—'}</td>
                  <td className="py-1.5 pr-2 text-foreground">{l.productos?.nombre ?? '—'}</td>
                  <td className="py-1.5 pr-2 text-right text-foreground">{l.cantidad}</td>
                  <td className="py-1.5 pr-2 text-right text-foreground">{formatearPrecio(Number(l.precio))}</td>
                  <td className="py-1.5 text-right font-semibold text-foreground">{formatearPrecio(Number(l.precio) * l.cantidad)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-foreground">
              <tr>
                <td colSpan={4} className="pt-2 pr-2 text-right text-muted-foreground">Suma de productos</td>
                <td className="pt-2 text-right font-semibold">{formatearPrecio(sumaLineas)}</td>
              </tr>
              {descDesempeno > 0 && (
                <tr>
                  <td colSpan={4} className="pr-2 text-right text-muted-foreground">Descuento por desempeño</td>
                  <td className="text-right">−{formatearPrecio(descDesempeno)}</td>
                </tr>
              )}
              {descEmbajador > 0 && (
                <tr>
                  <td colSpan={4} className="pr-2 text-right text-muted-foreground">Descuento del embajador</td>
                  <td className="text-right">−{formatearPrecio(descEmbajador)}</td>
                </tr>
              )}
              <tr>
                <td colSpan={4} className="pr-2 text-right font-semibold">Total calculado</td>
                <td className="text-right font-bold">{formatearPrecio(totalCalculado)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <Verificacion
          ok={cuadraTotal}
          texto={
            cuadraTotal
              ? 'Los productos cuadran con el total de la venta'
              : `Los productos suman ${formatearPrecio(totalCalculado)} pero la venta registra ${formatearPrecio(Number(venta.total))}`
          }
        />
      </div>
    </div>
  )
}

function Verificacion({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <p className={cn('flex items-start gap-1.5 text-xs font-medium', ok ? 'text-emerald-700' : 'text-destructive')}>
      {ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      {texto}
    </p>
  )
}
