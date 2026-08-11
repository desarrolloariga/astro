import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, SlidersHorizontal } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearFechaHora } from '@/lib/formato'
import { actualizarParametro } from './acciones'

export const metadata = { title: 'Parámetros — ASTRO' }

type Parametro = {
  id: number
  clave: string
  valor: string
  tipo_dato: string
  descripcion: string | null
  modulo: string | null
}
type CambioAuditoria = { registro_id: number; fecha_creacion: string; usuarios: { nombre: string } | null }

export default async function AdminParametrosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  if (!(await tienePermiso('parametros', 'editar'))) redirect('/inicio')

  const { ok, error } = await searchParams
  const supabase = await createClient()

  const { data: parametros } = await supabase
    .from('parametros')
    .select('id, clave, valor, tipo_dato, descripcion, modulo')
    .order('modulo')
    .order('clave')

  const lista = (parametros ?? []) as Parametro[]
  const porModulo = new Map<string, Parametro[]>()
  lista.forEach((p) => {
    const modulo = p.modulo ?? 'General'
    porModulo.set(modulo, [...(porModulo.get(modulo) ?? []), p])
  })

  // Último cambio por parámetro — la bitácora ya existe (auditoria),
  // solo faltaba mostrarla aquí en vez de obligar a ir a /admin/auditoria.
  const ultimoCambioPorId = new Map<number, CambioAuditoria>()
  if (lista.length > 0) {
    const { data: cambios } = await supabase
      .from('auditoria')
      .select('registro_id, fecha_creacion, usuarios ( nombre )')
      .eq('tabla', 'parametros')
      .in(
        'registro_id',
        lista.map((p) => p.id),
      )
      .order('fecha_creacion', { ascending: false })
    ;(cambios as unknown as CambioAuditoria[] | null)?.forEach((c) => {
      if (!ultimoCambioPorId.has(c.registro_id)) ultimoCambioPorId.set(c.registro_id, c)
    })
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Parámetros</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tiempos y políticas operativas — se leen en vivo desde las funciones de negocio, sin
          tocar la base de datos directamente.
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

      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <SlidersHorizontal className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">No hay parámetros configurados</p>
        </div>
      ) : (
        Array.from(porModulo.entries()).map(([modulo, params]) => (
          <section key={modulo} className="flex flex-col gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{modulo}</h2>
            <div className="flex flex-col gap-2">
              {params.map((p) => (
                <form
                  key={p.id}
                  action={actualizarParametro}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <input type="hidden" name="id" value={p.id} />
                  <div className="min-w-48 flex-1">
                    <p className="text-sm font-semibold text-foreground">{p.clave}</p>
                    {p.descripcion && <p className="text-xs text-muted-foreground">{p.descripcion}</p>}
                    {ultimoCambioPorId.get(p.id) && (
                      <p className="text-[11px] text-muted-foreground">
                        Última edición: {formatearFechaHora(ultimoCambioPorId.get(p.id)!.fecha_creacion)}
                        {ultimoCambioPorId.get(p.id)!.usuarios && ` · ${ultimoCambioPorId.get(p.id)!.usuarios!.nombre}`}
                      </p>
                    )}
                  </div>
                  {p.tipo_dato === 'booleano' ? (
                    <select
                      name="valor"
                      defaultValue={p.valor}
                      className="w-32 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    >
                      <option value="true">Sí</option>
                      <option value="false">No</option>
                    </select>
                  ) : p.tipo_dato === 'numero' ? (
                    <input
                      name="valor"
                      type="number"
                      step="0.01"
                      defaultValue={p.valor}
                      className="w-32 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    />
                  ) : (
                    <input
                      name="valor"
                      defaultValue={p.valor}
                      className="w-48 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    />
                  )}
                  <button type="submit" className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90">
                    Guardar
                  </button>
                </form>
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  )
}
