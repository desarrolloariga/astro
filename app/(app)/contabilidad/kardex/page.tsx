import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Boxes, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { hoyGuatemala } from '@/lib/contabilidad'
import { clasesCampo, esFecha, montoContable, textoAlCorte, textoPeriodo } from '@/lib/contabilidad-general'
import { Encabezado, Mensajes } from '@/components/contabilidad/comunes'
import { EncabezadoReporte } from '@/components/contabilidad/filtro-rango'

export const metadata = { title: 'Kardex PEPS — ASTRO' }

const TIPOS_KARDEX: Record<string, string> = {
  saldo_inicial: 'Saldo inicial',
  entrada_alta: 'Entrada · alta de producto',
  entrada_compra: 'Entrada · compra',
  entrada_ajuste: 'Entrada · ajuste de existencias',
  devolucion_venta: 'Entrada · devolución (venta anulada)',
  sobrante_toma: 'Entrada · sobrante de toma física',
  salida_venta: 'Salida · venta',
  faltante_toma: 'Salida · faltante de toma física',
}

const DOCUMENTOS: Record<string, string> = {
  saldo_inicial: 'Saldo inicial',
  publicacion: 'Alta de producto',
  carga_masiva: 'Carga masiva',
  orden_compra: 'Orden de compra',
  ajuste: 'Ajuste',
  venta: 'Venta',
  toma_fisica: 'Toma física',
}

type Kardex = {
  producto: {
    id: number
    codigo: string
    nombre: string
    codigo_barras: string | null
    categoria: string | null
    material: string | null
    peso_gramos: number | null
    modo_inventario: string
    unidad: string
    estado: string
  }
  saldo_inicial: { cantidad: number; valor: number }
  saldo_final: { cantidad: number; valor: number }
  movimientos: {
    id: number
    fecha: string
    tipo: string
    documento_tipo: string
    documento_id: number | null
    documento_ref: string | null
    bodega: string | null
    entrada: number | null
    salida: number | null
    costo_unitario: number
    costo_total: number
    saldo_cantidad: number
    saldo_valor: number
    costo_promedio: number | null
    peso: number
    sin_capa: number
  }[]
  capas: { id: number; fecha: string; cantidad_inicial: number; cantidad_restante: number; costo_unitario: number }[]
}

type Resumen = {
  total: number
  totales: { cantidad: number; valor: number }
  filas: { id: number; codigo: string; nombre: string; categoria: string | null; cantidad: number; valor: number; costo_promedio: number | null }[]
}

const cant = (n: number | null | undefined) => (n == null ? '' : Number(n).toLocaleString('es-GT', { maximumFractionDigits: 3 }))
const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Guatemala' })

export default async function KardexPage({
  searchParams,
}: {
  searchParams: Promise<{ producto?: string; q?: string; desde?: string; hasta?: string; pagina?: string }>
}) {
  const sp = await searchParams
  const hoy = hoyGuatemala()
  const desde = esFecha(sp.desde) ? sp.desde : `${hoy.slice(0, 4)}-01-01`
  const hasta = esFecha(sp.hasta) ? sp.hasta : hoy
  const q = (sp.q ?? '').trim()
  const pagina = Math.max(1, Number(sp.pagina) || 1)
  const supabase = await createClient()

  // Búsqueda por código exacto (o código de barras) → directo al Kardex del artículo.
  let productoId = Number(sp.producto) > 0 ? Number(sp.producto) : null
  const [puedeContab, puedeFinanzas, exacto, { data: empresa }] = await Promise.all([
    tienePermiso('contabilidad', 'ver'),
    tienePermiso('finanzas', 'ver'),
    !productoId && q
      ? supabase.from('productos').select('id').eq('activo', true).or(`codigo.ilike.${q.replace(/[,()]/g, '')},codigo_barras.eq.${q.replace(/[,()]/g, '')}`).limit(1)
      : Promise.resolve({ data: null }),
    supabase.from('empresa_contable').select('razon_social, nit').eq('id', 1).maybeSingle(),
  ])
  if (!puedeContab && !puedeFinanzas) redirect('/inicio')
  if (!productoId && exacto.data?.[0]) productoId = (exacto.data[0] as { id: number }).id

  const [{ data: kardexData, error: errorKardex }, { data: resumenData, error: errorResumen }] = await Promise.all([
    productoId
      ? supabase.rpc('fn_kardex', { p_producto_id: productoId, p_desde: desde, p_hasta: hasta })
      : Promise.resolve({ data: null, error: null }),
    productoId
      ? Promise.resolve({ data: null, error: null })
      : supabase.rpc('fn_kardex_resumen', { p_hasta: hasta, p_buscar: q || null, p_offset: (pagina - 1) * 100, p_limit: 100 }),
  ])
  const kardex = kardexData as Kardex | null
  const resumen = resumenData as Resumen | null
  const razon = (empresa as { razon_social: string } | null)?.razon_social ?? '—'
  const nit = (empresa as { nit: string } | null)?.nit ?? '—'

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={Boxes}
        titulo="Kardex PEPS"
        descripcion="Inventario valorizado por el método de primeras entradas, primeras salidas (Art. 41, Ley de Actualización Tributaria). Cada venta consume el costo de las unidades más antiguas."
      />
      <Mensajes error={errorKardex?.message ?? errorResumen?.message} />

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3 print:hidden">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-semibold text-foreground">
          Código del artículo
          <span className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input name="q" defaultValue={kardex ? kardex.producto.codigo : q} placeholder="Código, código de barras o nombre" className={cn(clasesCampo, 'pl-8')} />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Del
          <input name="desde" type="date" defaultValue={desde} className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Al
          <input name="hasta" type="date" defaultValue={hasta} className={clasesCampo} />
        </label>
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          Consultar
        </button>
        {kardex && (
          <Link href={`/contabilidad/kardex?hasta=${hasta}`} className="py-2 text-sm font-semibold text-primary hover:underline">
            ← Inventario valorizado
          </Link>
        )}
      </form>

      {kardex ? (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <EncabezadoReporte razonSocial={razon} nit={nit} titulo="Kardex de inventario (PEPS)" periodo={textoPeriodo(desde, hasta)} />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Código</dt>
              <dd className="font-mono font-semibold">{kardex.producto.codigo}</dd>
            </div>
            <div className="col-span-1 sm:col-span-3">
              <dt className="text-xs text-muted-foreground">Artículo</dt>
              <dd className="font-semibold">{kardex.producto.nombre}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Categoría</dt>
              <dd>{kardex.producto.categoria ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Material</dt>
              <dd>{kardex.producto.material ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Unidad de medida</dt>
              <dd>{kardex.producto.unidad}{kardex.producto.modo_inventario === 'pieza_unica' ? ' (pieza única)' : ''}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Peso por unidad</dt>
              <dd>{kardex.producto.peso_gramos ? `${cant(kardex.producto.peso_gramos)} g` : '—'}</dd>
            </div>
          </dl>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-xs">
              <thead className="border-b border-border text-muted-foreground">
                <tr className="uppercase tracking-wide">
                  <th rowSpan={2} className="px-1.5 py-1 text-left">Fecha</th>
                  <th rowSpan={2} className="px-1.5 py-1 text-left">Tipo de movimiento</th>
                  <th rowSpan={2} className="px-1.5 py-1 text-left">Documento</th>
                  <th colSpan={3} className="border-l border-border px-1.5 pt-1 text-center">Entradas</th>
                  <th colSpan={3} className="border-l border-border px-1.5 pt-1 text-center">Salidas</th>
                  <th colSpan={3} className="border-l border-border px-1.5 pt-1 text-center">Saldo</th>
                  <th rowSpan={2} className="border-l border-border px-1.5 py-1 text-right">Peso (g)</th>
                </tr>
                <tr>
                  {['Cant.', 'C. unit.', 'Total', 'Cant.', 'C. unit.', 'Total', 'Cant.', 'C. prom.', 'Total'].map((h, i) => (
                    <th key={i} className={cn('px-1.5 py-1 text-right', i % 3 === 0 && 'border-l border-border')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/60 bg-muted/30 font-semibold">
                  <td className="px-1.5 py-1" colSpan={3}>
                    Saldo inicial al {desde.split('-').reverse().join('/')}
                  </td>
                  <td colSpan={6} className="border-l border-border/60" />
                  <td className="border-l border-border/60 px-1.5 py-1 text-right tabular-nums">{cant(kardex.saldo_inicial.cantidad)}</td>
                  <td className="px-1.5 py-1 text-right tabular-nums">
                    {Number(kardex.saldo_inicial.cantidad) ? montoContable(Number(kardex.saldo_inicial.valor) / Number(kardex.saldo_inicial.cantidad)) : ''}
                  </td>
                  <td className="px-1.5 py-1 text-right tabular-nums">{montoContable(kardex.saldo_inicial.valor)}</td>
                  <td className="border-l border-border/60" />
                </tr>
                {kardex.movimientos.map((m) => (
                  <tr key={m.id} className="border-b border-border/40">
                    <td className="whitespace-nowrap px-1.5 py-1">{fechaCorta(m.fecha)}</td>
                    <td className="px-1.5 py-1">
                      {TIPOS_KARDEX[m.tipo] ?? m.tipo}
                      {Number(m.sin_capa) > 0 && (
                        <span className="ml-1 text-amber-700" title="Unidades sin capa PEPS: salieron al costo actual del producto">
                          (sin capa: {cant(m.sin_capa)})
                        </span>
                      )}
                    </td>
                    <td className="px-1.5 py-1">
                      {DOCUMENTOS[m.documento_tipo] ?? m.documento_tipo}
                      {m.documento_id ? ` #${m.documento_id}` : ''}
                      {m.bodega && <span className="block text-muted-foreground">{m.bodega}</span>}
                    </td>
                    <td className="border-l border-border/40 px-1.5 py-1 text-right tabular-nums">{cant(m.entrada)}</td>
                    <td className="px-1.5 py-1 text-right tabular-nums">{m.entrada ? montoContable(m.costo_unitario) : ''}</td>
                    <td className="px-1.5 py-1 text-right tabular-nums">{m.entrada ? montoContable(m.costo_total) : ''}</td>
                    <td className="border-l border-border/40 px-1.5 py-1 text-right tabular-nums">{cant(m.salida)}</td>
                    <td className="px-1.5 py-1 text-right tabular-nums">{m.salida ? montoContable(m.costo_unitario) : ''}</td>
                    <td className="px-1.5 py-1 text-right tabular-nums">{m.salida ? montoContable(m.costo_total) : ''}</td>
                    <td className="border-l border-border/40 px-1.5 py-1 text-right font-semibold tabular-nums">{cant(m.saldo_cantidad)}</td>
                    <td className="px-1.5 py-1 text-right tabular-nums">{m.costo_promedio != null ? montoContable(m.costo_promedio) : ''}</td>
                    <td className="px-1.5 py-1 text-right font-semibold tabular-nums">{montoContable(m.saldo_valor)}</td>
                    <td className="border-l border-border/40 px-1.5 py-1 text-right tabular-nums">{m.peso ? cant(m.peso) : ''}</td>
                  </tr>
                ))}
                {kardex.movimientos.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-1.5 py-6 text-center text-muted-foreground">
                      Sin movimientos en el período.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="border-t-2 border-foreground/40 font-bold">
                <tr>
                  <td colSpan={9} className="px-1.5 py-1.5 text-right">
                    Saldo final al {hasta.split('-').reverse().join('/')}
                  </td>
                  <td className="px-1.5 py-1.5 text-right tabular-nums">{cant(kardex.saldo_final.cantidad)}</td>
                  <td className="px-1.5 py-1.5 text-right tabular-nums">
                    {Number(kardex.saldo_final.cantidad) ? montoContable(Number(kardex.saldo_final.valor) / Number(kardex.saldo_final.cantidad)) : ''}
                  </td>
                  <td className="px-1.5 py-1.5 text-right tabular-nums">{montoContable(kardex.saldo_final.valor)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {kardex.capas.length > 0 && (
            <div className="text-xs">
              <p className="mb-1 font-semibold text-foreground">Capas PEPS vigentes (la primera es la próxima en salir)</p>
              <div className="flex flex-wrap gap-2">
                {kardex.capas.map((c, i) => (
                  <span key={c.id} className={cn('rounded-lg border px-2 py-1 tabular-nums', i === 0 ? 'border-primary/50 bg-primary/5' : 'border-border')}>
                    {fechaCorta(c.fecha)} · {cant(c.cantidad_restante)} de {cant(c.cantidad_inicial)} u × Q{montoContable(c.costo_unitario)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : resumen ? (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <EncabezadoReporte razonSocial={razon} nit={nit} titulo="Inventario valorizado (PEPS)" periodo={textoAlCorte(hasta)} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Código</th>
                  <th className="px-2 py-2">Artículo</th>
                  <th className="px-2 py-2">Categoría</th>
                  <th className="px-2 py-2 text-right">Existencia</th>
                  <th className="px-2 py-2 text-right">Costo promedio</th>
                  <th className="px-2 py-2 text-right">Valor PEPS</th>
                </tr>
              </thead>
              <tbody>
                {resumen.filas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-2 py-8 text-center text-muted-foreground">
                      {q ? 'Ningún artículo coincide con la búsqueda.' : 'Sin existencias valorizadas a esa fecha.'}
                    </td>
                  </tr>
                )}
                {resumen.filas.map((f) => (
                  <tr key={f.id} className={cn('border-b border-border/50', Number(f.cantidad) < 0 && 'text-destructive')}>
                    <td className="px-2 py-1.5">
                      <Link
                        href={`/contabilidad/kardex?producto=${f.id}&desde=${desde}&hasta=${hasta}`}
                        className="font-mono text-xs font-semibold text-primary hover:underline"
                      >
                        {f.codigo}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5">{f.nombre}</td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">{f.categoria ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{cant(f.cantidad)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{f.costo_promedio != null ? montoContable(f.costo_promedio) : ''}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{montoContable(f.valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-foreground/40 font-bold">
                <tr>
                  <td colSpan={3} className="px-2 py-2 text-right">
                    Total ({resumen.total} artículos)
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{cant(resumen.totales.cantidad)}</td>
                  <td />
                  <td className="px-2 py-2 text-right tabular-nums">Q {montoContable(resumen.totales.valor)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {resumen.total > 100 && (
            <div className="flex items-center justify-center gap-3 text-sm">
              {pagina > 1 && (
                <Link href={`/contabilidad/kardex?hasta=${hasta}&q=${encodeURIComponent(q)}&pagina=${pagina - 1}`} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
                  ← Anterior
                </Link>
              )}
              <span className="text-muted-foreground">
                Página {pagina} de {Math.ceil(resumen.total / 100)}
              </span>
              {pagina * 100 < resumen.total && (
                <Link href={`/contabilidad/kardex?hasta=${hasta}&q=${encodeURIComponent(q)}&pagina=${pagina + 1}`} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
                  Siguiente →
                </Link>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Existencias en rojo (negativas): salidas registradas sin entrada previa en el Kardex. Revisa el artículo y regularízalo con una toma física.
          </p>
        </div>
      ) : null}
    </main>
  )
}
