-- ============================================================
-- ASTRO — Importaciones (Fase 4 de la adaptación a la especificación
-- funcional de negocio).
--
-- Extiende el patrón de Compras (Fase 3) con los estados propios de
-- un embarque internacional. La función central es
-- fn_nacionalizar_importacion: distribuye flete/seguro/aranceles/
-- aduana/transporte entre las líneas del embarque PROPORCIONAL A SU
-- VALOR FOB (D-06, nunca por peso/volumen), y ese costo nacionalizado
-- se convierte en el CostoBase real de la pieza (D-01).
--
-- fn_recalcular_precio_producto se vuelve a CREATE OR REPLACE con la
-- misma firma de la Fase 1 — único punto de contacto entre este
-- módulo y el motor de precios.
-- ============================================================

create table public.importaciones (
  id bigint generated always as identity primary key,
  proveedor_id bigint not null references public.proveedores (id),
  estado text not null default 'borrador' check (estado in
    ('borrador', 'autorizada', 'en_transito', 'recibida_parcial', 'recibida_total',
     'nacionalizada', 'facturada', 'pagada', 'cancelada')),
  moneda_origen_id bigint references public.monedas (id),
  tipo_cambio numeric(10,4) not null default 1,
  fob_total numeric(12,2) not null default 0,
  flete_internacional numeric(12,2) not null default 0,
  seguro numeric(12,2) not null default 0,
  aranceles numeric(12,2) not null default 0,
  gastos_aduana numeric(12,2) not null default 0,
  transporte_interno numeric(12,2) not null default 0,
  costo_nacionalizado_total numeric(12,2),
  notas text,
  numero_factura_proveedor text,
  creado_por bigint references public.usuarios (id),
  autorizado_por bigint references public.usuarios (id),
  fecha_autorizacion timestamptz,
  fecha_recepcion_total timestamptz,
  fecha_nacionalizacion timestamptz,
  fecha_facturacion timestamptz,
  fecha_pago timestamptz,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create table public.importacion_detalles (
  id bigint generated always as identity primary key,
  importacion_id bigint not null references public.importaciones (id),
  producto_id bigint references public.productos (id),
  descripcion text not null,
  cantidad numeric(10,3) not null check (cantidad > 0),
  valor_fob_unitario numeric(12,2) not null check (valor_fob_unitario >= 0),
  valor_fob_total numeric(12,2) not null,
  costo_nacionalizado_unitario numeric(12,2),
  cantidad_recibida numeric(10,3) not null default 0,
  fecha_creacion timestamptz not null default now()
);

create index idx_importacion_detalles_importacion on public.importacion_detalles (importacion_id);

alter table public.productos add column importacion_detalle_id bigint references public.importacion_detalles (id);

create trigger trg_importaciones_fecha_actualizacion
  before update on public.importaciones
  for each row execute function public.fn_fecha_actualizacion();

create trigger trg_auditar_importaciones
  after insert or update or delete on public.importaciones
  for each row execute function public.fn_auditar();

create trigger trg_auditar_importacion_detalles
  after insert or update or delete on public.importacion_detalles
  for each row execute function public.fn_auditar();

alter table public.importaciones enable row level security;
alter table public.importacion_detalles enable row level security;

insert into public.permisos (modulo, accion, descripcion) values
  ('importaciones', 'ver', 'Consultar importaciones'),
  ('importaciones', 'crear', 'Crear importaciones y agregar líneas'),
  ('importaciones', 'autorizar', 'Autorizar o cancelar una importación'),
  ('importaciones', 'recibir', 'Registrar recepción física del embarque'),
  ('importaciones', 'costear', 'Nacionalizar (distribuir costos) el embarque'),
  ('importaciones', 'facturar', 'Marcar una importación como facturada'),
  ('importaciones', 'pagar', 'Marcar una importación como pagada')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('admin', 'importaciones', 'ver'), ('coordinador', 'importaciones', 'ver'),
    ('contabilidad', 'importaciones', 'ver'), ('produccion', 'importaciones', 'ver'),
  ('admin', 'importaciones', 'crear'), ('coordinador', 'importaciones', 'crear'),
  ('admin', 'importaciones', 'autorizar'), ('coordinador', 'importaciones', 'autorizar'),
  ('admin', 'importaciones', 'recibir'), ('contabilidad', 'importaciones', 'recibir'), ('produccion', 'importaciones', 'recibir'),
  ('admin', 'importaciones', 'costear'), ('contabilidad', 'importaciones', 'costear'),
  ('admin', 'importaciones', 'facturar'), ('contabilidad', 'importaciones', 'facturar'),
  ('admin', 'importaciones', 'pagar'), ('contabilidad', 'importaciones', 'pagar')
) as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

create policy sel_importaciones on public.importaciones
  for select to authenticated using (public.fn_tiene_permiso('importaciones', 'ver'));

create policy sel_importacion_detalles on public.importacion_detalles
  for select to authenticated using (public.fn_tiene_permiso('importaciones', 'ver'));

-- FOB en USD por defecto — si hoy solo existe GTQ, se agrega USD para
-- que tipo_cambio tenga sentido. Sin UI de multi-moneda completa.
insert into public.monedas (codigo, nombre, simbolo)
values ('USD', 'Dólar estadounidense', '$')
on conflict (codigo) do nothing;

-- ------------------------------------------------------------
-- Funciones — mismo patrón que Compras (Fase 3), más los pasos
-- propios de un embarque internacional.
-- ------------------------------------------------------------
create or replace function public.fn_crear_importacion(
  p_proveedor_id bigint,
  p_moneda_origen_id bigint default null,
  p_tipo_cambio numeric default 1,
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

  insert into public.importaciones (proveedor_id, moneda_origen_id, tipo_cambio, notas, creado_por)
  values (p_proveedor_id, p_moneda_origen_id, coalesce(p_tipo_cambio, 1), p_notas, public.fn_usuario_id())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.fn_agregar_linea_importacion(
  p_importacion_id bigint,
  p_producto_id bigint,
  p_descripcion text,
  p_cantidad numeric,
  p_valor_fob_unitario numeric
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_imp public.importaciones%rowtype;
  v_detalle_id bigint;
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

  insert into public.importacion_detalles (importacion_id, producto_id, descripcion, cantidad, valor_fob_unitario, valor_fob_total)
  values (p_importacion_id, p_producto_id, p_descripcion, p_cantidad, p_valor_fob_unitario, p_cantidad * p_valor_fob_unitario)
  returning id into v_detalle_id;

  update public.importaciones
    set fob_total = (select coalesce(sum(valor_fob_total), 0) from public.importacion_detalles where importacion_id = p_importacion_id)
    where id = p_importacion_id;

  return v_detalle_id;
end;
$$;

create or replace function public.fn_autorizar_importacion(p_importacion_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_imp public.importaciones%rowtype;
  v_lineas int;
begin
  if not public.fn_tiene_permiso('importaciones', 'autorizar') then
    raise exception 'No tienes permiso para autorizar importaciones';
  end if;

  select * into v_imp from public.importaciones where id = p_importacion_id for update;
  if not found then
    raise exception 'La importación no existe';
  end if;
  if v_imp.estado <> 'borrador' then
    raise exception 'Solo se autoriza una importación en borrador (actual: %)', v_imp.estado;
  end if;

  select count(*) into v_lineas from public.importacion_detalles where importacion_id = p_importacion_id;
  if v_lineas = 0 then
    raise exception 'La importación necesita al menos una línea antes de autorizarse';
  end if;

  update public.importaciones
    set estado = 'autorizada', autorizado_por = public.fn_usuario_id(), fecha_autorizacion = now()
    where id = p_importacion_id;
end;
$$;

create or replace function public.fn_marcar_en_transito_importacion(p_importacion_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_imp public.importaciones%rowtype;
begin
  if not public.fn_tiene_permiso('importaciones', 'autorizar') then
    raise exception 'No tienes permiso para avanzar esta importación';
  end if;

  select * into v_imp from public.importaciones where id = p_importacion_id for update;
  if not found then
    raise exception 'La importación no existe';
  end if;
  if v_imp.estado <> 'autorizada' then
    raise exception 'Solo pasa a tránsito una importación autorizada (actual: %)', v_imp.estado;
  end if;

  update public.importaciones set estado = 'en_transito' where id = p_importacion_id;
end;
$$;

-- Recepción física del embarque — NO toca costo_produccion todavía;
-- eso ocurre recién en fn_nacionalizar_importacion.
create or replace function public.fn_recibir_linea_importacion(
  p_detalle_id bigint,
  p_cantidad_recibida numeric
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_detalle public.importacion_detalles%rowtype;
  v_imp public.importaciones%rowtype;
  v_pendientes int;
begin
  if not public.fn_tiene_permiso('importaciones', 'recibir') then
    raise exception 'No tienes permiso para recibir importaciones';
  end if;
  if p_cantidad_recibida is null or p_cantidad_recibida <= 0 then
    raise exception 'La cantidad recibida debe ser mayor a 0';
  end if;

  select * into v_detalle from public.importacion_detalles where id = p_detalle_id for update;
  if not found then
    raise exception 'La línea de importación no existe';
  end if;

  select * into v_imp from public.importaciones where id = v_detalle.importacion_id for update;
  if v_imp.estado not in ('autorizada', 'en_transito', 'recibida_parcial') then
    raise exception 'Solo se recibe un embarque autorizado o en tránsito (actual: %)', v_imp.estado;
  end if;
  if v_detalle.cantidad_recibida + p_cantidad_recibida > v_detalle.cantidad then
    raise exception 'Esa cantidad excede lo pendiente de recibir en esta línea';
  end if;

  update public.importacion_detalles
    set cantidad_recibida = cantidad_recibida + p_cantidad_recibida
    where id = p_detalle_id;

  select count(*) into v_pendientes
    from public.importacion_detalles
    where importacion_id = v_imp.id and cantidad_recibida < cantidad;

  if v_pendientes = 0 then
    update public.importaciones
      set estado = 'recibida_total', fecha_recepcion_total = now()
      where id = v_imp.id;
  else
    update public.importaciones set estado = 'recibida_parcial' where id = v_imp.id;
  end if;
end;
$$;

-- D-06: distribución proporcional al valor FOB de cada línea, nunca
-- por peso/volumen. Esto es lo que alimenta D-01 con costo real.
create or replace function public.fn_nacionalizar_importacion(
  p_importacion_id bigint,
  p_flete_internacional numeric,
  p_seguro numeric,
  p_aranceles numeric,
  p_gastos_aduana numeric,
  p_transporte_interno numeric
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_imp public.importaciones%rowtype;
  v_total_adicionales numeric;
  v_linea record;
  v_costo_linea numeric;
  v_producto public.productos%rowtype;
begin
  if not public.fn_tiene_permiso('importaciones', 'costear') then
    raise exception 'No tienes permiso para nacionalizar importaciones';
  end if;

  select * into v_imp from public.importaciones where id = p_importacion_id for update;
  if not found then
    raise exception 'La importación no existe';
  end if;
  if v_imp.estado <> 'recibida_total' then
    raise exception 'Solo se nacionaliza una importación con recepción total (actual: %)', v_imp.estado;
  end if;
  if v_imp.fob_total <= 0 then
    raise exception 'La importación no tiene valor FOB registrado';
  end if;

  v_total_adicionales := coalesce(p_flete_internacional, 0) + coalesce(p_seguro, 0)
    + coalesce(p_aranceles, 0) + coalesce(p_gastos_aduana, 0) + coalesce(p_transporte_interno, 0);

  for v_linea in select * from public.importacion_detalles where importacion_id = p_importacion_id loop
    v_costo_linea := v_linea.valor_fob_total
      + (v_linea.valor_fob_total / v_imp.fob_total) * v_total_adicionales;

    update public.importacion_detalles
      set costo_nacionalizado_unitario = round((v_costo_linea / v_linea.cantidad) * v_imp.tipo_cambio, 2)
      where id = v_linea.id;

    if v_linea.producto_id is not null then
      select * into v_producto from public.productos where id = v_linea.producto_id for update;

      update public.productos
        set costo_produccion = round((v_costo_linea / v_linea.cantidad) * v_imp.tipo_cambio, 2),
            origen = 'importado',
            importacion_detalle_id = v_linea.id
        where id = v_linea.producto_id;

      if v_producto.estado = 'en_produccion' then
        perform public.fn_recalcular_precio_producto(v_linea.producto_id, 'nacionalizacion');
      end if;
    end if;
  end loop;

  update public.importaciones
    set flete_internacional = coalesce(p_flete_internacional, 0),
        seguro = coalesce(p_seguro, 0),
        aranceles = coalesce(p_aranceles, 0),
        gastos_aduana = coalesce(p_gastos_aduana, 0),
        transporte_interno = coalesce(p_transporte_interno, 0),
        costo_nacionalizado_total = round((v_imp.fob_total + v_total_adicionales) * v_imp.tipo_cambio, 2),
        estado = 'nacionalizada',
        fecha_nacionalizacion = now()
    where id = p_importacion_id;
end;
$$;

create or replace function public.fn_marcar_facturada_importacion(
  p_importacion_id bigint,
  p_numero_factura text
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_imp public.importaciones%rowtype;
begin
  if not public.fn_tiene_permiso('importaciones', 'facturar') then
    raise exception 'No tienes permiso para facturar importaciones';
  end if;

  select * into v_imp from public.importaciones where id = p_importacion_id for update;
  if not found then
    raise exception 'La importación no existe';
  end if;
  if v_imp.estado <> 'nacionalizada' then
    raise exception 'Solo se factura una importación ya nacionalizada (actual: %)', v_imp.estado;
  end if;

  update public.importaciones
    set estado = 'facturada', numero_factura_proveedor = p_numero_factura, fecha_facturacion = now()
    where id = p_importacion_id;
end;
$$;

create or replace function public.fn_marcar_pagada_importacion(p_importacion_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_imp public.importaciones%rowtype;
begin
  if not public.fn_tiene_permiso('importaciones', 'pagar') then
    raise exception 'No tienes permiso para marcar pagos de importaciones';
  end if;

  select * into v_imp from public.importaciones where id = p_importacion_id for update;
  if not found then
    raise exception 'La importación no existe';
  end if;
  if v_imp.estado <> 'facturada' then
    raise exception 'Solo se paga una importación facturada (actual: %)', v_imp.estado;
  end if;

  update public.importaciones set estado = 'pagada', fecha_pago = now() where id = p_importacion_id;
end;
$$;

create or replace function public.fn_cancelar_importacion(
  p_importacion_id bigint,
  p_motivo text
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_imp public.importaciones%rowtype;
begin
  if not public.fn_tiene_permiso('importaciones', 'autorizar') then
    raise exception 'No tienes permiso para cancelar importaciones';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'La cancelación requiere un motivo';
  end if;

  select * into v_imp from public.importaciones where id = p_importacion_id for update;
  if not found then
    raise exception 'La importación no existe';
  end if;
  if v_imp.estado not in ('borrador', 'autorizada') then
    raise exception 'Solo se cancela una importación en borrador o autorizada (actual: %)', v_imp.estado;
  end if;

  update public.importaciones
    set estado = 'cancelada',
        notas = coalesce(notas || ' | ', '') || 'Cancelada: ' || p_motivo
    where id = p_importacion_id;
end;
$$;

-- ------------------------------------------------------------
-- fn_recalcular_precio_producto — CREATE OR REPLACE, misma firma de
-- la Fase 1. Único cambio: deriva fuente_costo/omitir_factor_origen
-- de compra_detalle_id / importacion_detalle_id.
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

  v_fuente := case
    when v_producto.importacion_detalle_id is not null then 'importacion'
    when v_producto.compra_detalle_id is not null then 'compra'
    else 'manual'
  end;
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
select modulo, accion from public.permisos where modulo = 'importaciones' order by accion;
