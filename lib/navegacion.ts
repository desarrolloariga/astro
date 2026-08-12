import {
  LayoutDashboard,
  Sparkles,
  Boxes,
  PackagePlus,
  Bookmark,
  ShoppingBag,
  Truck,
  Link2,
  Contact,
  ClipboardCheck,
  Trophy,
  Gauge,
  Heart,
  HandCoins,
  Target,
  GraduationCap,
  LifeBuoy,
  LineChart,
  ScanLine,
  Warehouse,
  History,
  PackageSearch,
  Network,
  Megaphone,
  Users,
  Store,
  SlidersHorizontal,
  ScrollText,
  ShieldCheck,
  Calculator,
  type LucideIcon,
} from 'lucide-react'
import type { Rol } from '@/lib/usuario'

export type ItemNav = {
  etiqueta: string
  descripcion: string
  href: string
  icono: LucideIcon
  roles: Rol[] | 'todos'
  /**
   * Permiso granular (módulo.acción) que también desbloquea este
   * módulo aunque el rol del usuario no lo incluya — para que una
   * excepción individual (usuarios_permisos) sea visible en el menú,
   * no solo funcional al entrar por URL directa.
   */
  permiso?: { modulo: string; accion: string }
}

export type SeccionNav = { titulo: string; slug: string; items: ItemNav[] }

// La navegación crece con cada fase del desarrollo. Se comparte entre
// el menú lateral (components/app/shell.tsx) y la pantalla de inicio.
export const secciones: SeccionNav[] = [
  {
    titulo: 'General',
    slug: 'general',
    items: [
      {
        etiqueta: 'Inicio',
        descripcion: 'Panel de bienvenida y accesos rápidos',
        href: '/inicio',
        icono: LayoutDashboard,
        roles: 'todos',
      },
      {
        etiqueta: 'Catálogo',
        descripcion: 'Piezas disponibles en tiempo real en toda la red',
        href: '/catalogo',
        icono: Sparkles,
        roles: ['admin', 'coordinador', 'supervisor', 'asesor', 'embajador', 'tienda'],
        permiso: { modulo: 'catalogo', accion: 'ver' },
      },
    ],
  },
  {
    titulo: 'Ventas',
    slug: 'ventas',
    items: [
      {
        etiqueta: 'Separados',
        descripcion: 'Piezas reservadas con promesa de venta',
        href: '/separados',
        icono: Bookmark,
        roles: ['admin', 'coordinador', 'supervisor', 'asesor', 'embajador', 'tienda'],
        permiso: { modulo: 'separados', accion: 'crear' },
      },
      {
        etiqueta: 'Ventas',
        descripcion: 'Historial y comprobantes de pago',
        href: '/ventas',
        icono: ShoppingBag,
        roles: ['admin', 'coordinador', 'supervisor', 'asesor', 'embajador', 'tienda'],
        permiso: { modulo: 'ventas', accion: 'crear' },
      },
      {
        etiqueta: 'Pedidos',
        descripcion: 'Despacho y confirmación de entrega',
        href: '/pedidos',
        icono: Truck,
        roles: ['admin', 'coordinador', 'supervisor', 'asesor', 'embajador', 'tienda', 'produccion'],
      },
      {
        etiqueta: 'Enlaces',
        descripcion: 'Comparte el catálogo con clientes finales',
        href: '/links',
        icono: Link2,
        roles: ['admin', 'asesor', 'embajador', 'tienda'],
      },
      {
        etiqueta: 'Clientes',
        descripcion: 'Clientes captados y su historial de compras',
        href: '/clientes',
        icono: Contact,
        roles: ['admin', 'coordinador', 'supervisor', 'asesor', 'embajador', 'tienda', 'contabilidad'],
      },
    ],
  },
  {
    titulo: 'Análisis',
    slug: 'analisis',
    items: [
      {
        etiqueta: 'Mi red',
        descripcion: 'Tu equipo, tus embajadores y tu contacto',
        href: '/red',
        icono: Users,
        roles: ['admin', 'supervisor', 'asesor', 'embajador'],
      },
      {
        etiqueta: 'Ranking',
        descripcion: 'Posiciones del período por puntos acumulados',
        href: '/ranking',
        icono: Trophy,
        roles: ['admin', 'coordinador', 'supervisor', 'asesor', 'embajador', 'tienda'],
      },
      {
        etiqueta: 'Comisiones',
        descripcion: 'Tus comisiones y liquidaciones',
        href: '/comisiones',
        icono: HandCoins,
        roles: ['coordinador', 'supervisor', 'asesor', 'embajador', 'tienda'],
      },
      {
        etiqueta: 'Metas',
        descripcion: 'Metas de venta y campañas vigentes',
        href: '/metas',
        icono: Target,
        roles: ['admin', 'coordinador'],
      },
      {
        etiqueta: 'Finanzas',
        descripcion: 'KPIs, inventario valorizado y red comercial',
        href: '/finanzas',
        icono: LineChart,
        roles: ['admin', 'coordinador', 'contabilidad'],
        permiso: { modulo: 'finanzas', accion: 'ver' },
      },
    ],
  },
  {
    titulo: 'Aprendizaje',
    slug: 'aprendizaje',
    items: [
      {
        etiqueta: 'Academia',
        descripcion: 'Cursos, evaluaciones y certificaciones',
        href: '/academia',
        icono: GraduationCap,
        roles: 'todos',
      },
      {
        etiqueta: 'Soporte',
        descripcion: 'Preguntas frecuentes y tickets',
        href: '/soporte',
        icono: LifeBuoy,
        roles: 'todos',
      },
    ],
  },
  {
    titulo: 'Producción',
    slug: 'produccion',
    items: [
      {
        etiqueta: 'Artículos',
        descripcion: 'Fichas técnicas y publicación al CEDI',
        href: '/produccion',
        icono: Boxes,
        roles: ['admin', 'produccion'],
      },
      {
        etiqueta: 'Nuevo artículo',
        descripcion: 'Alta de un artículo con fotos',
        href: '/produccion/nueva',
        icono: PackagePlus,
        roles: ['admin', 'produccion'],
      },
    ],
  },
  {
    titulo: 'Inventario',
    slug: 'inventario',
    items: [
      {
        etiqueta: 'Inventario por bodega',
        descripcion: 'Piezas, valoración y costo por tienda o CEDI',
        href: '/inventario',
        icono: Warehouse,
        roles: ['admin', 'coordinador', 'contabilidad', 'supervisor', 'tienda'],
        permiso: { modulo: 'inventario', accion: 'ver' },
      },
      {
        etiqueta: 'Movimientos',
        descripcion: 'Bitácora línea por línea de cada movimiento de inventario',
        href: '/inventario/movimientos',
        icono: History,
        roles: ['admin', 'coordinador', 'contabilidad', 'supervisor', 'tienda'],
        permiso: { modulo: 'inventario', accion: 'ver' },
      },
      {
        etiqueta: 'Conteo físico',
        descripcion: 'Toma de inventario por tienda',
        href: '/tienda/conteo-fisico',
        icono: ScanLine,
        roles: ['admin', 'tienda'],
        permiso: { modulo: 'inventario', accion: 'ver' },
      },
      {
        etiqueta: 'Logística',
        descripcion: 'Solicitudes de reposición, alertas y rotación',
        href: '/logistica',
        icono: PackageSearch,
        roles: ['admin', 'coordinador', 'asesor', 'produccion'],
        permiso: { modulo: 'logistica', accion: 'gestionar' },
      },
    ],
  },
  {
    titulo: 'Contabilidad',
    slug: 'contabilidad',
    items: [
      {
        etiqueta: 'Comprobantes',
        descripcion: 'Bandeja de aprobación de pagos',
        href: '/contabilidad/comprobantes',
        icono: ClipboardCheck,
        roles: ['admin', 'contabilidad'],
        permiso: { modulo: 'comprobantes', accion: 'aprobar' },
      },
    ],
  },
  {
    titulo: 'Sistema',
    slug: 'sistema',
    items: [
      {
        etiqueta: 'Incentivos',
        descripcion: 'Reglas de puntaje, topes y simulador',
        href: '/admin/incentivos',
        icono: Gauge,
        roles: ['admin'],
        permiso: { modulo: 'incentivos', accion: 'editar' },
      },
      {
        etiqueta: 'Comisiones',
        descripcion: 'Reglas, cierre de período y liquidaciones',
        href: '/admin/comisiones',
        icono: HandCoins,
        roles: ['admin'],
      },
      {
        etiqueta: 'Costeo',
        descripcion: 'Políticas de margen y porcentajes de costeo',
        href: '/admin/costeo',
        icono: Calculator,
        roles: ['admin'],
        permiso: { modulo: 'costeo', accion: 'editar' },
      },
      {
        etiqueta: 'Academia',
        descripcion: 'Administración de cursos y evaluaciones',
        href: '/admin/academia',
        icono: GraduationCap,
        roles: ['admin'],
        permiso: { modulo: 'academia', accion: 'editar' },
      },
      {
        etiqueta: 'Fidelización',
        descripcion: 'Niveles, insignias, premios y reconocimientos',
        href: '/admin/fidelizacion',
        icono: Heart,
        roles: ['admin', 'coordinador'],
      },
    ],
  },
  {
    titulo: 'Configuración',
    slug: 'configuracion',
    items: [
      {
        etiqueta: 'Usuarios',
        descripcion: 'Crear cuentas, roles, jerarquía y tienda',
        href: '/admin/usuarios',
        icono: Users,
        roles: ['admin'],
        permiso: { modulo: 'usuarios', accion: 'ver' },
      },
      {
        etiqueta: 'Jerarquía',
        descripcion: 'Árbol de mando: asesores, embajadores y más',
        href: '/admin/usuarios/jerarquia',
        icono: Network,
        roles: ['admin'],
        permiso: { modulo: 'usuarios', accion: 'ver' },
      },
      {
        etiqueta: 'Permisos',
        descripcion: 'Matriz por rol y excepciones individuales',
        href: '/admin/permisos',
        icono: ShieldCheck,
        roles: ['admin'],
      },
      {
        etiqueta: 'Publicidad',
        descripcion: 'Anuncios internos dirigidos a la red comercial',
        href: '/admin/publicidad',
        icono: Megaphone,
        roles: ['admin', 'coordinador'],
        permiso: { modulo: 'publicidad', accion: 'editar' },
      },
      {
        etiqueta: 'Tiendas y bodegas',
        descripcion: 'Alta, baja y datos de cada punto',
        href: '/admin/tiendas',
        icono: Store,
        roles: ['admin'],
        permiso: { modulo: 'tiendas', accion: 'ver' },
      },
      {
        etiqueta: 'Parámetros',
        descripcion: 'Tiempos, políticas y ajustes operativos',
        href: '/admin/parametros',
        icono: SlidersHorizontal,
        roles: ['admin'],
        permiso: { modulo: 'parametros', accion: 'editar' },
      },
      {
        etiqueta: 'Auditoría',
        descripcion: 'Bitácora de cambios sensibles',
        href: '/admin/auditoria',
        icono: ScrollText,
        roles: ['admin'],
      },
    ],
  },
]

export const nombresRol: Record<Rol, string> = {
  admin: 'Administración',
  coordinador: 'Coordinación Comercial',
  supervisor: 'Supervisor',
  asesor: 'Asesor de venta',
  embajador: 'Embajador',
  tienda: 'Tienda',
  produccion: 'Producción',
  contabilidad: 'Contabilidad',
}

export function itemVisible(
  item: ItemNav,
  rol: Rol,
  permisosExtra: string[] = [],
  permisosRevocados: string[] = [],
) {
  const clave = item.permiso ? `${item.permiso.modulo}.${item.permiso.accion}` : null
  if (clave && permisosRevocados.includes(clave)) return false
  if (item.roles === 'todos' || item.roles.includes(rol)) return true
  return clave ? permisosExtra.includes(clave) : false
}

/**
 * Secciones filtradas a los módulos visibles para un rol (sin
 * secciones vacías). `permisosExtra`/`permisosRevocados` son las
 * excepciones individuales del usuario (ver lib/permisos.ts) —
 * amplían o recortan lo que el rol base ya mostraría.
 */
export function seccionesParaRol(
  rol: Rol,
  permisosExtra: string[] = [],
  permisosRevocados: string[] = [],
): SeccionNav[] {
  return secciones
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => itemVisible(i, rol, permisosExtra, permisosRevocados)),
    }))
    .filter((s) => s.items.length > 0)
}
