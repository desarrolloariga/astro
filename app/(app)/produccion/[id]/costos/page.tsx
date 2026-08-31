import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Receipt, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { formatearPrecio, formatearFechaHora } from '@/lib/formato'

export const metadata = { title: 'Hoja de costos — ASTRO' }

const nombresFuente: Record<string, string> = {
  manual: 'Costo manual',
  compra: 'Costo real de compra',
  importacion: 'Costo real de importación (nacionalizado)',
}

type Producto = {
  id: number
  codigo: string
  nombre: string
  origen: string
  costo_produccion: number | null
  precio_venta: number | null
  categorias: { nombre: string } | null
}

type Snapshot = {
  id: number
  costo_base: number
  fuente_costo: string
  costo_logistico: number
  precio_antes_embajador: number
  precio_sin_impuesto: number
  base_comisionable: number
  impuesto: number
  precio_final: number
  factor_margen_empresa_pct: number | null
  factor_envio_pct: number | null
  factor_empaque_pct: number | null
  factor_comision_pct: number | null
  factor_impuesto_pct: number | null
  motivo: string
  fecha_creacion: string
  usuarios: { nombre: string } | null
}

function Fila({
  etiqueta,
  valor,
  detalle,
  destacado,
}: {
  etiqueta: string
  valor: string
  detalle?: string
  destacado?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0">
      <div>
        <p className={destacado ? 'text-sm font-semibold text-foreground' : 'text-sm text-muted-foreground'}>
          {etiqueta}
        </p>
        {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
      </div>
      <p className={destacado ? 'text-base font-bold text-foreground' : 'text-sm font-semibold text-foreground'}>
        {valor}
      </p>
    </div>
  )
}

export default async function HojaDeCostosPage({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await obtenerUsuarioActual()
  const { id } = await params
  const supabase = await createClient()

  const [{ data: pieza }, { data: historialData }] = await Promise.all([
    supabase
      .from('productos')
      .select('id, codigo, nombre, origen, costo_produccion, precio_venta, categorias ( nombre )')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('producto_precio_historial')
      .select(
        'id, costo_base, fuente_costo, costo_logistico, precio_antes_embajador, precio_sin_impuesto, base_comisionable, impuesto, precio_final, factor_margen_empresa_pct, factor_envio_pct, factor_empaque_pct, factor_comision_pct, factor_impuesto_pct, motivo, fecha_creacion, usuarios:calculado_por ( nombre )',
      )
      .eq('producto_id', id)
      .order('fecha_creacion', { ascending: false }),
  ])

  // producto_precio_historial y productos ya filtran por RLS quién
  // puede ver costos (admin/contabilidad/coordinador, o produccion
  // solo lo suyo) — si no hay fila visible, no existe para este usuario.
  const producto = pieza as unknown as Producto | null
  if (!producto) notFound()

  const historial = (historialData ?? []) as unknown as Snapshot[]
  const ultimo = historial[0] ?? null
  const volverA = usuario.rol === 'produccion' || usuario.rol === 'admin' ? '/produccion' : '/inicio'

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <Link
          href={volverA}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Hoja de costos — {producto.nombre}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {producto.codigo} · {producto.categorias?.nombre ?? 'Sin categoría'}
        </p>
      </div>

      {!ultimo ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Receipt className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Todavía no se ha calculado un precio</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Indica el costo de producción y guarda la pieza para generar el primer cálculo.
          </p>
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-1 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Desglose vigente
              </h2>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              {nombresFuente[ultimo.fuente_costo] ?? ultimo.fuente_costo} · calculado{' '}
              {formatearFechaHora(ultimo.fecha_creacion)}
              {ultimo.usuarios?.nombre && ` por ${ultimo.usuarios.nombre}`}
            </p>

            <Fila etiqueta="Costo base" valor={formatearPrecio(ultimo.costo_base)} />
            <Fila
              etiqueta="Costo logístico"
              detalle={`+ envío ${ultimo.factor_envio_pct ?? 0}% + empaque ${ultimo.factor_empaque_pct ?? 0}%`}
              valor={formatearPrecio(ultimo.costo_logistico)}
            />
            <Fila
              etiqueta="Precio antes de embajador"
              detalle={`Costo logístico ÷ (1 − ${ultimo.factor_margen_empresa_pct ?? 0}% margen empresa)`}
              valor={formatearPrecio(ultimo.precio_antes_embajador)}
            />
            <Fila
              etiqueta="Comisión del embajador"
              detalle={`${ultimo.factor_comision_pct ?? 0}% sobre el precio antes de embajador`}
              valor={formatearPrecio(ultimo.base_comisionable)}
            />
            <Fila etiqueta="Precio sin impuesto" valor={formatearPrecio(ultimo.precio_sin_impuesto)} />
            <Fila
              etiqueta="Impuesto (IVA)"
              detalle={`${ultimo.factor_impuesto_pct ?? 0}%`}
              valor={formatearPrecio(ultimo.impuesto)}
            />
            <Fila etiqueta="Precio final al consumidor" valor={formatearPrecio(ultimo.precio_final)} destacado />
          </section>

          {historial.length > 1 && (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
                <History className="h-4 w-4 text-primary" />
                Historial de cálculos
              </h2>
              <div className="flex flex-col gap-2">
                {historial.map((h) => (
                  <div key={h.id} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>
                      {formatearFechaHora(h.fecha_creacion)} · {h.motivo}
                      {h.usuarios?.nombre && ` · ${h.usuarios.nombre}`}
                    </span>
                    <span className="font-semibold text-foreground">{formatearPrecio(h.precio_final)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
}
