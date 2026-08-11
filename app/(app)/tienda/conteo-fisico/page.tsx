import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, ClipboardList, ImageOff, Clock, Target } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { tienePermiso } from '@/lib/permisos'
import { formatearFechaHora, formatearFecha, formatearFechaCorta } from '@/lib/formato'
import { KpiCard } from '@/components/app/kpi-card'
import { AlertaCard } from '@/components/app/alerta-card'
import { GraficoBarraApilada } from '@/components/inventario/grafico-barra-apilada'
import { GraficoBarras } from '@/components/inventario/grafico-barras'
import type { ChartConfig } from '@/components/ui/chart'
import { iniciarConteo, marcarContado, cerrarConteo } from './acciones'

export const metadata = { title: 'Conteo físico — ASTRO' }

const CONTEOS_HISTORIAL = 8

type Detalle = {
  id: number
  contado: boolean
  productos: { id: number; codigo: string; nombre: string; producto_imagenes: { url: string; es_principal: boolean }[] } | null
}
type Conteo = { id: number; estado: string; fecha_inicio: string; fecha_cierre: string | null }
type DetalleCerrado = {
  conteo_id: number
  contado: boolean
  productos: { codigo: string; nombre: string } | null
}

function formatearDuracion(inicio: string, fin: string) {
  const ms = new Date(fin).getTime() - new Date(inicio).getTime()
  const horas = ms / 3600000
  if (horas < 1) return `duró ${Math.max(1, Math.round(ms / 60000))} min`
  if (horas < 48) return `duró ${horas.toFixed(1)} h`
  return `duró ${Math.round(horas / 24)} días`
}

export default async function ConteoFisicoPage({
  searchParams,
}: {
  searchParams: Promise<{ tienda_id?: string; ok?: string; error?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (!(await tienePermiso('inventario', 'ver'))) redirect('/inicio')

  const sp = await searchParams
  const supabase = await createClient()

  const tiendaId = usuario.rol === 'tienda' ? usuario.tienda_id : sp.tienda_id ? Number(sp.tienda_id) : null

  const { data: tiendas } = usuario.rol !== 'tienda'
    ? await supabase.from('tiendas').select('id, nombre').eq('activo', true).order('nombre')
    : { data: [] }

  if (usuario.rol !== 'tienda' && !tiendaId) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Conteo físico</h1>
        <form className="flex items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Tienda
            <select name="tienda_id" required defaultValue="" className="rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none">
              <option value="" disabled>Elige una tienda</option>
              {(tiendas ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
            Continuar
          </button>
        </form>
      </main>
    )
  }

  if (!tiendaId) redirect('/inicio')

  const [{ data: conteoAbierto }, { data: ultimoCerrado }, { data: cerradosRecientes }] = await Promise.all([
    supabase
      .from('conteos_fisicos')
      .select('id, estado, fecha_inicio, fecha_cierre')
      .eq('tienda_id', tiendaId)
      .eq('estado', 'abierto')
      .maybeSingle(),
    supabase
      .from('conteos_fisicos')
      .select('id, fecha_inicio, fecha_cierre')
      .eq('tienda_id', tiendaId)
      .eq('estado', 'cerrado')
      .order('fecha_cierre', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('conteos_fisicos')
      .select('id, fecha_cierre')
      .eq('tienda_id', tiendaId)
      .eq('estado', 'cerrado')
      .order('fecha_cierre', { ascending: false })
      .limit(CONTEOS_HISTORIAL),
  ])

  const conteo = conteoAbierto as Conteo | null

  const idsCerrados = (cerradosRecientes ?? []).map((c) => c.id)
  const [{ data: detalles }, { data: detallesCerrados }] = await Promise.all([
    conteo
      ? supabase
          .from('conteo_fisico_detalles')
          .select('id, contado, productos ( id, codigo, nombre, producto_imagenes ( url, es_principal ) )')
          .eq('conteo_id', conteo.id)
          .order('id')
      : Promise.resolve({ data: [] }),
    idsCerrados.length > 0
      ? supabase
          .from('conteo_fisico_detalles')
          .select('conteo_id, contado, productos ( codigo, nombre )')
          .in('conteo_id', idsCerrados)
      : Promise.resolve({ data: [] as DetalleCerrado[] }),
  ])

  const listaDetalles = (detalles ?? []) as unknown as Detalle[]
  const contados = listaDetalles.filter((d) => d.contado).length
  const faltantes = listaDetalles.filter((d) => !d.contado)

  const listaDetallesCerrados = (detallesCerrados ?? []) as unknown as DetalleCerrado[]

  const porConteo = new Map<number, { total: number; contados: number }>()
  const faltantesPorConteo = new Map<number, { codigo: string; nombre: string }[]>()
  for (const d of listaDetallesCerrados) {
    const actual = porConteo.get(d.conteo_id) ?? { total: 0, contados: 0 }
    actual.total++
    if (d.contado) actual.contados++
    else if (d.productos) {
      const faltantes = faltantesPorConteo.get(d.conteo_id) ?? []
      faltantes.push(d.productos)
      faltantesPorConteo.set(d.conteo_id, faltantes)
    }
    porConteo.set(d.conteo_id, actual)
  }
  const seriePrecision = [...(cerradosRecientes ?? [])]
    .reverse()
    .map((c) => {
      const stats = porConteo.get(c.id)
      const pct = stats && stats.total > 0 ? Math.round((stats.contados / stats.total) * 100) : 0
      return { etiqueta: c.fecha_cierre ? formatearFechaCorta(c.fecha_cierre) : `#${c.id}`, valor: pct }
    })

  const configProgreso: ChartConfig = {
    contado: { label: 'Contado', color: 'var(--chart-1)' },
    faltante: { label: 'Faltante', color: 'var(--muted-foreground)' },
  }
  const configPrecision: ChartConfig = { valor: { label: 'Precisión', color: 'var(--chart-1)' } }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Conteo físico</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Toma de inventario: marca cada pieza conforme la encuentres físicamente.
        </p>
      </div>

      {sp.ok && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{sp.ok}</span>
        </div>
      )}
      {sp.error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{sp.error}</span>
        </div>
      )}

      {(ultimoCerrado || seriePrecision.length > 0) && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {ultimoCerrado?.fecha_cierre && (
            <KpiCard
              icon={Clock}
              label="Último conteo cerrado"
              value={formatearFecha(ultimoCerrado.fecha_cierre)}
              subvalor={formatearDuracion(ultimoCerrado.fecha_inicio, ultimoCerrado.fecha_cierre)}
            />
          )}
          {seriePrecision.length > 0 && (
            <KpiCard
              icon={Target}
              label={`Precisión promedio (últimos ${seriePrecision.length})`}
              value={`${Math.round(seriePrecision.reduce((acc, s) => acc + s.valor, 0) / seriePrecision.length)}%`}
            />
          )}
        </section>
      )}

      {seriePrecision.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-bold text-foreground">Precisión por conteo cerrado</h2>
          <GraficoBarras
            data={seriePrecision}
            config={configPrecision}
            sufijo="%"
            alto={Math.max(120, seriePrecision.length * 36)}
          />
        </div>
      )}

      {(cerradosRecientes ?? []).length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold text-foreground">Historial de conteos cerrados</h2>
          <p className="text-xs text-muted-foreground">
            Las piezas que faltaron no se ajustan solas — decide aquí si corresponde darlas de baja.
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {(cerradosRecientes ?? []).map((c) => {
              const stats = porConteo.get(c.id)
              const pct = stats && stats.total > 0 ? Math.round((stats.contados / stats.total) * 100) : null
              const faltantes = faltantesPorConteo.get(c.id) ?? []
              return (
                <div key={c.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-foreground">
                      {c.fecha_cierre ? formatearFechaHora(c.fecha_cierre) : `Conteo #${c.id}`}
                      {stats && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {stats.contados}/{stats.total} encontradas
                        </span>
                      )}
                    </p>
                    {pct != null && (
                      <span
                        className={
                          pct === 100
                            ? 'rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary'
                            : 'rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive'
                        }
                      >
                        {pct}% precisión
                      </span>
                    )}
                  </div>
                  {faltantes.length > 0 && (
                    <details className="mt-2">
                      <summary className="w-fit cursor-pointer list-none text-xs font-semibold text-primary">
                        Ver {faltantes.length} pieza{faltantes.length > 1 ? 's' : ''} faltante
                        {faltantes.length > 1 ? 's' : ''}
                      </summary>
                      <ul className="mt-1.5 flex flex-col gap-1">
                        {faltantes.map((p) => (
                          <li key={p.codigo} className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{p.nombre}</span> · {p.codigo}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!conteo ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">No hay un conteo abierto</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Al iniciar, se listan todas las piezas que el sistema espera en esta tienda.
          </p>
          <form action={iniciarConteo}>
            <input type="hidden" name="tienda_id" value={tiendaId} />
            <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
              Iniciar conteo
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {contados} / {listaDetalles.length} piezas encontradas
                </p>
                <p className="text-xs text-muted-foreground">Iniciado {formatearFechaHora(conteo.fecha_inicio)}</p>
              </div>
              <form action={cerrarConteo}>
                <input type="hidden" name="conteo_id" value={conteo.id} />
                <input type="hidden" name="tienda_id" value={tiendaId} />
                <button type="submit" className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary">
                  Cerrar conteo
                </button>
              </form>
            </div>
            {listaDetalles.length > 0 && (
              <GraficoBarraApilada
                data={[{ nombre: 'Progreso', contado: contados, faltante: listaDetalles.length - contados }]}
                config={configProgreso}
              />
            )}
          </div>

          <form action={marcarContado} className="flex items-center gap-2">
            <input type="hidden" name="conteo_id" value={conteo.id} />
            <input type="hidden" name="tienda_id" value={tiendaId} />
            <input
              name="codigo"
              autoFocus
              placeholder="Escanea o escribe el código de la pieza y presiona Enter"
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
            />
            <button type="submit" className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
              Registrar
            </button>
          </form>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">
              {faltantes.length === 0 ? 'Todas las piezas fueron encontradas' : `Faltantes (${faltantes.length})`}
            </p>
            {faltantes.map((d) => {
              const portada = d.productos?.producto_imagenes.find((i) => i.es_principal)?.url
                ?? d.productos?.producto_imagenes[0]?.url
              return portada ? (
                <div key={d.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={portada} alt="" className="h-10 w-10 rounded-lg border border-border object-cover" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{d.productos?.nombre}</p>
                    <p className="text-xs text-muted-foreground">{d.productos?.codigo}</p>
                  </div>
                </div>
              ) : (
                <AlertaCard
                  key={d.id}
                  icon={ImageOff}
                  titulo={d.productos?.nombre ?? 'Pieza'}
                  valor={d.productos?.codigo ?? ''}
                  severidad="accent"
                />
              )
            })}
          </div>
        </>
      )}
    </main>
  )
}
