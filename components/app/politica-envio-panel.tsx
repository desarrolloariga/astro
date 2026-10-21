import Link from 'next/link'
import { History, Truck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatearFechaHora, formatearPrecio } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { guardarPoliticaEnvio } from '@/app/(app)/admin/precios/acciones'

const clasesCampo =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'

type Politica = {
  id: number
  tarifa: number
  envio_gratis_desde: number | null
  costo_real: number
  cobrar_publico: boolean
  cobrar_backoffice_cliente: boolean
  cobrar_compra_propia: boolean
  notas: string | null
  activo: boolean
  fecha_creacion: string
  autor: { nombre: string } | null
}

/** Pestañas de la página de Precios. */
export function PestanasPrecios({ activa }: { activa: 'factores' | 'envios' }) {
  return (
    <div className="flex gap-1 border-b border-border">
      {[
        { href: '/admin/precios', etiqueta: 'Factores de precio', id: 'factores' },
        { href: '/admin/precios?vista=envios', etiqueta: 'Políticas de envío', id: 'envios' },
      ].map((t) => (
        <Link
          key={t.id}
          href={t.href}
          className={cn(
            '-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors',
            activa === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {t.etiqueta}
        </Link>
      ))}
    </div>
  )
}

/** Configuración de la política de envío vigente + historial. */
export async function PoliticaEnvioPanel() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('politicas_envio')
    .select(
      'id, tarifa, envio_gratis_desde, costo_real, cobrar_publico, cobrar_backoffice_cliente, cobrar_compra_propia, notas, activo, fecha_creacion, autor:creado_por ( nombre )',
    )
    .order('fecha_creacion', { ascending: false })
    .limit(15)
  const historial = (data ?? []) as unknown as Politica[]
  const vigente = historial.find((p) => p.activo)

  const ejemplo = (monto: number) => {
    if (!vigente) return 'Gratis'
    if (vigente.envio_gratis_desde != null && monto >= Number(vigente.envio_gratis_desde)) return 'Gratis'
    return Number(vigente.tarifa) > 0 ? formatearPrecio(Number(vigente.tarifa)) : 'Gratis'
  }

  return (
    <div className="flex flex-col gap-6">
      {vigente && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { k: 'Tarifa al cliente', v: Number(vigente.tarifa) > 0 ? formatearPrecio(Number(vigente.tarifa)) : 'Sin cobro' },
            {
              k: 'Envío gratis desde',
              v: vigente.envio_gratis_desde != null ? formatearPrecio(Number(vigente.envio_gratis_desde)) : 'Nunca gratis',
            },
            { k: 'Costo real por envío', v: formatearPrecio(Number(vigente.costo_real)) },
          ].map((t) => (
            <div key={t.k} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.k}</p>
              <p className="mt-1 text-lg font-bold text-foreground">{t.v}</p>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-foreground">
          <Truck className="h-4 w-4 text-primary" /> Política de envío
        </h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Aplica a todo el país. El envío se suma al total de la compra (se puede pagar con la Billetera ASTRO dentro de su tope) y
          el costo real de cada envío entra como gasto en el estado de resultados, aunque el envío sea gratis para el cliente. Guardar
          crea una nueva versión; las ventas ya hechas no cambian.
        </p>
        <form action={guardarPoliticaEnvio} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
              Tarifa que paga el cliente (Q)
              <input name="tarifa" type="number" step="0.01" min="0" required defaultValue={vigente?.tarifa ?? 0} className={clasesCampo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
              Envío gratis a partir de (Q)
              <input
                name="envio_gratis_desde"
                type="number"
                step="0.01"
                min="0"
                placeholder="Vacío = nunca gratis"
                defaultValue={vigente?.envio_gratis_desde ?? ''}
                className={clasesCampo}
              />
              <span className="font-normal text-muted-foreground">Monto de productos de la compra (sin el envío).</span>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
              Costo real de cada envío (Q)
              <input name="costo_real" type="number" step="0.01" min="0" required defaultValue={vigente?.costo_real ?? 0} className={clasesCampo} />
              <span className="font-normal text-muted-foreground">Lo que le cuesta a la empresa enviar (mensajería).</span>
            </label>
          </div>

          <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-semibold text-foreground">¿A qué compras se les cobra envío?</legend>
            {[
              { name: 'cobrar_publico', etiqueta: 'Clientes que compran por un enlace de catálogo', valor: vigente?.cobrar_publico ?? true },
              { name: 'cobrar_backoffice_cliente', etiqueta: 'Compras del backoffice "para un cliente"', valor: vigente?.cobrar_backoffice_cliente ?? true },
              { name: 'cobrar_compra_propia', etiqueta: 'Compras "para mí" (embajador, asesor, tienda)', valor: vigente?.cobrar_compra_propia ?? false },
            ].map((o) => (
              <label key={o.name} className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" name={o.name} value="si" defaultChecked={o.valor} className="h-4 w-4" />
                {o.etiqueta}
              </label>
            ))}
            <p className="text-xs text-muted-foreground">A las compras sin cobro igual se les registra el costo real del envío como gasto.</p>
          </fieldset>

          <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
            Nota del cambio <span className="font-normal text-muted-foreground">(opcional)</span>
            <input name="notas" placeholder="Ej. Nueva tarifa de mensajería desde noviembre" className={clasesCampo} />
          </label>

          <button type="submit" className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Guardar política
          </button>
        </form>

        {vigente && (
          <div className="mt-5 rounded-lg bg-secondary/50 p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-semibold text-foreground">Así se cobra hoy (cliente por enlace):</p>
            {[150, 500, 1000, 2500].map((m) => (
              <p key={m}>
                Compra de {formatearPrecio(m)} → envío <span className="font-semibold text-foreground">{vigente.cobrar_publico ? ejemplo(m) : 'Gratis'}</span>
              </p>
            ))}
          </div>
        )}
      </section>

      {historial.length > 1 && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
            <History className="h-4 w-4 text-primary" /> Historial de cambios
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Fecha</th>
                  <th className="py-2 pr-3 text-right font-semibold">Tarifa</th>
                  <th className="py-2 pr-3 text-right font-semibold">Gratis desde</th>
                  <th className="py-2 pr-3 text-right font-semibold">Costo real</th>
                  <th className="py-2 font-semibold">Nota</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((p) => (
                  <tr key={p.id} className={cn('border-b border-border last:border-0', p.activo && 'font-semibold')}>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {formatearFechaHora(p.fecha_creacion)}
                      {p.autor && ` · ${p.autor.nombre}`}
                      {p.activo && <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">vigente</span>}
                    </td>
                    <td className="py-2 pr-3 text-right">{formatearPrecio(Number(p.tarifa))}</td>
                    <td className="py-2 pr-3 text-right">{p.envio_gratis_desde != null ? formatearPrecio(Number(p.envio_gratis_desde)) : '—'}</td>
                    <td className="py-2 pr-3 text-right">{formatearPrecio(Number(p.costo_real))}</td>
                    <td className="py-2 text-xs text-muted-foreground">{p.notas ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
