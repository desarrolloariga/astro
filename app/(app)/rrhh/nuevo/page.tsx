import { redirect } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cargarCatalogosRrhh } from '@/lib/rrhh-servidor'
import { Encabezado, EnlaceVolver, Mensajes } from '@/components/contabilidad/comunes'
import { FormularioColaborador } from '@/components/rrhh/formulario-colaborador'

export const metadata = { title: 'Nuevo colaborador — ASTRO' }

export default async function NuevoColaboradorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const [puede, cat] = await Promise.all([tienePermiso('rrhh', 'editar'), cargarCatalogosRrhh(supabase)])
  if (!puede) redirect('/rrhh')
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado icono={UserPlus} titulo="Nuevo colaborador" descripcion="El código del colaborador se asigna solo. Después de crearlo registras su información salarial y sus documentos.">
        <EnlaceVolver href="/rrhh">← Colaboradores</EnlaceVolver>
      </Encabezado>
      <Mensajes error={sp.error} />
      <FormularioColaborador cat={cat} />
    </main>
  )
}
