# Arquitectura de base de datos — ASTRO

## Decisiones vigentes

| Aspecto | Decisión |
|---|---|
| Motor | **Supabase** (Postgres + Auth + Storage + RLS) |
| Esquema | **`public`** — proyecto Supabase dedicado a ASTRO; expuesto en la API por defecto |
| Idioma | Tablas y campos **en español**, snake_case, tablas en plural |
| Claves primarias | `id bigint generated always as identity` — **sin UUID** |
| Migraciones | Supabase CLI, SQL puro en [supabase/migrations/](../supabase/migrations/) |
| Borrado | **Soft delete** (`activo boolean`) — nada se borra físicamente |
| Timestamps | `fecha_creacion` + `fecha_actualizacion` (trigger `fn_fecha_actualizacion`) |
| Estados | `text` + `check constraint` (no enums de Postgres) |
| Lógica crítica | Funciones RPC `security definer` en la BD (ventas, separados, carritos) — nunca INSERT directo desde el cliente |

**Puente Auth ↔ IDs numéricos:** Supabase Auth usa UUID; `public.usuarios.auth_uid` referencia
`auth.users(id)`. Toda política RLS usa los helpers `fn_usuario_id()`, `fn_rol_actual()`,
`fn_mi_tienda_id()` y `fn_es_mi_descendiente()` (jerarquía vía vista materializada
`vw_cadena_mando`). Un trigger sobre `auth.users` da de alta automáticamente la fila en
`public.usuarios` con el rol indicado en `raw_app_meta_data->>'rol'`.

## Conexión

Variables en `.env.local` (ver [.env.example](../.env.example)):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_DB_URL`. Clientes en [lib/supabase/](../lib/supabase/): `client.ts` (browser),
`server.ts` (SSR/Actions), `admin.ts` (service role, solo servidor). Todos operan con
`db: { schema: 'public' }`.

Comandos: `pnpm db:link` (vincular proyecto), `pnpm db:push` (aplicar migraciones),
`pnpm db:types` (generar tipos TS del esquema `public`).

> El esquema `public` está expuesto en la API por defecto en todo proyecto Supabase; no requiere
> configuración adicional en el Dashboard.

## Esquema implementado (migraciones aplicadas por fase)

### Fase 1 — Fundaciones (`20260714100002..4`)

- **Catálogos:** `monedas` (GTQ semilla, renombrada desde MXN el 2026-07-31), `paises` (México, config fiscal SAT pendiente — sin cambios; ver [20260731100001_moneda_quetzales.sql](../supabase/migrations/20260731100001_moneda_quetzales.sql)).
- **Roles y permisos:** `roles` (admin, coordinador, supervisor, asesor, embajador, tienda, produccion, contabilidad), `permisos` (módulo × acción), `roles_permisos`, `usuarios_permisos` (excepciones individuales).
- **Tiendas:** `tiendas` (tipo `cedi`/`tienda`/`bodega`; el CEDI Central es semilla), `usuarios_tiendas`.
- **Usuarios y jerarquía:** `usuarios` (con `superior_id` self-FK), `historial_jerarquia` (automático por trigger al cambiar de superior), vista materializada `vw_cadena_mando` (pares ancestro/descendiente, refrescada por trigger).
- **Transversales:** `parametros` (horas_separado, minutos_retencion_carrito, dias_vigencia_link, etc.), `auditoria` (trigger genérico `fn_auditar` sobre usuarios, parámetros, roles_permisos y tiendas), `notificaciones`.
- **RLS:** habilitado en todas las tablas; catálogos legibles por autenticados y escribibles solo por admin; `usuarios` visible según cadena de mando; `notificaciones` solo propias; `auditoria` solo admin; el rol `anon` no tiene privilegio alguno sobre tablas.

### Fase 2 — Productos e inventario (`20260714100005..6`)

- **Productos:** `categorias`, `materiales` (con semillas), `productos` (una fila = una pieza física; `codigo` único, ficha técnica, `costo_produccion` protegido, ciclo de estados con check), `producto_imagenes` (bucket público `ariga-productos`).
- **Inventario:** `transferencias` + `transferencia_detalles` (confirmación pieza a pieza con incidencias), `movimientos_inventario` (bitácora inmutable).
- **Funciones de negocio (`security definer`, con `FOR UPDATE`):** `fn_publicar_producto` (valida ficha y da de alta en CEDI), `fn_crear_transferencia` (bloquea piezas, valida origen común), `fn_confirmar_recepcion` (solo la tienda receptora; cierra la transferencia al resolverse todas las piezas).
- **Vistas sin costos:** `vw_catalogo` (piezas disponibles + "próximamente" según parámetro; imagen principal y galería en jsonb) y `vw_inventario_tienda` (inventario de la tienda del usuario). La red comercial y las tiendas **no** tienen SELECT directo a `productos`.
- **RLS:** producción solo ve/edita sus borradores; tabla `productos` legible solo para admin/contabilidad/coordinador; transferencias visibles para admin/coordinación/contabilidad y las tiendas involucradas.

### Fase 3 — Clientes, separados, ventas y pedidos (`20260715100001..2`)

- **Clientes:** `clientes` (CRM ligero; `vendedor_id` = quien lo captó). Se crean/reutilizan automáticamente al separar o vender (`fn_obtener_o_crear_cliente`, busca por vendedor+teléfono).
- **Separados:** `separados` (estado `activo`/`convertido`/`liberado`/`vencido`, `fecha_expiracion`, `aviso_enviado`, columnas de abono para fase futura). `fn_separar_pieza` bloquea la pieza (`FOR UPDATE`) y usa el parámetro `horas_separado`.
- **Liberación automática (pg_cron):** `fn_liberar_separados_vencidos` corre cada 5 min (libera y notifica); `fn_avisar_separados_por_vencer` cada 15 min (notifica antes del vencimiento, usa `horas_aviso_vencimiento_separado`). Jobs registrados vía `cron.schedule` (idempotente).
- **Ventas y pagos:** `ventas`, `venta_detalles`, `pagos` (`tarjeta`/`transferencia`/`deposito`/`pasarela`), `comprobantes` (bucket **privado** `ariga-comprobantes`, servido con URLs firmadas — nunca público, a diferencia de las fotos de producto). `fn_registrar_venta` (directa o desde un separado) y `fn_anular_venta` (solo admin, con motivo obligatorio) son atómicas y revierten/mueven el estado de cada pieza. `descuento_desempeno` queda en 0 hasta conectar el motor de incentivos (fase 5).
- **Pedidos:** `pedidos` (`en_espera`→`despachado`→`entregado`) generado automáticamente por cada venta; `pedido_documentos` para guías/evidencias. `fn_avanzar_pedido` valida la transición y quién puede ejecutarla.
- **Aprobación contable:** `fn_revisar_comprobante` (solo contabilidad/admin) aprueba/rechaza y, si aprueba, marca `pagos` y `ventas` como pagados; genera notificación al vendedor.
- **RLS:** todo de solo lectura directa (las escrituras van por las funciones anteriores); visibilidad por dueño + cadena de mando (`fn_es_mi_descendiente`) + tienda involucrada; contabilidad/admin/coordinador ven todo lo relevante a su rol.

### Corrección de seguridad — funciones RPC (`20260715100003`)

Se detectó y corrigió un bug real antes de construir la fase 4: en SQL, `NULL not in (...)`
evalúa a `NULL` (no a `TRUE`), así que `if public.fn_rol_actual() not in ('admin', …) then raise
exception` **nunca se disparaba** para un usuario autenticado en Supabase que no tuviera fila en
`public.usuarios` (p. ej. una cuenta de Auth que aún no ha sido vinculada a ASTRO). Corrección en
dos capas:
1. `fn_rol_actual()` ahora devuelve `'sin_rol'` en vez de `NULL` cuando no hay usuario ASTRO vinculado.
2. Cada función que requiere sesión ASTRO agrega `if public.fn_usuario_id() is null then raise exception …` como primera línea (necesario además del punto 1, porque varias funciones comparan `fn_usuario_id()` directamente, comparación también insegura ante `NULL`).
3. **`revoke execute on all functions in schema public from public`** (+ default privileges): antes, cualquier función quedaba ejecutable por `anon` porque Postgres concede `EXECUTE` a `PUBLIC` por defecto al crear una función, y la migración original solo *agregaba* permisos para `authenticated`/`service_role` sin revocar `PUBLIC`. Ahora `anon` no puede ejecutar nada salvo lo que la fase 4 le otorga explícitamente.

### Fase 4 — Links de venta y carrito público (`20260715100004..5`)

- **Links de venta:** `links_venta` (`token` aleatorio único vía `pgcrypto`, tipo `catalogo`/`subconjunto`/`pieza`, vigencia por `dias_vigencia_link`, contador de visitas), `link_productos` (piezas incluidas cuando el tipo no es `catalogo`).
- **Carrito del cliente final (sin cuenta):** `carritos` (identificado por su propio `token`, no por sesión), `carrito_detalles` con `fecha_expiracion` **por pieza** (retención corta, parámetro `minutos_retencion_carrito`). Nuevo estado de pieza `retenida` (se amplió el `check` de `productos.estado` y de `movimientos_inventario.tipo`).
- **Funciones públicas (únicas con `GRANT EXECUTE` a `anon`):** `fn_link_info` (valida vigencia + cuenta visitas), `fn_catalogo_por_token`, `fn_agregar_al_carrito` (bloquea la pieza `FOR UPDATE`, crea/reutiliza el carrito), `fn_quitar_del_carrito`, `fn_ver_carrito` (incluye segundos restantes de retención), `fn_confirmar_carrito` (crea la venta atribuida al **vendedor del enlace**, no al llamante — el cliente final es anónimo; pago solo `transferencia`/`deposito`, igual que el resto del flujo manual). Ninguna de estas funciones confía en `auth.uid()`; todas validan el `token` recibido.
- **Liberación automática (pg_cron):** `fn_liberar_carrito_items_vencidos` cada 2 min (libera piezas retenidas sin confirmar); `fn_vencer_links` cada hora (cosmético, marca enlaces vencidos en la lista del vendedor).
- **RLS:** `links_venta`/`carritos`/`carrito_detalles` solo lectura para el vendedor dueño (+ cadena de mando) y admin/coordinador — el cliente final nunca tiene SELECT directo, todo pasa por las funciones anteriores.

### Fase 5 — Puntos, ranking, descuentos por desempeño y fidelización (`20260716100001..3`)

- **Períodos:** `periodos` (mensual por defecto, soporta `campana`). `fn_obtener_periodo_actual()` reutiliza el período abierto vigente o crea el mensual correspondiente (idempotente vía `unique(tipo, fecha_inicio)`).
- **Reglas de puntaje:** `reglas_puntaje` (tipos `por_venta_fija`, `por_monto`, `por_categoria`, `por_margen`, `primera_venta_mes`, `cliente_nuevo`, `curso_completado` — este último a la espera de la fase Academia), `condiciones` en jsonb, vigencias, `version` (se auto-incrementa por trigger cuando cambia la lógica de la regla, para trazabilidad — los puntos ya otorgados nunca se recalculan).
- **Puntos:** `puntos` — ledger inmutable (solo `INSERT`, nunca `UPDATE`/`DELETE` vía RLS). `fn_calcular_puntos_regla(...)` es la función *pura* que evalúa una regla sobre una venta; la reutilizan tanto `fn_calcular_puntos` (otorga puntos reales) como `fn_simular_regla_puntaje` (solo lectura, admin) — évita duplicar la lógica de negocio.
- **Descuentos por desempeño:** `topes_venta` (global/rol/individual, con `check` que exige la combinación correcta de columnas) + `escalas_descuento` (progresivas). `fn_descuento_desempeno(vendedor_id)` consulta el acumulado del período vs. el tope más específico aplicable.
- **Enganche en ventas (`20260716100003`):** `fn_registrar_venta` y `fn_confirmar_carrito` se reemplazaron para calcular `descuento_desempeno` **antes** de fijar `ventas.total`, y llamar a `fn_calcular_puntos` al final (misma firma pública, sin romper a los llamantes).
- **Fidelización:** `niveles` (umbral de puntos por período), `usuario_niveles` (se actualiza automáticamente tras cada venta vía `fn_actualizar_nivel`), `insignias` (criterios automáticos `primera_venta` / `ventas_mes` evaluados en `fn_evaluar_insignias`), `usuario_insignias`, `premios` (por rango de posición y período), `reconocimientos` (curados por admin/coordinador, visibles solo si `publicado`).
- **`vw_ranking`:** posiciones agregadas por período (`rank()` sobre la suma de puntos), visible a **toda la red comercial autenticada** (no expone costos/márgenes, solo puntos — es la vista motivacional pública de la spec).
- **RLS:** catálogos de configuración (reglas, topes, escalas, premios, niveles, insignias) de lectura abierta a autenticados y escritura solo admin; `puntos`/`usuario_niveles`/`usuario_insignias` de solo lectura (las escriben las funciones); `reconocimientos` visibles solo si `publicado` (o admin/coordinador).

### Fase 6 — Comisiones y bonos (`20260717100001..3`)

Conceptualmente separado del motor de puntos: los puntos motivan y rankean, las comisiones pagan.

- **Metas:** `metas` (ámbito `vendedor`/`tienda`, por período; índices únicos parciales garantizan una sola meta por vendedor/tienda y período). Base del bono de cumplimiento de meta y de los semáforos de una fase posterior.
- **Reglas de comisión:** `reglas_comision` (tipos `por_venta`, `liderazgo`, `meta`, `crecimiento`, `capacitacion`/`fidelizacion` reservados para Academia/CRM), `condiciones` jsonb, `version` con auto-incremento por trigger (mismo patrón que `reglas_puntaje`).
- **Comisiones:** `comisiones` — ledger con `estado` (`calculada`→`aprobada`→`pagada`, estas sí mutan vía funciones dedicadas, a diferencia del ledger de puntos que es 100% inmutable). Dos vías de generación:
  - **Por venta** (`fn_calcular_comisiones`, enganchada en `fn_registrar_venta`/`fn_confirmar_carrito` igual que los puntos): resuelve `por_venta` (comisión directa del vendedor) y `liderazgo` (cada ascendente en `vw_cadena_mando` cuyo rol coincide con la regla gana % de la venta de su red).
  - **Por cierre de período** (`fn_cerrar_periodo`, solo admin): evalúa bonos `meta` (ventas del período ≥ `metas.monto_meta`) y `crecimiento` (vs. el período anterior del mismo tipo, umbral en `condiciones->>'umbral_crecimiento'`), y consolida **todas** las comisiones del período en `liquidaciones` por persona. Un período cerrado no se reabre.
- **Liquidaciones:** `fn_aprobar_liquidacion` / `fn_pagar_liquidacion` (solo admin) avanzan el estado y lo replican en las comisiones que la componen; notifican al vendedor al pagar.
- **RLS:** a diferencia del ranking de puntos (visible a toda la red, motivacional), `comisiones`/`liquidaciones` son datos de nómina — cada quien ve solo las suyas; admin y contabilidad ven todo. `reglas_comision` de lectura restringida a admin/contabilidad (parametrización financiera). `metas` de lectura abierta (no es dato sensible) y escritura admin **o coordinador** (coordinador administra metas y campañas según la especificación).
- **Exportación:** Route Handler `app/(app)/admin/comisiones/exportar/route.ts` genera CSV de las liquidaciones de un período (con BOM UTF-8 para Excel) — sin dependencias nuevas.

### Fase 7 — Academia Virtual y soporte (`20260718100001..2`)

- **Cursos:** `cursos`, `curso_contenidos` (`video`/`documento`/`texto`, con `check` que exige `url` o `contenido` según el tipo), `evaluaciones` (una por curso), `evaluacion_preguntas` (opción múltiple, `opciones` jsonb + índice de `respuesta_correcta`).
- **Progreso y certificación:** `progreso_cursos` (estado `en_curso`/`completado`, `contenidos_vistos` jsonb), `intentos_evaluacion` (respeta `intentos_maximos`), `certificaciones`.
- **Protección de la respuesta correcta:** `evaluacion_preguntas` es de lectura solo-admin vía RLS; el examen se sirve por la vista `vw_evaluacion_preguntas` (sin `respuesta_correcta`) para que el alumno no pueda leerla desde el cliente antes de responder. La calificación real ocurre server-side en `fn_enviar_evaluacion` (`security definer`, lee la tabla base).
- **Cierre del ciclo:** `fn_marcar_contenido_visto` completa automáticamente un curso sin evaluación cuando se vieron todos sus contenidos; `fn_enviar_evaluacion` completa uno con evaluación al aprobar. Ambos casos, si `cursos.otorga_puntos`, llaman a `fn_otorgar_puntos_curso`, que reutiliza el motor de puntos existente (regla `reglas_puntaje.tipo = 'curso_completado'`, ya reservada desde la fase 5) insertando directamente en `puntos` con `venta_id = null` — la tabla ya estaba preparada para puntos no ligados a una venta.
- **Soporte:** `faqs` (lectura abierta, administración admin), `tickets` + `ticket_mensajes` (`fn_crear_ticket`, `fn_responder_ticket`, `fn_actualizar_estado_ticket` — solo admin cambia estado/asigna). Notifica al autor cuando alguien más responde.
- **RLS:** cursos/contenidos/evaluaciones visibles a toda la red (Academia "disponible 24/7"); progreso y certificaciones visibles al propio usuario + su cadena de mando + admin/coordinador (un supervisor puede ver el avance de capacitación de su equipo); intentos de examen solo el propio usuario + admin (más sensible que la certificación final). Tickets visibles solo para el autor, la persona asignada y admin.

### Fase 8 — Financiero e inteligencia comercial, y pulido (`20260719100001..2`)

- **Vistas financieras auto-restringidas:** `vw_ventas_kpi`, `vw_margen_producto` (con `costo_produccion`, nunca para la red comercial), `vw_inventario_valorizado` (capital inmovilizado y piezas sin movimiento en 60+ días) y `vw_red_comercial` (activos/inactivos del mes). Mismo patrón que `vw_catalogo`/`vw_ranking`: son vistas de propietario `postgres` (bypasean RLS de las tablas base), así que cada una incluye `and public.fn_rol_actual() in (...)` en su `WHERE` — quien no tenga el rol adecuado simplemente recibe cero filas, en vez de depender de un GRANT diferenciado por rol (que Postgres no soporta a nivel de vista sin roles de BD dedicados).
- **Campañas:** `campanas` (nombre, vigencia, `configuracion` jsonb) — el registro visible del evento; las reglas de puntos/comisión especiales de la campaña se configuran con la misma vigencia en `reglas_puntaje`/`reglas_comision` (no se duplicó esa lógica).
- **Conteo físico de inventario:** `conteos_fisicos` + `conteo_fisico_detalles`. `fn_iniciar_conteo` fotografía qué piezas espera el sistema en una tienda (`estado = 'disponible_tienda'`) al momento de arrancar; `fn_marcar_pieza_contada` registra cada hallazgo; `fn_cerrar_conteo` cierra el conteo. **Deliberadamente no ajusta el inventario automáticamente** — el reporte de diferencias (piezas no marcadas) queda para que administración decida el ajuste, que es una operación sensible aparte.
- **RLS:** campañas de lectura abierta y escritura admin/coordinador (mismo criterio que metas); conteo físico visible para admin/coordinador y la tienda involucrada.

### Motor de permisos granulares (`20260720100001..2`)

Reemplaza la decisión inicial de "solo rol fijo" (ver historial): las tablas `permisos`/
`roles_permisos`/`usuarios_permisos` (fase 1) ahora se consultan de verdad.

- **`fn_tiene_permiso(modulo, accion)`:** excepción individual (`usuarios_permisos`, si existe) >
  permiso por defecto del rol (`roles_permisos`) > `false`. Es la única función que evalúa esto —
  tanto RLS como RPC la llaman, nunca reimplementan la lógica.
- **`roles_permisos` sembrado** para reproducir exactamente el comportamiento previo de cada rol
  (ningún acceso cambia al aplicar la migración); lo nuevo es la posibilidad de excepción individual.
- **Reemplazados por `fn_tiene_permiso`** (antes `fn_rol_actual() = 'admin'` o listas fijas): las
  políticas `adm_usuarios`, `adm_tiendas`, `adm_parametros`, `adm_reglas_puntaje`,
  `adm_topes_venta`, `adm_escalas_descuento`, `adm_cursos`, `adm_curso_contenidos`,
  `adm_evaluaciones`, `adm_evaluacion_preguntas`; las vistas `vw_ventas_kpi`,
  `vw_margen_producto`, `vw_inventario_valorizado`, `vw_red_comercial` (antes filtradas por rol
  fijo en su propio `WHERE`); y las funciones `fn_separar_pieza`, `fn_registrar_venta`,
  `fn_anular_venta`, `fn_revisar_comprobante`, `fn_simular_regla_puntaje`,
  `fn_iniciar_conteo`/`fn_marcar_pieza_contada`/`fn_cerrar_conteo` (estas últimas conservan además
  el check de que el rol `tienda` solo opere su propia tienda — eso es alcance de datos, no permiso).
- **Deliberadamente sin tocar:** la administración de la propia matriz
  (`roles_permisos`/`usuarios_permisos`/`permisos`) sigue protegida por `fn_rol_actual() = 'admin'`
  fijo, no por `fn_tiene_permiso` — evita que un error de configuración en el sistema de permisos
  deje a todos sin forma de corregirlo. Tampoco se tocó nada fuera del catálogo de 16 permisos
  (jerarquía, atribución de canal de venta, visibilidad por cadena de mando, etc.) — eso sigue
  siendo rol fijo a propósito, porque el spec no pide excepciones individuales ahí.

### Fases siguientes (plan aprobado)

Queda la fase 9, diferida por decisión del usuario (integraciones SAT y pasarela de pago), con
las tablas (`facturas`, `pagos_bancarios`, `cola_reintentos`) y los puntos de enganche ya
contemplados en el plan:
`C:\Users\Personal\.claude\plans\lee-el-documento-ariga-especificacion-fu-mighty-lark.md`.

## Invariantes de negocio en la BD

1. **Cero doble venta:** separar/retener/vender una pieza siempre pasa por funciones con `SELECT … FOR UPDATE` sobre `productos` dentro de una transacción.
2. **Puntos inmutables:** `puntos` guarda la versión de la regla aplicada; cambiar una regla nunca recalcula lo histórico.
3. **Costos protegidos:** `costo_produccion` y márgenes jamás visibles para la red comercial (catálogo servido por vista sin columnas de costo).
4. **Cliente final anónimo:** solo interactúa vía funciones RPC que validan el token del link.
5. **Todo parametrizable** vive en `parametros` o tablas de reglas — nunca hardcodeado.
