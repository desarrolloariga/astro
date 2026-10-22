import { AppShell } from '@/components/app/shell'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { obtenerContexto } from '@/lib/contexto'

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Una sola llamada a la base por navegación: usuario, permisos y carrito
  // llegan juntos (fn_contexto_sesion) y la página reutiliza la respuesta.
  const usuario = await obtenerUsuarioActual()
  const contexto = (await obtenerContexto())!

  return (
    <AppShell
      usuario={{ nombre: usuario.nombre, rol: usuario.rol }}
      permisosExtra={contexto.concedidos}
      permisosRevocados={contexto.revocados}
      // Contador del carrito backoffice (solo para quien compra desde el catálogo).
      unidadesCarrito={contexto.permisos.has('catalogo.ver') ? contexto.carritoUnidades : null}
    >
      {children}
    </AppShell>
  )
}
