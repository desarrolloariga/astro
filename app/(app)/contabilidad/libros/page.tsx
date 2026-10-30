import { redirect } from 'next/navigation'
import { BookMarked, FileSpreadsheet, FileText, Stamp } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearFechaHora } from '@/lib/formato'
import { hoyGuatemala, rangoMes } from '@/lib/contabilidad'
import { clasesCampo, esFecha } from '@/lib/contabilidad-general'
import { REPORTES, type ClaveReporte } from '@/lib/reportes/contables'
import { BotonConfirmar } from '@/components/app/boton-confirmar'
import { Encabezado, Mensajes } from '@/components/contabilidad/comunes'
import { definirFolioInicial } from './acciones'

export const metadata = { title: 'Libros SAT — ASTRO' }

const LIBROS: ClaveReporte[] = ['libro_diario', 'libro_mayor', 'diario_mayor', 'libro_compras', 'libro_ventas', 'libro_inventarios']

type Folio = { libro: string; folio_inicial: number; ultimo_folio: number }
type Emision = {
  id: number
  libro: string
  desde: string
  hasta: string
  folio_desde: number
  folio_hasta: number
  paginas: number
  fecha_emision: string
  emisor: { nombre: string } | null
}

const fecha = (f: string) => f.split('-').reverse().join('/')

export default async function LibrosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; desde?: string; hasta?: string }>
}) {
  const sp = await searchParams
  const mes = rangoMes(hoyGuatemala())
  const desde = esFecha(sp.desde) ? sp.desde : mes.desde
  const hasta = esFecha(sp.hasta) ? sp.hasta : mes.hasta
  const supabase = await createClient()
  const [puedeVer, puedeEmitir, puedeConfigurar, { data: foliosData }, { data: emisionesData }] = await Promise.all([
    tienePermiso('contabilidad', 'ver'),
    tienePermiso('contabilidad', 'registrar'),
    tienePermiso('contabilidad', 'configurar'),
    supabase.from('libros_folios').select('libro, folio_inicial, ultimo_folio'),
    supabase
      .from('libros_emisiones')
      .select('id, libro, desde, hasta, folio_desde, folio_hasta, paginas, fecha_emision, emisor:emitido_por ( nombre )')
      .order('id', { ascending: false })
      .limit(60),
  ])
  if (!puedeVer) redirect('/inicio')
  const folios = new Map(((foliosData ?? []) as Folio[]).map((f) => [f.libro, f]))
  const emisiones = (emisionesData ?? []) as unknown as Emision[]

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={BookMarked}
        titulo="Libros SAT"
        descripcion="Libros contables y de IVA con el encabezado de 4 líneas. La vista previa no usa folios; la emisión oficial numera cada página desde el siguiente folio del libro y deja registro."
      />
      <Mensajes ok={sp.ok} error={sp.error} />

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Del
          <input name="desde" type="date" defaultValue={desde} className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Al
          <input name="hasta" type="date" defaultValue={hasta} className={clasesCampo} />
        </label>
        <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">
          Cambiar período
        </button>
        <p className="text-xs text-muted-foreground">El libro de inventarios se emite a la fecha «Al».</p>
      </form>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {LIBROS.map((clave) => {
          const def = REPORTES[clave]
          const folio = def.libro ? folios.get(def.libro) : undefined
          const q = new URLSearchParams({ reporte: clave, desde, hasta })
          return (
            <section key={clave} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
              <div>
                <p className="font-semibold text-foreground">{def.titulo}</p>
                <p className="text-xs text-muted-foreground">{def.descripcion}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                <span className="text-muted-foreground">Vista previa:</span>
                <a href={`/contabilidad/reportes/exportar?${q}&formato=pdf`} target="_blank" className="inline-flex items-center gap-1 text-primary hover:underline">
                  <FileText className="h-3.5 w-3.5" /> PDF
                </a>
                <a href={`/contabilidad/reportes/exportar?${q}&formato=xlsx`} className="inline-flex items-center gap-1 text-primary hover:underline">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                </a>
              </div>
              {folio ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
                  <span>
                    Folio inicial {folio.folio_inicial} · siguiente folio <span className="font-semibold">{folio.ultimo_folio + 1}</span>
                  </span>
                  {puedeEmitir && (
                    <form action="/contabilidad/libros/emitir" method="post" target="_blank">
                      <input type="hidden" name="reporte" value={clave} />
                      <input type="hidden" name="desde" value={desde} />
                      <input type="hidden" name="hasta" value={hasta} />
                      <BotonConfirmar
                        mensaje={`¿Emitir el ${def.titulo.toLowerCase()} oficial ${def.corte ? `al ${fecha(hasta)}` : `del ${fecha(desde)} al ${fecha(hasta)}`}? Se usarán folios desde el ${folio.ultimo_folio + 1} y quedará registrado.`}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground hover:bg-primary/90"
                      >
                        <Stamp className="h-3.5 w-3.5" /> Emitir oficial
                      </BotonConfirmar>
                    </form>
                  )}
                </div>
              ) : puedeConfigurar ? (
                <form action={definirFolioInicial} className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-amber-500/50 px-3 py-2 text-xs">
                  <input type="hidden" name="libro" value={def.libro} />
                  <label className="flex flex-col gap-1 font-semibold">
                    Folio inicial (se pide una sola vez)
                    <input name="folio" type="number" min="1" required defaultValue="1" className={`${clasesCampo} w-28 py-1`} />
                  </label>
                  <BotonConfirmar
                    mensaje="El folio inicial no se puede cambiar después. ¿Confirmas?"
                    className="rounded-lg border border-border px-3 py-1.5 font-semibold hover:bg-muted"
                  >
                    Definir folio inicial
                  </BotonConfirmar>
                </form>
              ) : (
                <p className="text-xs text-muted-foreground">Aún sin folio inicial definido.</p>
              )}
            </section>
          )
        })}
      </div>

      <section className="rounded-xl border border-border bg-card">
        <p className="border-b border-border px-4 py-3 text-sm font-semibold">Emisiones oficiales</p>
        {emisiones.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Aún no se ha emitido ningún libro oficial.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Libro</th>
                  <th className="px-4 py-2">Período</th>
                  <th className="px-4 py-2">Folios</th>
                  <th className="px-4 py-2">Emitido</th>
                </tr>
              </thead>
              <tbody>
                {emisiones.map((e) => {
                  const nombre = Object.values(REPORTES).find((r) => r.libro === e.libro)?.titulo ?? e.libro
                  return (
                    <tr key={e.id} className="border-t border-border/60">
                      <td className="px-4 py-2">{nombre}</td>
                      <td className="px-4 py-2 text-xs">
                        {e.desde === e.hasta ? `Al ${fecha(e.hasta)}` : `${fecha(e.desde)} – ${fecha(e.hasta)}`}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {e.folio_desde} – {e.folio_hasta} ({e.paginas} pág.)
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {formatearFechaHora(e.fecha_emision)} · {e.emisor?.nombre ?? ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
