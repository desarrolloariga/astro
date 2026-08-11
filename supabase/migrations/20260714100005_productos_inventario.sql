-- ============================================================
-- ARIGA — Migración 0005: Productos e inventario (Módulos C y D)
-- Piezas únicas de joyería, CEDI, transferencias y trazabilidad.
-- ============================================================

-- ------------------------------------------------------------
-- Catálogos de producto
-- ------------------------------------------------------------
create table public.categorias (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  descripcion text,
  orden int not null default 0,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create table public.materiales (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  descripcion text,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

-- ------------------------------------------------------------
-- Productos (cada fila es UNA pieza física, mayormente irrepetible)
-- Ciclo de estados:
--   en_produccion → disponible_cedi → en_transito → disponible_tienda
--   → separada → vendida → (entregada | devuelta | baja)
-- ------------------------------------------------------------
create table public.productos (
  id bigint generated always as identity primary key,
  codigo text not null unique,              -- código único de la pieza (también para QR)
  nombre text not null,
  descripcion text,
  categoria_id bigint references public.categorias (id),
  material_id bigint references public.materiales (id),
  peso_gramos numeric(10,3),
  kilataje text,                            -- '14k', '18k', '925'…
  piedras text,
  costo_produccion numeric(12,2),           -- SOLO admin/contabilidad (nunca red comercial)
  precio_venta numeric(12,2),
  moneda_id bigint references public.monedas (id),
  estado text not null default 'en_produccion'
    check (estado in ('en_produccion','disponible_cedi','en_transito','disponible_tienda',
                      'separada','vendida','entregada','devuelta','baja')),
  tienda_id bigint references public.tiendas (id),   -- ubicación actual (CEDI o tienda)
  creado_por bigint references public.usuarios (id),
  fecha_publicacion timestamptz,            -- KPI producción: publicacion - creacion
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create index idx_productos_estado on public.productos (estado);
create index idx_productos_tienda on public.productos (tienda_id);
create index idx_productos_categoria on public.productos (categoria_id);

create table public.producto_imagenes (
  id bigint generated always as identity primary key,
  producto_id bigint not null references public.productos (id),
  url text not null,                        -- ruta en el bucket 'ariga-productos'
  orden int not null default 0,
  es_principal boolean not null default false,
  fecha_creacion timestamptz not null default now()
);

create index idx_producto_imagenes_producto on public.producto_imagenes (producto_id);

-- ------------------------------------------------------------
-- Transferencias entre bodegas (CEDI → tienda, tienda → tienda)
-- ------------------------------------------------------------
create table public.transferencias (
  id bigint generated always as identity primary key,
  tienda_origen_id bigint not null references public.tiendas (id),
  tienda_destino_id bigint not null references public.tiendas (id),
  estado text not null default 'en_transito'
    check (estado in ('en_transito','recibida','con_incidencia')),
  creado_por bigint references public.usuarios (id),
  fecha_envio timestamptz not null default now(),
  fecha_recepcion timestamptz,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz,
  check (tienda_origen_id <> tienda_destino_id)
);

create table public.transferencia_detalles (
  id bigint generated always as identity primary key,
  transferencia_id bigint not null references public.transferencias (id),
  producto_id bigint not null references public.productos (id),
  estado_recepcion text not null default 'pendiente'
    check (estado_recepcion in ('pendiente','confirmado','incidencia')),
  comentario_incidencia text,
  confirmado_por bigint references public.usuarios (id),
  fecha_confirmacion timestamptz
);

create index idx_transferencia_detalles_transferencia
  on public.transferencia_detalles (transferencia_id);

-- ------------------------------------------------------------
-- Bitácora inmutable de movimientos (quién, cuándo, de dónde a dónde)
-- ------------------------------------------------------------
create table public.movimientos_inventario (
  id bigint generated always as identity primary key,
  producto_id bigint not null references public.productos (id),
  tipo text not null
    check (tipo in ('alta_cedi','salida_transferencia','entrada_transferencia',
                    'separado','liberacion','venta','devolucion','ajuste','baja')),
  tienda_origen_id bigint references public.tiendas (id),
  tienda_destino_id bigint references public.tiendas (id),
  usuario_id bigint references public.usuarios (id),
  referencia text,                          -- 'transferencia:12', 'venta:45'…
  fecha_creacion timestamptz not null default now()
);

create index idx_movimientos_producto on public.movimientos_inventario (producto_id);

-- Triggers de fecha_actualizacion y auditoría
do $$
declare t text;
begin
  foreach t in array array['categorias','materiales','productos','transferencias']
  loop
    execute format(
      'create trigger trg_%s_fecha_actualizacion before update on public.%I
       for each row execute function public.fn_fecha_actualizacion()', t, t);
  end loop;
end $$;

-- Cambios de precio/costo/estado de piezas son sensibles → auditoría
create trigger trg_auditar_productos
  after insert or update or delete on public.productos
  for each row execute function public.fn_auditar();

-- ============================================================
-- Funciones de negocio (security definer; el cliente nunca
-- cambia estados de pieza con UPDATE directo)
-- ============================================================

-- ------------------------------------------------------------
-- Publicar una pieza: valida ficha completa y la ingresa al CEDI
-- ------------------------------------------------------------
create or replace function public.fn_publicar_producto(p_producto_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
  v_cedi_id bigint;
  v_imagenes int;
begin
  if public.fn_rol_actual() not in ('admin','produccion') then
    raise exception 'No tienes permiso para publicar piezas';
  end if;

  select * into v_producto from public.productos
    where id = p_producto_id for update;

  if not found then
    raise exception 'La pieza no existe';
  end if;
  if v_producto.estado <> 'en_produccion' then
    raise exception 'Solo se publican piezas en estado en_produccion (actual: %)', v_producto.estado;
  end if;

  -- Ficha técnica mínima completa
  if v_producto.nombre is null or v_producto.precio_venta is null
     or v_producto.categoria_id is null or v_producto.material_id is null then
    raise exception 'Ficha incompleta: nombre, precio, categoría y material son obligatorios';
  end if;

  select count(*) into v_imagenes
    from public.producto_imagenes where producto_id = p_producto_id;
  if v_imagenes = 0 then
    raise exception 'La pieza necesita al menos una foto para publicarse';
  end if;

  select id into v_cedi_id from public.tiendas where tipo = 'cedi' and activo limit 1;
  if v_cedi_id is null then
    raise exception 'No hay CEDI activo configurado';
  end if;

  update public.productos
    set estado = 'disponible_cedi',
        tienda_id = v_cedi_id,
        fecha_publicacion = now()
    where id = p_producto_id;

  insert into public.movimientos_inventario
    (producto_id, tipo, tienda_destino_id, usuario_id, referencia)
  values
    (p_producto_id, 'alta_cedi', v_cedi_id, public.fn_usuario_id(), 'publicacion');
end;
$$;

-- ------------------------------------------------------------
-- Crear una orden de transferencia con piezas específicas.
-- Bloquea cada pieza (FOR UPDATE): cero doble asignación.
-- ------------------------------------------------------------
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
  if public.fn_rol_actual() not in ('admin','coordinador') then
    raise exception 'Solo administración genera órdenes de transferencia';
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

-- ------------------------------------------------------------
-- Confirmar recepción pieza por pieza (o levantar incidencia)
-- ------------------------------------------------------------
create or replace function public.fn_confirmar_recepcion(
  p_detalle_id bigint,
  p_ok boolean,
  p_comentario text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_detalle public.transferencia_detalles%rowtype;
  v_transferencia public.transferencias%rowtype;
  v_pendientes int;
  v_incidencias int;
begin
  select d.* into v_detalle
    from public.transferencia_detalles d
    where d.id = p_detalle_id for update;

  if not found then
    raise exception 'Detalle de transferencia inexistente';
  end if;
  if v_detalle.estado_recepcion <> 'pendiente' then
    raise exception 'Esta pieza ya fue confirmada';
  end if;

  select t.* into v_transferencia
    from public.transferencias t where t.id = v_detalle.transferencia_id for update;

  -- Solo la tienda receptora (o admin) confirma
  if public.fn_rol_actual() <> 'admin'
     and (public.fn_rol_actual() <> 'tienda'
          or public.fn_mi_tienda_id() is distinct from v_transferencia.tienda_destino_id) then
    raise exception 'Solo la tienda receptora confirma la recepción';
  end if;

  update public.transferencia_detalles
    set estado_recepcion = case when p_ok then 'confirmado' else 'incidencia' end,
        comentario_incidencia = case when p_ok then null else p_comentario end,
        confirmado_por = public.fn_usuario_id(),
        fecha_confirmacion = now()
    where id = p_detalle_id;

  if p_ok then
    update public.productos
      set estado = 'disponible_tienda',
          tienda_id = v_transferencia.tienda_destino_id
      where id = v_detalle.producto_id;

    insert into public.movimientos_inventario
      (producto_id, tipo, tienda_origen_id, tienda_destino_id, usuario_id, referencia)
    values
      (v_detalle.producto_id, 'entrada_transferencia',
       v_transferencia.tienda_origen_id, v_transferencia.tienda_destino_id,
       public.fn_usuario_id(), 'transferencia:' || v_transferencia.id);
  end if;

  -- ¿Quedan piezas pendientes? Si no, cerrar la transferencia
  select count(*) filter (where estado_recepcion = 'pendiente'),
         count(*) filter (where estado_recepcion = 'incidencia')
    into v_pendientes, v_incidencias
    from public.transferencia_detalles
    where transferencia_id = v_transferencia.id;

  if v_pendientes = 0 then
    update public.transferencias
      set estado = case when v_incidencias > 0 then 'con_incidencia' else 'recibida' end,
          fecha_recepcion = now()
      where id = v_transferencia.id;
  end if;
end;
$$;
