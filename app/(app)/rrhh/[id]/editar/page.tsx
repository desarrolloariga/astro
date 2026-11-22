import { notFound, redirect } from 'next/navigation'
import { UserCog } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { type Colaborador } from '@/lib/rrhh'
import { cargarCatalogosRrhh } from '@/lib/rrhh-servidor'
import { Encabezado, EnlaceVolver, Mensajes } from '@/components/contabilidad/comunes'
import { FormularioColaborador } from '@/components/rrhh/formulario-colaborador'

export const metadata = { title: 'Editar expediente — ASTRO' }

export default async function EditarColaboradorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const supabase = await createClient()
  const [puede, cat, { data }] = await Promise.all([
    tienePermiso('rrhh', 'editar'),
    cargarCatalogosRrhh(supabase),
    supabase.from('colaboradores').select('*').eq('id', Number(id)).maybeSingle(),
  ])
  if (!puede) redirect(`/rrhh/${id}`)
  if (!data) notFound()
  const c = data as Colaborador
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado icono={UserCog} titulo={`Editar · ${c.nombres} ${c.apellidos}`} descripcion={`Código ${c.codigo}`}>
        <EnlaceVolver href={`/rrhh/${c.id}`}>← Expediente</EnlaceVolver>
      </Encabezado>
      <Mensajes error={sp.error} />
      <FormularioColaborador c={c} cat={cat} />
    </main>
  )
}
