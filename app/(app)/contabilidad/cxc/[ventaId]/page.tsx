import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { HandCoins } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { formatearFechaHora } from '@/lib/formato'
import { hoyGuatemala } from '@/lib/contabilidad'
import { clasesCampo, montoContable } from '@/lib/contabilidad-general'
import { ESTADOS_COBRO, METODOS_COBRO, documentoFel, type FilaCxc } from '@/lib/cxc'
import { Encabezado, EnlaceVolver, Mensajes } from '@/components/contabilidad/comunes'
import { anularFactura, registrarFactura } from './acciones'

export const metadata = { title: 'Cobro de venta — ASTRO' }

type Ficha = {
  resumen: FilaCxc | null
  venta: {
    id: number
    subtotal: number
    descuento: number
    envio: number
    total: number
    impuesto: number
    vendedor: string | null
    nit_cliente: string | null
    direccion_cliente: string | null
  } | null
  lineas: { codigo: string; nombre: string; cantidad: number; precio: number }[]
  pagos: {
    id: number
    metodo: string
    monto: number
    estado: string
    referencia: string | null
    fecha: string
    banco: { cuenta: string; fecha: string } | null
  }[]
  facturas: {
    id: number
    correlativo: number
    serie: string
    numero: string
    numero_autorizacion: string | null
    fecha_emision: string
    nit: string
    nombre: string
    direccion: string | null
    total: number
    base: number
    impuesto: number
    estado: string
    motivo_anulacion: string | null
  }[]
}

const metodoPago = (m: string) =>
  m === 'bolsa' ? METODOS_COBRO.canje : m === 'tarjeta' || m === 'pasarela' ? `${METODOS_COBRO.tarjeta} (${m})` : (METODOS_COBRO[m] ?? m)

export default async function FichaCobroPage({
  params,
  searchParams,
}: {
  params: Promise<{ ventaId: string }>
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const [{ ventaId }, sp] = await Promise.all([params, searchParams])
  const id = Number(ventaId)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const supabase = await createClient()
  const [puedeVer, puedeRegistrar, { data, error }] = await Promise.all([
    tienePermiso('contabilidad', 'ver'),
    tienePermiso('contabilidad', 'registrar'),
    supabase.rpc('fn_cxc_venta', { p_venta_id: id }),
  ])
  if (!puedeVer) redirect('/inicio')
  const ficha = data as Ficha | null
  if (!ficha?.venta || !ficha.resumen) notFound()
  const r = ficha.resumen
  const vigente = ficha.facturas.find((f) => f.estado === 'vigente')

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado icono={HandCoins} titulo={`Venta #${id} · ${r.cliente}`} descripcion={`${r.fecha.split('-').reverse().join('/')} · canal ${r.canal}${ficha.venta.vendedor ? ` · vendedor ${ficha.venta.vendedor}` : ''}`}>
        <EnlaceVolver href="/contabilidad/cxc">← Cuentas por cobrar</EnlaceVolver>
      </Encabezado>
      <Mensajes ok={sp.ok} error={sp.error ?? error?.message} />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', ESTADOS_COBRO[r.estado_cobro]?.clase)}>
          {ESTADOS_COBRO[r.estado_cobro]?.etiqueta}
        </span>
        <span>
          Total <span className="font-semibold tabular-nums">Q {montoContable(r.total)}</span>
        </span>
        <span>
          Cobrado <span className="font-semibold tabular-nums">Q {montoContable(r.cobrado)}</span>
        </span>
        <span>
          En bancos <span className="font-semibold tabular-nums">Q {montoContable(r.en_bancos)}</span>
        </span>
        {Number(r.saldo) > 0 && (
          <span className="text-amber-700 dark:text-amber-300">
            Saldo <span className="font-semibold tabular-nums">Q {montoContable(r.saldo)}</span>
          </span>
        )}
        {r.pedido_id && (
          <Link href={`/pedidos/${r.pedido_id}`} className="ml-auto text-xs font-semibold text-primary hover:underline">
            Ver pedido #{r.pedido_id}
          </Link>
        )}
      </div>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">Detalle</p>
          <table className="w-full text-sm">
            <tbody>
              {ficha.lineas.map((l, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="px-4 py-1.5">
                    <span className="font-mono text-xs text-muted-foreground">{l.codigo}</span> {l.nombre}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{l.cantidad}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{montoContable(Number(l.precio) * l.cantidad)}</td>
                </tr>
              ))}
              <tr className="text-xs text-muted-foreground">
                <td className="px-4 py-1" colSpan={2}>Descuento</td>
                <td className="px-4 py-1 text-right tabular-nums">−{montoContable(ficha.venta.descuento)}</td>
              </tr>
              <tr className="text-xs text-muted-foreground">
                <td className="px-4 py-1" colSpan={2}>Envío</td>
                <td className="px-4 py-1 text-right tabular-nums">{montoContable(ficha.venta.envio)}</td>
              </tr>
              <tr className="font-semibold">
                <td className="px-4 py-1.5" colSpan={2}>Total (impuesto incluido Q {montoContable(ficha.venta.impuesto)})</td>
                <td className="px-4 py-1.5 text-right tabular-nums">{montoContable(ficha.venta.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">Pagos</p>
          {ficha.pagos.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">Sin pagos registrados.</p>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {ficha.pagos.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                  <span>
                    {metodoPago(p.metodo)}
                    <span className="block text-xs text-muted-foreground">
                      {formatearFechaHora(p.fecha)}
                      {p.referencia ? ` · ref. ${p.referencia}` : ''}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="font-semibold tabular-nums">Q {montoContable(p.monto)}</span>
                    <span className="block text-xs">
                      {p.estado !== 'confirmado' ? (
                        <span className="text-amber-700 dark:text-amber-300">{p.estado}</span>
                      ) : p.metodo === 'bolsa' ? (
                        <span className="text-muted-foreground">aplicado de la Billetera</span>
                      ) : p.banco ? (
                        <span className="text-primary">
                          en bancos · {p.banco.cuenta} {p.banco.fecha.split('-').reverse().join('/')}
                        </span>
                      ) : (
                        <span className="text-sky-700 dark:text-sky-300">en tránsito (sin registrar en bancos)</span>
                      )}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold text-foreground">Factura FEL</p>
        {vigente ? (
          <div className="flex flex-col gap-2 text-sm">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Serie-Número</dt>
                <dd className="font-mono font-semibold">{documentoFel(vigente.serie, vigente.numero)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Correlativo</dt>
                <dd>#{vigente.correlativo}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Fecha de emisión</dt>
                <dd>{vigente.fecha_emision.split('-').reverse().join('/')}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">NIT</dt>
                <dd className="font-mono">{vigente.nit}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Nombre</dt>
                <dd>{vigente.nombre}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Autorización</dt>
                <dd className="break-all font-mono text-xs">{vigente.numero_autorizacion ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Base</dt>
                <dd className="tabular-nums">{montoContable(vigente.base)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Impuesto</dt>
                <dd className="tabular-nums">{montoContable(vigente.impuesto)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Total</dt>
                <dd className="font-semibold tabular-nums">{montoContable(vigente.total)}</dd>
              </div>
            </dl>
            {puedeRegistrar && (
              <details>
                <summary className="cursor-pointer text-xs font-semibold text-destructive">Anular esta factura</summary>
                <form action={anularFactura} className="mt-2 flex flex-wrap gap-2">
                  <input type="hidden" name="venta_id" value={id} />
                  <input type="hidden" name="factura_id" value={vigente.id} />
                  <input name="motivo" required placeholder="Motivo (anulada también en el certificador FEL)" className={cn(clasesCampo, 'w-80')} />
                  <button type="submit" className="rounded-lg px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10">
                    Anular
                  </button>
                </form>
              </details>
            )}
          </div>
        ) : r.estado_venta === 'anulada' ? (
          <p className="text-sm text-muted-foreground">La venta está anulada.</p>
        ) : puedeRegistrar ? (
          <form action={registrarFactura} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="venta_id" value={id} />
            <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
              Emite la factura en el certificador FEL y copia aquí sus datos. Total a facturar: Q {montoContable(ficha.venta.total)}.
            </p>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Serie
              <input name="serie" required className={cn(clasesCampo, 'font-mono uppercase')} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Número
              <input name="numero" required className={cn(clasesCampo, 'font-mono')} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Fecha de emisión
              <input name="fecha" type="date" required defaultValue={hoyGuatemala()} className={clasesCampo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              NIT
              <input name="nit" defaultValue={ficha.venta.nit_cliente ?? 'CF'} className={cn(clasesCampo, 'font-mono uppercase')} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
              Nombre
              <input name="nombre" required defaultValue={r.cliente === 'Consumidor final' ? 'Consumidor final' : r.cliente} className={clasesCampo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
              Número de autorización (UUID)
              <input name="autorizacion" className={cn(clasesCampo, 'font-mono')} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-3">
              Dirección (opcional)
              <input name="direccion" defaultValue={ficha.venta.direccion_cliente ?? ''} className={clasesCampo} />
            </label>
            <div className="flex items-end">
              <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                Registrar factura
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">Sin factura registrada.</p>
        )}
        {ficha.facturas.filter((f) => f.estado === 'anulada').map((f) => (
          <p key={f.id} className="text-xs text-muted-foreground">
            Anulada: {documentoFel(f.serie, f.numero)} (#{f.correlativo}) · {f.motivo_anulacion}
          </p>
        ))}
      </section>
    </main>
  )
}
