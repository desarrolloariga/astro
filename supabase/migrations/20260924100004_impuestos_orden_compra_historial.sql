-- ============================================================
-- ASTRO — Órdenes de compra ganan un campo de impuestos (monto
-- capturado a mano, igual que en la trazabilidad de carga masiva —
-- no se asume ningún % fijo). El total pasa de ser solo la suma de
-- líneas a subtotal + impuestos.
--
-- Impuestos=0 por defecto: las órdenes ya creadas no cambian su total
-- histórico, solo las que capturen un monto de aquí en adelante.
-- ============================================================

alter table public.ordenes_compra
  add column impuestos numeric(12,2) not null default 0 check (impuestos >= 0);

comment on column public.ordenes_compra.impuestos is
  'Monto de impuestos de la orden (capturado a mano, no un % fijo) — total = subtotal + impuestos.';

-- ------------------------------------------------------------
-- fn_agregar_linea_compra — misma firma. El total ahora suma los
-- impuestos capturados en la orden, no solo el subtotal de líneas.
-- ------------------------------------------------------------
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
  if p_producto_id is null then
    raise exception 'Toda línea de una orden de compra debe ligarse a un artículo';
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
        total = (select coalesce(sum(subtotal), 0) from public.orden_compra_detalles where orden_compra_id = p_orden_compra_id) + oc.impuestos
    where oc.id = p_orden_compra_id;

  return v_detalle_id;
end;
$$;

-- ------------------------------------------------------------
-- fn_actualizar_impuestos_orden_compra — solo mientras la orden sigue
-- en borrador (antes de autorizar), igual que agregar/quitar líneas.
-- ------------------------------------------------------------
create or replace function public.fn_actualizar_impuestos_orden_compra(
  p_orden_compra_id bigint,
  p_impuestos numeric
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_orden public.ordenes_compra%rowtype;
begin
  if not public.fn_tiene_permiso('compras', 'crear') then
    raise exception 'No tienes permiso para modificar órdenes de compra';
  end if;
  if p_impuestos is null or p_impuestos < 0 then
    raise exception 'Los impuestos no pueden ser negativos';
  end if;

  select * into v_orden from public.ordenes_compra where id = p_orden_compra_id for update;
  if not found then
    raise exception 'La orden de compra no existe';
  end if;
  if v_orden.estado <> 'borrador' then
    raise exception 'Solo se editan impuestos de una orden en borrador (actual: %)', v_orden.estado;
  end if;

  update public.ordenes_compra
    set impuestos = p_impuestos,
        total = subtotal + p_impuestos
    where id = p_orden_compra_id;
end;
$$;
