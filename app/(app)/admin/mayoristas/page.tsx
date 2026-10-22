import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, BadgePercent, CheckCircle2, Plus, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearNumero, formatearPrecio } from '@/lib/formato'
import { cn } from '@/lib/utils'
import { asignarPolitica, guardarPolitica } from './acciones'

export const metadata = { title: 'Políticas mayoristas — ASTRO' }

const campo = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'
const etiqueta = 'flex flex-col gap-1 text-xs font-semibold text-foreground'
const boton = 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90'

type Politica = {
  id: number
  nombre: string
  descripcion: string | null
  descuento_pct: number
  minimo_compra: number
  todas_categorias: boolean
  activo: boolean
  politica_mayorista_categorias: { categoria_id: number; visible: boolean; descuento_pct: number | null }[]
}
type Categoria = { id: number; nombre: string }
type Mayorista = { id: number; nombre: string; correo: string; activo: boolean; politica_mayorista_id: number | null }

function FormPolitica({ p, categorias }: { p?: Politica; categorias: Categoria[] }) {
  const porCategoria = new Map((p?.politica_mayorista_categorias ?? []).map((c) => [c.categoria_id, c]))
  const ejemplo = 1000 * (1 - Number(p?.descuento_pct ?? 0) / 100)
  return (
    <form action={guardarPolitica} className="flex flex-col gap-4">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_140px_160px]">
        <label className={etiqueta}>
          Nombre de la política
          <input name="nombre" required defaultValue={p?.nombre} placeholder="Ej. Mayorista A" className={campo} />
        </label>
        <label className={etiqueta}>
          Descuento general (%)
          <input name="descuento_pct" type="number" step="0.01" min={0} max={99.99} required defaultValue={p?.descuento_pct ?? 20} className={campo} />
        </label>
        <label className={etiqueta}>
          Compra mínima (Q)
          <input name="minimo_compra" type="number" step="0.01" min={0} defaultValue={p?.minimo_compra ?? 0} className={campo} />
        </label>
      </div>
      <label className={etiqueta}>
        Descripción (interna)
        <input name="descripcion" defaultValue={p?.descripcion ?? ''} placeholder="Ej. Joyerías aliadas de la capital" className={campo} />
      </label>
      {p && (
        <p className="text-xs text-muted-foreground">
          Ejemplo: una pieza de {formatearPrecio(1000)} al público le queda en {formatearPrecio(ejemplo)} (salvo categorías con % propio).
        </p>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <input name="todas_categorias" type="checkbox" defaultChecked={p?.todas_categorias ?? true} className="h-4 w-4" />
          Ve todas las categorías
        </label>
        <p className="text-xs text-muted-foreground">
          Si lo desmarcas, solo verá las categorías marcadas como &quot;Visible&quot;. El % propio reemplaza al descuento general en esa categoría (vacío = usa el general).
        </p>
        <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {categorias.map((c) => {
            const fila = porCategoria.get(c.id)
            return (
              <div key={c.id} className="grid grid-cols-[1fr_auto_96px] items-center gap-2 border-b border-border/60 py-1.5 text-sm">
                <input type="hidden" name="categoria_id" value={c.id} />
                <span className="truncate text-foreground">{c.nombre}</span>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input name={`visible_${c.id}`} type="checkbox" defaultChecked={p ? Boolean(fila?.visible) : true} className="h-4 w-4" /> Visible
                </label>
                <input
                  name={`pct_${c.id}`}
                  type="number"
                  step="0.01"
                  min={0}
                  max={99.99}
                  defaultValue={fila?.descuento_pct ?? ''}
                  placeholder="% propio"
                  aria-label={`Descuento propio de ${c.nombre}`}
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
                />
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <input name="activo" type="checkbox" defaultChecked={p?.activo ?? true} className="h-4 w-4" /> Activa
        </label>
        <button type="submit" className={boton}>
          {p ? 'Guardar cambios' : (
            <>
              <Plus className="h-4 w-4" /> Crear política
            </>
          )}
        </button>
      </div>
    </form>
  )
}

export default async function PoliticasMayoristasPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  const supabase = await createClient()
  const [permitido, { ok, error }, { data: politicasData }, { data: categoriasData }, { data: rolData }] = await Promise.all([
    tienePermiso('mayoristas', 'configurar'),
    searchParams,
    supabase
      .from('politicas_mayoristas')
      .select('id, nombre, descripcion, descuento_pct, minimo_compra, todas_categorias, activo, politica_mayorista_categorias ( categoria_id, visible, descuento_pct )')
      .order('nombre'),
    supabase.from('categorias').select('id, nombre').eq('activo', true).order('orden').order('nombre'),
    supabase.from('roles').select('id').eq('nombre', 'mayorista').maybeSingle(),
  ])
  if (!permitido) redirect('/inicio')

  const { data: mayoristasData } = rolData
    ? await supabase.from('usuarios').select('id, nombre, correo, activo, politica_mayorista_id').eq('rol_id', rolData.id).order('nombre')
    : { data: [] }

  const politicas = (politicasData ?? []) as Politica[]
  const categorias = (categoriasData ?? []) as Categoria[]
  const mayoristas = (mayoristasData ?? []) as Mayorista[]
  const faltaMigracion = !rolData

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <BadgePercent className="h-6 w-6 text-primary" /> Políticas mayoristas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          El mayorista solo compra para sí. Su precio es el precio público menos el descuento de su política, ve solo las categorías
          permitidas y debe cumplir la compra mínima. Sus compras no generan comisiones, puntos ni Billetera.
        </p>
      </div>

      {faltaMigracion && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> Falta correr la migración 20261021100020_mayoristas.sql en Supabase.
        </div>
      )}
      {ok && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {ok}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Mayoristas y su política */}
      <section id="mayoristas" className="flex scroll-mt-6 flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Users className="h-4 w-4 text-primary" /> Mayoristas ({mayoristas.length})
        </h2>
        {mayoristas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay cuentas mayoristas. Créalas en{' '}
            <Link href="/admin/usuarios" className="font-semibold text-primary hover:underline">
              Configuración → Usuarios
            </Link>{' '}
            con el rol &quot;Mayorista&quot; y luego asígnales aquí su política.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {mayoristas.map((m) => (
              <form key={m.id} action={asignarPolitica} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <input type="hidden" name="usuario_id" value={m.id} />
                <div className="min-w-0">
                  <p className={cn('text-sm font-semibold', m.activo ? 'text-foreground' : 'text-muted-foreground line-through')}>{m.nombre}</p>
                  <p className="text-xs text-muted-foreground">{m.correo}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select name="politica_id" defaultValue={m.politica_mayorista_id ?? ''} className="rounded-lg border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Sin política (no ve piezas)</option>
                    {politicas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} · {formatearNumero(Number(p.descuento_pct))}%{p.activo ? '' : ' (inactiva)'}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
                    Asignar
                  </button>
                </div>
              </form>
            ))}
          </div>
        )}
      </section>

      {/* Políticas */}
      {politicas.map((p) => (
        <details key={p.id} id={`politica-${p.id}`} className="group scroll-mt-6 rounded-xl border border-border bg-card">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-5">
            <span className="flex flex-col">
              <span className="text-base font-bold text-foreground">{p.nombre}</span>
              <span className="text-xs text-muted-foreground">
                {formatearNumero(Number(p.descuento_pct))}% de descuento · compra mínima {formatearPrecio(Number(p.minimo_compra))} ·{' '}
                {p.todas_categorias ? 'todas las categorías' : `${p.politica_mayorista_categorias.filter((c) => c.visible).length} categorías`} ·{' '}
                {mayoristas.filter((m) => m.politica_mayorista_id === p.id).length} mayorista(s)
              </span>
            </span>
            <span className="flex items-center gap-2 text-xs">
              <span className={cn('rounded-full px-2 py-0.5 font-semibold', p.activo ? 'bg-emerald-600/10 text-emerald-700' : 'bg-muted text-muted-foreground')}>
                {p.activo ? 'Activa' : 'Inactiva'}
              </span>
              <span className="font-semibold text-primary group-open:hidden">Editar</span>
            </span>
          </summary>
          <div className="border-t border-border p-5">
            <FormPolitica p={p} categorias={categorias} />
          </div>
        </details>
      ))}

      <details className="rounded-xl border border-dashed border-border bg-card" open={politicas.length === 0}>
        <summary className="cursor-pointer list-none p-5 text-sm font-semibold text-primary">+ Nueva política</summary>
        <div className="border-t border-border p-5">
          <FormPolitica categorias={categorias} />
        </div>
      </details>
    </main>
  )
}
