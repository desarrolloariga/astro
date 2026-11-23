'use client'

import { useActionState, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { centavos, clasesCampo, montoContable, type CentroCosto } from '@/lib/contabilidad-general'
import { TIPOS_COMPRA, TIPOS_DOCUMENTO_CXP, ivaIncluido, type Combustible } from '@/lib/cxp'
import { registrarFacturaProveedor, type EstadoCxp } from '@/app/(app)/contabilidad/cxp/acciones'
import { CamposAutorizacion, Mensajes } from './comunes'

type Cuenta = { id: number; codigo: string; nombre: string; tipo: string; exige_centro_costo: boolean }
type Proveedor = { id: number; nombre: string; nit: string | null }
type Linea = { clave: number; cuentaTexto: string; cuentaId: number | null; cc: string; monto: string; descripcion: string }

const etiqueta = (c: Cuenta) => `${c.codigo} ${c.nombre}`
const aNumero = (v: string) => {
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0
}
let clave = 1
const nueva = (): Linea => ({ clave: clave++, cuentaTexto: '', cuentaId: null, cc: '', monto: '', descripcion: '' })

export function FormularioFacturaProveedor({
  proveedores,
  cuentas,
  centros,
  hoy,
  regimenGeneral,
  combustibles,
}: {
  proveedores: Proveedor[]
  cuentas: Cuenta[]
  centros: CentroCosto[]
  hoy: string
  regimenGeneral: boolean
  combustibles: Combustible[]
}) {
  const [estado, accion, enviando] = useActionState<EstadoCxp, FormData>(registrarFacturaProveedor, {})
  const porEtiqueta = useMemo(() => {
    const m = new Map<string, Cuenta>()
    cuentas.forEach((c) => {
      m.set(etiqueta(c).toLowerCase(), c)
      m.set(c.codigo, c)
    })
    return m
  }, [cuentas])
  const porId = useMemo(() => new Map(cuentas.map((c) => [c.id, c])), [cuentas])

  const [proveedorId, setProveedorId] = useState('')
  const [nit, setNit] = useState('')
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('factura')
  const [total, setTotal] = useState('')
  const [iva, setIva] = useState('')
  const [ivaManual, setIvaManual] = useState(false)
  const [lineas, setLineas] = useState<Linea[]>([nueva()])
  const [tipoCompra, setTipoCompra] = useState('')
  const [combustible, setCombustible] = useState(combustibles[0]?.clave ?? '')
  const [galones, setGalones] = useState('')
  const [ccCombustible, setCcCombustible] = useState('')
  const [fecha, setFecha] = useState(hoy)

  const esDuca = tipo === 'poliza_importacion'
  const compra = esDuca ? 'importacion' : tipoCompra
  const esCombustible = compra === 'combustible'
  const daIva = regimenGeneral && TIPOS_DOCUMENTO_CXP[tipo]?.ivaCredito
  const totalN = aNumero(total)
  const tarifa = combustibles.find((x) => x.clave === combustible)?.idp_por_galon ?? 0
  const idp = esCombustible ? Math.round(aNumero(galones) * Number(tarifa) * 100) / 100 : 0
  // Combustible: el IDP no lleva IVA → IVA = (total − IDP) × 12/112. DUCA: el IVA se escribe tal como viene en la póliza.
  const ivaN = !daIva ? 0 : esCombustible ? Math.round(((totalN - idp) * 12 * 100) / 112) / 100 : esDuca || ivaManual ? aNumero(iva) : ivaIncluido(totalN)
  const base = Math.round((totalN - ivaN) * 100) / 100
  const mesAnterior = fecha && fecha < `${hoy.slice(0, 7)}-01`
  const suma = lineas.reduce((a, l) => a + aNumero(l.monto), 0)
  const diferencia = (centavos(base) - centavos(suma)) / 100
  const conMonto = lineas.filter((l) => aNumero(l.monto) > 0)
  const faltaCuenta = conMonto.some((l) => !l.cuentaId)
  const faltaCc = conMonto.some((l) => l.cuentaId && porId.get(l.cuentaId)?.exige_centro_costo && !l.cc)
  const listoCombustible = esCombustible && aNumero(galones) > 0 && Boolean(combustible) && Boolean(ccCombustible) && idp < totalN
  const listo =
    totalN > 0 &&
    Boolean(compra) &&
    Boolean(nombre.trim() || proveedorId) &&
    (esCombustible ? listoCombustible : diferencia === 0 && conMonto.length > 0 && !faltaCuenta && !faltaCc)

  const cambiar = (k: number, c: Partial<Linea>) => setLineas((ls) => ls.map((l) => (l.clave === k ? { ...l, ...c } : l)))
  const elegirProveedor = (id: string) => {
    setProveedorId(id)
    const p = proveedores.find((x) => String(x.id) === id)
    if (p) {
      setNit(p.nit ?? '')
      setNombre(p.nombre)
    }
  }

  return (
    <form action={accion} encType="multipart/form-data" className="flex flex-col gap-4">
      <input type="hidden" name="iva" value={ivaN} />
      <input type="hidden" name="tipo_compra" value={compra} />
      <input
        type="hidden"
        name="lineas"
        value={JSON.stringify(
          esCombustible
            ? [{ centro_costo_id: ccCombustible ? Number(ccCombustible) : null }]
            : conMonto.map((l) => ({ cuenta_id: l.cuentaId, centro_costo_id: l.cc ? Number(l.cc) : null, monto: aNumero(l.monto), descripcion: l.descripcion })),
        )}
      />
      <datalist id="cuentas-cxp">
        {cuentas.map((c) => (
          <option key={c.id} value={etiqueta(c)} />
        ))}
      </datalist>
      <Mensajes error={estado.error} sinAutorizacion />

      <section className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <p className="text-sm font-semibold sm:col-span-2 lg:col-span-4">Documento</p>
        <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
          Proveedor (opcional)
          <select name="proveedor_id" value={proveedorId} onChange={(e) => elegirProveedor(e.target.value)} className={clasesCampo}>
            <option value="">— Escribir NIT y nombre —</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          NIT del emisor
          <input name="nit" value={nit} onChange={(e) => setNit(e.target.value)} placeholder="CF" className={cn(clasesCampo, 'font-mono uppercase')} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Nombre del emisor
          <input name="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Tipo
          <select
            name="tipo"
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value)
              if (e.target.value === 'poliza_importacion') setIvaManual(true)
            }}
            className={clasesCampo}
          >
            {Object.entries(TIPOS_DOCUMENTO_CXP).map(([v, t]) => (
              <option key={v} value={v}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Tipo de compra
          {esDuca ? (
            <span className="rounded-lg border border-dashed border-border px-3 py-2 text-xs font-normal">Importación (DUCA)</span>
          ) : (
            <select value={tipoCompra} required onChange={(e) => setTipoCompra(e.target.value)} className={cn(clasesCampo, !tipoCompra && 'border-amber-500')}>
              <option value="" disabled>
                Elige…
              </option>
              {Object.entries(TIPOS_COMPRA)
                .filter(([v]) => v !== 'importacion')
                .map(([v, e]) => (
                  <option key={v} value={v}>
                    {e}
                  </option>
                ))}
            </select>
          )}
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          {esDuca ? 'Serie / aduana' : 'Serie'}
          <input name="serie" className={cn(clasesCampo, 'font-mono uppercase')} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          {esDuca ? 'Número de DUCA' : 'Número'}
          <input name="numero" required className={cn(clasesCampo, 'font-mono')} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Autorización (UUID)
          <input name="autorizacion" className={cn(clasesCampo, 'font-mono')} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Fecha de emisión
          <input name="fecha" type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Vencimiento
          <input name="vencimiento" type="date" className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Total del documento
          <input name="total" required inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} className={cn(clasesCampo, 'text-right tabular-nums')} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          IVA crédito
          {daIva && esCombustible ? (
            <span className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-right text-sm tabular-nums">{montoContable(ivaN)}</span>
          ) : daIva ? (
            <input
              inputMode="decimal"
              placeholder={esDuca ? 'IVA de la póliza' : undefined}
              value={ivaManual ? iva : totalN ? String(ivaN) : ''}
              onChange={(e) => {
                setIvaManual(true)
                setIva(e.target.value)
              }}
              className={cn(clasesCampo, 'text-right tabular-nums')}
            />
          ) : (
            <span className="rounded-lg border border-dashed border-border px-3 py-2 text-xs font-normal text-muted-foreground">
              {regimenGeneral ? 'Este documento no da crédito fiscal' : 'Pequeño contribuyente: sin crédito fiscal'}
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2 lg:col-span-3">
          Concepto
          <input name="descripcion" placeholder="Ej. Publicidad en redes de octubre" className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Soporte (PDF o imagen)
          <input name="soporte" type="file" accept="application/pdf,image/*" className="text-xs" />
        </label>
      </section>

      {mesAnterior && (
        <label className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex flex-col gap-1">
            <span className="font-semibold">
              La fecha es de un mes anterior ({fecha.slice(5, 7)}/{fecha.slice(0, 4)}): el documento y su partida quedan en ese mes, no en el actual.
            </span>
            <span className="flex items-center gap-2 text-xs">
              <input type="checkbox" required name="confirmo_mes_anterior" /> Confirmo que el documento corresponde a ese mes
            </span>
          </span>
        </label>
      )}
      {estado.pedirPin && (
        <CamposAutorizacion mensaje="La fecha cae en un mes cerrado en contabilidad. Para registrar el documento ingresa tu PIN contable y el motivo; la autorización queda registrada." />
      )}

      {esCombustible && (
        <section className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <p className="text-sm font-semibold sm:col-span-2 lg:col-span-4">Combustible</p>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Tipo de combustible
            <select name="combustible" value={combustible} onChange={(e) => setCombustible(e.target.value)} className={clasesCampo}>
              {combustibles.map((x) => (
                <option key={x.clave} value={x.clave}>
                  {x.nombre} · IDP Q{Number(x.idp_por_galon).toFixed(2)}/gal
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Galones
            <input name="galones" inputMode="decimal" required value={galones} onChange={(e) => setGalones(e.target.value)} className={cn(clasesCampo, 'text-right tabular-nums')} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Centro de costo
            <select value={ccCombustible} required onChange={(e) => setCcCombustible(e.target.value)} className={cn(clasesCampo, !ccCombustible && 'border-amber-500')}>
              <option value="">Elige…</option>
              {centros.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} · {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col justify-end gap-0.5 text-xs">
            <span>
              IDP (exento) <span className="font-semibold tabular-nums">Q {montoContable(idp)}</span>
            </span>
            <span>
              Base gravada <span className="font-semibold tabular-nums">Q {montoContable(Math.max(totalN - idp - ivaN, 0))}</span>
            </span>
            <span>
              IVA <span className="font-semibold tabular-nums">Q {montoContable(ivaN)}</span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
            El gasto (sin IVA, incluido el IDP) va a la cuenta del combustible elegido. En el libro de compras, la base va en la columna Combustibles, el IDP como
            exento y el IVA en su columna: suman el total de la factura.
            {idp >= totalN && totalN > 0 && <span className="font-semibold text-destructive"> El IDP no puede ser igual o mayor al total: revisa los galones.</span>}
          </p>
        </section>
      )}

      {!esCombustible && (
      <section className="overflow-x-auto rounded-xl border border-border bg-card">
        <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">
          Distribución contable <span className="font-normal text-muted-foreground">(base sin IVA: Q {montoContable(base)})</span>
        </p>
        <table className="w-full min-w-[760px] text-sm">
          <tbody>
            {lineas.map((l) => {
              const cuenta = l.cuentaId ? porId.get(l.cuentaId) : undefined
              const llevaCc = !cuenta || cuenta.exige_centro_costo || cuenta.tipo === 'ingreso'
              return (
                <tr key={l.clave} className="border-b border-border/60 align-top">
                  <td className="px-2 py-1.5">
                    <input
                      list="cuentas-cxp"
                      value={l.cuentaTexto}
                      placeholder="Cuenta (gasto, activo, inventario…)"
                      onChange={(e) => {
                        const c = porEtiqueta.get(e.target.value.trim().toLowerCase()) ?? porEtiqueta.get(e.target.value.trim())
                        cambiar(l.clave, { cuentaTexto: c ? etiqueta(c) : e.target.value, cuentaId: c?.id ?? null })
                      }}
                      className={cn(clasesCampo, l.cuentaTexto && !l.cuentaId && 'border-destructive')}
                    />
                  </td>
                  <td className="w-44 px-2 py-1.5">
                    <select
                      value={l.cc}
                      disabled={!llevaCc}
                      onChange={(e) => cambiar(l.clave, { cc: e.target.value })}
                      className={cn(clasesCampo, cuenta?.exige_centro_costo && !l.cc && aNumero(l.monto) > 0 && 'border-destructive', !llevaCc && 'opacity-50')}
                    >
                      <option value="">{llevaCc ? 'Centro de costo…' : 'No aplica'}</option>
                      {centros.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.codigo} · {c.nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="w-52 px-2 py-1.5">
                    <input value={l.descripcion} placeholder="Detalle" onChange={(e) => cambiar(l.clave, { descripcion: e.target.value })} className={clasesCampo} />
                  </td>
                  <td className="w-32 px-2 py-1.5">
                    <input inputMode="decimal" value={l.monto} placeholder="Monto" onChange={(e) => cambiar(l.clave, { monto: e.target.value })} className={cn(clasesCampo, 'text-right tabular-nums')} />
                  </td>
                  <td className="w-8 px-2 py-2.5">
                    <button
                      type="button"
                      disabled={lineas.length <= 1}
                      onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                      className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
                      title="Quitar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
          <button type="button" onClick={() => setLineas((ls) => [...ls, nueva()])} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            <Plus className="h-4 w-4" />
            Agregar cuenta
          </button>
          {lineas.length === 1 && base > 0 && !lineas[0].monto && (
            <button type="button" onClick={() => cambiar(lineas[0].clave, { monto: String(base) })} className="text-xs font-semibold text-primary hover:underline">
              Usar la base completa (Q {montoContable(base)})
            </button>
          )}
        </div>
      </section>
      )}

      {!esCombustible && (
      <div className={cn('flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl px-4 py-3 text-sm font-semibold', diferencia === 0 && base > 0 ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive')}>
        <span className="flex items-center gap-2">
          {diferencia === 0 && base > 0 ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {diferencia === 0 && base > 0 ? 'La distribución cuadra con la base' : 'La distribución debe sumar la base sin IVA'}
        </span>
        <span className="tabular-nums">Total Q {montoContable(totalN)}</span>
        <span className="tabular-nums">IVA Q {montoContable(ivaN)}</span>
        <span className="tabular-nums">Base Q {montoContable(base)}</span>
        <span className="tabular-nums">Distribuido Q {montoContable(suma)}</span>
        {diferencia !== 0 && <span className="tabular-nums">Diferencia Q {montoContable(Math.abs(diferencia))}</span>}
      </div>
      )}
      {!esCombustible && (faltaCuenta || faltaCc) && (
        <p className="text-xs text-destructive">
          {faltaCuenta ? 'Hay líneas con monto sin una cuenta válida. ' : ''}
          {faltaCc ? 'Las cuentas de costo y gasto necesitan centro de costo.' : ''}
        </p>
      )}
      <div>
        <button
          type="submit"
          disabled={!listo || enviando}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enviando ? 'Guardando…' : estado.pedirPin ? 'Autorizar y registrar' : 'Registrar documento'}
        </button>
        {!compra && <span className="ml-3 text-xs text-muted-foreground">Elige el tipo de compra para continuar.</span>}
      </div>
    </form>
  )
}
