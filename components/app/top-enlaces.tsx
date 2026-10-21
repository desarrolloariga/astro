import Link from 'next/link'
import { ArrowDownWideNarrow, Coins, Eye, Percent, ShoppingBag, Trophy, Wallet } from 'lucide-react'
import { formatearNumero, formatearPrecio } from '@/lib/formato'
import { cn } from '@/lib/utils'

export type FilaTop = {
  id: number
  nombre: string
  tipo: string
  dueno: string | null
  activo: boolean
  visitas: number
  ventas: number
  monto: number
  comision: number
}

export type OrdenTop = 'visitas' | 'ventas' | 'monto' | 'comision' | 'conversion'

const ORDENES: { valor: OrdenTop; etiqueta: string }[] = [
  { valor: 'ventas', etiqueta: 'Ventas' },
  { valor: 'monto', etiqueta: 'Monto' },
  { valor: 'comision', etiqueta: 'Comisión' },
  { valor: 'visitas', etiqueta: 'Visitas' },
  { valor: 'conversion', etiqueta: 'Conversión' },
]

const conversion = (f: { visitas: number; ventas: number }) => (f.visitas > 0 ? (f.ventas / f.visitas) * 100 : 0)
const pct = (n: number) => `${formatearNumero(Math.round(n * 10) / 10)}%`

function Ranking({
  titulo,
  icono: Icono,
  filas,
  valor,
  formato,
}: {
  titulo: string
  icono: typeof Eye
  filas: FilaTop[]
  valor: (f: FilaTop) => number
  formato: (n: number) => string
}) {
  const top = [...filas].filter((f) => valor(f) > 0).sort((a, b) => valor(b) - valor(a)).slice(0, 5)
  const max = top.length ? valor(top[0]) : 0
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Icono className="h-4 w-4 text-primary" />
        {titulo}
      </h3>
      {top.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Aún sin datos.</p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {top.map((f, i) => (
            <li key={f.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                      i === 0 ? 'bg-amber-400 text-amber-950' : 'bg-secondary text-muted-foreground',
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="truncate font-medium text-foreground">{f.nombre}</span>
                </span>
                <span className="shrink-0 font-semibold text-foreground">{formato(valor(f))}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary" style={{ width: `${max > 0 ? (valor(f) / max) * 100 : 0}%` }} />
              </div>
              {f.dueno && <span className="text-[10px] text-muted-foreground">de {f.dueno}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** Pestaña "Top y métricas" del módulo de Enlaces. */
export function TopEnlaces({
  filas,
  orden,
  nombresTipo,
}: {
  filas: FilaTop[]
  orden: OrdenTop
  nombresTipo: Record<string, string>
}) {
  const tot = filas.reduce(
    (a, f) => ({
      visitas: a.visitas + f.visitas,
      ventas: a.ventas + f.ventas,
      monto: a.monto + f.monto,
      comision: a.comision + f.comision,
    }),
    { visitas: 0, ventas: 0, monto: 0, comision: 0 },
  )
  const conVentas = filas.filter((f) => f.ventas > 0).length

  // Rendimiento por tipo de catálogo (completo, parcial, por productos, pieza).
  const porTipo = [...filas.reduce((m, f) => {
    const t = m.get(f.tipo) ?? { tipo: f.tipo, enlaces: 0, visitas: 0, ventas: 0, monto: 0 }
    t.enlaces++
    t.visitas += f.visitas
    t.ventas += f.ventas
    t.monto += f.monto
    m.set(f.tipo, t)
    return m
  }, new Map<string, { tipo: string; enlaces: number; visitas: number; ventas: number; monto: number }>()).values()].sort(
    (a, b) => b.monto - a.monto,
  )

  const valorOrden = (f: FilaTop) =>
    orden === 'conversion' ? conversion(f) : orden === 'visitas' ? f.visitas : orden === 'monto' ? f.monto : orden === 'comision' ? f.comision : f.ventas
  const tabla = [...filas].sort((a, b) => valorOrden(b) - valorOrden(a) || b.visitas - a.visitas)

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { etiqueta: 'Conversión', valor: pct(conversion(tot)), detalle: `${formatearNumero(tot.ventas)} ventas de ${formatearNumero(tot.visitas)} visitas` },
          { etiqueta: 'Ticket promedio', valor: formatearPrecio(tot.ventas > 0 ? tot.monto / tot.ventas : 0), detalle: 'monto ÷ ventas' },
          { etiqueta: 'Enlaces que venden', valor: `${conVentas} de ${filas.length}`, detalle: filas.length ? pct((conVentas / filas.length) * 100) : '—' },
          { etiqueta: 'Comisión por visita', valor: formatearPrecio(tot.visitas > 0 ? tot.comision / tot.visitas : 0), detalle: 'lo que vale cada visita' },
        ].map((t) => (
          <div key={t.etiqueta} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.etiqueta}</p>
            <p className="mt-1 text-lg font-bold text-foreground">{t.valor}</p>
            <p className="text-xs text-muted-foreground">{t.detalle}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Ranking titulo="Más visitados" icono={Eye} filas={filas} valor={(f) => f.visitas} formato={formatearNumero} />
        <Ranking titulo="Más ventas" icono={ShoppingBag} filas={filas} valor={(f) => f.ventas} formato={formatearNumero} />
        <Ranking titulo="Mayor monto" icono={Wallet} filas={filas} valor={(f) => f.monto} formato={formatearPrecio} />
        <Ranking titulo="Mayor comisión" icono={Coins} filas={filas} valor={(f) => f.comision} formato={formatearPrecio} />
      </section>

      {porTipo.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
            <Percent className="h-4 w-4 text-primary" />
            Rendimiento por tipo de catálogo
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {porTipo.map((t) => (
              <div key={t.tipo} className="rounded-lg bg-secondary/50 p-3">
                <p className="text-sm font-semibold text-foreground">{nombresTipo[t.tipo] ?? t.tipo}</p>
                <p className="text-xs text-muted-foreground">
                  {t.enlaces} enlace{t.enlaces !== 1 ? 's' : ''} · {formatearNumero(t.visitas)} visitas
                </p>
                <p className="mt-1 text-sm font-bold text-foreground">{formatearPrecio(t.monto)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatearNumero(t.ventas)} ventas · conversión {pct(conversion(t))}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Trophy className="h-4 w-4 text-primary" />
            Todos los enlaces
          </h3>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <ArrowDownWideNarrow className="h-3.5 w-3.5 text-muted-foreground" />
            {ORDENES.map((o) => (
              <Link
                key={o.valor}
                href={`/links?vista=top&orden=${o.valor}`}
                className={cn(
                  'rounded-full border px-2.5 py-1 font-semibold transition-colors',
                  orden === o.valor ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:border-primary',
                )}
              >
                {o.etiqueta}
              </Link>
            ))}
          </div>
        </div>
        {tabla.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Aún no hay enlaces.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-2 font-semibold">#</th>
                  <th className="py-2 pr-3 font-semibold">Enlace</th>
                  <th className="py-2 pr-3 text-right font-semibold">Visitas</th>
                  <th className="py-2 pr-3 text-right font-semibold">Ventas</th>
                  <th className="py-2 pr-3 text-right font-semibold">Conversión</th>
                  <th className="py-2 pr-3 text-right font-semibold">Monto</th>
                  <th className="py-2 text-right font-semibold">Comisión</th>
                </tr>
              </thead>
              <tbody>
                {tabla.map((f, i) => (
                  <tr key={f.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-2 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <p className="font-medium text-foreground">{f.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {nombresTipo[f.tipo] ?? f.tipo}
                        {f.dueno ? ` · de ${f.dueno}` : ''}
                        {!f.activo && ' · inactivo'}
                      </p>
                    </td>
                    <td className="py-2 pr-3 text-right text-foreground">{formatearNumero(f.visitas)}</td>
                    <td className="py-2 pr-3 text-right text-foreground">{formatearNumero(f.ventas)}</td>
                    <td className="py-2 pr-3 text-right text-foreground">{pct(conversion(f))}</td>
                    <td className="py-2 pr-3 text-right font-semibold text-foreground">{formatearPrecio(f.monto)}</td>
                    <td className="py-2 text-right text-foreground">{formatearPrecio(f.comision)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Métricas acumuladas desde la creación de cada enlace. Las ventas anuladas no cuentan. La comisión es la calculada o, si
        aún no se calcula, la estimada con el % de catálogo del enlace.
      </p>
    </div>
  )
}
