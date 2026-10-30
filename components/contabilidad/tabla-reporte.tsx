import { cn } from '@/lib/utils'
import { ESTILO, formatoCelda, type ReporteTabla } from '@/lib/reportes/tabla'
import { EncabezadoReporte } from './filtro-rango'

/** Muestra en pantalla cualquier reporte construido para PDF/Excel (mismo contenido). */
export function TablaReporte({ r }: { r: ReporteTabla }) {
  const derecha = (t?: string) => t === 'monto' || t === 'numero'
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <EncabezadoReporte razonSocial={r.razonSocial} nit={r.nit ?? '—'} titulo={r.titulo} periodo={r.periodo} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {r.columnas.map((c) => (
                <th key={c.clave} className={cn('whitespace-nowrap px-2 py-2', derecha(c.tipo) ? 'text-right' : 'text-left')}>
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.filas.length === 0 && (
              <tr>
                <td colSpan={r.columnas.length} className="px-2 py-8 text-center text-muted-foreground">
                  Sin movimientos contabilizados en el período.
                </td>
              </tr>
            )}
            {r.filas.map((f, i) => {
              const estilo = f[ESTILO]
              return (
                <tr
                  key={i}
                  className={cn(
                    'border-b border-border/40',
                    estilo === 'titulo' && 'bg-muted/50 font-semibold',
                    estilo === 'subtotal' && 'font-semibold',
                    estilo === 'total' && 'border-t border-foreground/30 font-bold',
                  )}
                >
                  {r.columnas.map((c) => (
                    <td
                      key={c.clave}
                      className={cn('whitespace-pre px-2 py-1', derecha(c.tipo) && 'text-right tabular-nums', c.clave === 'codigo' && 'font-mono text-xs text-muted-foreground')}
                    >
                      {Array.isArray(f[c.clave]) ? (f[c.clave] as unknown[]).join(', ') : formatoCelda(f[c.clave], c.tipo)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
          {r.totales && (
            <tfoot className="border-t-2 border-foreground/40 font-bold">
              <tr>
                {r.columnas.map((c) => (
                  <td key={c.clave} className={cn('px-2 py-2', derecha(c.tipo) && 'text-right tabular-nums')}>
                    {formatoCelda(r.totales?.[c.clave], c.tipo)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {r.nota && <p className="text-xs text-muted-foreground">{r.nota}</p>}
    </div>
  )
}
