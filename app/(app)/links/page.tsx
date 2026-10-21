import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, Link2, Eye, ShoppingBag, QrCode, Percent, Ban, Coins, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { tienePermiso } from '@/lib/permisos'
import { obtenerUrlBase } from '@/lib/url-publica'
import { formatearFechaHora, formatearNumero, formatearPrecio } from '@/lib/formato'
import { CopyButton } from '@/components/app/copy-button'
import { CodigoQr } from '@/components/app/codigo-qr'
import { EstadoBadge, estadosVenta } from '@/components/app/estado-badge'
import { cn } from '@/lib/utils'
import { desactivarLink, fijarComisionLink } from './acciones'

export const metadata = { title: 'Enlaces — ASTRO' }

const nombresTipo: Record<string, string> = {
  catalogo: 'Catálogo completo',
  filtrado: 'Catálogo parcial',
  subconjunto: 'Por productos',
  pieza: 'Pieza única',
}

type Filtros = {
  categorias?: number[]
  materiales?: number[]
  kilatajes?: string[]
  precio_min?: number
  precio_max?: number
}

type LinkVenta = {
  id: number
  token: string
  tipo: string
  nombre: string | null
  filtros: Filtros | null
  estado: string
  fecha_vencimiento: string | null
  contador_visitas: number
  fecha_creacion: string
  comision_embajador_pct: number | null
  vendedor_id: number
  vendedor: { nombre: string } | null
  link_productos: { count: number }[]
}

type Resumen = {
  link_id: number
  ventas: number
  ventas_pagadas: number
  monto_total: number
  monto_pagado: number
  comision_pct: number
  comision_generada: number
  comision_estimada: number
}

type VentaLink = {
  id: number
  link_id: number
  estado: string
  total: number
  fecha_creacion: string
  clientes: { nombre: string } | null
}

function estadoReal(l: LinkVenta) {
  if (l.estado === 'activo' && l.fecha_vencimiento && new Date(l.fecha_vencimiento) < new Date()) return 'vencido'
  return l.estado
}

function Metrica({ icono: Icono, etiqueta, valor, detalle }: { icono: typeof Eye; etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-secondary/60 px-3 py-2">
      <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icono className="h-3 w-3" />
        {etiqueta}
      </span>
      <span className="text-sm font-bold text-foreground">{valor}</span>
      {detalle && <span className="text-[11px] text-muted-foreground">{detalle}</span>}
    </div>
  )
}

export default async function LinksPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; nuevo?: string; estado?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (!['tienda', 'asesor', 'embajador', 'admin', 'coordinador', 'supervisor'].includes(usuario.rol)) redirect('/inicio')
  const puedeGenerar = ['tienda', 'asesor', 'embajador', 'admin'].includes(usuario.rol)

  const puedeFijarComision = await tienePermiso('links', 'fijar_comision')
  const { ok, error, nuevo, estado: filtroEstado } = await searchParams
  const supabase = await createClient()
  const baseUrl = await obtenerUrlBase()

  const [{ data }, { data: resumenData }, { data: categoriasData }, { data: materialesData }] = await Promise.all([
    supabase
      .from('links_venta')
      .select(
        `id, token, tipo, nombre, filtros, estado, fecha_vencimiento, contador_visitas, fecha_creacion,
         comision_embajador_pct, vendedor_id, vendedor:vendedor_id ( nombre ), link_productos ( count )`,
      )
      .order('fecha_creacion', { ascending: false })
      .limit(200),
    supabase.rpc('fn_resumen_links'),
    supabase.from('categorias').select('id, nombre'),
    supabase.from('materiales').select('id, nombre'),
  ])

  const todos = (data ?? []) as unknown as LinkVenta[]
  const resumen = new Map(((resumenData ?? []) as Resumen[]).map((r) => [r.link_id, r]))
  const nombreCategoria = new Map((categoriasData ?? []).map((c) => [c.id as number, c.nombre as string]))
  const nombreMaterial = new Map((materialesData ?? []).map((m) => [m.id as number, m.nombre as string]))

  const lista = todos.filter((l) => {
    const e = estadoReal(l)
    if (filtroEstado === 'activos') return e === 'activo'
    if (filtroEstado === 'inactivos') return e !== 'activo'
    return true
  })

  // Totales de lo que se está viendo.
  const totales = lista.reduce(
    (acc, l) => {
      const r = resumen.get(l.id)
      acc.visitas += l.contador_visitas
      acc.ventas += r?.ventas ?? 0
      acc.monto += Number(r?.monto_total ?? 0)
      acc.pagado += Number(r?.monto_pagado ?? 0)
      acc.comision += Number(r?.comision_generada ?? 0) > 0 ? Number(r?.comision_generada) : Number(r?.comision_estimada ?? 0)
      return acc
    },
    { visitas: 0, ventas: 0, monto: 0, pagado: 0, comision: 0 },
  )

  const ventasPorLink = new Map<number, VentaLink[]>()
  if (lista.length > 0) {
    // ventas.link_id no tiene FK declarada hacia links_venta: se consulta aparte.
    const { data: ventasData } = await supabase
      .from('ventas')
      .select('id, link_id, estado, total, fecha_creacion, clientes ( nombre )')
      .in(
        'link_id',
        lista.map((l) => l.id),
      )
      .order('fecha_creacion', { ascending: false })

    ;(ventasData as unknown as VentaLink[] | null)?.forEach((v) => {
      const grupo = ventasPorLink.get(v.link_id) ?? []
      grupo.push(v)
      ventasPorLink.set(v.link_id, grupo)
    })
  }

  function describirFiltros(f: Filtros | null) {
    if (!f) return null
    const partes: string[] = []
    if (f.categorias?.length) partes.push(f.categorias.map((id) => nombreCategoria.get(id) ?? `#${id}`).join(', '))
    if (f.materiales?.length) partes.push(f.materiales.map((id) => nombreMaterial.get(id) ?? `#${id}`).join(', '))
    if (f.kilatajes?.length) partes.push(f.kilatajes.join(', '))
    if (f.precio_min != null && f.precio_max != null)
      partes.push(`${formatearPrecio(f.precio_min)} – ${formatearPrecio(f.precio_max)}`)
    else if (f.precio_min != null) partes.push(`desde ${formatearPrecio(f.precio_min)}`)
    else if (f.precio_max != null) partes.push(`hasta ${formatearPrecio(f.precio_max)}`)
    return partes.join(' · ')
  }

  const nuevoLink = nuevo ? todos.find((l) => l.token === nuevo) : undefined
  const pestanas = [
    { valor: undefined, etiqueta: 'Todos' },
    { valor: 'activos', etiqueta: 'Activos' },
    { valor: 'inactivos', etiqueta: 'Vencidos / desactivados' },
  ]

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Enlaces de venta</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tus catálogos compartidos: cada venta que entra por un enlace se registra a nombre de quien lo creó.
          </p>
        </div>
        {puedeGenerar && (
          <Link
            href="/catalogo/generar-link"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
          >
            <Link2 className="h-4 w-4" />
            Generar link
          </Link>
        )}
      </div>

      {nuevoLink && (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <CheckCircle2 className="h-4 w-4" />
            Enlace generado: {nuevoLink.nombre ?? nombresTipo[nuevoLink.tipo]}
          </p>
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-background px-3 py-2 text-xs text-muted-foreground">
            <span className="flex-1 truncate font-mono">{`${baseUrl}/c/${nuevoLink.token}`}</span>
            <CopyButton texto={`${baseUrl}/c/${nuevoLink.token}`} />
          </div>
        </div>
      )}
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

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { etiqueta: 'Enlaces', valor: formatearNumero(lista.length) },
          { etiqueta: 'Visitas', valor: formatearNumero(totales.visitas) },
          { etiqueta: 'Ventas', valor: formatearNumero(totales.ventas) },
          { etiqueta: 'Monto vendido', valor: formatearPrecio(totales.monto), detalle: `${formatearPrecio(totales.pagado)} pagado` },
          { etiqueta: 'Comisiones', valor: formatearPrecio(totales.comision) },
        ].map((t) => (
          <div key={t.etiqueta} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.etiqueta}</p>
            <p className="mt-1 text-lg font-bold text-foreground">{t.valor}</p>
            {t.detalle && <p className="text-xs text-muted-foreground">{t.detalle}</p>}
          </div>
        ))}
      </section>

      <nav className="flex flex-wrap gap-2">
        {pestanas.map((p) => (
          <Link
            key={p.etiqueta}
            href={p.valor ? `/links?estado=${p.valor}` : '/links'}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
              filtroEstado === p.valor ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-primary',
            )}
          >
            {p.etiqueta}
          </Link>
        ))}
      </nav>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Link2 className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">No hay enlaces aquí</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Genera uno desde el catálogo: completo, parcial por categorías o eligiendo las piezas.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map((l) => {
            const r = resumen.get(l.id)
            const ventasLink = ventasPorLink.get(l.id) ?? []
            const url = `${baseUrl}/c/${l.token}`
            const estado = estadoReal(l)
            const pct = Number(r?.comision_pct ?? l.comision_embajador_pct ?? 0)
            const generada = Number(r?.comision_generada ?? 0)
            const estimada = Number(r?.comision_estimada ?? 0)
            const esMio = l.vendedor_id === usuario.id
            const piezasSeleccionadas = l.link_productos?.[0]?.count ?? 0
            const filtrosTexto = l.tipo === 'filtrado' ? describirFiltros(l.filtros) : null
            return (
              <div
                key={l.id}
                className={cn(
                  'flex flex-col gap-3 rounded-xl border bg-card p-4',
                  l.token === nuevo ? 'border-primary ring-1 ring-primary' : 'border-border',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{l.nombre ?? nombresTipo[l.tipo] ?? l.tipo}</p>
                    <p className="text-xs text-muted-foreground">
                      {nombresTipo[l.tipo] ?? l.tipo}
                      {(l.tipo === 'subconjunto' || l.tipo === 'pieza') && ` · ${piezasSeleccionadas} pieza(s)`}
                      {filtrosTexto && ` · ${filtrosTexto}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {!esMio && l.vendedor && <>De {l.vendedor.nombre} · </>}
                      Creado {formatearFechaHora(l.fecha_creacion)}
                      {l.fecha_vencimiento ? ` · Vence ${formatearFechaHora(l.fecha_vencimiento)}` : ' · Sin vencimiento'}
                    </p>
                  </div>
                  <span
                    className={
                      estado === 'activo'
                        ? 'rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary'
                        : 'rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground'
                    }
                  >
                    {estado === 'activo' ? 'Activo' : estado === 'vencido' ? 'Vencido' : 'Desactivado'}
                  </span>
                </div>

                {estado === 'activo' && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
                    <span className="flex-1 truncate font-mono">{url}</span>
                    <CopyButton texto={url} />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metrica icono={Eye} etiqueta="Visitas" valor={formatearNumero(l.contador_visitas)} />
                  <Metrica
                    icono={ShoppingBag}
                    etiqueta="Ventas"
                    valor={formatearNumero(r?.ventas ?? 0)}
                    detalle={`${r?.ventas_pagadas ?? 0} pagada(s)`}
                  />
                  <Metrica
                    icono={Wallet}
                    etiqueta="Monto vendido"
                    valor={formatearPrecio(Number(r?.monto_total ?? 0))}
                    detalle={`${formatearPrecio(Number(r?.monto_pagado ?? 0))} pagado`}
                  />
                  <Metrica
                    icono={Coins}
                    etiqueta="Comisión"
                    valor={formatearPrecio(generada > 0 ? generada : estimada)}
                    detalle={generada > 0 ? 'calculada' : `estimada · ${formatearNumero(pct)}%`}
                  />
                </div>

                {ventasLink.length > 0 && (
                  <details>
                    <summary className="w-fit cursor-pointer list-none text-xs font-semibold text-primary">
                      Ver ventas generadas ({ventasLink.length})
                    </summary>
                    <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                      <table className="w-full min-w-[420px] text-xs">
                        <thead>
                          <tr className="border-b border-border bg-secondary/40 text-left uppercase tracking-wide text-muted-foreground">
                            <th className="px-3 py-1.5 font-semibold">Venta</th>
                            <th className="px-3 py-1.5 font-semibold">Cliente</th>
                            <th className="px-3 py-1.5 font-semibold">Estado</th>
                            <th className="px-3 py-1.5 font-semibold">Fecha</th>
                            <th className="px-3 py-1.5 text-right font-semibold">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ventasLink.map((v) => (
                            <tr key={v.id} className="border-b border-border last:border-0">
                              <td className="px-3 py-1.5 text-foreground">
                                <a href={`/ventas#venta-${v.id}`} className="font-semibold hover:underline">
                                  #{v.id}
                                </a>
                              </td>
                              <td className="px-3 py-1.5 text-muted-foreground">{v.clientes?.nombre ?? '—'}</td>
                              <td className="px-3 py-1.5">
                                <EstadoBadge estado={v.estado} config={estadosVenta} />
                              </td>
                              <td className="px-3 py-1.5 text-muted-foreground">{formatearFechaHora(v.fecha_creacion)}</td>
                              <td className="px-3 py-1.5 text-right font-semibold text-foreground">{formatearPrecio(v.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {estado === 'activo' && (
                    <details className="w-full sm:w-auto">
                      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-primary">
                        <QrCode className="h-3.5 w-3.5" />
                        Ver código QR
                      </summary>
                      <div className="flex flex-col items-center gap-2 pt-3">
                        <CodigoQr url={url} alt={`Código QR — ${l.nombre ?? nombresTipo[l.tipo] ?? l.tipo}`} />
                        <p className="text-center text-xs text-muted-foreground">Escanéalo para abrir este enlace directamente.</p>
                      </div>
                    </details>
                  )}

                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Percent className="h-3.5 w-3.5" />
                    Comisión por catálogo: <span className="font-semibold text-foreground">{formatearNumero(pct)}%</span>
                    {l.comision_embajador_pct == null && <span>(por defecto)</span>}
                  </span>

                  {estado === 'activo' && (esMio || usuario.rol === 'admin') && (
                    <form action={desactivarLink} className="ml-auto">
                      <input type="hidden" name="link_id" value={l.id} />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-destructive"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Desactivar
                      </button>
                    </form>
                  )}
                </div>

                {puedeFijarComision && (
                  <details>
                    <summary className="w-fit cursor-pointer list-none text-xs font-semibold text-primary">
                      Ajustar % de este enlace
                    </summary>
                    <form action={fijarComisionLink} className="mt-2 flex items-center gap-2">
                      <input type="hidden" name="link_id" value={l.id} />
                      <input
                        name="pct"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        defaultValue={l.comision_embajador_pct ?? ''}
                        placeholder={String(pct)}
                        className="w-24 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
                      >
                        Guardar
                      </button>
                    </form>
                  </details>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Las ventas anuladas no suman. La comisión se muestra «calculada» cuando ya está registrada en comisiones; mientras
        tanto se estima con el % de catálogo del enlace.
      </p>
    </main>
  )
}
