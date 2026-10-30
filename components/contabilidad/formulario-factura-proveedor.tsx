'use client'

import { useActionState, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { centavos, clasesCampo, montoContable, type CentroCosto } from '@/lib/contabilidad-general'
import { TIPOS_DOCUMENTO_CXP, ivaIncluido } from '@/lib/cxp'
import { registrarFacturaProveedor, type EstadoCxp } from '@/app/(app)/contabilidad/cxp/acciones'
import { Mensajes } from './comunes'

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
}: {
  proveedores: Proveedor[]
  cuentas: Cuenta[]
  centros: CentroCosto[]
  hoy: string
  regimenGeneral: boolean
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

  const daIva = regimenGeneral && TIPOS_DOCUMENTO_CXP[tipo]?.ivaCredito
  const totalN = aNumero(total)
  const ivaN = daIva ? (ivaManual ? aNumero(iva) : ivaIncluido(totalN)) : 0
  const base = Math.round((totalN - ivaN) * 100) / 100
  const suma = lineas.reduce((a, l) => a + aNumero(l.monto), 0)
  const diferencia = (centavos(base) - centavos(suma)) / 100
  const conMonto = lineas.filter((l) => aNumero(l.monto) > 0)
  const faltaCuenta = conMonto.some((l) => !l.cuentaId)
  const faltaCc = conMonto.some((l) => l.cuentaId && porId.get(l.cuentaId)?.exige_centro_costo && !l.cc)
  const listo = totalN > 0 && diferencia === 0 && conMonto.length > 0 && !faltaCuenta && !faltaCc && (nombre.trim() || proveedorId)

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
      <input
        type="hidden"
        name="lineas"
        value={JSON.stringify(
          conMonto.map((l) => ({ cuenta_id: l.cuentaId, centro_costo_id: l.cc ? Number(l.cc) : null, monto: aNumero(l.monto), descripcion: l.descripcion })),
        )}
      />
      <datalist id="cuentas-cxp">
        {cuentas.map((c) => (
          <option key={c.id} value={etiqueta(c)} />
        ))}
      </datalist>
      <Mensajes error={estado.error} />

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
          <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className={clasesCampo}>
            {Object.entries(TIPOS_DOCUMENTO_CXP).map(([v, t]) => (
              <option key={v} value={v}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Serie
          <input name="serie" className={cn(clasesCampo, 'font-mono uppercase')} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Número
          <input name="numero" required className={cn(clasesCampo, 'font-mono')} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Autorización (UUID)
          <input name="autorizacion" className={cn(clasesCampo, 'font-mono')} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Fecha de emisión
          <input name="fecha" type="date" required defaultValue={hoy} className={clasesCampo} />
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
          {daIva ? (
            <input
              inputMode="decimal"
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
      {(faltaCuenta || faltaCc) && (
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
          {enviando ? 'Guardando…' : 'Registrar factura'}
        </button>
      </div>
    </form>
  )
}
