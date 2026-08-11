import { AppShell } from '@/components/app/shell'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { obtenerPermisosExtra } from '@/lib/permisos'

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const usuario = await obtenerUsuarioActual()
  const { concedidos, revocados } = await obtenerPermisosExtra()

  return (
    <AppShell
      usuario={{ nombre: usuario.nombre, rol: usuario.rol }}
      permisosExtra={concedidos}
      permisosRevocados={revocados}
    >
      {children}
    </AppShell>
  )
}
