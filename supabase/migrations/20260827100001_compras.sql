-- ============================================================
-- ASTRO — Compras locales (Fase 3 de la adaptación a la especificación
-- funcional de negocio).
--
-- El documento pide una máquina de 10 estados (ST-04) que asume una
-- matriz de autorización que todavía no existe. Se simplifica a algo
-- ejecutable ahora, con la puerta abierta a expandirse después:
--   borrador → autorizada → recibida_parcial → recibida_total
--   → facturada → pagada        (+ cancelada desde borrador/autorizada)
--
-- Punto clave (D-01): recibir una línea ligada a una pieza escribe el
-- costo real en productos.costo_produccion y dispara el motor de
-- precios con fuente_costo='compra' — de ahí el sentido de tener este
-- módulo ya en esta fase, no solo el motor de precios aislado.
-- ============================================================

create table public.ordenes_compra (
  id bigint generated always as identity primary key,
  proveedor_id bigint not null references public.proveedores (id),
  estado text not null default 'borrador' check (estado in
    ('borrador', 'autorizada', 'recibida_parcial', 'recibida_total', 'facturada', 'pagada', 'cancelada')),
  moneda_id bigint references public.monedas (id),
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notas text,
  numero_factura_proveedor text,
  creado_por bigint references public.usuarios (id),
  autorizado_por bigint references public.usuarios (id),
  fecha_autorizacion timestamptz,
  fecha_recepcion_total timestamptz,
  fecha_facturacion timestamptz,
  fecha_pago timestamptz,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create table public.orden_compra_detalles (
  id bigint generated always as identity primary key,
  orden_compra_id bigint not null references public.ordenes_compra (id),
  producto_id bigint references public.productos (id),
  descripcion text not null,
  cantidad numeric(10,3) not null check (cantidad > 0),
  costo_unitario numeric(12,2) not null check (costo_unitario >= 0),
  subtotal numeric(12,2) not null,
  cantidad_recibida numeric(10,3) not null default 0,
  fecha_creacion timestamptz not null default now()
);

create index idx_orden_compra_detalles_orden on public.orden_compra_detalles (orden_compra_id);

-- Enlace de trazabilidad (D-01: "usar costo real cuando exista").
alter table public.productos add column compra_detalle_id bigint references public.orden_compra_detalles (id);

create trigger trg_ordenes_compra_fecha_actualizacion
  before update on public.ordenes_compra
  for each row execute function public.fn_fecha_actualizacion();

create trigger trg_auditar_ordenes_compra
  after insert or update or delete on public.ordenes_compra
  for each row execute function public.fn_auditar();

create trigger trg_auditar_orden_compra_detalles
  after insert or update or delete on public.orden_compra_detalles
  for each row execute function public.fn_auditar();

alter table public.ordenes_compra enable row level security;
alter table public.orden_compra_detalles enable row level security;

insert into public.permisos (modulo, accion, descripcion) values
  ('compras', 'ver', 'Consultar órdenes de compra'),
  ('compras', 'crear', 'Crear órdenes de compra y agregar líneas'),
  ('compras', 'autorizar', 'Autorizar o cancelar una orden de compra'),
  ('compras', 'recibir', 'Registrar recepción de mercadería'),
  ('compras', 'facturar', 'Marcar una orden como facturada'),
  ('compras', 'pagar', 'Marcar una orden como pagada')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('admin', 'compras', 'ver'), ('coordinador', 'compras', 'ver'),
    ('contabilidad', 'compras', 'ver'), ('produccion', 'compras', 'ver'),
  ('admin', 'compras', 'crear'), ('coordinador', 'compras', 'crear'),
  ('admin', 'compras', 'autorizar'), ('coordinador', 'compras', 'autorizar'),
  ('admin', 'compras', 'recibir'), ('contabilidad', 'compras', 'recibir'), ('produccion', 'compras', 'recibir'),
  ('admin', 'compras', 'facturar'), ('contabilidad', 'compras', 'facturar'),
  ('admin', 'compras', 'pagar'), ('contabilidad', 'compras', 'pagar')
) as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

create policy sel_ordenes_compra on public.ordenes_compra
  for select to authenticated using (public.fn_tiene_permiso('compras', 'ver'));

create policy sel_orden_compra_detalles on public.orden_compra_detalles
  for select to authenticated using (public.fn_tiene_permiso('compras', 'ver'));

-- Sin políticas de insert/update/delete: toda escritura pasa por las
-- funciones de abajo (mismo patrón que productos/pedidos).

-- ------------------------------------------------------------
-- Funciones — una por transición, al estilo fn_avanzar_pedido.
-- ------------------------------------------------------------
create or replace function public.fn_crear_orden_compra(
  p_proveedor_id bigint,
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

  insert into public.ordenes_compra (proveedor_id, notas, creado_por)
  values (p_proveedor_id, p_notas, public.fn_usuario_id())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.fn_agregar_linea_compra(
  p_orden_compra_id bigint,
  p_producto_id bigint,
  p_descripcion text,
  p_cantidad numeric,
  p_costo_unitario numeric
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_orden public.ordenes_compra%rowtype;
  v_detalle_id bigint;
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

  insert into public.orden_compra_detalles (orden_compra_id, producto_id, descripcion, cantidad, costo_unitario, subtotal)
  values (p_orden_compra_id, p_producto_id, p_descripcion, p_cantidad, p_costo_unitario, p_cantidad * p_costo_unitario)
  returning id into v_detalle_id;

  update public.ordenes_compra oc
    set subtotal = (select coalesce(sum(subtotal), 0) from public.orden_compra_detalles where orden_compra_id = p_orden_compra_id),
        total = (select coalesce(sum(subtotal), 0) from public.orden_compra_detalles where orden_compra_id = p_orden_compra_id)
    where oc.id = p_orden_compra_id;

  return v_detalle_id;
end;
$$;

create or replace function public.fn_autorizar_orden_compra(p_orden_compra_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_orden public.ordenes_compra%rowtype;
  v_lineas int;
begin
  if not public.fn_tiene_permiso('compras', 'autorizar') then
    raise exception 'No tienes permiso para autorizar órdenes de compra';
  end if;

  select * into v_orden from public.ordenes_compra where id = p_orden_compra_id for update;
  if not found then
    raise exception 'La orden de compra no existe';
  end if;
  if v_orden.estado <> 'borrador' then
    raise exception 'Solo se autoriza una orden en borrador (actual: %)', v_orden.estado;
  end if;

  select count(*) into v_lineas from public.orden_compra_detalles where orden_compra_id = p_orden_compra_id;
  if v_lineas = 0 then
    raise exception 'La orden necesita al menos una línea antes de autorizarse';
  end if;

  update public.ordenes_compra
    set estado = 'autorizada', autorizado_por = public.fn_usuario_id(), fecha_autorizacion = now()
    where id = p_orden_compra_id;
end;
$$;

-- El paso que conecta con el motor de precios (D-01): al recibir una
-- línea ligada a una pieza, esa pieza gana costo real.
create or replace function public.fn_recibir_linea_compra(
  p_detalle_id bigint,
  p_cantidad_recibida numeric,
  p_costo_unitario_real numeric default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_detalle public.orden_compra_detalles%rowtype;
  v_orden public.ordenes_compra%rowtype;
  v_producto public.productos%rowtype;
  v_costo_real numeric;
  v_pendientes int;
begin
  if not public.fn_tiene_permiso('compras', 'recibir') then
    raise exception 'No tienes permiso para recibir mercadería';
  end if;
  if p_cantidad_recibida is null or p_cantidad_recibida <= 0 then
    raise exception 'La cantidad recibida debe ser mayor a 0';
  end if;

  select * into v_detalle from public.orden_compra_detalles where id = p_detalle_id for update;
  if not found then
    raise exception 'La línea de compra no existe';
  end if;

  select * into v_orden from public.ordenes_compra where id = v_detalle.orden_compra_id for update;
  if v_orden.estado not in ('autorizada', 'recibida_parcial') then
    raise exception 'Solo se recibe mercadería de una orden autorizada (actual: %)', v_orden.estado;
  end if;
  if v_detalle.cantidad_recibida + p_cantidad_recibida > v_detalle.cantidad then
    raise exception 'Esa cantidad excede lo pendiente de recibir en esta línea';
  end if;

  update public.orden_compra_detalles
    set cantidad_recibida = cantidad_recibida + p_cantidad_recibida
    where id = p_detalle_id;

  if v_detalle.producto_id is not null then
    v_costo_real := coalesce(p_costo_unitario_real, v_detalle.costo_unitario);

    select * into v_producto from public.productos where id = v_detalle.producto_id for update;

    update public.productos
      set costo_produccion = v_costo_real,
          origen = 'local',
          compra_detalle_id = p_detalle_id
      where id = v_detalle.producto_id;

    if v_producto.estado = 'en_produccion' then
      perform public.fn_recalcular_precio_producto(v_detalle.producto_id, 'recepcion_compra');
    end if;
  end if;

  select count(*) into v_pendientes
    from public.orden_compra_detalles
    where orden_compra_id = v_orden.id and cantidad_recibida < cantidad;

  if v_pendientes = 0 then
    update public.ordenes_compra
      set estado = 'recibida_total', fecha_recepcion_total = now()
      where id = v_orden.id;
  else
    update public.ordenes_compra set estado = 'recibida_parcial' where id = v_orden.id;
  end if;
end;
$$;

create or replace function public.fn_marcar_facturada_compra(
  p_orden_compra_id bigint,
  p_numero_factura text
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_orden public.ordenes_compra%rowtype;
begin
  if not public.fn_tiene_permiso('compras', 'facturar') then
    raise exception 'No tienes permiso para facturar órdenes de compra';
  end if;

  select * into v_orden from public.ordenes_compra where id = p_orden_compra_id for update;
  if not found then
    raise exception 'La orden de compra no existe';
  end if;
  if v_orden.estado <> 'recibida_total' then
    raise exception 'Solo se factura una orden con recepción total (actual: %)', v_orden.estado;
  end if;

  update public.ordenes_compra
    set estado = 'facturada', numero_factura_proveedor = p_numero_factura, fecha_facturacion = now()
    where id = p_orden_compra_id;
end;
$$;

create or replace function public.fn_marcar_pagada_compra(p_orden_compra_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_orden public.ordenes_compra%rowtype;
begin
  if not public.fn_tiene_permiso('compras', 'pagar') then
    raise exception 'No tienes permiso para marcar pagos de compras';
  end if;

  select * into v_orden from public.ordenes_compra where id = p_orden_compra_id for update;
  if not found then
    raise exception 'La orden de compra no existe';
  end if;
  if v_orden.estado <> 'facturada' then
    raise exception 'Solo se paga una orden facturada (actual: %)', v_orden.estado;
  end if;

  update public.ordenes_compra set estado = 'pagada', fecha_pago = now() where id = p_orden_compra_id;
end;
$$;

create or replace function public.fn_cancelar_orden_compra(
  p_orden_compra_id bigint,
  p_motivo text
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_orden public.ordenes_compra%rowtype;
begin
  if not public.fn_tiene_permiso('compras', 'autorizar') then
    raise exception 'No tienes permiso para cancelar órdenes de compra';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'La cancelación requiere un motivo';
  end if;

  select * into v_orden from public.ordenes_compra where id = p_orden_compra_id for update;
  if not found then
    raise exception 'La orden de compra no existe';
  end if;
  if v_orden.estado not in ('borrador', 'autorizada') then
    raise exception 'Solo se cancela una orden en borrador o autorizada (actual: %)', v_orden.estado;
  end if;

  update public.ordenes_compra
    set estado = 'cancelada',
        notas = coalesce(notas || ' | ', '') || 'Cancelada: ' || p_motivo
    where id = p_orden_compra_id;
end;
$$;

-- ------------------------------------------------------------
-- fn_recalcular_precio_producto — CREATE OR REPLACE, misma firma de
-- la Fase 1. Único cambio: si la pieza tiene compra_detalle_id, su
-- costo ya es real y se omite el factor teórico de origen (D-01,
-- evita duplicar el 40%/20% sobre un costo que ya lo incluye). La
-- Fase 4 (Importaciones) vuelve a extender esta misma función.
-- ------------------------------------------------------------
create or replace function public.fn_recalcular_precio_producto(
  p_producto_id bigint,
  p_motivo text default 'recalculo'
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
  v_costo_base numeric;
  v_fuente text;
  v_omitir_origen boolean;
  v_r record;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if public.fn_rol_actual() not in ('admin', 'produccion')
     and not public.fn_tiene_permiso('precios', 'recalcular') then
    raise exception 'No tienes permiso para calcular el precio de esta pieza';
  end if;

  select * into v_producto from public.productos where id = p_producto_id for update;
  if not found then
    raise exception 'La pieza no existe';
  end if;

  v_costo_base := v_producto.costo_produccion;
  if v_costo_base is null or v_costo_base <= 0 then
    raise exception 'Indica un costo de producción válido antes de calcular el precio';
  end if;

  v_fuente := case when v_producto.compra_detalle_id is not null then 'compra' else 'manual' end;
  v_omitir_origen := v_fuente <> 'manual';

  select * into v_r from public.fn_calcular_precio(
    v_costo_base, v_producto.origen, v_producto.categoria_id, v_producto.id, v_omitir_origen);

  insert into public.producto_precio_historial (
    producto_id, costo_base, origen, fuente_costo,
    costo_origen, costo_logistico, precio_sin_impuesto, base_comisionable, impuesto, precio_final,
    factor_origen_pct, factor_envio_pct, factor_empaque_pct, factor_comision_pct, factor_impuesto_pct,
    calculado_por, motivo
  ) values (
    p_producto_id, v_r.costo_base, v_producto.origen, v_fuente,
    v_r.costo_origen, v_r.costo_logistico, v_r.precio_sin_impuesto, v_r.base_comisionable,
    v_r.impuesto, v_r.precio_final,
    v_r.factor_origen_usado, v_r.factor_envio_usado, v_r.factor_empaque_usado,
    v_r.factor_comision_usado, v_r.factor_impuesto_usado,
    public.fn_usuario_id(), p_motivo
  );

  update public.productos set precio_venta = v_r.precio_final where id = p_producto_id;
end;
$$;

-- Verificación
select modulo, accion from public.permisos where modulo = 'compras' order by accion;
