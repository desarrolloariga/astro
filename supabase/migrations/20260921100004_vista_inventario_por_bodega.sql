-- ============================================================
-- ASTRO — Reporte de inventario por bodega: una fila por artículo Y
-- bodega donde realmente tiene existencia. vw_inventario_tienda
-- (20260819100001) sigue sirviendo para el reporte financiero
-- existente (una fila por producto, ligada a su tienda_id base) pero
-- ya no basta para ver el detalle real de un artículo por_cantidad
-- cuyo stock quedó repartido entre varias bodegas (ver
-- 20260921100003) — para eso hace falta una vista aparte que
-- despliegue inventario_cantidad completo, no solo la fila de la
-- bodega base.
--
-- Solo cantidades — sin costo ni precio (mismo criterio ya aplicado
-- en /existencias de Producción): este es un reporte operativo de
-- "qué hay y dónde", no financiero.
--
-- Producción ya ve Existencias (solo cantidades) y hace los
-- traslados entre bodegas — gana inventario.ver para poder ver este
-- reporte también (hasta ahora solo lo tenían admin/tienda/
-- coordinador/contabilidad/supervisor, ver 20260731100002).
-- ============================================================

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from public.roles r
join public.permisos p on p.modulo = 'inventario' and p.accion = 'ver'
where r.nombre = 'produccion'
on conflict (rol_id, permiso_id) do nothing;

create or replace view public.vw_inventario_por_bodega as
select
  p.id as producto_id,
  p.codigo,
  p.nombre,
  p.modo_inventario,
  p.estado,
  p.categoria_id,
  c.nombre as categoria,
  p.material_id,
  m.nombre as material,
  p.proveedor_id,
  pr.nombre as proveedor,
  p.nivel_ganancia,
  p.marca,
  p.coleccion,
  p.origen,
  p.atributos->>'subcategoria' as subcategoria,
  t.id as tienda_id,
  t.nombre as tienda,
  1 as cantidad
from public.productos p
join public.tiendas t on t.id = p.tienda_id
left join public.categorias c on c.id = p.categoria_id
left join public.materiales m on m.id = p.material_id
left join public.proveedores pr on pr.id = p.proveedor_id
where p.activo
  and p.modo_inventario = 'pieza_unica'
  and p.estado in ('disponible_cedi', 'en_transito', 'disponible_tienda', 'separada')
  and public.fn_rol_actual() in ('admin','coordinador','contabilidad','supervisor','tienda','produccion')

union all

select
  p.id as producto_id,
  p.codigo,
  p.nombre,
  p.modo_inventario,
  p.estado,
  p.categoria_id,
  c.nombre as categoria,
  p.material_id,
  m.nombre as material,
  p.proveedor_id,
  pr.nombre as proveedor,
  p.nivel_ganancia,
  p.marca,
  p.coleccion,
  p.origen,
  p.atributos->>'subcategoria' as subcategoria,
  ic.tienda_id,
  t.nombre as tienda,
  ic.cantidad_disponible as cantidad
from public.inventario_cantidad ic
join public.productos p on p.id = ic.producto_id
join public.tiendas t on t.id = ic.tienda_id
left join public.categorias c on c.id = p.categoria_id
left join public.materiales m on m.id = p.material_id
left join public.proveedores pr on pr.id = p.proveedor_id
where p.activo
  and p.modo_inventario = 'por_cantidad'
  and ic.cantidad_disponible > 0
  and public.fn_rol_actual() in ('admin','coordinador','contabilidad','supervisor','tienda','produccion');

comment on view public.vw_inventario_por_bodega is
  'Reporte operativo: una fila por artículo y bodega donde tiene existencia real. Pieza única = 1 fila (su tienda_id) con cantidad 1; por_cantidad = una fila por cada bodega con stock > 0 en inventario_cantidad. Sin costo ni precio — ver vw_inventario_tienda para el reporte financiero.';

grant select on public.vw_inventario_por_bodega to authenticated;

-- Visibilidad: igual que vw_inventario_tienda, la vista fija su
-- propio filtro de rol en el WHERE en vez de depender de la RLS de
-- productos/inventario_cantidad — mismo patrón que el resto de vw_*
-- del proyecto (las vistas no heredan RLS de las tablas base aquí).
-- produccion se incluye sin acotar a "sus propias piezas" porque este
-- es un reporte operativo de bodega, no el listado de alta/edición.
