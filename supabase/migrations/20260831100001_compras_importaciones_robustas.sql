-- ============================================================
-- ASTRO — Compras/Importaciones robustas (Fase B de "formularios
-- nivel Odoo/SAP"). Campos confirmados: condiciones de pago, fecha de
-- entrega esperada, dirección de entrega, método de envío, referencia
-- del proveedor, notas separadas (internas vs. para el proveedor), y
-- descuento por línea.
--
-- Nota de "CREATE OR REPLACE gotcha": las funciones que ganan
-- parámetros nuevos cambian de firma (Postgres identifica funciones
-- por nombre+tipos de argumento) — hay que DROP la firma vieja antes
-- de recrearlas, si no queda un overload viejo huérfano.
-- ============================================================

alter table public.ordenes_compra
  add column condiciones_pago text,
  add column fecha_entrega_esperada date,
  add column direccion_entrega text,
  add column metodo_envio text,
  add column referencia_proveedor text,
  add column notas_proveedor text;

alter table public.orden_compra_detalles
  add column descuento_pct numeric(5,2) not null default 0 check (descuento_pct >= 0 and descuento_pct <= 100);

alter table public.importaciones
  add column condiciones_pago text,
  add column fecha_entrega_esperada date,
  add column direccion_entrega text,
  add column metodo_envio text,
  add column referencia_proveedor text,
  add column notas_proveedor text;

alter table public.importacion_detalles
  add column descuento_pct numeric(5,2) not null default 0 check (descuento_pct >= 0 and descuento_pct <= 100);

-- ------------------------------------------------------------
-- fn_crear_orden_compra — cambia de firma (gana 6 parámetros).
-- ------------------------------------------------------------
drop function if exists public.fn_crear_orden_compra(bigint, text);

create or replace function public.fn_crear_orden_compra(
  p_proveedor_id bigint,
  p_condiciones_pago text default null,
  p_fecha_entrega_esperada date default null,
  p_direccion_entrega text default null,
  p_metodo_envio text default null,
  p_referencia_proveedor text default null,
  p_notas_proveedor text default null,
  p_notas text default null
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.fn_tiene_permiso('compras', 'crear') then
    raise exception 'No tienes permiso para crear órdenes de compra';
  end if;

  insert into public.ordenes_compra (
    proveedor_id, condiciones_pago, fecha_entrega_esperada, direccion_entrega,
    metodo_envio, referencia_proveedor, notas_proveedor, notas, creado_por
  )
  values (
    p_proveedor_id, p_condiciones_pago, p_fecha_entrega_esperada, p_direccion_entrega,
    p_metodo_envio, p_referencia_proveedor, p_notas_proveedor, p_notas, public.fn_usuario_id()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- fn_agregar_linea_compra — cambia de firma (gana p_descuento_pct).
-- ------------------------------------------------------------
drop function if exists public.fn_agregar_linea_compra(bigint, bigint, text, numeric, numeric);

create or replace function public.fn_agregar_linea_compra(
  p_orden_compra_id bigint,
  p_producto_id bigint,
  p_descripcion text,
  p_cantidad numeric,
  p_costo_unitario numeric,
  p_descuento_pct numeric default 0
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_orden public.ordenes_compra%rowtype;
  v_detalle_id bigint;
  v_subtotal numeric;
begin
  if not public.fn_tiene_permiso('compras', 'crear') then
    raise exception 'No tienes permiso para modificar órdenes de compra';
  end if;

  select * into v_orden from public.ordenes_compra where id = p_orden_compra_id for update;
  if not found then
    raise exception 'La orden de compra no existe';
  end if;
  if v_orden.estado <> 'borrador' then
    raise exception 'Solo se agregan líneas a una orden en borrador (actual: %)', v_orden.estado;
  end if;
  if p_descripcion is null or btrim(p_descripcion) = '' then
    raise exception 'La línea necesita una descripción';
  end if;
  if coalesce(p_descuento_pct, 0) < 0 or coalesce(p_descuento_pct, 0) > 100 then
    raise exception 'El descuento debe estar entre 0 y 100%%';
  end if;

  v_subtotal := p_cantidad * p_costo_unitario * (1 - coalesce(p_descuento_pct, 0) / 100);

  insert into public.orden_compra_detalles (
    orden_compra_id, producto_id, descripcion, cantidad, costo_unitario, descuento_pct, subtotal
  )
  values (
    p_orden_compra_id, p_producto_id, p_descripcion, p_cantidad, p_costo_unitario, coalesce(p_descuento_pct, 0), v_subtotal
  )
  returning id into v_detalle_id;

  update public.ordenes_compra oc
    set subtotal = (select coalesce(sum(subtotal), 0) from public.orden_compra_detalles where orden_compra_id = p_orden_compra_id),
        total = (select coalesce(sum(subtotal), 0) from public.orden_compra_detalles where orden_compra_id = p_orden_compra_id)
    where oc.id = p_orden_compra_id;

  return v_detalle_id;
end;
$$;

-- ------------------------------------------------------------
-- fn_crear_importacion — cambia de firma (gana 6 parámetros).
-- ------------------------------------------------------------
drop function if exists public.fn_crear_importacion(bigint, bigint, numeric, text);

create or replace function public.fn_crear_importacion(
  p_proveedor_id bigint,
  p_moneda_origen_id bigint default null,
  p_tipo_cambio numeric default 1,
  p_condiciones_pago text default null,
  p_fecha_entrega_esperada date default null,
  p_direccion_entrega text default null,
  p_metodo_envio text default null,
  p_referencia_proveedor text default null,
  p_notas_proveedor text default null,
  p_notas text default null
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.fn_tiene_permiso('importaciones', 'crear') then
    raise exception 'No tienes permiso para crear importaciones';
  end if;

  insert into public.importaciones (
    proveedor_id, moneda_origen_id, tipo_cambio, condiciones_pago, fecha_entrega_esperada,
    direccion_entrega, metodo_envio, referencia_proveedor, notas_proveedor, notas, creado_por
  )
  values (
    p_proveedor_id, p_moneda_origen_id, coalesce(p_tipo_cambio, 1), p_condiciones_pago, p_fecha_entrega_esperada,
    p_direccion_entrega, p_metodo_envio, p_referencia_proveedor, p_notas_proveedor, p_notas, public.fn_usuario_id()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- fn_agregar_linea_importacion — cambia de firma (gana p_descuento_pct).
-- ------------------------------------------------------------
drop function if exists public.fn_agregar_linea_importacion(bigint, bigint, text, numeric, numeric);

create or replace function public.fn_agregar_linea_importacion(
  p_importacion_id bigint,
  p_producto_id bigint,
  p_descripcion text,
  p_cantidad numeric,
  p_valor_fob_unitario numeric,
  p_descuento_pct numeric default 0
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_imp public.importaciones%rowtype;
  v_detalle_id bigint;
  v_valor_fob_total numeric;
begin
  if not public.fn_tiene_permiso('importaciones', 'crear') then
    raise exception 'No tienes permiso para modificar importaciones';
  end if;

  select * into v_imp from public.importaciones where id = p_importacion_id for update;
  if not found then
    raise exception 'La importación no existe';
  end if;
  if v_imp.estado <> 'borrador' then
    raise exception 'Solo se agregan líneas a una importación en borrador (actual: %)', v_imp.estado;
  end if;
  if p_descripcion is null or btrim(p_descripcion) = '' then
    raise exception 'La línea necesita una descripción';
  end if;
  if coalesce(p_descuento_pct, 0) < 0 or coalesce(p_descuento_pct, 0) > 100 then
    raise exception 'El descuento debe estar entre 0 y 100%%';
  end if;

  v_valor_fob_total := p_cantidad * p_valor_fob_unitario * (1 - coalesce(p_descuento_pct, 0) / 100);

  insert into public.importacion_detalles (
    importacion_id, producto_id, descripcion, cantidad, valor_fob_unitario, descuento_pct, valor_fob_total
  )
  values (
    p_importacion_id, p_producto_id, p_descripcion, p_cantidad, p_valor_fob_unitario, coalesce(p_descuento_pct, 0), v_valor_fob_total
  )
  returning id into v_detalle_id;

  update public.importaciones
    set fob_total = (select coalesce(sum(valor_fob_total), 0) from public.importacion_detalles where importacion_id = p_importacion_id)
    where id = p_importacion_id;

  return v_detalle_id;
end;
$$;

-- Verificación
select column_name from information_schema.columns
where table_schema = 'public' and table_name in ('ordenes_compra', 'importaciones')
  and column_name in ('condiciones_pago', 'fecha_entrega_esperada', 'direccion_entrega', 'metodo_envio', 'referencia_proveedor', 'notas_proveedor')
order by table_name, column_name;
