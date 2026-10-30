import { redirect } from 'next/navigation'
import { NotebookPen } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { hoyGuatemala } from '@/lib/contabilidad'
import { cargarCatalogosCaptura, fechaBloqueo } from '@/lib/contabilidad-servidor'
import { Encabezado, EnlaceVolver } from '@/components/contabilidad/comunes'
import { FormularioPartida } from '@/components/contabilidad/formulario-partida'

export const metadata = { title: 'Nueva partida — ASTRO' }

export default async function NuevaPartidaPage() {
  const supabase = await createClient()
  const [puedeRegistrar, puedeAutorizar, catalogos, bloqueo] = await Promise.all([
    tienePermiso('contabilidad', 'registrar'),
    tienePermiso('contabilidad', 'autorizar_cierre'),
    cargarCatalogosCaptura(supabase),
    fechaBloqueo(supabase),
  ])
  if (!puedeRegistrar) redirect('/contabilidad/partidas')

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={NotebookPen}
        titulo="Nueva partida"
        descripcion="Captura de partida de diario. Solo se contabiliza cuando el total del Debe es igual al del Haber."
      >
        <EnlaceVolver href="/contabilidad/partidas">← Partidas</EnlaceVolver>
      </Encabezado>
      {catalogos.cuentas.length === 0 ? (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300">
          Aún no hay cuentas de detalle activas. Crea la nomenclatura primero.
        </p>
      ) : (
        <FormularioPartida
          cuentas={catalogos.cuentas}
          centros={catalogos.centros}
          hoy={hoyGuatemala()}
          fechaBloqueo={bloqueo}
          puedeAutorizar={puedeAutorizar}
        />
      )}
    </main>
  )
}
