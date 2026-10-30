import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ReceiptText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { hoyGuatemala } from '@/lib/contabilidad'
import { clasesCampo, montoContable } from '@/lib/contabilidad-general'
import { ESTADOS_PAGO, TIPOS_DOCUMENTO_CXP, documentoProveedor, type FilaCxp } from '@/lib/cxp'
import { BotonConfirmar } from '@/components/app/boton-confirmar'
import { Encabezado, EnlaceVolver, Mensajes } from '@/components/contabilidad/comunes'
import { anularFacturaProveedor, anularPagoProveedor, completarFacturaProveedor, registrarPagoProveedor } from '../acciones'

export const metadata = { title: 'Factura de proveedor — ASTRO' }

type Ficha = {
  factura: FilaCxp | null
  soporte: string | null
  motivo_anulacion: string | null
  lineas: { codigo: string; cuenta: string; centro_costo: string | null; descripcion: string | null; monto: number }[]
  pagos: {
    id: number
    fecha: string
    monto: number
    cuenta: string
    referencia: string | null
    anulado: boolean
    motivo_anulacion: string | null
    conciliado: boolean | null
  }[]
  pagos_oc: { fecha: string; monto: number; cuenta: string; referencia: string | null }[]
  partida_id: number | null
}

const fecha = (f: string | null) => (f ? f.split('-').reverse().join('/') : '—')

export default async function FichaFacturaProveedorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const facturaId = Number(id)
  if (!Number.isInteger(facturaId) || facturaId <= 0) notFound()
  const supabase = await createClient()
  const [puedeVer, puedeRegistrar, { data, error }, { data: extra }] = await Promise.all([
    tienePermiso('contabilidad', 'ver'),
    tienePermiso('contabilidad', 'registrar'),
    supabase.rpc('fn_cxp_factura', { p_id: facturaId }),
    supabase.rpc('fn_cxp_catalogos'),
  ])
  if (!puedeVer) redirect('/inicio')
  const ficha = data as Ficha | null
  if (!ficha?.factura) notFound()
  const f = ficha.factura
  const cuentasBancarias = ((extra as { cuentas_bancarias?: { id: number; nombre: string }[] } | null)?.cuentas_bancarias ?? [])
  const soporte = ficha.soporte
    ? (await createAdminClient().storage.from('astro-gastos').createSignedUrl(ficha.soporte, 3600)).data?.signedUrl
    : null
  const vigente = f.estado === 'vigente'

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={ReceiptText}
        titulo={`${TIPOS_DOCUMENTO_CXP[f.tipo_documento]?.etiqueta ?? 'Documento'} ${documentoProveedor(f.serie, f.numero)}`}
        descripcion={`${f.nombre} · NIT ${f.nit}${f.descripcion ? ` · ${f.descripcion}` : ''}`}
      >
        <EnlaceVolver href="/contabilidad/cxp">← Cuentas por pagar</EnlaceVolver>
      </Encabezado>
      <Mensajes ok={sp.ok} error={sp.error ?? error?.message} />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', ESTADOS_PAGO[f.estado_pago]?.clase)}>
          {ESTADOS_PAGO[f.estado_pago]?.etiqueta}
        </span>
        <span>Correlativo #{f.correlativo}</span>
        <span>Emisión {fecha(f.fecha_emision)}</span>
        <span className={cn(f.dias_vencida && 'font-semibold text-destructive')}>
          Vence {fecha(f.fecha_vencimiento)}
          {f.dias_vencida ? ` · ${f.dias_vencida} días de atraso` : ''}
        </span>
        <span>
          Total <span className="font-semibold tabular-nums">Q {montoContable(f.total)}</span>
        </span>
        <span>
          IVA crédito <span className="tabular-nums">Q {montoContable(f.iva_credito)}</span>
        </span>
        <span>
          Saldo <span className="font-semibold tabular-nums">Q {montoContable(f.saldo)}</span>
        </span>
        <span className="ml-auto flex gap-3 text-xs font-semibold">
          {f.orden_compra_id && (
            <Link href={`/compras/${f.orden_compra_id}`} className="text-primary hover:underline">
              Orden de compra #{f.orden_compra_id}
            </Link>
          )}
          {ficha.partida_id && (
            <Link href={`/contabilidad/partidas/${ficha.partida_id}`} className="text-primary hover:underline">
              Ver partida
            </Link>
          )}
          {soporte && (
            <a href={soporte} target="_blank" className="text-primary hover:underline">
              Ver soporte
            </a>
          )}
        </span>
      </div>
      {f.estado === 'anulada' && ficha.motivo_anulacion && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Anulada: {ficha.motivo_anulacion}</p>
      )}

      {f.origen === 'orden_compra' ? (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          Factura de una orden de compra: el inventario y la deuda con el proveedor ya se contabilizaron al recibir la orden, así que
          esta factura no genera otra partida. Sus pagos sí salen de bancos contra Proveedores.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">Distribución contable</p>
          <table className="w-full text-sm">
            <tbody>
              {ficha.lineas.map((l, i) => (
                <tr key={i} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-1.5 font-mono text-xs text-muted-foreground">{l.codigo}</td>
                  <td className="px-2 py-1.5">
                    {l.cuenta}
                    {l.descripcion && <span className="block text-xs text-muted-foreground">{l.descripcion}</span>}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs">{l.centro_costo ?? ''}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{montoContable(l.monto)}</td>
                </tr>
              ))}
              {Number(f.iva_credito) > 0 && (
                <tr className="border-t border-border/60 text-muted-foreground">
                  <td className="px-4 py-1.5" />
                  <td className="px-2 py-1.5">IVA crédito fiscal</td>
                  <td />
                  <td className="px-4 py-1.5 text-right tabular-nums">{montoContable(f.iva_credito)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Pagos</p>
        {ficha.pagos.length === 0 && ficha.pagos_oc.length === 0 && <p className="text-sm text-muted-foreground">Sin pagos registrados.</p>}
        <ul className="divide-y divide-border/60 text-sm">
          {ficha.pagos.map((p) => (
            <li key={p.id} className={cn('flex flex-wrap items-center justify-between gap-2 py-2', p.anulado && 'opacity-60')}>
              <span>
                {fecha(p.fecha)} · {p.cuenta}
                {p.referencia ? ` · ref. ${p.referencia}` : ''}
                {p.anulado && <span className="block text-xs text-muted-foreground">Anulado: {p.motivo_anulacion}</span>}
                {p.conciliado && <span className="block text-xs text-primary">Conciliado en bancos</span>}
              </span>
              <span className="flex items-center gap-3">
                <span className={cn('font-semibold tabular-nums', p.anulado && 'line-through')}>Q {montoContable(p.monto)}</span>
                {!p.anulado && !p.conciliado && puedeRegistrar && (
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold text-destructive">Anular</summary>
                    <form action={anularPagoProveedor} className="mt-1 flex gap-2">
                      <input type="hidden" name="factura_id" value={f.id} />
                      <input type="hidden" name="pago_id" value={p.id} />
                      <input name="motivo" required placeholder="Motivo" className={cn(clasesCampo, 'w-48 py-1 text-xs')} />
                      <button type="submit" className="text-xs font-semibold text-destructive">
                        Confirmar
                      </button>
                    </form>
                  </details>
                )}
              </span>
            </li>
          ))}
          {ficha.pagos_oc.map((p, i) => (
            <li key={`oc-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {fecha(p.fecha)} · {p.cuenta} <span className="text-xs text-muted-foreground">(pagado desde la orden de compra)</span>
              </span>
              <span className="font-semibold tabular-nums">Q {montoContable(p.monto)}</span>
            </li>
          ))}
        </ul>

        {vigente && Number(f.saldo) > 0 && puedeRegistrar && (
          cuentasBancarias.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Crea una cuenta bancaria en <Link href="/contabilidad/bancos" className="font-semibold text-primary hover:underline">Bancos</Link> para registrar pagos.
            </p>
          ) : (
            <form action={registrarPagoProveedor} className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-5">
              <input type="hidden" name="factura_id" value={f.id} />
              <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
                Cuenta bancaria
                <select name="cuenta_bancaria_id" required defaultValue="" className={clasesCampo}>
                  <option value="" disabled>
                    Elige…
                  </option>
                  {cuentasBancarias.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Fecha
                <input name="fecha" type="date" required defaultValue={hoyGuatemala()} className={clasesCampo} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Monto
                <input name="monto" required inputMode="decimal" defaultValue={String(f.saldo)} className={cn(clasesCampo, 'text-right tabular-nums')} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Referencia
                <input name="referencia" placeholder="No. de transferencia o cheque" className={clasesCampo} />
              </label>
              <div className="sm:col-span-5">
                <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                  Registrar pago
                </button>
              </div>
            </form>
          )
        )}
      </section>

      {vigente && puedeRegistrar && (
        <details className="rounded-xl border border-border bg-card px-4 py-3" open={f.origen === 'orden_compra' && !f.serie}>
          <summary className="cursor-pointer text-sm font-semibold">Datos del documento (serie, número, autorización, vencimiento)</summary>
          <form action={completarFacturaProveedor} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-5">
            <input type="hidden" name="factura_id" value={f.id} />
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Serie
              <input name="serie" defaultValue={f.serie ?? ''} className={cn(clasesCampo, 'font-mono uppercase')} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Número
              <input name="numero" defaultValue={f.numero} className={cn(clasesCampo, 'font-mono')} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Fecha de emisión
              <input name="fecha" type="date" defaultValue={f.fecha_emision} className={clasesCampo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Vencimiento
              <input name="vencimiento" type="date" defaultValue={f.fecha_vencimiento ?? ''} className={clasesCampo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Autorización
              <input name="autorizacion" defaultValue={f.numero_autorizacion ?? ''} className={cn(clasesCampo, 'font-mono')} />
            </label>
            <div className="sm:col-span-5">
              <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">
                Guardar datos
              </button>
            </div>
          </form>
        </details>
      )}

      {vigente && puedeRegistrar && ficha.pagos.every((p) => p.anulado) && (
        <details className="rounded-xl border border-border bg-card px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">Anular este documento</summary>
          <form action={anularFacturaProveedor} className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="factura_id" value={f.id} />
            <input name="motivo" required placeholder="Motivo de la anulación" className={cn(clasesCampo, 'w-80')} />
            <BotonConfirmar
              mensaje="¿Anular el documento? Si generó partida, se revierte."
              className="rounded-lg px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10"
            >
              Anular
            </BotonConfirmar>
          </form>
        </details>
      )}
    </main>
  )
}
