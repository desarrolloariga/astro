-- ============================================================
-- ASTRO — Parámetros de artículos: descuento automático por días sin
-- venta (configurable artículo por artículo) + edición de punto de
-- reorden desde una pantalla dedicada.
--
-- Antes de esto, "sin movimiento" (vw_piezas_lentas / dias_pieza_lenta
-- global) usaba coalesce(fecha_actualizacion, fecha_creacion) como
-- proxy — cualquier edición de la ficha reiniciaba el conteo, no solo
-- una venta. Para una regla que dispara un descuento real, eso no es
-- suficientemente preciso: se agrega fecha_ultima_venta, que SOLO se
-- toca al vender (fn_registrar_venta y fn_confirmar_carrito).
-- ============================================================

alter table public.productos
  add column fecha_ultima_venta timestamptz,
  add column dias_sin_venta_descuento int check (dias_sin_venta_descuento is null or dias_sin_venta_descuento > 0),
  add column descuento_automatico_pct numeric(5,2)
    check (descuento_automatico_pct is null or (descuento_automatico_pct > 0 and descuento_automatico_pct < 100));

comment on column public.productos.fecha_ultima_venta is
  'Se actualiza solo al vender (fn_registrar_venta / fn_confirmar_carrito) — no con cualquier edición de la ficha, a diferencia de fecha_actualizacion.';
comment on column public.productos.dias_sin_venta_descuento is
  'Regla por artículo: días sin venta antes de aplicar descuento_automatico_pct automáticamente. NULL = sin regla configurada.';
comment on column public.productos.descuento_automatico_pct is
  '% de descuento que fn_aplicar_descuentos_automaticos aplica cuando se cumple dias_sin_venta_descuento.';

-- ------------------------------------------------------------
-- fn_registrar_venta — misma firma; gana fecha_ultima_venta = now()
-- en cada pieza vendida.
-- ------------------------------------------------------------
create or replace function public.fn_registrar_venta(
  p_producto_ids bigint[],
  p_cliente_nombre text,
  p_cliente_telefono text,
  p_metodo_pago text,
  p_monto numeric,
  p_referencia text default null,
  p_separado_id bigint default null,
  p_descuento_embajador_pct numeric default null,
  p_cantidad int default 1
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
  v_separado public.separados%rowtype;
  v_cliente_id bigint;
  v_venta_id bigint;
  v_pedido_id bigint;
  v_subtotal numeric := 0;
  v_descuento_pct numeric;
  v_descuento_monto numeric;
  v_descuento_embajador_monto numeric := 0;
  v_canal text;
  v_tienda_id bigint;
  v_id bigint;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if not public.fn_tiene_permiso('ventas','crear') then
    raise exception 'No tienes permiso para registrar ventas';
  end if;
  if p_producto_ids is null or array_length(p_producto_ids, 1) is null then
    raise exception 'La venta necesita al menos una pieza';
  end if;
  if p_metodo_pago not in ('tarjeta','transferencia','deposito','pasarela') then
    raise exception 'Método de pago inválido';
  end if;
  if p_cantidad is null or p_cantidad < 1 then
    raise exception 'La cantidad debe ser al menos 1';
  end if;
  if p_cantidad <> 1 and array_length(p_producto_ids, 1) <> 1 then
    raise exception 'La cantidad solo aplica al vender una sola referencia a la vez';
  end if;

  if p_separado_id is not null then
    select * into v_separado from public.separados where id = p_separado_id for update;
    if not found or v_separado.estado <> 'activo' then
      raise exception 'El separado indicado no está activo';
    end if;
    if v_separado.vendedor_id <> public.fn_usuario_id() and public.fn_rol_actual() <> 'admin' then
      raise exception 'Solo el vendedor que separó la pieza puede concretar la venta';
    end if;
    if array_length(p_producto_ids, 1) <> 1 or p_producto_ids[1] <> v_separado.producto_id then
      raise exception 'La venta desde un separado debe incluir únicamente esa pieza';
    end if;
  end if;

  v_canal := case public.fn_rol_actual()
    when 'tienda' then 'tienda'
    when 'asesor' then 'asesor'
    when 'embajador' then 'embajador'
    else 'asesor'
  end;

  foreach v_id in array p_producto_ids loop
    select * into v_producto from public.productos where id = v_id for update;

    if not found then
      raise exception 'La pieza % no existe', v_id;
    end if;

    if v_producto.modo_inventario = 'pieza_unica' then
      if p_cantidad <> 1 then
        raise exception 'La pieza % es única — no admite cantidad', v_producto.codigo;
      end if;
      if p_separado_id is not null then
        if v_producto.estado <> 'separada' then
          raise exception 'La pieza % ya no está separada', v_producto.codigo;
        end if;
      elsif v_producto.estado not in ('disponible_cedi','disponible_tienda') then
        raise exception 'La pieza % no está disponible para vender (estado: %)',
          v_producto.codigo, v_producto.estado;
      end if;

      v_subtotal := v_subtotal + coalesce(v_producto.precio_descuento, v_producto.precio_venta, 0);
    else
      if p_separado_id is not null then
        raise exception 'No se puede apartar una referencia con inventario por cantidad';
      end if;
      if v_producto.estado not in ('disponible_cedi','disponible_tienda') then
        raise exception 'La referencia % no está disponible para vender (estado: %)',
          v_producto.codigo, v_producto.estado;
      end if;

      update public.inventario_cantidad
        set cantidad_disponible = cantidad_disponible - p_cantidad
        where producto_id = v_id and tienda_id = v_producto.tienda_id
          and cantidad_disponible >= p_cantidad;
      if not found then
        raise exception 'Stock insuficiente para %', v_producto.codigo;
      end if;

      v_subtotal := v_subtotal + coalesce(v_producto.precio_descuento, v_producto.precio_venta, 0) * p_cantidad;
    end if;

    v_tienda_id := coalesce(v_tienda_id, v_producto.tienda_id);
  end loop;

  v_cliente_id := public.fn_obtener_o_crear_cliente(p_cliente_nombre, p_cliente_telefono);

  v_descuento_pct := public.fn_descuento_desempeno(public.fn_usuario_id());
  v_descuento_monto := round(v_subtotal * v_descuento_pct / 100, 2);

  if p_descuento_embajador_pct is not null and p_descuento_embajador_pct <> 0 then
    if not public.fn_tiene_permiso('ventas','descuento_embajador') then
      raise exception 'No tienes permiso para aplicar un descuento personal';
    end if;
    if p_descuento_embajador_pct < 0 or p_descuento_embajador_pct > 100 then
      raise exception 'El descuento personal debe estar entre 0 y 100';
    end if;
    v_descuento_embajador_monto := round(v_subtotal * p_descuento_embajador_pct / 100, 2);
  end if;

  insert into public.ventas
    (vendedor_id, tienda_id, cliente_id, canal, subtotal, descuento_desempeno, descuento_embajador, total, moneda_id, separado_id)
  values
    (public.fn_usuario_id(), v_tienda_id, v_cliente_id, v_canal, v_subtotal, v_descuento_monto, v_descuento_embajador_monto,
     v_subtotal - v_descuento_monto,
     (select id from public.monedas where codigo = 'GTQ'), p_separado_id)
  returning id into v_venta_id;

  foreach v_id in array p_producto_ids loop
    select * into v_producto from public.productos where id = v_id;

    if v_producto.modo_inventario = 'pieza_unica' then
      insert into public.venta_detalles (venta_id, producto_id, precio, cantidad)
      values (v_venta_id, v_id, coalesce(v_producto.precio_descuento, v_producto.precio_venta, 0), 1);

      update public.productos set estado = 'vendida', fecha_ultima_venta = now() where id = v_id;

      insert into public.movimientos_inventario (producto_id, tipo, usuario_id, referencia, cantidad)
      values (v_id, 'venta', public.fn_usuario_id(), 'venta:' || v_venta_id, 1);
    else
      insert into public.venta_detalles (venta_id, producto_id, precio, cantidad)
      values (v_venta_id, v_id, coalesce(v_producto.precio_descuento, v_producto.precio_venta, 0), p_cantidad);

      update public.productos set fecha_ultima_venta = now() where id = v_id;

      insert into public.movimientos_inventario (producto_id, tipo, usuario_id, referencia, cantidad)
      values (v_id, 'venta', public.fn_usuario_id(), 'venta:' || v_venta_id, p_cantidad);
    end if;
  end loop;

  if p_separado_id is not null then
    update public.separados set estado = 'convertido' where id = p_separado_id;
  end if;

  insert into public.pagos (venta_id, metodo, monto, referencia)
  values (v_venta_id, p_metodo_pago, p_monto, p_referencia);

  insert into public.pedidos (venta_id)
  values (v_venta_id)
  returning id into v_pedido_id;

  perform public.fn_calcular_puntos(v_venta_id);
  perform public.fn_calcular_comisiones(v_venta_id);

  return v_venta_id;
end;
$$;

-- ------------------------------------------------------------
-- fn_confirmar_carrito — misma firma; gana fecha_ultima_venta = now()
-- (venta por enlace es venta igual).
-- ------------------------------------------------------------
create or replace function public.fn_confirmar_carrito(
  p_carrito_token text,
  p_nombre text,
  p_telefono text,
  p_correo text,
  p_direccion text,
  p_metodo_pago text,
  p_referencia text default null
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_carrito public.carritos%rowtype;
  v_link public.links_venta%rowtype;
  v_detalle record;
  v_producto public.productos%rowtype;
  v_reservada int;
  v_cliente_id bigint;
  v_venta_id bigint;
  v_subtotal numeric := 0;
  v_descuento_pct numeric;
  v_descuento_monto numeric;
  v_items int := 0;
begin
  if p_metodo_pago not in ('transferencia','deposito') then
    raise exception 'Para compras por enlace el pago es por transferencia o depósito';
  end if;
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre es obligatorio';
  end if;

  select * into v_carrito from public.carritos where token = p_carrito_token and estado = 'abierto' for update;
  if not found then
    raise exception 'Carrito no encontrado o ya confirmado';
  end if;

  select * into v_link from public.links_venta where id = v_carrito.link_id;

  for v_detalle in
    select * from public.carrito_detalles where carrito_id = v_carrito.id order by id
  loop
    select * into v_producto from public.productos where id = v_detalle.producto_id for update;

    if v_producto.modo_inventario = 'pieza_unica' then
      if v_producto.estado <> 'retenida' or v_detalle.fecha_expiracion < now() then
        raise exception 'La pieza % ya no está disponible; se venció el tiempo de retención', v_producto.codigo;
      end if;
    else
      select cantidad_reservada into v_reservada from public.inventario_cantidad
        where producto_id = v_detalle.producto_id and tienda_id = v_producto.tienda_id for update;
      if coalesce(v_reservada, 0) < v_detalle.cantidad or v_detalle.fecha_expiracion < now() then
        raise exception 'La pieza % ya no está disponible; se venció el tiempo de retención', v_producto.codigo;
      end if;
    end if;

    v_subtotal := v_subtotal + coalesce(v_producto.precio_descuento, v_producto.precio_venta, 0) * v_detalle.cantidad;
    v_items := v_items + 1;
  end loop;

  if v_items = 0 then
    raise exception 'El carrito está vacío';
  end if;

  v_cliente_id := public.fn_obtener_o_crear_cliente_vendedor(v_link.vendedor_id, p_nombre, p_telefono, p_correo);

  v_descuento_pct := public.fn_descuento_desempeno(v_link.vendedor_id);
  v_descuento_monto := round(v_subtotal * v_descuento_pct / 100, 2);

  insert into public.ventas (vendedor_id, cliente_id, canal, link_id, subtotal, descuento_desempeno, total, moneda_id)
  values (v_link.vendedor_id, v_cliente_id, 'link', v_link.id, v_subtotal, v_descuento_monto,
          v_subtotal - v_descuento_monto, (select id from public.monedas where codigo = 'GTQ'))
  returning id into v_venta_id;

  for v_detalle in
    select * from public.carrito_detalles where carrito_id = v_carrito.id order by id
  loop
    select * into v_producto from public.productos where id = v_detalle.producto_id;

    insert into public.venta_detalles (venta_id, producto_id, precio, cantidad)
    values (v_venta_id, v_detalle.producto_id, coalesce(v_producto.precio_descuento, v_producto.precio_venta, 0), v_detalle.cantidad);

    if v_producto.modo_inventario = 'pieza_unica' then
      update public.productos set estado = 'vendida', fecha_ultima_venta = now() where id = v_detalle.producto_id;
    else
      update public.inventario_cantidad
        set cantidad_reservada = cantidad_reservada - v_detalle.cantidad
        where producto_id = v_detalle.producto_id and tienda_id = v_producto.tienda_id;

      update public.productos set fecha_ultima_venta = now() where id = v_detalle.producto_id;
    end if;

    insert into public.movimientos_inventario (producto_id, tipo, referencia, cantidad)
    values (v_detalle.producto_id, 'venta', 'venta:' || v_venta_id, v_detalle.cantidad);
  end loop;

  insert into public.pagos (venta_id, metodo, monto, referencia)
  values (v_venta_id, p_metodo_pago, v_subtotal, p_referencia);

  insert into public.pedidos (venta_id, direccion_entrega)
  values (v_venta_id, p_direccion);

  update public.carritos
    set estado = 'confirmado', nombre_cliente = p_nombre, telefono = p_telefono,
        correo = p_correo, direccion = p_direccion
    where id = v_carrito.id;

  perform public.fn_calcular_puntos(v_venta_id);
  perform public.fn_calcular_comisiones(v_venta_id);

  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
  values (v_link.vendedor_id, 'venta_confirmada', 'Venta por enlace confirmada',
          'Se registró una venta por tu enlace. Sube o espera el comprobante para aprobarla.',
          '/ventas');

  return v_venta_id;
end;
$$;

-- ------------------------------------------------------------
-- fn_actualizar_parametros_articulo — edición desde "Parámetros de
-- artículos": punto de reorden + regla de descuento automático.
-- Security definer porque produccion no tiene UPDATE directo sobre
-- productos ya publicados (RLS solo le permite tocar sus propios
-- borradores en_produccion) — mismo patrón que
-- fn_cambiar_nivel_ganancia_producto.
-- ------------------------------------------------------------
create or replace function public.fn_actualizar_parametros_articulo(
  p_producto_id bigint,
  p_punto_reorden numeric default null,
  p_dias_sin_venta_descuento int default null,
  p_descuento_automatico_pct numeric default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if public.fn_rol_actual() not in ('admin', 'produccion') then
    raise exception 'No tienes permiso para editar parámetros de artículos';
  end if;
  if p_dias_sin_venta_descuento is not null and p_dias_sin_venta_descuento <= 0 then
    raise exception 'Los días sin venta deben ser mayores a 0';
  end if;
  if p_descuento_automatico_pct is not null
     and (p_descuento_automatico_pct <= 0 or p_descuento_automatico_pct >= 100) then
    raise exception 'El % de descuento automático debe estar entre 0 y 100';
  end if;
  if (p_dias_sin_venta_descuento is null) <> (p_descuento_automatico_pct is null) then
    raise exception 'Indica días sin venta y % de descuento juntos, o ninguno de los dos';
  end if;

  update public.productos
    set punto_reorden = p_punto_reorden,
        dias_sin_venta_descuento = p_dias_sin_venta_descuento,
        descuento_automatico_pct = p_descuento_automatico_pct
    where id = p_producto_id;

  if not found then
    raise exception 'La pieza no existe';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- fn_aplicar_descuentos_automaticos — corre sola por pg_cron, sin
-- sesión de usuario (no pasa por fn_tiene_permiso/fn_usuario_id).
-- Idempotente: nunca reaplica sobre una pieza que ya tiene
-- precio_descuento (manual o automático) — la regla no "renueva" un
-- descuento existente, solo lo activa la primera vez que se cumple.
-- ------------------------------------------------------------
create or replace function public.fn_aplicar_descuentos_automaticos()
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  v_aplicados int := 0;
  r record;
begin
  for r in
    select id, precio_venta, descuento_automatico_pct
    from public.productos
    where activo
      and estado in ('disponible_cedi', 'disponible_tienda')
      and dias_sin_venta_descuento is not null
      and descuento_automatico_pct is not null
      and precio_descuento is null
      and precio_venta is not null
      and coalesce(fecha_ultima_venta, fecha_publicacion, fecha_creacion)
        < now() - (dias_sin_venta_descuento || ' days')::interval
  loop
    update public.productos
      set precio_descuento = round(r.precio_venta * (1 - r.descuento_automatico_pct / 100), 2),
          descuento_motivo = 'Descuento automático por días sin venta',
          descuento_por = null,
          descuento_fecha = now()
      where id = r.id;
    v_aplicados := v_aplicados + 1;
  end loop;

  return v_aplicados;
end;
$$;

-- ------------------------------------------------------------
-- Programación diaria — 09:00 UTC = ~03:00 America/Guatemala (UTC-6).
-- Si el proyecto de Supabase tiene pg_cron deshabilitado, actívalo
-- primero desde Database > Extensions en el dashboard y vuelve a
-- correr este bloque.
-- ------------------------------------------------------------
create extension if not exists pg_cron;

select cron.schedule(
  'descuentos_automaticos_diario',
  '0 9 * * *',
  $$select public.fn_aplicar_descuentos_automaticos();$$
);
