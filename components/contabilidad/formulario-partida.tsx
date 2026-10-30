'use client'

import { useActionState, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  centavos,
  clasesCampo,
  montoContable,
  type CentroCosto,
  type CuentaDetalle,
} from '@/lib/contabilidad-general'
import { guardarPartidaAccion, type EstadoFormulario } from '@/app/(app)/contabilidad/partidas/acciones'
import { CamposAutorizacion, Mensajes } from './comunes'

type Linea = {
  clave: number
  cuentaTexto: string
  cuentaId: number | null
  centroCostoId: string
  debe: string
  haber: string
  descripcion: string
}

export type PartidaInicial = {
  id: number
  fecha: string
  tipo: string
  descripcion: string
  lineas: { cuenta_id: number; centro_costo_id: number | null; debe: number; haber: number; descripcion: string | null }[]
}

const etiquetaCuenta = (c: CuentaDetalle) => `${c.codigo} ${c.nombre}`
const aNumero = (v: string) => {
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0
}

let siguienteClave = 1
const lineaVacia = (): Linea => ({
  clave: siguienteClave++,
  cuentaTexto: '',
  cuentaId: null,
  centroCostoId: '',
  debe: '',
  haber: '',
  descripcion: '',
})

export function FormularioPartida({
  cuentas,
  centros,
  inicial,
  hoy,
  fechaBloqueo,
  puedeAutorizar,
}: {
  cuentas: CuentaDetalle[]
  centros: CentroCosto[]
  inicial?: PartidaInicial
  hoy: string
  fechaBloqueo: string | null
  puedeAutorizar: boolean
}) {
  const [estado, accion, enviando] = useActionState<EstadoFormulario, FormData>(guardarPartidaAccion, {})
  const porId = useMemo(() => new Map(cuentas.map((c) => [c.id, c])), [cuentas])
  const porEtiqueta = useMemo(() => {
    const m = new Map<string, CuentaDetalle>()
    cuentas.forEach((c) => {
      m.set(etiquetaCuenta(c).toLowerCase(), c)
      m.set(c.codigo, c)
    })
    return m
  }, [cuentas])

  const [fecha, setFecha] = useState(inicial?.fecha ?? hoy)
  const [tipo, setTipo] = useState(inicial?.tipo ?? 'manual')
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '')
  const [lineas, setLineas] = useState<Linea[]>(() =>
    inicial?.lineas.length
      ? inicial.lineas.map((l) => {
          const c = porId.get(l.cuenta_id)
          return {
            clave: siguienteClave++,
            cuentaTexto: c ? etiquetaCuenta(c) : '',
            cuentaId: l.cuenta_id,
            centroCostoId: l.centro_costo_id ? String(l.centro_costo_id) : '',
            debe: Number(l.debe) > 0 ? String(l.debe) : '',
            haber: Number(l.haber) > 0 ? String(l.haber) : '',
            descripcion: l.descripcion ?? '',
          }
        })
      : [lineaVacia(), lineaVacia()],
  )

  const cambiar = (clave: number, cambios: Partial<Linea>) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)))

  const elegirCuenta = (clave: number, texto: string) => {
    const c = porEtiqueta.get(texto.trim().toLowerCase()) ?? porEtiqueta.get(texto.trim())
    cambiar(clave, {
      cuentaTexto: c ? etiquetaCuenta(c) : texto,
      cuentaId: c?.id ?? null,
      ...(c && !c.exige_centro_costo && c.tipo !== 'ingreso' ? { centroCostoId: '' } : {}),
    })
  }

  const totalDebe = lineas.reduce((a, l) => a + aNumero(l.debe), 0)
  const totalHaber = lineas.reduce((a, l) => a + aNumero(l.haber), 0)
  const diferencia = (centavos(totalDebe) - centavos(totalHaber)) / 100
  const conMonto = lineas.filter((l) => aNumero(l.debe) > 0 || aNumero(l.haber) > 0)
  const problemas: string[] = []
  if (conMonto.some((l) => !l.cuentaId)) problemas.push('Hay líneas con monto sin una cuenta válida.')
  if (conMonto.some((l) => l.cuentaId && porId.get(l.cuentaId)?.exige_centro_costo && !l.centroCostoId)) {
    problemas.push('Las cuentas de costo y gasto necesitan centro de costo.')
  }
  if (lineas.some((l) => aNumero(l.debe) > 0 && aNumero(l.haber) > 0)) problemas.push('Una línea no puede tener Debe y Haber a la vez.')
  const cuadra = diferencia === 0 && totalDebe > 0
  const listaParaContabilizar = cuadra && conMonto.length >= 2 && problemas.length === 0
  const fechaCerrada = Boolean(fechaBloqueo && (fecha <= fechaBloqueo || (inicial && inicial.fecha <= fechaBloqueo)))

  const lineasJson = JSON.stringify(
    conMonto.map((l) => ({
      cuenta_id: l.cuentaId,
      centro_costo_id: l.centroCostoId ? Number(l.centroCostoId) : null,
      debe: aNumero(l.debe),
      haber: aNumero(l.haber),
      descripcion: l.descripcion.trim(),
    })),
  )

  return (
    <form action={accion} className="flex flex-col gap-4">
      {inicial && <input type="hidden" name="id" value={inicial.id} />}
      {inicial && <input type="hidden" name="fecha_original" value={inicial.fecha} />}
      <input type="hidden" name="lineas" value={lineasJson} />
      <datalist id="cuentas-detalle">
        {cuentas.map((c) => (
          <option key={c.id} value={etiquetaCuenta(c)} />
        ))}
      </datalist>

      <Mensajes error={estado.error} />

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[10rem_10rem_1fr]">
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Fecha
          <input name="fecha" type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Tipo
          <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className={clasesCampo}>
            <option value="manual">Manual</option>
            <option value="ajuste">Ajuste</option>
            <option value="apertura">Apertura</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Concepto
          <input
            name="descripcion"
            required
            maxLength={500}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej. Depreciación de mobiliario y equipo de octubre"
            className={clasesCampo}
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2">#</th>
              <th className="px-2 py-2">Cuenta (solo de detalle)</th>
              <th className="w-44 px-2 py-2">Centro de costo</th>
              <th className="w-48 px-2 py-2">Descripción de la línea</th>
              <th className="w-32 px-2 py-2 text-right">Debe</th>
              <th className="w-32 px-2 py-2 text-right">Haber</th>
              <th className="w-8 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => {
              const cuenta = l.cuentaId ? porId.get(l.cuentaId) : undefined
              const ccPermitido = cuenta ? cuenta.exige_centro_costo || cuenta.tipo === 'ingreso' : true
              const faltaCc = Boolean(cuenta?.exige_centro_costo && !l.centroCostoId && (aNumero(l.debe) > 0 || aNumero(l.haber) > 0))
              return (
                <tr key={l.clave} className="border-b border-border/60 last:border-0 align-top">
                  <td className="px-2 py-1.5 pt-3.5 text-xs text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <input
                      list="cuentas-detalle"
                      value={l.cuentaTexto}
                      onChange={(e) => elegirCuenta(l.clave, e.target.value)}
                      placeholder="Escribe código o nombre…"
                      className={cn(clasesCampo, l.cuentaTexto && !l.cuentaId && 'border-destructive')}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={l.centroCostoId}
                      disabled={!ccPermitido}
                      onChange={(e) => cambiar(l.clave, { centroCostoId: e.target.value })}
                      className={cn(clasesCampo, faltaCc && 'border-destructive', !ccPermitido && 'opacity-50')}
                    >
                      <option value="">{ccPermitido ? (cuenta?.exige_centro_costo ? 'Elige…' : 'Sin centro') : 'No aplica'}</option>
                      {centros.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.codigo} · {c.nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={l.descripcion}
                      maxLength={300}
                      onChange={(e) => cambiar(l.clave, { descripcion: e.target.value })}
                      className={clasesCampo}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      inputMode="decimal"
                      value={l.debe}
                      onChange={(e) => cambiar(l.clave, { debe: e.target.value, ...(e.target.value ? { haber: '' } : {}) })}
                      className={cn(clasesCampo, 'text-right tabular-nums')}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      inputMode="decimal"
                      value={l.haber}
                      onChange={(e) => cambiar(l.clave, { haber: e.target.value, ...(e.target.value ? { debe: '' } : {}) })}
                      className={cn(clasesCampo, 'text-right tabular-nums')}
                    />
                  </td>
                  <td className="px-2 py-1.5 pt-2.5">
                    <button
                      type="button"
                      title="Quitar línea"
                      disabled={lineas.length <= 2}
                      onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="border-t border-border bg-muted/30 text-sm font-semibold">
            <tr>
              <td colSpan={4} className="px-2 py-2">
                <button
                  type="button"
                  onClick={() => setLineas((ls) => [...ls, lineaVacia()])}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                >
                  <Plus className="h-4 w-4" />
                  Agregar línea
                </button>
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{montoContable(totalDebe)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{montoContable(totalHaber)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div
        role="status"
        className={cn(
          'flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl px-4 py-3 text-sm font-semibold',
          cuadra ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive',
        )}
      >
        <span className="flex items-center gap-2">
          {cuadra ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {cuadra ? 'La partida cuadra' : totalDebe + totalHaber === 0 ? 'Ingresa los montos' : 'La partida no cuadra'}
        </span>
        <span className="tabular-nums">Debe Q {montoContable(totalDebe)}</span>
        <span className="tabular-nums">Haber Q {montoContable(totalHaber)}</span>
        <span className="tabular-nums">Diferencia Q {montoContable(Math.abs(diferencia))}</span>
      </div>
      {problemas.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-destructive">
          {problemas.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {fechaCerrada &&
        (puedeAutorizar ? (
          <CamposAutorizacion mensaje="La fecha cae en un mes cerrado. Para guardar necesitas tu PIN contable y el motivo; la autorización queda registrada." />
        ) : (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            La fecha cae en un mes cerrado y no tienes permiso para autorizar cambios en meses cerrados.
          </p>
        ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          name="contabilizar"
          value="1"
          disabled={!listaParaContabilizar || enviando || (fechaCerrada && !puedeAutorizar)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enviando ? 'Guardando…' : 'Guardar y contabilizar'}
        </button>
        <button
          type="submit"
          name="contabilizar"
          value="0"
          disabled={enviando || conMonto.length === 0 || (fechaCerrada && !puedeAutorizar)}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          Guardar borrador
        </button>
        <p className="text-xs text-muted-foreground">
          El borrador puede guardarse descuadrado; solo se contabiliza cuando Debe = Haber. Una partida contabilizada ya no se edita: se revierte.
        </p>
      </div>
    </form>
  )
}
