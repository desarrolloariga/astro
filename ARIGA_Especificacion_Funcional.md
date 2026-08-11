# ECOSISTEMA COMERCIAL DIGITAL ARIGA
## Especificación funcional detallada — Documento base para plan de desarrollo

> **Propósito de este documento:** describir de forma exhaustiva el funcionamiento de la plataforma (actores, flujos de información, reglas de negocio, seguridad y parametrización) sin entrar aún en diseño de tablas ni esquema de base de datos. Servirá como insumo directo para generar el plan técnico en Claude Code.

---

## 1. Visión general del sistema

La plataforma es el **sistema operativo comercial** de ARIGA Joyería: un ecosistema digital único que controla el ciclo completo de cada pieza de joyería, desde que nace en producción hasta que se vende, se factura ante el SAT, se cobra por el banco y se consolida en el módulo financiero.

El principio rector es el **control end-to-end con una sola fuente de verdad**:

```
Producción crea la pieza
   → entra al inventario central (CEDI)
   → se transfiere a tiendas/bodegas
   → se publica en el catálogo virtual
   → tiendas, asesores y embajadores la venden o la separan
   → el cliente final arma su carrito vía link y paga
   → el pedido se rastrea hasta la entrega
   → se factura ante el SAT y se concilia el pago bancario
   → todo alimenta el módulo financiero y de inteligencia comercial
```

Características transversales:

- **Piezas mayormente únicas:** en joyería la mayoría de artículos son irrepetibles. El sistema debe garantizar **cero doble venta** mediante reserva ("separado") y descuento de disponibilidad en tiempo real.
- **Parametrización 100% dentro de la aplicación:** toda regla de negocio configurable (puntajes, topes, descuentos, comisiones, períodos, premios, tiempos de expiración, roles) se administra desde el **panel de administración**, nunca editando directamente la base de datos. Supabase es el motor, no la interfaz de configuración.
- **Arquitectura replicable:** diseñada para expandirse a otros países copiando la base de datos y ajustando pagos, moneda y facturación local.
- **Propiedad de ARIGA:** código fuente y datos bajo control de la empresa; posibilidad de alojar la base de datos en servidor propio.

---

## 2. Actores y jerarquía comercial

La estructura comercial es piramidal y cada nivel tiene visibilidad sobre los niveles que dependen de él (y solo esos):

```
Gerencia General
   └── Coordinación Comercial
         └── Supervisores  (cada supervisor administra 12 o más asesores)
               └── Asesores de venta  (cada asesor administra 350+ embajadores)
                     └── Embajadores (externos)
                           └── Clientes finales
```

### 2.1 Gerencia General / Administración (rol: `admin`)
- Acceso total al sistema y al panel de administración.
- Configura reglas de puntaje, comisiones, descuentos, premios, períodos y catálogo de parámetros.
- Gestiona usuarios, roles, tiendas/bodegas y la estructura jerárquica (asignación supervisor → asesor → embajador).
- Consulta el módulo financiero completo: ventas, costos, márgenes, valoración de inventario.
- Aprueba operaciones sensibles (ajustes de inventario, anulaciones de venta, cambios de precio).

### 2.2 Coordinación Comercial (rol: `coordinador`)
- Visión completa de la red comercial (todos los supervisores, asesores y embajadores).
- Administra metas, campañas e incentivos dentro de los parámetros que fija administración.
- Consulta rankings, cumplimiento de metas y desempeño por canal.
- No accede a configuración financiera ni de sistema.

### 2.3 Supervisores (rol: `supervisor`)
- Ven y gestionan únicamente su equipo de asesores y la red de embajadores debajo de estos.
- Consultan ventas, puntajes, ranking y comisiones de su estructura.
- Dan seguimiento a metas de su equipo y detectan asesores/embajadores inactivos.

### 2.4 Asesores de venta (rol: `asesor`) — personal de ARIGA
- Acceden a su perfil y al catálogo disponible.
- Registran ventas propias y **separan** piezas con promesa de venta.
- Visualizan a sus embajadores y el desempeño de su red.
- Consultan su puntaje, posición en el ranking, comisiones y descuentos del mes.
- Dan seguimiento al estado de sus pedidos y adjuntan comprobantes de pago.
- Comparten enlaces de catálogo o de piezas específicas con clientes finales.

### 2.5 Embajadores (rol: `embajador`) — externos a ARIGA
- Usuario y contraseña propios; **solo ven su propia información**.
- Venden por catálogo de forma totalmente virtual: cierran la venta ellos mismos o envían un **link de carrito** al cliente final.
- Separan piezas, registran ventas, consultan su puntaje, ranking, nivel, insignias y descuentos.
- Dan seguimiento a sus pedidos y cargan comprobantes.
- Acceden a la Academia Virtual (cursos, videos, certificaciones).

### 2.6 Tiendas (rol: `tienda`)
- Cada tienda opera como una **bodega con catálogo propio**.
- Registra ventas de mostrador, separa piezas, recibe transferencias del CEDI y confirma recepción.
- Consulta su inventario, sus ventas y sus indicadores.

### 2.7 Producción (rol: `produccion`)
- Crea los productos: fotos, características, peso, materiales, costo y datos de cada pieza.
- Alimenta el inventario central (CEDI) con piezas nuevas.
- No ve información comercial ni financiera.

### 2.8 Contabilidad (rol: `contabilidad`)
- Revisa y aprueba/rechaza comprobantes de pago adjuntados.
- Supervisa facturación SAT y conciliación bancaria.
- Acceso de lectura al módulo financiero.

### 2.9 Cliente final (sin cuenta — acceso por enlace)
- Recibe un **link firmado** al catálogo o a una pieza, generado por un asesor, embajador o tienda.
- Visualiza productos disponibles con imágenes, características, peso y precio.
- **Arma su carrito**, realiza el pago por la pasarela/portal bancario y recibe confirmación.
- Toda compra por link queda **atribuida automáticamente** al vendedor que lo generó.

---

## 3. Flujos funcionales detallados

### 3.1 Flujo de producción y alta de productos
1. Producción crea la pieza: código único, galería de fotos, ficha técnica (material, peso, kilataje, piedras), costo de producción y precio sugerido.
2. La pieza queda en estado **"en producción / borrador"** hasta completar la ficha.
3. Al publicarse, ingresa al **CEDI (inventario central)** como única fuente de verdad del stock, en estado **"disponible en CEDI"**.
4. Se registra el tiempo entre creación y publicación (KPI de producción).

### 3.2 Flujo de transferencias CEDI → tiendas
1. Administración genera una **orden de transferencia** del CEDI hacia una tienda/bodega, seleccionando piezas específicas.
2. Las piezas pasan a estado **"en tránsito"** (no vendibles durante el tránsito, o vendibles como "próximamente" según parámetro configurable).
3. La tienda receptora **confirma recepción** pieza por pieza; discrepancias generan una incidencia para revisión.
4. Al confirmarse, la pieza queda **"disponible"** en el catálogo de esa tienda. Cada movimiento queda trazado (quién, cuándo, de dónde a dónde).

### 3.3 Flujo de catálogo y visibilidad
- El catálogo muestra únicamente piezas en estado **"disponible"**.
- Estados de pieza: `en producción` → `disponible CEDI` → `en tránsito` → `disponible tienda` → `separada` → `vendida` (→ estados terminales: `entregada`, `devuelta`, `baja`).
- Cuando una pieza se vende o se separa, **desaparece del catálogo o se marca como no disponible en tiempo real** para todos los canales simultáneamente.
- El catálogo debe ser visualmente elegante (marca de joyería): galería, zoom, ficha, filtros por categoría, material, rango de precio y tienda.

### 3.4 Flujo de separado (reserva con promesa de venta)
1. Una tienda, asesor o embajador solicita separar una pieza para un cliente.
2. El sistema valida disponibilidad **de forma atómica** (bloqueo a nivel de transacción: dos solicitudes simultáneas nunca pueden separar la misma pieza).
3. La pieza pasa a `separada`, deja de mostrarse como disponible y queda asociada al vendedor que la reservó.
4. **Parámetro configurable desde el panel admin:** tiempo máximo de separado (p. ej. 48–72 horas). Al vencer, la pieza se libera automáticamente y vuelve al catálogo; el vendedor recibe notificación previa al vencimiento.
5. Si el cliente concreta, el separado se convierte en venta; si desiste, el vendedor libera manualmente o espera la liberación automática.

### 3.5 Flujo de venta directa (tienda / asesor / embajador)
1. El vendedor selecciona la(s) pieza(s) desde el catálogo (disponibles o separadas por él).
2. Registra datos del cliente final (nombre, contacto, dirección de entrega si aplica).
3. Selecciona método de pago: tarjeta, transferencia, depósito, pasarela de pago, o combinación.
4. El sistema genera la venta, descuenta la pieza del catálogo, atribuye la venta al vendedor y dispara: cálculo de puntos, comisiones, ranking, pedido logístico y proceso de facturación SAT.

### 3.6 Flujo de venta por link (cliente final arma su carrito)
1. El asesor o embajador genera un **enlace único y firmado** (con vencimiento configurable) hacia el catálogo general, un subconjunto de piezas o una pieza específica.
2. El cliente final abre el link **sin necesidad de crear cuenta**, navega y **agrega piezas a su carrito**.
3. Al agregar una pieza al carrito se aplica una **retención temporal corta** (parámetro configurable, p. ej. 15–30 minutos) para evitar que otro canal la venda mientras el cliente completa el pago.
4. El cliente ingresa sus datos y paga a través del portal bancario / pasarela.
5. Confirmado el pago, la venta se registra automáticamente **atribuida al vendedor dueño del link** (puntos, comisión y ranking incluidos).
6. Si el pago no se completa en el tiempo de retención, las piezas se liberan.
7. Se mide la **conversión de enlaces** (enviados vs. compras concretadas) por vendedor.

### 3.7 Flujo de pedidos y logística
1. Toda venta genera un **pedido** con estados: `en espera` → `despachado` → `recibido/entregado`.
2. Quien recibe (tienda, vendedor o cliente) **confirma la recepción** en la plataforma.
3. Se pueden adjuntar documentos al pedido: comprobantes de pago, guías de envío, evidencia de entrega.
4. Contabilidad revisa los comprobantes y los **aprueba o rechaza** con comentario; el vendedor ve el estado de su comprobante.
5. KPIs: tiempo promedio despacho→recepción, pedidos pendientes de comprobante, comprobantes pendientes de aprobación.

### 3.8 Flujo de facturación SAT y conciliación bancaria
1. Confirmada la venta (y aprobado el pago cuando aplica), el sistema genera la **factura electrónica ante el SAT** vía API.
2. La factura queda vinculada a la venta con su número, fecha y estado (emitida, anulada, con error).
3. Los pagos del portal bancario se registran automáticamente y se **concilian** contra ventas: pagos sin venta asociada o ventas sin pago se listan como excepciones para revisión de contabilidad.
4. Errores de integración (SAT o banco caídos) entran a una **cola de reintentos** con alerta; ninguna venta se pierde por un fallo externo.

### 3.9 Flujo del sistema de puntos, ranking e incentivos
Motor central de motivación comercial. **Todas sus reglas se configuran desde el panel de administración**, sin tocar la base de datos:

- **Reglas de puntaje configurables:** puntos por venta (fijos, por monto, por categoría de producto, por margen), multiplicadores por campaña o temporada, puntos por primera venta del mes, por venta a cliente nuevo, por curso completado en la Academia, etc. Cada regla tiene vigencia (fecha inicio/fin) y estado activo/inactivo.
- **Ciclos:** el ranking y los contadores se **reinician cada mes** (período configurable: mensual por defecto, con soporte para campañas especiales).
- **Ranking:** tabla general de posiciones por período, filtrable por rol (asesores / embajadores), por supervisor y por tienda. Las primeras posiciones reciben **premios configurables** (definidos y publicados desde el panel admin).
- **Descuentos por desempeño:** cada vendedor tiene un **tope de ventas mensual configurable** (global, por rol o individual). Al superarlo, sus ventas siguientes obtienen un **descuento configurable** (% o escala progresiva). Se reinicia cada período.
- **Historial y versionado de reglas:** cuando una regla cambia, las ventas pasadas conservan los puntos calculados con la regla vigente en su momento (nunca se recalcula retroactivamente salvo acción explícita del admin).
- **Simulador (recomendado):** vista en el panel admin para simular "si aplico esta regla, ¿cuántos puntos habría generado el mes pasado?" antes de activarla.

### 3.10 Programa de fidelización (gamificación)
Complementa el ranking con mecánicas de largo plazo, también parametrizables en el panel:

- **Niveles** (p. ej. Bronce, Plata, Oro, Diamante) con umbrales de puntos/ventas configurables y **beneficios exclusivos por nivel** (mayor descuento, acceso anticipado a colecciones, prioridad en separados).
- **Insignias y logros:** hitos configurables (primera venta, 10 ventas en un mes, racha de N semanas vendiendo, curso certificado).
- **Reconocimientos:** publicación de destacados del mes visible para la red.

### 3.11 Sistema de comisiones
Separado conceptualmente de los puntos (los puntos motivan y rankean; las comisiones pagan):

- **Comisión por venta:** % o monto fijo configurable por rol, categoría de producto o rango de precio.
- **Bonos configurables:** por cumplimiento de meta, por crecimiento vs. período anterior, por liderazgo (supervisores/asesores ganan un % sobre las ventas de su red), por capacitación completada y por fidelización de clientes.
- **Liquidación por período:** cierre mensual con reporte de comisiones por persona, exportable, con estado (calculada → aprobada → pagada).
- Todo parámetro de comisión se administra desde el panel admin con vigencias y auditoría de cambios.

### 3.12 Academia Virtual
- Cursos en línea, videos y material sobre técnicas de venta, cierre de ventas, redes sociales, uso de la plataforma e inteligencia artificial.
- **Evaluaciones y certificaciones** al completar módulos.
- Contenido administrable desde el panel (crear cursos, subir videos/documentos, definir evaluaciones y puntaje de aprobación).
- Integración con incentivos: completar cursos puede otorgar puntos/insignias (regla configurable).
- Disponible 24/7 para toda la red comercial.

### 3.13 Atención al cliente y soporte interno
- **Centro de ayuda** con preguntas frecuentes y guías.
- **Sistema de tickets** interno: vendedores y tiendas reportan incidencias (pieza con datos erróneos, problema de pago, pedido demorado) con seguimiento de estado.
- Canales de contacto: chat interno, enlace directo a WhatsApp, correo.
- **Asistente de IA (fase posterior recomendada):** chatbot que responde sobre catálogo, estado de pedidos y reglas del programa de incentivos.

### 3.14 Módulo financiero e inteligencia comercial
Capa gerencial que consolida toda la operación:

- Ventas totales, ventas por día, por tienda, por canal (tienda/asesor/embajador) y por vendedor.
- Costo por producto, margen bruto por producto/tienda, ticket promedio, transacciones por período.
- Valoración de inventario en tiempo real (CEDI y por tienda), rotación por tienda, piezas sin movimiento y capital inmovilizado.
- Embajadores activos vs. inactivos, % de vendedores que superan su tope, cumplimiento de metas.
- Conversión de enlaces, productos más vendidos, clientes activos.
- Estado de facturación SAT y conciliación bancaria.
- Exportación a Excel y conexión futura con Power BI para tableros ejecutivos.

---

## 4. Panel de administración (requisito crítico)

**Toda parametrización vive dentro de la aplicación.** El panel de administración debe permitir, sin intervención en Supabase:

1. **Usuarios y jerarquía:** crear/editar/desactivar usuarios de todos los roles; asignar embajadores a asesores, asesores a supervisores; mover personas entre estructuras conservando su historial.
2. **Roles y permisos:** matriz de permisos por rol (idealmente granular: módulo × acción), con posibilidad de excepciones individuales.
3. **Tiendas y bodegas:** alta/baja de tiendas, datos de cada punto, usuarios asociados.
4. **Reglas de puntaje:** CRUD completo de reglas con vigencias, condiciones y simulación.
5. **Comisiones y bonos:** porcentajes, montos, condiciones y períodos de liquidación.
6. **Descuentos por desempeño:** topes de venta (global/rol/individual) y escalas de descuento.
7. **Niveles, insignias y premios** del programa de fidelización.
8. **Parámetros operativos:** tiempo de expiración de separados, tiempo de retención de carrito, vigencia de links, política de piezas en tránsito, monedas y país.
9. **Academia:** gestión de cursos, contenidos, evaluaciones y certificados.
10. **Aprobaciones:** bandeja de comprobantes, ajustes de inventario, anulaciones y excepciones de conciliación.
11. **Auditoría:** bitácora de quién cambió qué parámetro, cuándo y valor anterior/nuevo.

---

## 5. Seguridad y control de acceso

### 5.1 Autenticación (Supabase Auth)
- Acceso únicamente con usuario y contraseña; cada tienda, asesor, embajador, supervisor y miembro del equipo tiene credencial propia.
- Recuperación de contraseña por correo; sesiones con expiración; opción de 2FA para roles administrativos (recomendado).
- El **cliente final no se autentica**: accede por link firmado con token de un solo propósito y vencimiento.

### 5.2 Row Level Security (RLS) — políticas por rol
La restricción vive **en la base de datos**, no solo en la interfaz: aunque alguien intente saltarse el frontend o consumir la API directamente, solo obtiene los datos que su rol permite. Políticas conceptuales:

- **Embajador:** SELECT/INSERT únicamente sobre sus propias ventas, separados, pedidos, puntos, comisiones y comprobantes (`usuario_id = auth.uid()`). Lectura del catálogo de piezas disponibles. Cero visibilidad de otros vendedores, costos o márgenes.
- **Asesor:** todo lo suyo + lectura de la información comercial de los embajadores de su red (ventas, puntos, ranking, actividad). No ve costos ni datos de otros asesores.
- **Supervisor:** lectura sobre la información de sus asesores y de los embajadores descendientes (la política resuelve la jerarquía de forma recursiva o mediante una vista materializada de la cadena de mando). Sin acceso a configuración ni finanzas.
- **Tienda:** su inventario, sus ventas, sus transferencias entrantes y sus pedidos. Lectura del catálogo general.
- **Producción:** INSERT/UPDATE sobre productos en estado borrador/producción; lectura de sus propias cargas. Sin acceso a ventas, precios de venta finales ni finanzas.
- **Contabilidad:** lectura de ventas, pedidos y pagos; UPDATE solo sobre el estado de comprobantes y conciliación. Sin permisos de configuración.
- **Coordinador:** lectura de toda la red comercial e indicadores; escritura sobre metas y campañas.
- **Admin:** políticas de acceso total (o `service_role` limitado a operaciones de servidor).
- **Cliente final (anónimo con token):** lectura exclusivamente de las piezas incluidas en el link firmado y escritura solo de su propio carrito/orden, validada por el token.
- **Regla transversal:** costos de producción y márgenes solo visibles para admin, coordinador (si se decide) y contabilidad — nunca para la red comercial.
- **Datos sensibles de clientes finales** (contacto, dirección): visibles solo para el vendedor que atendió la venta, logística y administración.

### 5.3 Integridad operativa
- **Operaciones atómicas** en separado, carrito y venta (bloqueo de fila / transacción) para garantizar cero doble venta bajo concurrencia.
- **Bitácora de auditoría** de acciones críticas: cambios de precio, ajustes de inventario, anulaciones, cambios de parámetros, aprobaciones.
- **Soft delete** generalizado: nada se borra físicamente; todo se desactiva conservando trazabilidad.

---

## 6. Métodos de pago

- Tarjetas (pasarela de pago), transferencias, depósitos y portal bancario de ARIGA.
- **Compra en un clic** desde el link del carrito.
- Registro de pagos parciales/abonos sobre piezas separadas (parámetro configurable: % mínimo de abono para mantener un separado extendido).
- Conciliación automática pago ↔ venta con bandeja de excepciones.
- Diseño desacoplado de la pasarela para poder cambiar de proveedor por país (clave para expansión).

---

## 7. Mejoras y consideraciones adicionales recomendadas

Elementos no explícitos en la cotización que elevan la calidad del producto:

1. **Notificaciones multicanal:** in-app + correo (+ WhatsApp vía API en fase posterior) para: separado por vencer, venta confirmada, pago recibido, comprobante aprobado/rechazado, transferencia despachada, cambio de posición en ranking, cierre de mes.
2. **PWA / instalación en escritorio:** la app web instalable en los computadores de tienda (cumple el requerimiento de "aplicación de escritorio" sin desarrollo nativo) y en móviles de la red comercial.
3. **Multi-moneda y multi-país desde el diseño:** todos los montos con moneda asociada; catálogo de países con su configuración fiscal y de pagos, para que la expansión sea configuración y no re-desarrollo.
4. **Gestión de imágenes optimizada:** compresión automática, miniaturas y CDN (Supabase Storage) — crítico para un catálogo de joyería con muchas fotos de alta calidad.
5. **Códigos QR / etiquetas por pieza:** cada pieza física con QR que abre su ficha; agiliza ventas en tienda, transferencias e inventarios físicos.
6. **Conteo físico de inventario:** módulo de toma de inventario por tienda (escanear/marcar piezas presentes) con reporte de diferencias — habilita el equivalente a un IRA de joyería.
7. **Metas configurables:** metas de venta por vendedor/tienda/período definidas en el panel, con semáforos de cumplimiento en dashboards.
8. **Estados de cliente final ligeros (CRM básico):** historial de compras por cliente, clientes recurrentes, cumpleaños (oportunidad de venta en joyería).
9. **Modo campaña:** eventos especiales (Día de la Madre, Navidad) con reglas de puntos, descuentos y catálogos destacados temporales, todo desde el panel.
10. **Exportaciones e informes:** todo listado exportable a Excel/PDF; cierres mensuales descargables (ventas, comisiones, puntos, inventario).
11. **Rendimiento del catálogo público:** el link para cliente final debe cargar rápido en móviles con datos limitados (SSR/ISR de Next.js, imágenes lazy).
12. **Ambiente de pruebas (staging):** entorno separado para validar cambios de reglas e integraciones SAT/banco sin tocar producción.
13. **Respaldo y recuperación:** backups automáticos diarios de la base de datos y del storage de imágenes, con procedimiento de restauración documentado.
14. **Internacionalización preparada:** textos centralizados para eventual segundo idioma.
15. **Onboarding guiado:** flujo de primer ingreso para embajadores (perfil, mini-tutorial, primer curso de la Academia) — reduce fricción en una red de cientos de personas.

---

## 8. Resumen del alcance por módulos (mapa para el plan de desarrollo)

1. **Autenticación, roles y jerarquía comercial** (Auth + RLS + panel de usuarios).
2. **Producción y alta de productos** (fichas, fotos, costos, publicación al CEDI).
3. **Inventario central (CEDI), tiendas/bodegas y transferencias** con trazabilidad.
4. **Catálogo virtual** elegante multi-tienda con estados de pieza en tiempo real.
5. **Separados** con expiración configurable y liberación automática.
6. **Ventas directas** (tienda/asesor/embajador) con atribución.
7. **Carrito por link para cliente final** con retención temporal y atribución al vendedor.
8. **Pedidos y logística** (estados, confirmación de recepción, comprobantes, aprobación contable).
9. **Motor de puntos, ranking y descuentos por desempeño** — 100% parametrizable en panel.
10. **Fidelización** (niveles, insignias, logros, premios).
11. **Comisiones y bonos** con liquidación por período.
12. **Academia Virtual** (cursos, evaluaciones, certificaciones).
13. **Atención al cliente** (centro de ayuda, tickets).
14. **Integraciones SAT y banco** con cola de reintentos y conciliación.
15. **Módulo financiero e inteligencia comercial** (KPIs, exportaciones, base para Power BI).
16. **Panel de administración** (parámetros, aprobaciones, auditoría).
17. **Transversales:** notificaciones, PWA, multi-moneda/multi-país, backups, staging.

---

*Documento preparado como base funcional. El siguiente paso es transformarlo en un plan técnico en Claude Code: modelo de datos, políticas RLS concretas, estructura de la app Next.js y orden de construcción por fases.*
