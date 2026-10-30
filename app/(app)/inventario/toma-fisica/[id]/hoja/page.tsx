import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { hoyGuatemala } from '@/lib/contabilidad'
import type { LineaToma } from '@/lib/toma-fisica'
import { BotonImprimir } from '@/components/app/boton-imprimir'

export const metadata = { title: 'Hoja de conteo — ASTRO' }

export default async function HojaConteoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ modo?: string }>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const tomaId = Number(id)
  if (!Number.isInteger(tomaId) || tomaId <= 0) notFound()
  const supabase = await createClient()
  const [puedeContar, puedeAprobar, { data: toma }, { data: lineasData }, { data: empresa }] = await Promise.all([
    tienePermiso('toma_fisica', 'contar'),
    tienePermiso('toma_fisica', 'aprobar'),
    supabase
      .from('tomas_fisicas')
      .select('id, fecha_creacion, bodega:bodega_id ( nombre ), categoria:categoria_id ( nombre )')
      .eq('id', tomaId)
      .maybeSingle(),
    supabase.rpc('fn_toma_lineas', { p_toma_id: tomaId }),
    supabase.from('empresa_contable').select('razon_social').eq('id', 1).maybeSingle(),
  ])
  if (!puedeContar && !puedeAprobar) redirect('/inicio')
  if (!toma) notFound()
  const t = toma as unknown as { id: number; bodega: { nombre: string } | null; categoria: { nombre: string } | null }
  const lineas = (lineasData ?? []) as LineaToma[]
  // La existencia solo aparece si quien imprime puede verla (fn_toma_lineas la oculta en tomas a ciegas).
  const conExistencias = sp.modo === 'existencias' && lineas.some((l) => l.cantidad_sistema != null)

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 text-black print:max-w-none print:px-0 print:py-0">
      <div className="flex justify-end print:hidden">
        <BotonImprimir>Imprimir hoja</BotonImprimir>
      </div>
      <div className="text-center">
        <p className="text-sm font-bold uppercase">{(empresa as { razon_social: string } | null)?.razon_social ?? 'ASTRO'}</p>
        <p className="text-base font-semibold">Hoja de toma física {conExistencias ? 'con existencias' : 'a ciegas'} · #{t.id}</p>
        <p className="text-xs">
          Bodega: {t.bodega?.nombre ?? '—'}
          {t.categoria ? ` · Categoría: ${t.categoria.nombre}` : ''} · Impresa el {hoyGuatemala().split('-').reverse().join('/')}
        </p>
      </div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-y-2 border-black text-left">
            <th className="w-8 px-1 py-1.5">#</th>
            <th className="px-1 py-1.5">Código</th>
            <th className="px-1 py-1.5">Artículo</th>
            {conExistencias && <th className="w-20 px-1 py-1.5 text-right">Existencia</th>}
            <th className="w-24 px-1 py-1.5 text-center">Conteo</th>
            <th className="w-40 px-1 py-1.5">Observaciones</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l, i) => (
            <tr key={l.id} className="break-inside-avoid border-b border-black/40">
              <td className="px-1 py-2 align-top">{i + 1}</td>
              <td className="px-1 py-2 align-top font-mono">{l.codigo}</td>
              <td className="px-1 py-2 align-top">
                {l.nombre}
                {l.categoria && <span className="block text-[10px] text-black/60">{l.categoria}</span>}
              </td>
              {conExistencias && (
                <td className="px-1 py-2 text-right align-top tabular-nums">
                  {Number(l.cantidad_sistema ?? 0).toLocaleString('es-GT')}
                </td>
              )}
              <td className="px-1 py-2">
                <div className="mx-auto h-6 w-20 border border-black/60" />
              </td>
              <td className="px-1 py-2">
                <div className="h-6 border-b border-black/40" />
              </td>
            </tr>
          ))}
          {Array.from({ length: 8 }).map((_, i) => (
            <tr key={`extra-${i}`} className="border-b border-black/40">
              <td className="px-1 py-3">{lineas.length + i + 1}</td>
              <td className="px-1 py-3" colSpan={conExistencias ? 3 : 2}>
                <div className="h-5" />
              </td>
              <td className="px-1 py-3">
                <div className="mx-auto h-6 w-20 border border-black/60" />
              </td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-black/70">
        Las filas en blanco son para artículos encontrados que no están en la lista. Total de artículos listados: {lineas.length}.
      </p>
      <div className="mt-10 grid grid-cols-3 gap-8 text-center text-xs">
        {['Contó', 'Revisó', 'Aprobó'].map((f) => (
          <div key={f}>
            <div className="border-t border-black pt-1">{f}: nombre y firma</div>
          </div>
        ))}
      </div>
    </main>
  )
}
