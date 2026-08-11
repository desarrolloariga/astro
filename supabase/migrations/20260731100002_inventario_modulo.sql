-- ============================================================
-- ARIGA — Módulo de Inventario: vistas por bodega + traslados.
--
-- Contexto: fn_crear_transferencia y fn_confirmar_recepcion ya
-- existían y funcionaban (fase 2), pero nunca tuvieron UI. Esta
-- migración agrega lo que falta para construirla:
--   1. Permiso nuevo 'inventario'.'transferir' (crear/gestionar
--      traslados), sembrado con los mismos roles que ya exigía
--      fn_crear_transferencia de forma fija (admin, coordinador).
--   2. Amplía 'inventario'.'ver' a coordinador y contabilidad
--      (antes solo admin/tienda) — no quita nada a nadie.
--   3. Migra fn_crear_transferencia a fn_tiene_permiso(...), mismo
--      patrón ya usado en 20260720100002_permisos_rewire.sql. No
--      cambia el comportamiento actual (los defaults del punto 1
--      reproducen exactamente el chequeo fijo anterior).
--   4. vw_inventario_tienda — YA EXISTÍA (20260714100006), pero
--      solo servía para "mi propia tienda" sin costos, y con
--      fn_mi_tienda_id() en el WHERE para TODOS los roles — un
--      admin/coordinador (sin tienda_id propio) obtenía 0 filas.
--      Nunca tuvo ningún consumidor en la app (confirmado por
--      búsqueda en todo el repo). Se reemplaza (drop + create) por
--      una versión con costo incluido y visibilidad por rol: todo
--      para admin/coordinador/contabilidad, solo lo propio para
--      tienda. Las vistas corren como su dueño (no heredan RLS de
--      productos), así que la visibilidad se resuelve en el WHERE.
--   5. vw_transferencia_detalles — detalle de cada traslado con
--      nombre/código de pieza y tiendas, replicando la MISMA
--      condición de visibilidad que la política sel_transferencia_detalles
--      ya existente. Hace falta aparte de vw_inventario_tienda
--      porque mientras una pieza está en_transito su tienda_id
--      sigue apuntando al origen — la tienda destino necesita ver
--      qué le están enviando antes de que la pieza sea "suya".
-- ============================================================

-- 1. Nuevo permiso
insert into public.permisos (modulo, accion, descripcion) values
  ('inventario', 'transferir', 'Crear y gestionar traslados entre bodegas')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('admin','inventario','transferir'),
  ('coordinador','inventario','transferir')
) as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

-- 2. Amplía inventario.ver
insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('coordinador','inventario','ver'),
  ('contabilidad','inventario','ver')
) as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

-- 3. fn_crear_transferencia — mismo cuerpo, gate migrado a fn_tiene_permiso
create or replace function public.fn_crear_transferencia(
  p_tienda_destino_id bigint,
  p_producto_ids bigint[]
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_transferencia_id bigint;
  v_origen_id bigint;
  v_producto public.productos%rowtype;
  v_id bigint;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
  end if;
  if not public.fn_tiene_permiso('inventario','transferir') then
    raise exception 'No tienes permiso para generar órdenes de transferencia';
  end if;
  if p_producto_ids is null or array_length(p_producto_ids, 1) is null then
    raise exception 'La transferencia necesita al menos una pieza';
  end if;

  foreach v_id in array p_producto_ids loop
    select * into v_producto from public.productos where id = v_id for update;

    if not found then
      raise exception 'La pieza % no existe', v_id;
    end if;
    if v_producto.estado not in ('disponible_cedi','disponible_tienda') then
      raise exception 'La pieza % (%) no está disponible para transferir (estado: %)',
        v_producto.codigo, v_id, v_producto.estado;
    end if;

    if v_origen_id is null then
      v_origen_id := v_producto.tienda_id;
    elsif v_origen_id <> v_producto.tienda_id then
      raise exception 'Todas las piezas deben estar en la misma bodega de origen';
    end if;
  end loop;

  if v_origen_id = p_tienda_destino_id then
    raise exception 'El origen y el destino no pueden ser la misma bodega';
  end if;

  insert into public.transferencias (tienda_origen_id, tienda_destino_id, creado_por)
  values (v_origen_id, p_tienda_destino_id, public.fn_usuario_id())
  returning id into v_transferencia_id;

  foreach v_id in array p_producto_ids loop
    insert into public.transferencia_detalles (transferencia_id, producto_id)
    values (v_transferencia_id, v_id);

    update public.productos set estado = 'en_transito' where id = v_id;

    insert into public.movimientos_inventario
      (producto_id, tipo, tienda_origen_id, tienda_destino_id, usuario_id, referencia)
    values
      (v_id, 'salida_transferencia', v_origen_id, p_tienda_destino_id,
       public.fn_usuario_id(), 'transferencia:' || v_transferencia_id);
  end loop;

  return v_transferencia_id;
end;
$$;

-- 4. vw_inventario_tienda (reemplaza la versión de 20260714100006:
-- columnas distintas, así que no alcanza con create or replace)
drop view if exists public.vw_inventario_tienda;

create view public.vw_inventario_tienda as
select
  p.id, p.codigo, p.nombre,
  c.nombre as categoria,
  m.nombre as material,
  p.peso_gramos, p.kilataje, p.piedras,
  p.estado, p.precio_venta, p.costo_produccion, p.moneda_id,
  p.tienda_id,
  t.nombre as tienda, t.tipo as tienda_tipo,
  (select i.url from public.producto_imagenes i
     where i.producto_id = p.id
     order by i.es_principal desc, i.orden asc limit 1) as imagen_principal,
  p.fecha_actualizacion, p.fecha_creacion
from public.productos p
left join public.categorias c on c.id = p.categoria_id
left join public.materiales m on m.id = p.material_id
left join public.tiendas t on t.id = p.tienda_id
where p.activo
  and (
    public.fn_rol_actual() in ('admin','coordinador','contabilidad')
    or (public.fn_rol_actual() = 'tienda' and p.tienda_id = public.fn_mi_tienda_id())
  );

grant select on public.vw_inventario_tienda to authenticated;
revoke all on public.vw_inventario_tienda from anon;

-- 5. vw_transferencia_detalles
create or replace view public.vw_transferencia_detalles as
select
  td.id, td.transferencia_id, td.producto_id,
  p.codigo as producto_codigo, p.nombre as producto_nombre,
  td.estado_recepcion, td.comentario_incidencia,
  td.confirmado_por, td.fecha_confirmacion,
  t.estado as transferencia_estado,
  t.tienda_origen_id, torigen.nombre as tienda_origen,
  t.tienda_destino_id, tdestino.nombre as tienda_destino,
  t.creado_por, t.fecha_envio, t.fecha_recepcion
from public.transferencia_detalles td
join public.transferencias t on t.id = td.transferencia_id
join public.productos p on p.id = td.producto_id
left join public.tiendas torigen on torigen.id = t.tienda_origen_id
left join public.tiendas tdestino on tdestino.id = t.tienda_destino_id
where
  public.fn_rol_actual() in ('admin','coordinador','contabilidad')
  or (public.fn_rol_actual() = 'tienda'
      and public.fn_mi_tienda_id() in (t.tienda_origen_id, t.tienda_destino_id));

grant select on public.vw_transferencia_detalles to authenticated;
revoke all on public.vw_transferencia_detalles from anon;

-- Verificación
select modulo, accion from public.permisos where modulo = 'inventario' order by accion;
