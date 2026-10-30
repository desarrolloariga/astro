import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BookText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { hoyGuatemala, rangoMes } from '@/lib/contabilidad'
import { clasesCampo, esFecha, montoContable, numeroPartida, textoPeriodo } from '@/lib/contabilidad-general'
import { Encabezado, Mensajes } from '@/components/contabilidad/comunes'
import { EncabezadoReporte, FiltroRango } from '@/components/contabilidad/filtro-rango'

export const metadata = { title: 'Libro mayor — ASTRO' }

type Mayor = {
  cuenta: { id: number; codigo: string; nombre: string; tipo: string; naturaleza: string; es_detalle: boolean }
  saldo_anterior: number
  debe: number
  haber: number
  saldo_final: number
  cantidad: number
  movimientos: {
    partida_id: number
    anio: number
    numero: number
    fecha: string
    partida: string
    codigo: string
    cuenta: string
    centro_costo: string | null
    debe: number
    haber: number
    descripcion: string | null
    saldo: number
  }[]
}

export default async function LibroMayorPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; cuenta?: string; cc?: string }>
}) {
  const sp = await searchParams
  const mes = rangoMes(hoyGuatemala())
  const desde = esFecha(sp.desde) ? sp.desde : mes.desde
  const hasta = esFecha(sp.hasta) ? sp.hasta : mes.hasta
  const cuentaId = Number(sp.cuenta) > 0 ? Number(sp.cuenta) : null
  const cc = Number(sp.cc) > 0 ? Number(sp.cc) : null

  const supabase = await createClient()
  const [puedeVer, { data: cuentasData }, { data: centros }, { data: empresa }, mayorRes] = await Promise.all([
    tienePermiso('contabilidad', 'ver'),
    supabase.from('cuentas_contables').select('id, codigo, nombre, es_detalle').order('codigo'),
    supabase.from('centros_costo').select('id, codigo, nombre').order('codigo'),
    supabase.from('empresa_contable').select('razon_social, nit').eq('id', 1).maybeSingle(),
    cuentaId
      ? supabase.rpc('fn_libro_mayor', { p_cuenta_id: cuentaId, p_desde: desde, p_hasta: hasta, p_centro_costo_id: cc })
      : Promise.resolve({ data: null, error: null }),
  ])
  if (!puedeVer) redirect('/inicio')

  const cuentas = (cuentasData ?? []) as { id: number; codigo: string; nombre: string; es_detalle: boolean }[]
  const mayor = mayorRes.data as Mayor | null
  // Saldo en la naturaleza de la cuenta (las acreedoras se muestran en positivo cuando su saldo es acreedor).
  const signo = mayor?.cuenta.naturaleza === 'acreedora' ? -1 : 1

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={BookText}
        titulo="Libro mayor"
        descripcion="Movimientos de una cuenta con saldo corrido. Si eliges una cuenta Madre, incluye todas sus subcuentas."
      />
      <Mensajes error={mayorRes.error?.message} />

      <FiltroRango desde={desde} hasta={hasta}>
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs font-semibold text-foreground">
          Cuenta
          <select name="cuenta" required defaultValue={cuentaId ? String(cuentaId) : ''} className={clasesCampo}>
            <option value="" disabled>
              Elige una cuenta…
            </option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} {c.nombre}
                {c.es_detalle ? '' : ' (Madre)'}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Centro de costo
          <select name="cc" defaultValue={cc ? String(cc) : ''} className={clasesCampo}>
            <option value="">Todos</option>
            {((centros ?? []) as { id: number; codigo: string; nombre: string }[]).map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo}
              </option>
            ))}
          </select>
        </label>
      </FiltroRango>

      {mayor && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <EncabezadoReporte
            razonSocial={(empresa as { razon_social: string } | null)?.razon_social ?? '—'}
            nit={(empresa as { nit: string } | null)?.nit ?? '—'}
            titulo={`Libro mayor · ${mayor.cuenta.codigo} ${mayor.cuenta.nombre}`}
            periodo={textoPeriodo(desde, hasta)}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">Fecha</th>
                  <th className="px-2 py-2 text-left">Partida</th>
                  <th className="px-2 py-2 text-left">Concepto</th>
                  {!mayor.cuenta.es_detalle && <th className="px-2 py-2 text-left">Subcuenta</th>}
                  <th className="px-2 py-2 text-left">C. costo</th>
                  <th className="px-2 py-2 text-right">Debe</th>
                  <th className="px-2 py-2 text-right">Haber</th>
                  <th className="px-2 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50 bg-muted/30 font-semibold">
                  <td colSpan={mayor.cuenta.es_detalle ? 6 : 7} className="px-2 py-1.5">
                    Saldo anterior
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{montoContable(signo * mayor.saldo_anterior)}</td>
                </tr>
                {mayor.movimientos.map((m, i) => (
                  <tr key={i} className="border-b border-border/40">
                    <td className="whitespace-nowrap px-2 py-1 text-xs">{m.fecha.split('-').reverse().join('/')}</td>
                    <td className="whitespace-nowrap px-2 py-1">
                      <Link href={`/contabilidad/partidas/${m.partida_id}`} className="font-mono text-xs text-primary hover:underline">
                        {numeroPartida(m.anio, m.numero)}
                      </Link>
                    </td>
                    <td className="px-2 py-1">
                      {m.partida}
                      {m.descripcion && <span className="block text-xs text-muted-foreground">{m.descripcion}</span>}
                    </td>
                    {!mayor.cuenta.es_detalle && (
                      <td className="px-2 py-1 text-xs">
                        <span className="font-mono text-muted-foreground">{m.codigo}</span> {m.cuenta}
                      </td>
                    )}
                    <td className="px-2 py-1 font-mono text-xs">{m.centro_costo ?? ''}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{Number(m.debe) > 0 ? montoContable(m.debe) : ''}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{Number(m.haber) > 0 ? montoContable(m.haber) : ''}</td>
                    <td className={cn('px-2 py-1 text-right tabular-nums', signo * m.saldo < 0 && 'text-destructive')}>
                      {montoContable(signo * m.saldo)}
                    </td>
                  </tr>
                ))}
                {mayor.movimientos.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-2 py-6 text-center text-muted-foreground">
                      Sin movimientos en el período.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="border-t-2 border-foreground/40 font-bold">
                <tr>
                  <td colSpan={mayor.cuenta.es_detalle ? 4 : 5} className="px-2 py-2 text-right">
                    Totales del período ({mayor.cantidad} movimientos)
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{montoContable(mayor.debe)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{montoContable(mayor.haber)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{montoContable(signo * mayor.saldo_final)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Saldo expresado en la naturaleza de la cuenta ({mayor.cuenta.naturaleza}); en rojo si queda al contrario.
            {mayor.cantidad >= 5000 && ' Se muestran los primeros 5,000 movimientos: acota el rango de fechas.'}
          </p>
        </div>
      )}
    </main>
  )
}
