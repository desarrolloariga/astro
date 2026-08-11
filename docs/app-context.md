# Contexto de la aplicación — Ecosistema Comercial Digital ASTRO

## Qué es

El **sistema operativo comercial de ASTRO Joyería**: una plataforma única que controla el ciclo
completo de cada pieza de joyería (mayormente piezas únicas e irrepetibles):

```
Producción crea la pieza → CEDI (inventario central) → transferencia a tiendas
→ catálogo virtual → venta (tienda / asesor / embajador / link al cliente final)
→ pedido y logística → facturación SAT y conciliación bancaria → módulo financiero
```

Especificación funcional completa: `c:\Users\Personal\Downloads\ARIGA_Especificacion_Funcional_1.md`.
Plan técnico aprobado: `C:\Users\Personal\.claude\plans\lee-el-documento-ariga-especificacion-fu-mighty-lark.md`.

**Principios rectores:**
- **Cero doble venta:** reserva ("separado") y retención de carrito con operaciones atómicas en BD.
- **Parametrización 100% en la app:** reglas de puntos, comisiones, topes, tiempos y premios se administran desde el panel admin — nunca editando la base de datos.
- **Jerarquía piramidal con visibilidad descendente:** admin → coordinador → supervisor → asesor → embajador → cliente final; cada nivel solo ve su red.
- **Replicable a otros países:** multi-moneda/multi-país desde el diseño.

**Alcance diferido (fase futura, con tablas y enganches ya previstos):** integración de facturación
SAT y pasarela de pago. El carrito por link SÍ se construye ahora con pago manual
(transferencia/depósito + comprobante aprobado por contabilidad).

## Actores (roles)

`admin`, `coordinador`, `supervisor`, `asesor` (personal ASTRO), `embajador` (externo, solo ve lo
suyo), `tienda` (bodega con catálogo propio), `produccion`, `contabilidad`, y **cliente final sin
cuenta** (accede por link firmado con vencimiento; su compra se atribuye al dueño del link).

## Stack técnico

| Capa | Elección |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| Estilos | Tailwind CSS v4 + shadcn `base-nova` — ver [design-system.md](./design-system.md) |
| Backend | Supabase: Postgres (esquema `public`), Auth, Storage, RLS — ver [database-architecture.md](./database-architecture.md) |
| Migraciones | Supabase CLI (`supabase/migrations/`, SQL puro) |
| Deploy | Vercel (`@vercel/analytics` activo en producción) |
| Paquetes | pnpm |

## Estado del desarrollo (2026-07-15)

| Fase | Estado |
|---|---|
| 0. Infraestructura (Supabase clients, proxy de sesión, login/recuperar, `.env.local` configurado) | ✅ Verificado en dev |
| 1. Fundaciones (roles, usuarios, jerarquía, tiendas, parámetros, auditoría — migraciones 0001–0004) | ✅ Aplicada por el usuario en el editor SQL |
| 2. Producto e inventario (productos, transferencias, catálogo — migraciones 0005–0006 + UI producción/catálogo) | ✅ Aplicada; UI verificada en dev |
| 3. Clientes, separados, ventas/pagos, pedidos (migraciones 0007–0008 + UI catálogo→separar/vender, /separados, /ventas, /pedidos, bandeja de contabilidad) | ✅ Aplicada por el usuario |
| Corrección de seguridad en funciones RPC (migración 0009) | ✅ SQL listo; **pendiente aplicar** |
| 4. Links de venta y carrito público (migraciones 0010–0011 + UI /links, ficha "compartir pieza", storefront `/c/[token]`) | ✅ Aplicada por el usuario |
| 5. Puntos, ranking, descuentos por desempeño, fidelización (migraciones 0012–0014 + UI /ranking, /admin/incentivos, /admin/fidelizacion) | ✅ Aplicada por el usuario |
| 6. Comisiones y bonos (migraciones 0015–0017 + UI /comisiones, /metas, /admin/comisiones + exportación CSV) | ✅ Aplicada por el usuario |
| 7. Academia Virtual y soporte (migraciones 0018–0019 + UI /academia, /admin/academia, /soporte) | ✅ Aplicada por el usuario |
| 8. Financiero, campañas, conteo físico, QR, PWA (migraciones 0020–0021 + UI /finanzas, campañas en /metas, /tienda/conteo-fisico, QR en ficha de pieza) | ✅ Aplicada por el usuario |
| Panel de configuración: usuarios, tiendas, parámetros, auditoría (sin migraciones nuevas — usa tablas de la fase 1) | ✅ Completo, sin SQL pendiente |
| Motor de permisos granulares real (migraciones 0022–0023 + UI /admin/permisos) | ✅ SQL y UI listos; **pendiente aplicar SQL** |
| 9. SAT + pasarela de pago | ⏸ Diferida por decisión del usuario |

**Nota:** el proyecto Supabase es **dedicado** a ASTRO y todo vive en el esquema `public`. El
trigger de alta de usuarios solo actúa si el usuario de Auth trae `app: 'ariga'` en `app_metadata`
(script reutilizable en
[supabase/scripts/asignar_rol_ariga.sql](../supabase/scripts/asignar_rol_ariga.sql) para vincular
usuarios ya existentes en Auth).

**Flujo de migraciones:** el usuario aplica el SQL **manualmente** en el editor SQL de Supabase
(no se usa `db push`). Los archivos de `supabase/migrations/` son la fuente de verdad y se
ejecutan en orden de nombre.

**Pendientes que dependen del usuario:**
1. Ejecutar en el editor SQL, en orden, las migraciones 0022 y 0023 (`supabase/migrations/20260720100001..2`).
2. Crear repositorio remoto (GitHub) y conectar a Vercel cuando se decida publicar.

**Actualización (2026-07-20):** la decisión previa de "solo rol fijo, sin matriz de permisos"
(2026-07-19) quedó superada. Se implementó `fn_tiene_permiso(modulo, accion)` (excepción individual
> permiso por rol > false) y se conectó de verdad en RLS/RPC para los 16 permisos ya catalogados —
ver [database-architecture.md](./database-architecture.md). El resto del sistema (jerarquía,
atribución de canal de venta, etc.) sigue siendo rol fijo a propósito, porque no forma parte del
catálogo de permisos ni el spec pide excepciones individuales ahí. La administración de la propia
matriz de permisos permanece protegida por rol fijo `admin` (no por `fn_tiene_permiso`) para evitar
un bloqueo si se configura mal.

**Dependencia externa a tener presente:** los códigos QR (ficha de pieza y enlaces de `/links`, [components/app/codigo-qr.tsx](../components/app/codigo-qr.tsx)) se generan llamando a `api.qrserver.com` (servicio público, sin API key) en vez de una librería instalada — evita una dependencia nueva, pero es una llamada a un tercero en cada render. Si en algún momento se prefiere generarlo localmente (sin salir del servidor), se puede sustituir por una librería como `qrcode` sin tocar el resto del flujo.

## Estructura de la app

```
app/(auth)/login, /recuperar        ← acceso con credenciales (Supabase Auth)
app/(app)/inicio                    ← dashboard post-login (se expandirá por rol)
app/(app)/catalogo, /catalogo/[id]  ← catálogo y ficha de pieza (separar / vender)
app/(app)/separados                 ← reservas activas, liberar o convertir en venta
app/(app)/ventas                    ← historial y subida de comprobante de pago
app/(app)/pedidos                   ← despacho y confirmación de entrega
app/(app)/produccion, /nueva        ← alta y publicación de piezas al CEDI
app/(app)/contabilidad/comprobantes ← bandeja de aprobación de comprobantes
app/(app)/links                     ← generar y compartir enlaces de venta
app/(app)/ranking                   ← ranking de puntos por período (toda la red comercial)
app/(app)/admin/incentivos          ← reglas de puntaje, topes/descuentos, simulador (admin)
app/(app)/admin/fidelizacion        ← niveles, insignias, premios, reconocimientos
app/(app)/comisiones                ← comisiones propias del vendedor (ledger + liquidaciones)
app/(app)/metas                     ← metas de venta por vendedor/tienda (admin/coordinador)
app/(app)/admin/comisiones          ← reglas de comisión, cierre de período, liquidaciones, export CSV
app/(app)/academia, /[id]           ← cursos, contenidos y evaluación (toda la red)
app/(app)/admin/academia            ← administración de cursos, contenidos y preguntas
app/(app)/soporte, /tickets/[id]    ← FAQs y tickets de soporte interno
app/(app)/finanzas                  ← dashboard KPI + semáforos de metas + export CSV
app/(app)/tienda/conteo-fisico      ← toma de inventario físico por tienda
app/(app)/admin/usuarios            ← crear cuentas (Auth admin), rol, tienda, jerarquía
app/(app)/admin/tiendas             ← alta/baja de tiendas y bodegas
app/(app)/admin/parametros          ← edición de parámetros operativos
app/(app)/admin/auditoria           ← bitácora de cambios (solo lectura)
app/(app)/admin/permisos            ← matriz rol×permiso + excepciones individuales
lib/navegacion.ts                   ← navegación compartida entre el sidebar y /inicio (sensible a permisosExtra/Revocados)
lib/permisos.ts                     ← tienePermiso() y obtenerPermisosExtra() (espejo de fn_tiene_permiso)
app/(publico)/c/[token]             ← catálogo público, carrito con retención y checkout (cliente final sin cuenta)
public/manifest.json, sw.js         ← PWA (instalable en escritorio/móvil)
proxy.ts                            ← refresco de sesión + protección de rutas
lib/supabase/{client,server,admin}  ← clientes por contexto (siempre esquema public)
lib/usuario.ts                      ← usuario ASTRO de la sesión (id, rol, tienda)
lib/formato.ts                      ← formato es-GT / GTQ
supabase/migrations/                ← esquema versionado
supabase/scripts/                   ← scripts SQL de uso puntual (no migraciones)
```

Convenciones de UI: copy en español (es-GT), moneda GTQ (Quetzal), paleta azul OKLCH del
[design-system.md](./design-system.md); la marca es **ASTRO** (el demo "Aurora" está siendo
reemplazado módulo a módulo).
