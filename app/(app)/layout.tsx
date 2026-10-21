import { AppShell } from '@/components/app/shell'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { obtenerPermisosExtra, tienePermiso } from '@/lib/permisos'
import { createClient } from '@/lib/supabase/server'

async function contarCarrito() {
  const supabase = await createClient()
  const { data } = await supabase.rpc('fn_ver_mi_carrito')
  return ((data ?? []) as { cantidad: number }[]).reduce((acc, i) => acc + i.cantidad, 0)
}

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Todo en paralelo (antes eran 4 consultas en fila en cada navegación).
  const [usuario, { concedidos, revocados }, puedeComprar, unidades] = await Promise.all([
    obtenerUsuarioActual(),
    obtenerPermisosExtra(),
    tienePermiso('catalogo', 'ver'),
    contarCarrito(),
  ])

  return (
    <AppShell
      usuario={{ nombre: usuario.nombre, rol: usuario.rol }}
      permisosExtra={concedidos}
      permisosRevocados={revocados}
      // Contador del carrito backoffice (solo para quien compra desde el catálogo).
      unidadesCarrito={puedeComprar ? unidades : null}
    >
      {children}
    </AppShell>
  )
}
