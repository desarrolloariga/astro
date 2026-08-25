import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, ArrowLeft, UserPlus, Briefcase } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { crearContratacion } from '../acciones'
import { Campo, SeccionFormulario, BotonPrimario, clasesInput } from '@/components/app/formulario'

export const metadata = { title: 'Nueva solicitud de contratación — ASTRO' }

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

      <form action={crearContratacion} className="flex flex-col gap-6">
        <SeccionFormulario icon={UserPlus} titulo="Candidato">
          <div className="flex flex-col gap-4">
            <Campo label="Nombre del candidato" required>
              <input name="candidato_nombre" required className={clasesInput} />
            </Campo>
            <Campo label="Contacto" helpText="Teléfono o correo.">
              <input name="candidato_contacto" className={clasesInput} />
            </Campo>
          </div>
        </SeccionFormulario>

        <SeccionFormulario icon={Briefcase} titulo="Puesto">
          <div className="flex flex-col gap-4">
            <Campo label="Puesto" required>
              <input name="puesto" required placeholder="Asesor de venta, tienda Zona 10…" className={clasesInput} />
            </Campo>
            <div className="grid grid-cols-2 gap-4">
              <Campo label="Rol sugerido">
                <select name="rol_sugerido_id" defaultValue="" className={clasesInput}>
                  <option value="">—</option>
                  {(roles ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Tienda">
                <select name="tienda_id" defaultValue="" className={clasesInput}>
                  <option value="">—</option>
                  {(tiendas ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            <Campo label="Salario propuesto (GTQ)">
              <input name="salario_propuesto" type="number" step="0.01" min="0" className={clasesInput} />
            </Campo>
          </div>
        </SeccionFormulario>

        <div className="flex justify-end">
          <BotonPrimario>Enviar solicitud</BotonPrimario>
        </div>
      </form>
    </main>
  )
}
