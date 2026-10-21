import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ClipboardCheck, CheckCircle2, AlertCircle, MapPin, Package, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearFechaHora } from '@/lib/formato'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Torre de control — ASTRO' }

type Fila = {
  id: number
  estado: string
  fecha_aprobacion_pago: string | null
  fecha_preparacion: string | null
  fecha_despacho: string | null
  ciudad: string | null
  departamento: string | null
  nombre_destinatario: string | null
  ventas: { id: number; venta_detalles: { cantidad: number }[] } | null
}

function horasDesde(fecha: string | null) {
  if (!fecha) return null
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 3_600_000)
}

function Antiguedad({ fecha }: { fecha: string | null }) {
  const h = horasDesde(fecha)
  if (h == null) return null
  const texto = h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`
  // Más de 24 h sin moverse desde la aprobación = alerta.
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', h >= 24 ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
      <Clock className="h-3 w-3" />
      {texto}
    </span>
  )
}

function Tarjeta({ p, fechaRef }: { p: Fila; fechaRef: string | null }) {
  const unidades = (p.ventas?.venta_detalles ?? []).reduce((a, d) => a + d.cantidad, 0)
  return (
    <Link
      href={`/logistica/${p.id}`}
      className="flex flex-col gap-1.5 rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground">Pedido #{p.id}</span>
        <Antiguedad fecha={fechaRef} />
      </div>
      <p className="truncate text-sm text-foreground">{p.nombre_destinatario ?? '—'}</p>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 truncate">
          <MapPin className="h-3 w-3 shrink-0" />
          {[p.ciudad, p.departamento].filter(Boolean).join(', ') || 'Sin ciudad'}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1">
          <Package className="h-3 w-3" />
          {unidades}
        </span>
      </div>
    </Link>
  )
}

export default async function TorreControlPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  if (!(await tienePermiso('pedidos', 'despachar'))) redirect('/inicio')
  const { ok, error } = await searchParams
  const supabase = await createClient()

  const hace14Dias = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const columnas = 'id, estado, fecha_aprobacion_pago, fecha_preparacion, fecha_despacho, ciudad, departamento, nombre_destinatario, ventas ( id, venta_detalles ( cantidad ) )'

  const [{ data: porPreparar }, { data: enPreparacion }, { data: enviados }] = await Promise.all([
    supabase.from('pedidos').select(columnas).eq('estado', 'listo_para_despacho').order('fecha_aprobacion_pago', { ascending: true }),
    supabase.from('pedidos').select(columnas).eq('estado', 'en_preparacion').order('fecha_preparacion', { ascending: true }),
    supabase
      .from('pedidos')
      .select(columnas)
      .in('estado', ['despachado', 'entregado'])
      .gte('fecha_despacho', hace14Dias)
      .order('fecha_despacho', { ascending: false }),
  ])

  const listas = {
    porPreparar: (porPreparar ?? []) as unknown as Fila[],
    enPreparacion: (enPreparacion ?? []) as unknown as Fila[],
    enviados: (enviados ?? []) as unknown as Fila[],
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          Torre de control
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pedidos con el pago aprobado por contabilidad: prepara, verifica cada artículo, firma y envía.
        </p>
      </div>

      {ok && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{ok}</span>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[
          { titulo: 'Por preparar', lista: listas.porPreparar, fecha: (p: Fila) => p.fecha_aprobacion_pago, acento: 'border-t-brand-deep' },
          { titulo: 'En preparación', lista: listas.enPreparacion, fecha: (p: Fila) => p.fecha_preparacion, acento: 'border-t-amber-500' },
          { titulo: 'Enviados (14 días)', lista: listas.enviados, fecha: (p: Fila) => p.fecha_despacho, acento: 'border-t-emerald-600' },
        ].map((col) => (
          <section key={col.titulo} className={cn('flex flex-col gap-3 rounded-xl border border-t-4 border-border bg-card p-4', col.acento)}>
            <h2 className="flex items-center justify-between text-sm font-bold uppercase tracking-wide text-muted-foreground">
              {col.titulo}
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-foreground">{col.lista.length}</span>
            </h2>
            {col.lista.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Nada por aquí.</p>
            ) : (
              col.lista.map((p) => <Tarjeta key={p.id} p={p} fechaRef={col.titulo.startsWith('Enviados') ? null : col.fecha(p)} />)
            )}
          </section>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        La antigüedad se marca en rojo cuando un pedido lleva 24 h o más sin avanzar. Última actualización:{' '}
        {formatearFechaHora(new Date())}.
      </p>
    </main>
  )
}
