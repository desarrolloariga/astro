import { AppShell } from '@/components/app/shell'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { obtenerPermisosExtra, tienePermiso } from '@/lib/permisos'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const usuario = await obtenerUsuarioActual()
  const { concedidos, revocados } = await obtenerPermisosExtra()

  // Contador del carrito backoffice (solo para quien compra desde el catálogo).
  let unidadesCarrito: number | null = null
  if (await tienePermiso('catalogo', 'ver')) {
    const supabase = await createClient()
    const { data } = await supabase.rpc('fn_ver_mi_carrito')
    unidadesCarrito = ((data ?? []) as { cantidad: number }[]).reduce((acc, i) => acc + i.cantidad, 0)
  }

  return (
    <AppShell
      usuario={{ nombre: usuario.nombre, rol: usuario.rol }}
      permisosExtra={concedidos}
      permisosRevocados={revocados}
      unidadesCarrito={unidadesCarrito}
    >
      {children}
    </AppShell>
  )
}
