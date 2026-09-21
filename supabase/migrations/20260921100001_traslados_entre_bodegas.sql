-- ============================================================
-- ASTRO — Traslados entre bodegas (múltiples CEDI).
--
-- La consolidación de agosto (20260819100001) retiró las funciones de
-- transferencia porque "las tiendas ya nunca reciben inventario
-- físico" — eso sigue vigente sin cambios. Lo que se reactiva aquí es
-- distinto y más angosto: mover inventario entre VARIAS BODEGAS
-- (tiendas.tipo='cedi'), nunca hacia una tienda de venta. Las tablas
-- transferencias/transferencia_detalles nunca se borraron —
-- quedaron como registro histórico— y se reutilizan tal cual, solo
-- se les agrega soporte para líneas por cantidad (antes solo movían
-- productos.tienda_id de piezas únicas, una fila completa a la vez).
--
-- Cubre ambos tipos de inventario en un solo traslado:
--   - pieza_unica: mueve la fila completa (productos.tienda_id),
--     pasa por el estado 'en_transito' mientras se confirma.
--   - por_cantidad: descuenta cantidad de inventario_cantidad en el
--     origen al crear el traslado, y la sirve en el destino al
--     confirmar recepción — no hay estado "en tránsito" para
--     cantidades (viven en la tabla, no en una fila que se mueve).
-- ============================================================

-- ------------------------------------------------------------
-- 1. transferencia_detalles gana "cantidad" — null significa pieza
-- única (mueve toda la fila), un número significa cuántas unidades
-- por_cantidad se están moviendo en esa línea.
-- ------------------------------------------------------------
alter table public.transferencia_detalles
  add column cantidad int check (cantidad is null or cantidad > 0);

comment on column public.transferencia_detalles.cantidad is
  'NULL = línea de pieza única (mueve toda la fila del producto). Con valor = línea por_cantidad, cuántas unidades se trasladan.';

-- ------------------------------------------------------------
-- 2. Se re-agrega el permiso inventario.transferir (se había
-- retirado por completo en 20260819100001) — admin/coordinador/
-- producción, el mismo círculo que ya gestiona logística.
-- ------------------------------------------------------------
insert into public.permisos (modulo, accion, descripcion) values
  ('inventario', 'transferir', 'Crear y recibir traslados de inventario entre bodegas')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('admin', 'inventario', 'transferir'),
  ('coordinador', 'inventario', 'transferir'),
  ('produccion', 'inventario', 'transferir')
) as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

-- ------------------------------------------------------------
-- 3. fn_crear_traslado — crea el encabezado y cada línea. Origen y
-- destino deben ser bodegas (tipo='cedi') activas y distintas —
-- nunca una tienda. p_lineas es un jsonb array de
-- {"producto_id": bigint, "cantidad": int|null} — cantidad null (o
-- ausente) para una línea de pieza única.
-- ------------------------------------------------------------
create or replace function public.fn_crear_traslado(
  p_tienda_origen_id bigint,
  p_tienda_destino_id bigint,
  p_lineas jsonb
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_origen public.tiendas%rowtype;
  v_destino public.tiendas%rowtype;
  v_traslado_id bigint;
  v_linea jsonb;
  v_producto public.productos%rowtype;
  v_producto_id bigint;
  v_cantidad int;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if not public.fn_tiene_permiso('inventario', 'transferir') then
    raise exception 'No tienes permiso para trasladar inventario';
  end if;
  if p_tienda_origen_id = p_tienda_destino_id then
    raise exception 'La bodega de origen y destino no pueden ser la misma';
  end if;

  select * into v_origen from public.tiendas where id = p_tienda_origen_id and activo;
  if not found or v_origen.tipo <> 'cedi' then
    raise exception 'La bodega de origen debe ser un CEDI/bodega activo';
  end if;
  select * into v_destino from public.tiendas where id = p_tienda_destino_id and activo;
  if not found or v_destino.tipo <> 'cedi' then
    raise exception 'La bodega de destino debe ser un CEDI/bodega activo';
  end if;

  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El traslado necesita al menos una línea';
  end if;

  insert into public.transferencias (tienda_origen_id, tienda_destino_id, creado_por)
  values (p_tienda_origen_id, p_tienda_destino_id, public.fn_usuario_id())
  returning id into v_traslado_id;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_producto_id := (v_linea->>'producto_id')::bigint;
    v_cantidad := nullif(v_linea->>'cantidad', '')::int;

    select * into v_producto from public.productos where id = v_producto_id for update;
    if not found then
      raise exception 'El producto % no existe', v_producto_id;
    end if;

    if v_producto.modo_inventario = 'pieza_unica' then
      if v_producto.tienda_id is distinct from p_tienda_origen_id then
        raise exception 'La pieza % no está en la bodega de origen', v_producto.codigo;
      end if;
      if v_producto.estado <> 'disponible_cedi' then
        raise exception 'La pieza % no está disponible para trasladar (estado: %)', v_producto.codigo, v_producto.estado;
      end if;

      update public.productos set estado = 'en_transito' where id = v_producto_id;

      insert into public.transferencia_detalles (transferencia_id, producto_id, cantidad)
      values (v_traslado_id, v_producto_id, null);

      insert into public.movimientos_inventario
        (producto_id, tipo, tienda_origen_id, tienda_destino_id, usuario_id, referencia)
      values
        (v_producto_id, 'salida_transferencia', p_tienda_origen_id, p_tienda_destino_id,
         public.fn_usuario_id(), 'traslado:' || v_traslado_id);
    else
      if v_cantidad is null or v_cantidad <= 0 then
        raise exception 'Indica una cantidad válida para %', v_producto.codigo;
      end if;

      update public.inventario_cantidad
        set cantidad_disponible = cantidad_disponible - v_cantidad
        where producto_id = v_producto_id and tienda_id = p_tienda_origen_id
          and cantidad_disponible >= v_cantidad;
      if not found then
        raise exception 'Stock insuficiente de % en la bodega de origen', v_producto.codigo;
      end if;

      insert into public.transferencia_detalles (transferencia_id, producto_id, cantidad)
      values (v_traslado_id, v_producto_id, v_cantidad);

      insert into public.movimientos_inventario
        (producto_id, tipo, tienda_origen_id, tienda_destino_id, usuario_id, referencia, cantidad)
      values
        (v_producto_id, 'salida_transferencia', p_tienda_origen_id, p_tienda_destino_id,
         public.fn_usuario_id(), 'traslado:' || v_traslado_id, v_cantidad);
    end if;
  end loop;

  return v_traslado_id;
end;
$$;

-- ------------------------------------------------------------
-- 4. fn_confirmar_recepcion_traslado — confirma o marca incidencia
-- en una línea. Al confirmar todas las líneas del traslado, cierra el
-- encabezado como 'recibida' (o 'con_incidencia' si alguna falló).
-- ------------------------------------------------------------
create or replace function public.fn_confirmar_recepcion_traslado(
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
  v_traslado public.transferencias%rowtype;
  v_producto public.productos%rowtype;
  v_pendientes int;
  v_incidencias int;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if not public.fn_tiene_permiso('inventario', 'transferir') then
    raise exception 'No tienes permiso para recibir traslados';
  end if;

  select * into v_detalle from public.transferencia_detalles where id = p_detalle_id for update;
  if not found then
    raise exception 'La línea de traslado no existe';
  end if;
  if v_detalle.estado_recepcion <> 'pendiente' then
    raise exception 'Esta línea ya fue resuelta';
  end if;

  select * into v_traslado from public.transferencias where id = v_detalle.transferencia_id for update;
  select * into v_producto from public.productos where id = v_detalle.producto_id for update;

  if p_ok then
    if v_detalle.cantidad is null then
      update public.productos
        set estado = 'disponible_cedi', tienda_id = v_traslado.tienda_destino_id
        where id = v_detalle.producto_id;
    else
      insert into public.inventario_cantidad (producto_id, tienda_id, cantidad_disponible)
      values (v_detalle.producto_id, v_traslado.tienda_destino_id, v_detalle.cantidad)
      on conflict (producto_id, tienda_id)
        do update set cantidad_disponible = public.inventario_cantidad.cantidad_disponible + excluded.cantidad_disponible;
    end if;

    insert into public.movimientos_inventario
      (producto_id, tipo, tienda_origen_id, tienda_destino_id, usuario_id, referencia, cantidad)
    values
      (v_detalle.producto_id, 'entrada_transferencia', v_traslado.tienda_origen_id, v_traslado.tienda_destino_id,
       public.fn_usuario_id(), 'traslado:' || v_traslado.id, v_detalle.cantidad);

    update public.transferencia_detalles
      set estado_recepcion = 'confirmado', confirmado_por = public.fn_usuario_id(), fecha_confirmacion = now()
      where id = p_detalle_id;
  else
    -- Incidencia: se devuelve la disponibilidad al origen — pieza
    -- única vuelve a estar disponible ahí, cantidad se reintegra.
    if v_detalle.cantidad is null then
      update public.productos set estado = 'disponible_cedi' where id = v_detalle.producto_id;
    else
      update public.inventario_cantidad
        set cantidad_disponible = cantidad_disponible + v_detalle.cantidad
        where producto_id = v_detalle.producto_id and tienda_id = v_traslado.tienda_origen_id;
    end if;

    update public.transferencia_detalles
      set estado_recepcion = 'incidencia', comentario_incidencia = p_comentario,
          confirmado_por = public.fn_usuario_id(), fecha_confirmacion = now()
      where id = p_detalle_id;
  end if;

  select count(*) filter (where estado_recepcion = 'pendiente'),
         count(*) filter (where estado_recepcion = 'incidencia')
    into v_pendientes, v_incidencias
    from public.transferencia_detalles
    where transferencia_id = v_traslado.id;

  if v_pendientes = 0 then
    update public.transferencias
      set estado = case when v_incidencias > 0 then 'con_incidencia' else 'recibida' end,
          fecha_recepcion = now()
      where id = v_traslado.id;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 5. fn_publicar_producto — misma firma; si no se indica bodega
-- destino Y hay más de un CEDI activo, exige elegir en vez de caer
-- siempre en "el primero" en silencio.
-- ------------------------------------------------------------
create or replace function public.fn_publicar_producto(
  p_producto_id bigint,
  p_tienda_destino_id bigint default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
  v_cedi_id bigint;
  v_imagenes int;
  v_total_cedis int;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if public.fn_rol_actual() not in ('admin', 'produccion') then
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

  if v_producto.nombre is null or v_producto.costo_produccion is null then
    raise exception 'Ficha incompleta: nombre y costo son obligatorios';
  end if;

  if v_producto.modo_inventario = 'por_cantidad'
     and (v_producto.cantidad_inicial is null or v_producto.cantidad_inicial <= 0) then
    raise exception 'Indica la cantidad inicial antes de publicar esta referencia';
  end if;

  select count(*) into v_imagenes
    from public.producto_imagenes where producto_id = p_producto_id;
  if v_imagenes = 0 then
    raise exception 'La pieza necesita al menos una foto para publicarse';
  end if;

  if p_tienda_destino_id is not null then
    select id into v_cedi_id from public.tiendas
      where id = p_tienda_destino_id and tipo = 'cedi' and activo;
    if v_cedi_id is null then
      raise exception 'La bodega destino indicada no es un CEDI activo';
    end if;
  else
    select count(*) into v_total_cedis from public.tiendas where tipo = 'cedi' and activo;
    if v_total_cedis > 1 then
      raise exception 'Hay más de una bodega activa — indica a cuál publicar';
    end if;
    select id into v_cedi_id from public.tiendas where tipo = 'cedi' and activo limit 1;
  end if;
  if v_cedi_id is null then
    raise exception 'No hay CEDI activo configurado';
  end if;

  -- Snapshot final de precio antes de publicar (RN-05).
  perform public.fn_recalcular_precio_producto(p_producto_id, 'publicacion');

  update public.productos
    set estado = 'disponible_cedi',
        tienda_id = v_cedi_id,
        fecha_publicacion = now()
    where id = p_producto_id;

  if v_producto.modo_inventario = 'por_cantidad' then
    insert into public.inventario_cantidad (producto_id, tienda_id, cantidad_disponible)
    values (p_producto_id, v_cedi_id, v_producto.cantidad_inicial);

    insert into public.movimientos_inventario
      (producto_id, tipo, tienda_destino_id, usuario_id, referencia, cantidad)
    values
      (p_producto_id, 'alta_cedi', v_cedi_id, public.fn_usuario_id(), 'publicacion', v_producto.cantidad_inicial);
  else
    insert into public.movimientos_inventario
      (producto_id, tipo, tienda_destino_id, usuario_id, referencia)
    values
      (p_producto_id, 'alta_cedi', v_cedi_id, public.fn_usuario_id(), 'publicacion');
  end if;
end;
$$;
