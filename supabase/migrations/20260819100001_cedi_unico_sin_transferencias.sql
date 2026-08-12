-- ============================================================
-- ASTRO — Cambio de arquitectura operativa (decisión del negocio,
-- 2026-08-11): el inventario ya NO se transfiere del CEDI a las
-- tiendas. Todo el stock vive siempre en el CEDI y se despacha
-- directamente desde ahí. Las tiendas siguen existiendo como canal de
-- venta y destino de despacho, pero dejan de tener bodega propia — ya
-- nunca volverán a recibir stock físico vía transferencia.
--
-- Se retira por completo la función de transferencias (no solo se
-- oculta): las funciones RPC, el permiso inventario.transferir y su
-- pantalla dedicada. Las tablas transferencias/transferencia_detalles
-- y el historial ya generado en movimientos_inventario NO se tocan —
-- son registro histórico, no datos en uso.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Quitar las funciones de transferencia — ya no tienen llamador
-- ------------------------------------------------------------
drop function if exists public.fn_crear_transferencia(bigint, bigint[]);
drop function if exists public.fn_confirmar_recepcion(bigint, boolean, text);

-- ------------------------------------------------------------
-- 2. Quitar el permiso inventario.transferir del catálogo
-- ------------------------------------------------------------
delete from public.roles_permisos
  where permiso_id = (select id from public.permisos where modulo = 'inventario' and accion = 'transferir');
delete from public.usuarios_permisos
  where permiso_id = (select id from public.permisos where modulo = 'inventario' and accion = 'transferir');
delete from public.permisos where modulo = 'inventario' and accion = 'transferir';

-- ------------------------------------------------------------
-- 3. vw_inventario_tienda — el rol tienda ya no se restringe a su
-- propia bodega (nunca volverá a tener stock ahí): ve la red completa
-- de inventario igual que coordinador/supervisor/contabilidad, que en
-- la práctica siempre será "lo que hay en el CEDI". Mismas columnas,
-- solo cambia el WHERE — CREATE OR REPLACE seguro.
-- ------------------------------------------------------------
create or replace view public.vw_inventario_tienda as
select
  p.id, p.codigo, p.nombre,
  c.nombre as categoria,
  m.nombre as material,
  p.peso_gramos, p.kilataje, p.piedras,
  p.estado,
  coalesce(p.precio_descuento, p.precio_venta) as precio_venta,
  p.precio_venta as precio_lista,
  (p.precio_descuento is not null) as en_descuento,
  p.costo_produccion, p.moneda_id,
  p.tienda_id,
  t.nombre as tienda, t.tipo as tienda_tipo,
  (select i.url from public.producto_imagenes i
     where i.producto_id = p.id
     order by i.es_principal desc, i.orden asc limit 1) as imagen_principal,
  p.fecha_actualizacion, p.fecha_creacion,
  p.categoria_id, p.material_id,
  p.modo_inventario,
  case when p.modo_inventario = 'por_cantidad' then ic.cantidad_disponible else null end as cantidad_disponible
from public.productos p
left join public.categorias c on c.id = p.categoria_id
left join public.materiales m on m.id = p.material_id
left join public.tiendas t on t.id = p.tienda_id
left join public.inventario_cantidad ic on ic.producto_id = p.id and ic.tienda_id = p.tienda_id
where p.activo
  and public.fn_rol_actual() in ('admin','coordinador','contabilidad','supervisor','tienda');

-- ------------------------------------------------------------
-- 4. vw_piezas_lentas — mismo criterio de visibilidad para tienda
-- ------------------------------------------------------------
create or replace view public.vw_piezas_lentas as
select
  p.id, p.codigo, p.nombre, c.nombre as categoria, m.nombre as material,
  p.tienda_id, t.nombre as tienda, p.precio_venta,
  coalesce(p.fecha_actualizacion, p.fecha_creacion) as ultimo_movimiento,
  extract(day from now() - coalesce(p.fecha_actualizacion, p.fecha_creacion))::int as dias_sin_movimiento
from public.productos p
left join public.categorias c on c.id = p.categoria_id
left join public.materiales m on m.id = p.material_id
left join public.tiendas t on t.id = p.tienda_id
where p.activo
  and p.estado in ('disponible_cedi','disponible_tienda')
  and p.modo_inventario = 'pieza_unica'
  and coalesce(p.fecha_actualizacion, p.fecha_creacion)
    < now() - ((select valor from public.parametros where clave = 'dias_pieza_lenta') || ' days')::interval
  and public.fn_rol_actual() in ('admin','coordinador','supervisor','contabilidad','tienda');
