import { redirect } from 'next/navigation'
import { ReceiptText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { hoyGuatemala } from '@/lib/contabilidad'
import { cargarCatalogosCaptura } from '@/lib/contabilidad-servidor'
import { Encabezado, EnlaceVolver } from '@/components/contabilidad/comunes'
import { FormularioFacturaProveedor } from '@/components/contabilidad/formulario-factura-proveedor'

export const metadata = { title: 'Nueva factura de proveedor — ASTRO' }

export default async function NuevaFacturaProveedorPage() {
  const supabase = await createClient()
  const [puedeRegistrar, catalogos, { data: extra }, { data: empresa }] = await Promise.all([
    tienePermiso('contabilidad', 'registrar'),
    cargarCatalogosCaptura(supabase),
    supabase.rpc('fn_cxp_catalogos'),
    supabase.from('empresa_contable').select('regimen_iva').eq('id', 1).maybeSingle(),
  ])
  if (!puedeRegistrar) redirect('/contabilidad/cxp')
  const proveedores = ((extra as { proveedores?: { id: number; nombre: string; nit: string | null }[] } | null)?.proveedores ?? [])

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <Encabezado
        icono={ReceiptText}
        titulo="Nueva factura de proveedor"
        descripcion="Registra la factura FEL o el documento del proveedor y distribuye su base (sin IVA) en las cuentas de gasto, activo o inventario con su centro de costo. Se contabiliza al guardar."
      >
        <EnlaceVolver href="/contabilidad/cxp">← Cuentas por pagar</EnlaceVolver>
      </Encabezado>
      <FormularioFacturaProveedor
        proveedores={proveedores}
        cuentas={catalogos.cuentas}
        centros={catalogos.centros}
        hoy={hoyGuatemala()}
        regimenGeneral={(empresa as { regimen_iva: string } | null)?.regimen_iva === 'general'}
      />
    </main>
  )
}
