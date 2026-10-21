import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, Gift, ImagePlus, PackageCheck, Pencil, Plus, Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatearFechaHora, formatearNumero } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { BotonConfirmar } from '@/components/app/boton-confirmar'
import { InputFotos } from '@/components/app/input-fotos'
import { atenderCanje, guardarPremio } from './acciones'

export const metadata = { title: 'Premiaciones — ASTRO' }

const clasesCampo =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'

type Premio = {
  id: number
  nombre: string
  descripcion: string | null
  puntos: number
  stock: number | null
  imagenes: string[]
  activo: boolean
}

type Canje = {
  id: number
  puntos: number
  estado: string
  comentario: string | null
  fecha_creacion: string
  fecha_atencion: string | null
  premio: { nombre: string; imagenes: string[] } | null
  usuario: { nombre: string; telefono: string | null } | null
}

const estadosCanje: Record<string, { etiqueta: string; clases: string }> = {
  solicitado: { etiqueta: 'Por entregar', clases: 'bg-amber-500/15 text-amber-800' },
  entregado: { etiqueta: 'Entregado', clases: 'bg-emerald-600/10 text-emerald-700' },
  rechazado: { etiqueta: 'Rechazado', clases: 'bg-destructive/10 text-destructive' },
}

function FormularioPremio({ premio }: { premio?: Premio }) {
  return (
    <form action={guardarPremio} encType="multipart/form-data" className="flex flex-col gap-3">
      {premio && <input type="hidden" name="id" value={premio.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px_140px]">
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Nombre del premio
          <input name="nombre" required defaultValue={premio?.nombre} className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Puntos para canjear
          <input name="puntos" type="number" min="1" step="1" required defaultValue={premio?.puntos} className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
          Stock <span className="font-normal text-muted-foreground">(vacío = sin límite)</span>
          <input name="stock" type="number" min="0" step="1" defaultValue={premio?.stock ?? ''} className={clasesCampo} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
        Descripción
        <textarea name="descripcion" rows={2} defaultValue={premio?.descripcion ?? ''} className={clasesCampo} />
      </label>

      {premio && premio.imagenes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-foreground">Fotos actuales (desmarca para quitar)</span>
          <div className="flex flex-wrap gap-2">
            {premio.imagenes.map((url) => (
              <label key={url} className="relative cursor-pointer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-16 w-16 rounded-lg border border-border object-cover" />
                <input type="checkbox" name="mantener" value={url} defaultChecked className="absolute left-1 top-1 h-4 w-4" />
              </label>
            ))}
          </div>
        </div>
      )}

      <label className="flex flex-col gap-1 text-xs font-semibold text-foreground">
        <span className="inline-flex items-center gap-1.5">
          <ImagePlus className="h-3.5 w-3.5 text-primary" />
          {premio ? 'Agregar fotos' : 'Fotos'} <span className="font-normal text-muted-foreground">(hasta 6; máx. 9 MB por envío)</span>
        </span>
        <InputFotos />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" name="activo" value="si" defaultChecked={premio?.activo ?? true} className="h-4 w-4" />
          Visible para canjear
        </label>
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
          {premio ? 'Guardar cambios' : 'Crear premio'}
        </button>
      </div>
    </form>
  )
}

export default async function PremiacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const supabase = await createClient()
  const { data: puede } = await supabase.rpc('fn_puede_admin_premios')
  if (!puede) redirect('/inicio')
  const { ok, error } = await searchParams

  const [{ data: premiosData }, { data: pendientesData }, { data: historialData }] = await Promise.all([
    supabase.from('premios_canje').select('id, nombre, descripcion, puntos, stock, imagenes, activo').order('activo', { ascending: false }).order('puntos'),
    supabase
      .from('canjes_premios')
      .select('id, puntos, estado, comentario, fecha_creacion, fecha_atencion, premio:premio_id ( nombre, imagenes ), usuario:usuario_id ( nombre, telefono )')
      .eq('estado', 'solicitado')
      .order('fecha_creacion', { ascending: true }),
    supabase
      .from('canjes_premios')
      .select('id, puntos, estado, comentario, fecha_creacion, fecha_atencion, premio:premio_id ( nombre, imagenes ), usuario:usuario_id ( nombre, telefono )')
      .neq('estado', 'solicitado')
      .order('fecha_atencion', { ascending: false })
      .limit(30),
  ])

  const premios = (premiosData ?? []) as Premio[]
  const pendientes = (pendientesData ?? []) as unknown as Canje[]
  const historial = (historialData ?? []) as unknown as Canje[]

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <Gift className="h-5 w-5 text-primary" />
          Premiaciones
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Premios que la red canjea con sus puntos desde Mi red. Al canjear se descuentan los puntos; si rechazas el canje, se
          devuelven.
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

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          <PackageCheck className="h-4 w-4 text-primary" />
          Canjes por entregar
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-foreground">{pendientes.length}</span>
        </h2>
        {pendientes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No hay canjes pendientes.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {pendientes.map((c) => (
              <div key={c.id} className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {c.premio?.imagenes?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.premio.imagenes[0]} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <Gift className="h-5 w-5 text-muted-foreground" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{c.premio?.nombre ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.usuario?.nombre ?? '—'}
                      {c.usuario?.telefono ? ` · ${c.usuario.telefono}` : ''} · {formatearNumero(c.puntos)} pts ·{' '}
                      {formatearFechaHora(c.fecha_creacion)}
                    </p>
                  </div>
                </div>
                <form action={atenderCanje} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="canje_id" value={c.id} />
                  <input name="comentario" placeholder="Motivo si rechazas" className="w-48 rounded-md border border-input bg-background px-2 py-1.5 text-xs" />
                  <BotonConfirmar
                    name="accion"
                    value="rechazar"
                    mensaje="¿Rechazar este canje? Se devolverán los puntos al usuario."
                    className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
                  >
                    Rechazar
                  </BotonConfirmar>
                  <BotonConfirmar
                    name="accion"
                    value="entregar"
                    mensaje="¿Confirmas que el premio fue entregado?"
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Marcar entregado
                  </BotonConfirmar>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <Trophy className="h-4 w-4 text-primary" />
            Premios ({premios.length})
          </h2>
        </div>

        <details className="rounded-xl border border-dashed border-primary/40 bg-card" open={premios.length === 0}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-primary">
            <Plus className="h-4 w-4" />
            Nuevo premio
          </summary>
          <div className="px-4 pb-4">
            <FormularioPremio />
          </div>
        </details>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {premios.map((p) => (
            <div key={p.id} className={cn('flex flex-col overflow-hidden rounded-xl border bg-card', p.activo ? 'border-border' : 'border-dashed border-border opacity-70')}>
              <div className="relative aspect-[4/3] bg-secondary">
                {p.imagenes[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imagenes[0]} alt={p.nombre} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Gift className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
                  </div>
                )}
                <span className="absolute left-2 top-2 rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">
                  {formatearNumero(p.puntos)} pts
                </span>
                {!p.activo && (
                  <span className="absolute right-2 top-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    Oculto
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-4">
                <p className="font-semibold text-foreground">{p.nombre}</p>
                {p.descripcion && <p className="line-clamp-2 text-xs text-muted-foreground">{p.descripcion}</p>}
                <p className="text-xs text-muted-foreground">
                  {p.stock == null ? 'Sin límite de stock' : p.stock === 0 ? 'Agotado' : `${p.stock} disponibles`} ·{' '}
                  {p.imagenes.length} foto{p.imagenes.length !== 1 ? 's' : ''}
                </p>
                <details className="mt-2">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-primary">
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </summary>
                  <div className="mt-3">
                    <FormularioPremio premio={p} />
                  </div>
                </details>
              </div>
            </div>
          ))}
        </div>
      </section>

      {historial.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Historial de canjes</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Premio</th>
                  <th className="py-2 pr-3 font-semibold">Usuario</th>
                  <th className="py-2 pr-3 text-right font-semibold">Puntos</th>
                  <th className="py-2 pr-3 font-semibold">Estado</th>
                  <th className="py-2 font-semibold">Atendido</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 text-foreground">{c.premio?.nombre ?? '—'}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{c.usuario?.nombre ?? '—'}</td>
                    <td className="py-2 pr-3 text-right font-semibold text-foreground">{formatearNumero(c.puntos)}</td>
                    <td className="py-2 pr-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', estadosCanje[c.estado]?.clases)}>
                        {estadosCanje[c.estado]?.etiqueta ?? c.estado}
                      </span>
                      {c.comentario && <span className="ml-2 text-xs text-muted-foreground">{c.comentario}</span>}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">{c.fecha_atencion ? formatearFechaHora(c.fecha_atencion) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  )
}
