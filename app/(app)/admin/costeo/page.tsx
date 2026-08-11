import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, Calculator, Percent } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { crearPoliticaMargen, alternarPoliticaMargen, actualizarParametroCosteo } from './acciones'

export const metadata = { title: 'Costeo — ASTRO' }

const clasesCampo =
  'rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none'

const nombresOrigen: Record<string, string> = { local: 'Local', importado: 'Importado' }

type Categoria = { id: number; nombre: string }
type Parametro = { id: number; clave: string; valor: string; descripcion: string | null }
type PoliticaMargen = {
  id: number
  categoria_id: number | null
  origen: string
  margen_pct: number
  activo: boolean
  categorias: { nombre: string } | null
}

export default async function AdminCosteoPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  if (!(await tienePermiso('costeo', 'editar'))) redirect('/inicio')

  const { ok, error } = await searchParams
  const supabase = await createClient()

  const [{ data: politicas }, { data: categorias }, { data: parametros }] = await Promise.all([
    supabase
      .from('politicas_margen')
      .select('id, categoria_id, origen, margen_pct, activo, categorias ( nombre )')
      .order('fecha_creacion', { ascending: false }),
    supabase.from('categorias').select('id, nombre').eq('activo', true).order('orden'),
    supabase
      .from('parametros')
      .select('id, clave, valor, descripcion')
      .in('clave', ['pct_empaque', 'pct_flete_importado']),
  ])

  const listaPoliticas = (politicas ?? []) as unknown as PoliticaMargen[]
  const listaCategorias = (categorias ?? []) as Categoria[]
  const listaParametros = (parametros ?? []) as Parametro[]

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Costeo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Motor de precios: sugiere un precio de venta a partir del costo, sin reemplazar el campo
          editable de producción.
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

      {/* Porcentajes globales */}
      <section className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <Calculator className="h-4 w-4 text-primary" /> Porcentajes de costeo
        </h2>
        <div className="flex flex-col gap-2">
          {listaParametros.map((p) => (
            <form
              key={p.id}
              action={actualizarParametroCosteo}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3"
            >
              <input type="hidden" name="id" value={p.id} />
              <div className="min-w-48 flex-1">
                <p className="text-sm font-semibold text-foreground">{p.clave}</p>
                {p.descripcion && <p className="text-xs text-muted-foreground">{p.descripcion}</p>}
              </div>
              <input
                name="valor"
                type="number"
                step="0.01"
                defaultValue={p.valor}
                className="w-32 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90"
              >
                Guardar
              </button>
            </form>
          ))}
        </div>
      </section>

      {/* Políticas de margen */}
      <section className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <Percent className="h-4 w-4 text-primary" /> Políticas de margen
        </h2>

        <div className="flex flex-col gap-2">
          {listaPoliticas.length === 0 && (
            <p className="text-sm text-muted-foreground">Aún no hay políticas configuradas.</p>
          )}
          {listaPoliticas.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {p.categorias?.nombre ?? 'Todas las categorías'}{' '}
                  <span className="font-normal text-muted-foreground">
                    · {nombresOrigen[p.origen] ?? p.origen}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">{p.margen_pct}% de margen</p>
              </div>
              <form action={alternarPoliticaMargen}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="activo" value={p.activo ? '1' : '0'} />
                <button
                  type="submit"
                  className={
                    p.activo
                      ? 'rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary'
                      : 'rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground'
                  }
                >
                  {p.activo ? 'Activa' : 'Inactiva'}
                </button>
              </form>
            </div>
          ))}
        </div>

        <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">
            + Nueva política de margen
          </summary>
          <form action={crearPoliticaMargen} className="flex flex-col gap-3 px-4 pb-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <select name="categoria_id" defaultValue="" className={clasesCampo}>
                <option value="">Todas las categorías</option>
                {listaCategorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <select name="origen" required defaultValue="" className={clasesCampo}>
                <option value="" disabled>
                  Origen
                </option>
                <option value="local">Local</option>
                <option value="importado">Importado</option>
              </select>
              <input
                name="margen_pct"
                type="number"
                step="0.01"
                required
                placeholder="% de margen"
                className={clasesCampo}
              />
            </div>
            <button
              type="submit"
              className="mt-1 w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
            >
              Crear política
            </button>
          </form>
        </details>
      </section>
    </main>
  )
}
