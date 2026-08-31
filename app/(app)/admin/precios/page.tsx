import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, Calculator, PlusCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearFechaHora } from '@/lib/formato'
import { actualizarParametroPrecio, crearExcepcionParametroPrecio, desactivarParametroPrecio } from './acciones'
import { Campo, BotonPrimario, clasesInput as clasesCampo } from '@/components/app/formulario'

export const metadata = { title: 'Precios — ASTRO' }

const CLAVES = [
  'factor_margen_empresa',
  'factor_envio',
  'factor_empaque',
  'factor_impuesto',
  'factor_comision_embajador',
] as const

const nombresClave: Record<string, string> = {
  factor_margen_empresa: 'Margen de empresa',
  factor_envio: 'Envío',
  factor_empaque: 'Empaque',
  factor_impuesto: 'Impuesto (IVA)',
  factor_comision_embajador: 'Comisión del embajador',
}

type Parametro = {
  id: number
  clave: string
  categoria_id: number | null
  producto_id: number | null
  valor_pct: number
  motivo: string | null
  version: number
  fecha_actualizacion: string | null
  categorias: { nombre: string } | null
  productos: { codigo: string } | null
}
type Categoria = { id: number; nombre: string }

export default async function AdminPreciosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  if (!(await tienePermiso('precios', 'editar'))) redirect('/inicio')

  const { ok, error } = await searchParams
  const supabase = await createClient()

  const [{ data: parametros }, { data: categorias }] = await Promise.all([
    supabase
      .from('parametros_precio')
      .select(
        'id, clave, categoria_id, producto_id, valor_pct, motivo, version, fecha_actualizacion, categorias ( nombre ), productos ( codigo )',
      )
      .eq('activo', true)
      .order('clave'),
    supabase.from('categorias').select('id, nombre').eq('activo', true).order('orden'),
  ])

  const lista = (parametros ?? []) as unknown as Parametro[]
  const globales = lista.filter((p) => !p.categoria_id && !p.producto_id)
  const excepciones = lista.filter((p) => p.categoria_id || p.producto_id)
  const listaCategorias = (categorias ?? []) as Categoria[]

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Precios</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Factores del motor de precios — el precio de venta se calcula desde el costo, nunca se
          escribe a mano. Cambiar un factor aquí no repriza piezas ya publicadas.
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

      <section className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <Calculator className="h-4 w-4 text-primary" /> Factores globales
        </h2>
        <div className="flex flex-col gap-2">
          {CLAVES.map((clave) => {
            const p = globales.find((g) => g.clave === clave)
            if (!p) return null
            return (
              <form
                key={p.id}
                action={actualizarParametroPrecio}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <input type="hidden" name="id" value={p.id} />
                <div className="min-w-48 flex-1">
                  <p className="text-sm font-semibold text-foreground">{nombresClave[clave] ?? clave}</p>
                  <p className="text-xs text-muted-foreground">
                    v{p.version}
                    {p.fecha_actualizacion && ` · actualizado ${formatearFechaHora(p.fecha_actualizacion)}`}
                  </p>
                </div>
                <input
                  name="valor_pct"
                  type="number"
                  step="0.01"
                  defaultValue={p.valor_pct}
                  className="w-24 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                />
                <span className="text-sm text-muted-foreground">%</span>
                <input
                  name="motivo"
                  defaultValue={p.motivo ?? ''}
                  placeholder="Motivo del cambio"
                  className="min-w-40 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
                <BotonPrimario className="px-3 py-2 text-xs">Guardar</BotonPrimario>
              </form>
            )
          })}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-bold text-foreground">Excepciones por categoría o pieza</h2>

        {excepciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay excepciones configuradas.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {excepciones.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {nombresClave[p.clave] ?? p.clave}{' '}
                    <span className="font-normal text-muted-foreground">
                      · {p.categorias?.nombre ?? p.productos?.codigo ?? '—'}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.valor_pct}% {p.motivo && `· ${p.motivo}`}
                  </p>
                </div>
                <form action={desactivarParametroPrecio}>
                  <input type="hidden" name="id" value={p.id} />
                  <button
                    type="submit"
                    className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
                  >
                    Desactivar
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}

        <details className="rounded-xl border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground">
            <PlusCircle className="h-4 w-4 text-primary" />
            Nueva excepción
          </summary>
          <form action={crearExcepcionParametroPrecio} className="flex flex-col gap-4 px-4 pb-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo label="Factor" required>
                <select name="clave" required defaultValue="" className={clasesCampo}>
                  <option value="" disabled>
                    Selecciona…
                  </option>
                  {CLAVES.map((c) => (
                    <option key={c} value={c}>
                      {nombresClave[c]}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="% del factor" required>
                <input name="valor_pct" type="number" step="0.01" required className={clasesCampo} />
              </Campo>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo label="Categoría" helpText="Indica categoría o pieza — al menos una de las dos.">
                <select name="categoria_id" defaultValue="" className={clasesCampo}>
                  <option value="">Sin categoría específica</option>
                  {listaCategorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="ID de pieza específica" helpText="La más específica gana sobre el factor global.">
                <input name="producto_id" type="number" className={clasesCampo} />
              </Campo>
            </div>
            <Campo label="Motivo">
              <input name="motivo" className={clasesCampo} />
            </Campo>
            <div>
              <BotonPrimario>Crear excepción</BotonPrimario>
            </div>
          </form>
        </details>
      </section>
    </main>
  )
}
