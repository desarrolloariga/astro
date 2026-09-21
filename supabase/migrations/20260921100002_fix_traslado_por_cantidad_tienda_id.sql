-- ============================================================
-- ASTRO — Fix: al recibir un traslado de un artículo POR CANTIDAD, el
-- inventario_cantidad del destino sí se actualizaba, pero
-- productos.tienda_id se quedaba apuntando al origen. TODO el resto
-- del sistema (ventas, reservas de carrito, Existencias) usa
-- productos.tienda_id como "dónde vive" ese artículo — nunca reparte
-- por varias bodegas a la vez — así que la cantidad recién recibida
-- quedaba invisible/inaccesible: Existencias seguía consultando el
-- inventario en la bodega vieja, y una venta habría fallado por
-- "stock insuficiente" ahí aunque el destino sí tuviera existencia.
--
-- La corrección tiene dos partes:
--   1) fn_crear_traslado ahora EXIGE que un traslado por_cantidad
--      mueva TODO el stock disponible en el origen — no se puede
--      partir un mismo artículo entre dos bodegas (el resto del
--      sistema no está preparado para eso). Si el negocio necesita
--      soportar existencias repartidas de verdad en el futuro, es un
--      cambio más grande a ventas/catálogo, no solo a traslados.
--   2) fn_confirmar_recepcion_traslado ahora actualiza
--      productos.tienda_id al destino cuando confirma una línea por
--      cantidad — igual que ya hacía para pieza única.
-- ============================================================

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
  v_disponible int;
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

      select cantidad_disponible into v_disponible from public.inventario_cantidad
        where producto_id = v_producto_id and tienda_id = p_tienda_origen_id;
      if v_disponible is null or v_disponible <= 0 then
        raise exception 'No hay existencia de % en la bodega de origen', v_producto.codigo;
      end if;
      -- Todo el sistema (ventas, Existencias) sigue asumiendo que un
      -- artículo por cantidad vive en una sola bodega a la vez
      -- (productos.tienda_id) — un traslado parcial dejaría el
      -- remanente del origen inaccesible. Se exige mover todo.
      if v_cantidad <> v_disponible then
        raise exception 'Los artículos por cantidad se trasladan completos — hay % disponibles en el origen, no se puede mover solo una parte', v_disponible;
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

      -- Se exigió mover todo el stock del origen al crear el
      -- traslado (ver fn_crear_traslado) — el artículo pasa a "vivir"
      -- en el destino, igual que ya ocurre con pieza única.
      update public.productos set tienda_id = v_traslado.tienda_destino_id where id = v_detalle.producto_id;
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
-- Reparación de datos: si ya se confirmó un traslado por_cantidad con
-- este bug (inventario_cantidad correcto en destino, pero
-- productos.tienda_id sin actualizar), se corrige aquí una sola vez.
-- Toma la línea confirmada más reciente de cada producto con
-- cantidad, y si su bodega destino difiere de productos.tienda_id
-- actual, lo actualiza.
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select distinct on (td.producto_id)
      td.producto_id, t.tienda_destino_id
    from public.transferencia_detalles td
    join public.transferencias t on t.id = td.transferencia_id
    where td.estado_recepcion = 'confirmado' and td.cantidad is not null
    order by td.producto_id, td.fecha_confirmacion desc
  loop
    update public.productos
      set tienda_id = r.tienda_destino_id
      where id = r.producto_id and tienda_id is distinct from r.tienda_destino_id;
  end loop;
end $$;
