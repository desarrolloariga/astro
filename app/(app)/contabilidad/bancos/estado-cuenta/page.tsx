import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { formatearFechaHora } from '@/lib/formato'
import { clasesCampo, montoContable } from '@/lib/contabilidad-general'
import { Encabezado, EnlaceVolver, Mensajes } from '@/components/contabilidad/comunes'
import { importarEstadoCuenta } from './acciones'

export const metadata = { title: 'Estados de cuenta — ASTRO' }

type Estado = {
  id: number
  desde: string
  hasta: string
  saldo_final: number
  archivo: string | null
  estado: string
  fecha_creacion: string
  cuenta: { nombre: string; moneda: string } | null
  lineas: { estado: string }[]
}

export default async function EstadosCuentaPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const [puede, { data: cuentasData }, { data }] = await Promise.all([
    tienePermiso('bancos', 'gestionar'),
    supabase.from('cuentas_bancarias').select('id, nombre, moneda, tipo').eq('activa', true).order('nombre'),
    supabase
      .from('estados_cuenta')
      .select('id, desde, hasta, saldo_final, archivo, estado, fecha_creacion, cuenta:cuenta_id ( nombre, moneda ), lineas:estado_cuenta_lineas ( estado )')
      .order('hasta', { ascending: false })
      .order('id', { ascending: false })
      .limit(100),
  ])
  if (!puede) redirect('/inicio')
  const cuentas = (cuentasData ?? []) as { id: number; nombre: string; moneda: string; tipo: string }[]
  const estados = (data ?? []) as unknown as Estado[]

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={FileSpreadsheet}
        titulo="Estados de cuenta"
        descripcion="Importa el estado de cuenta del banco (Excel o CSV) y crúzalo contra el libro de bancos. Lo que solo está en el banco se registra como nota de débito o crédito; al final se cierra la conciliación del mes."
      >
        <EnlaceVolver href="/contabilidad/bancos">← Bancos</EnlaceVolver>
      </Encabezado>
      <Mensajes ok={sp.ok} error={sp.error} />

      <form action={importarEstadoCuenta} encType="multipart/form-data" className="grid grid-cols-1 gap-3 rounded-xl border border-dashed border-primary/40 bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <p className="flex items-center gap-2 text-sm font-semibold sm:col-span-2 lg:col-span-4">
          <Upload className="h-4 w-4 text-primary" />
          Importar estado de cuenta
        </p>
        <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
          Cuenta bancaria
          <select name="cuenta_id" required defaultValue="" className={clasesCampo}>
            <option value="" disabled>
              Elige…
            </option>
            {cuentas.filter((c) => c.tipo !== 'caja').map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.moneda})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold sm:col-span-2">
          Archivo (.xlsx o .csv)
          <input name="archivo" type="file" required accept=".xlsx,.csv,.txt" className="text-xs" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Del (opcional)
          <input name="desde" type="date" className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Al (opcional)
          <input name="hasta" type="date" className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Saldo inicial (opcional)
          <input name="saldo_inicial" inputMode="decimal" className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Saldo final
          <input name="saldo_final" inputMode="decimal" placeholder="Si el archivo no trae saldo" className={clasesCampo} />
        </label>
        <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
          Reconoce columnas como Fecha, Descripción/Concepto, Referencia/Documento, Débito/Cargo, Crédito/Abono, Monto y Saldo, aunque
          haya títulos arriba. Las fechas y saldos se toman del archivo si no los escribes. Al importar se cruza automáticamente por
          monto, fecha (±3 días) y referencia.
        </p>
        <div className="flex flex-col items-end justify-end gap-2">
          <a href="/contabilidad/bancos/estado-cuenta/plantilla" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            <Download className="h-3.5 w-3.5" />
            Descargar plantilla
          </a>
          <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Importar y cruzar
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Cuenta</th>
              <th className="px-3 py-2">Período</th>
              <th className="px-3 py-2 text-right">Saldo final</th>
              <th className="px-3 py-2">Avance</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {estados.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  Aún no hay estados de cuenta importados.
                </td>
              </tr>
            )}
            {estados.map((e) => {
              const total = e.lineas.length
              const listas = e.lineas.filter((l) => l.estado !== 'pendiente').length
              return (
                <tr key={e.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Link href={`/contabilidad/bancos/estado-cuenta/${e.id}`} className="font-semibold text-primary hover:underline">
                      {e.cuenta?.nombre}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {e.archivo} · {formatearFechaHora(e.fecha_creacion)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {e.desde.split('-').reverse().join('/')} – {e.hasta.split('-').reverse().join('/')}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {e.cuenta?.moneda === 'USD' ? 'US$' : 'Q'} {montoContable(e.saldo_final)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {listas} de {total} líneas resueltas
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', e.estado === 'cerrado' ? 'bg-primary/10 text-primary' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300')}>
                      {e.estado === 'cerrado' ? 'Conciliado y cerrado' : 'En conciliación'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </main>
  )
}
