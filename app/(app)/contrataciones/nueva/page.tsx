import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { crearContratacion } from '../acciones'

export const metadata = { title: 'Nueva solicitud de contratación — ASTRO' }

const clasesCampo =
  'rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none'

export default async function NuevaContratacionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  if (!(await tienePermiso('contrataciones', 'crear'))) redirect('/inicio')

  const { error } = await searchParams
  const supabase = await createClient()
  const [{ data: roles }, { data: tiendas }] = await Promise.all([
    supabase.from('roles').select('id, nombre').order('nombre'),
    supabase.from('tiendas').select('id, nombre').eq('activo', true).order('nombre'),
  ])

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <Link
          href="/contrataciones"
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a contrataciones
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Nueva solicitud de contratación</h1>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form action={crearContratacion} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Nombre del candidato *</span>
          <input name="candidato_nombre" required className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Contacto</span>
          <input name="candidato_contacto" placeholder="Teléfono o correo" className={clasesCampo} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Puesto *</span>
          <input name="puesto" required placeholder="Asesor de venta, tienda Zona 10…" className={clasesCampo} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Rol sugerido</span>
            <select name="rol_sugerido_id" defaultValue="" className={clasesCampo}>
              <option value="">—</option>
              {(roles ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Tienda</span>
            <select name="tienda_id" defaultValue="" className={clasesCampo}>
              <option value="">—</option>
              {(tiendas ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Salario propuesto (GTQ)</span>
          <input name="salario_propuesto" type="number" step="0.01" min="0" className={clasesCampo} />
        </label>
        <button
          type="submit"
          className="w-fit rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          Enviar solicitud
        </button>
      </form>
    </main>
  )
}
