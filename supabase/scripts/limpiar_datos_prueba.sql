-- ============================================================
-- LIMPIEZA DE DATOS DE PRUEBA — ARIGA/ASTRO
-- ============================================================
-- Antes de arrancar producción y creación de artículos "de forma
-- oficial", este script borra TODO lo transaccional (artículos,
-- inventario, ventas, compras, traslados, etc.) generado durante
-- las pruebas, sin tocar:
--   - Catálogos: categorías, materiales, proveedores, tiendas/bodegas
--   - Usuarios, roles y permisos
--   - Configuración: parametros, parametros_precio (solo se
--     desvincula el producto_id de excepción si lo hubiera; la fila
--     de configuración en sí NO se borra)
--   - Auditoría (auditoria) — se conserva intacta como bitácora
--     histórica de lo que se hizo durante las pruebas
--
-- Se borran (y sus dependientes obligatorios, aunque no se hayan
-- pedido explícitamente — Postgres no permite dejarlos huérfanos):
--   productos, producto_imagenes, producto_precio_historial,
--   movimientos_inventario, inventario_cantidad,
--   carritos, carrito_detalles,
--   ventas, venta_detalles, pagos, pedidos, comisiones, puntos,
--   separados, clientes,
--   ordenes_compra, orden_compra_detalles, cargas_masivas,
--   recepciones_metal, recepcion_metal_detalles,
--   transferencias, transferencia_detalles,
--   conteo_fisico_detalles, notificaciones,
--   comprobantes, pedido_documentos, link_productos
--     (estas 3 últimas no se mencionaron explícitamente, pero son
--     dependientes obligatorios de pagos/pedidos/productos — no se
--     puede borrar el padre sin vaciarlas primero)
--
-- Investigado previamente: ninguna FK en este alcance usa
-- ON DELETE CASCADE/SET NULL (todas son RESTRICT, el default de
-- Postgres) y los triggers de auditoría (trg_auditar_*) son seguros
-- en DELETE — no fallan, solo insertan una fila más en auditoria por
-- cada fila borrada (auditoria se conserva, así que esto es esperado
-- y no requiere ninguna acción).
--
-- Hay una referencia circular real entre productos y
-- orden_compra_detalles (productos.compra_detalle_id ↔
-- orden_compra_detalles.producto_id) — se rompe con un UPDATE antes
-- de borrar.
--
-- Es IRREVERSIBLE. Corre primero el bloque 0 (solo lectura) y
-- confirma que los conteos son los que esperas. Pega esto en el
-- editor SQL de Supabase.
-- ============================================================


-- ============================================================
-- 0) VERIFICACIÓN PREVIA (solo lectura, corre esto primero)
-- ============================================================

select 'productos' as tabla, count(*) from public.productos
union all select 'producto_imagenes', count(*) from public.producto_imagenes
union all select 'producto_precio_historial', count(*) from public.producto_precio_historial
union all select 'movimientos_inventario', count(*) from public.movimientos_inventario
union all select 'inventario_cantidad', count(*) from public.inventario_cantidad
union all select 'carritos', count(*) from public.carritos
union all select 'carrito_detalles', count(*) from public.carrito_detalles
union all select 'ventas', count(*) from public.ventas
union all select 'venta_detalles', count(*) from public.venta_detalles
union all select 'pagos', count(*) from public.pagos
union all select 'pedidos', count(*) from public.pedidos
union all select 'comisiones', count(*) from public.comisiones
union all select 'puntos', count(*) from public.puntos
union all select 'separados', count(*) from public.separados
union all select 'clientes', count(*) from public.clientes
union all select 'ordenes_compra', count(*) from public.ordenes_compra
union all select 'orden_compra_detalles', count(*) from public.orden_compra_detalles
union all select 'cargas_masivas', count(*) from public.cargas_masivas
union all select 'recepciones_metal', count(*) from public.recepciones_metal
union all select 'recepcion_metal_detalles', count(*) from public.recepcion_metal_detalles
union all select 'transferencias', count(*) from public.transferencias
union all select 'transferencia_detalles', count(*) from public.transferencia_detalles
union all select 'conteo_fisico_detalles', count(*) from public.conteo_fisico_detalles
union all select 'notificaciones', count(*) from public.notificaciones
union all select 'comprobantes', count(*) from public.comprobantes
union all select 'pedido_documentos', count(*) from public.pedido_documentos
union all select 'link_productos', count(*) from public.link_productos
order by 1;

-- Catálogos y configuración que NO se van a tocar (deben quedar
-- igual antes y después):
select 'categorias' as tabla, count(*) from public.categorias
union all select 'materiales', count(*) from public.materiales
union all select 'proveedores', count(*) from public.proveedores
union all select 'tiendas', count(*) from public.tiendas
union all select 'usuarios', count(*) from public.usuarios
union all select 'parametros', count(*) from public.parametros
union all select 'parametros_precio', count(*) from public.parametros_precio
union all select 'auditoria', count(*) from public.auditoria
order by 1;


-- ============================================================
-- A partir de aquí es DESTRUCTIVO. No hay vuelta atrás.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Romper la referencia circular productos ↔ orden_compra_detalles,
--    y desvincular (sin borrar) cualquier excepción de precio ligada
--    a un producto puntual.
-- ------------------------------------------------------------
update public.productos set compra_detalle_id = null where compra_detalle_id is not null;
update public.parametros_precio set producto_id = null where producto_id is not null;

-- ------------------------------------------------------------
-- 2) Dependientes obligatorios FUERA del alcance original, que
--    bloquearían el borrado de pagos/pedidos/productos si no se
--    vacían primero.
-- ------------------------------------------------------------
delete from public.comprobantes;
delete from public.pedido_documentos;
delete from public.link_productos;

-- ------------------------------------------------------------
-- 3) Hojas (nada más depende de ellas) — orden sin restricciones
--    entre sí.
-- ------------------------------------------------------------
delete from public.notificaciones;
delete from public.conteo_fisico_detalles;
delete from public.recepcion_metal_detalles;
delete from public.transferencia_detalles;
delete from public.carrito_detalles;
delete from public.venta_detalles;
delete from public.orden_compra_detalles;
delete from public.producto_precio_historial;
delete from public.movimientos_inventario;
delete from public.inventario_cantidad;
delete from public.producto_imagenes;
delete from public.comisiones;
delete from public.puntos;

-- ------------------------------------------------------------
-- 4) Padres de nivel medio.
-- ------------------------------------------------------------
delete from public.pagos;
delete from public.pedidos;
delete from public.ventas;
delete from public.separados;

-- ------------------------------------------------------------
-- 5) productos — después de todos sus hijos y de romper la
--    referencia circular en el paso 1.
-- ------------------------------------------------------------
delete from public.productos;

-- ------------------------------------------------------------
-- 6) Raíces finales, sin nada que ya dependa de ellas.
-- ------------------------------------------------------------
delete from public.carritos;
delete from public.clientes;
delete from public.ordenes_compra;
delete from public.cargas_masivas;
delete from public.recepciones_metal;
delete from public.transferencias;


-- ============================================================
-- 7) VERIFICACIÓN POSTERIOR
-- ============================================================

-- Todas estas deben devolver 0:
select 'productos' as tabla, count(*) from public.productos
union all select 'producto_imagenes', count(*) from public.producto_imagenes
union all select 'producto_precio_historial', count(*) from public.producto_precio_historial
union all select 'movimientos_inventario', count(*) from public.movimientos_inventario
union all select 'inventario_cantidad', count(*) from public.inventario_cantidad
union all select 'carritos', count(*) from public.carritos
union all select 'carrito_detalles', count(*) from public.carrito_detalles
union all select 'ventas', count(*) from public.ventas
union all select 'venta_detalles', count(*) from public.venta_detalles
union all select 'pagos', count(*) from public.pagos
union all select 'pedidos', count(*) from public.pedidos
union all select 'comisiones', count(*) from public.comisiones
union all select 'puntos', count(*) from public.puntos
union all select 'separados', count(*) from public.separados
union all select 'clientes', count(*) from public.clientes
union all select 'ordenes_compra', count(*) from public.ordenes_compra
union all select 'orden_compra_detalles', count(*) from public.orden_compra_detalles
union all select 'cargas_masivas', count(*) from public.cargas_masivas
union all select 'recepciones_metal', count(*) from public.recepciones_metal
union all select 'recepcion_metal_detalles', count(*) from public.recepcion_metal_detalles
union all select 'transferencias', count(*) from public.transferencias
union all select 'transferencia_detalles', count(*) from public.transferencia_detalles
union all select 'conteo_fisico_detalles', count(*) from public.conteo_fisico_detalles
union all select 'notificaciones', count(*) from public.notificaciones
union all select 'comprobantes', count(*) from public.comprobantes
union all select 'pedido_documentos', count(*) from public.pedido_documentos
union all select 'link_productos', count(*) from public.link_productos
order by 1;

-- Catálogos/config — deben seguir con el MISMO conteo que en el
-- bloque 0 (nada de esto se tocó):
select 'categorias' as tabla, count(*) from public.categorias
union all select 'materiales', count(*) from public.materiales
union all select 'proveedores', count(*) from public.proveedores
union all select 'tiendas', count(*) from public.tiendas
union all select 'usuarios', count(*) from public.usuarios
union all select 'parametros', count(*) from public.parametros
union all select 'parametros_precio', count(*) from public.parametros_precio
union all select 'auditoria', count(*) from public.auditoria
order by 1;

-- ============================================================
-- NOTA: esto NO borra los archivos físicos ya subidos al bucket de
-- Storage 'ariga-productos' (fotos de los productos borrados). Si
-- quieres liberar ese espacio también, hazlo aparte desde el panel
-- de Storage de Supabase — este script solo toca la base de datos.
-- ============================================================
