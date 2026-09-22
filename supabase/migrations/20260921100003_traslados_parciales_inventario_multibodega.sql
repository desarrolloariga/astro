-- ============================================================
-- ASTRO — Traslados parciales de artículos por_cantidad + inventario
-- repartido entre varias bodegas.
--
-- La migración anterior (20260921100002) exigió que un traslado
-- por_cantidad moviera TODO el disponible del origen, porque el
-- resto del sistema (ventas, carrito, Existencias) asumía que
-- productos.tienda_id era la ÚNICA bodega donde vive el stock de esa
-- referencia. El usuario pidió volver a permitir traslados parciales,
-- así que ahora se corrige la causa real: el motor de ventas y
-- reservas pasa a SUMAR la existencia de una referencia por_cantidad
-- entre TODAS las bodegas (inventario_cantidad), en vez de mirar solo
-- la fila de productos.tienda_id.
--
-- Con esto, productos.tienda_id deja de ser "la única bodega" de un
-- artículo por_cantidad — pasa a ser solo la bodega "de origen"/
-- referencia por defecto (donde se reabastece por defecto, ver
-- fn_sumar_inventario_producto), sin dejar de ser fuente de verdad
-- para pieza_unica (donde sí hay una sola unidad física).
--
-- Cambios:
--   1) carrito_detalles gana columna tienda_id — recuerda de qué
--      bodega se reservó cada línea por_cantidad, para poder
--      liberar/confirmar esa misma reserva más adelante sin volver a
--      adivinar. (Pieza única no la necesita: su estado vive en la
--      propia fila de productos.)
--   2) fn_agregar_al_carrito: al reservar una línea por_cantidad,
--      recorre las bodegas con existencia (empezando por
--      productos.tienda_id, luego cualquier otra) y reserva de la
--      primera que alcance a cubrir la cantidad pedida completa.
--      Nota de alcance: una misma línea de carrito sigue reservando
--      de UNA sola bodega — no se fracciona una reserva entre dos
--      bodegas a la vez, para no complicar quitar/liberar. Si ninguna
--      bodega individual alcanza pero la suma sí, se pide iniciar
--      sesión/comprar en tramos menores (limitación aceptada).
--   3) fn_quitar_del_carrito / fn_liberar_carrito_items_vencidos /
--      fn_confirmar_carrito: usan la bodega recordada en
--      carrito_detalles.tienda_id en vez de productos.tienda_id.
--   4) fn_registrar_venta: el descuento de stock por_cantidad ahora
--      recorre todas las bodegas con existencia (orden: la de
--      productos.tienda_id primero, luego el resto) y descuenta de
--      cada una lo que haga falta hasta cubrir la cantidad vendida —
--      una venta directa sí puede fraccionar entre bodegas porque no
--      necesita "recordar" nada después.
--   5) fn_crear_traslado: se relaja la restricción de "todo o nada" —
--      ahora acepta 0 < cantidad <= disponible en el origen.
--   6) fn_confirmar_recepcion_traslado: deja de tocar
--      productos.tienda_id para líneas por_cantidad (ya no representa
--      "la única bodega"); solo pieza_unica sigue actualizándolo.
-- ============================================================

alter table public.carrito_detalles
  add column tienda_id bigint references public.tiendas(id);

comment on column public.carrito_detalles.tienda_id is
  'Bodega de la que se reservó esta línea (solo por_cantidad) — necesaria para liberar/confirmar la reserva correcta cuando el stock de una referencia está repartido entre varias bodegas.';

-- ------------------------------------------------------------
-- 1) fn_agregar_al_carrito — misma firma. Elige bodega con stock
-- suficiente y la recuerda en carrito_detalles.tienda_id.
-- ------------------------------------------------------------
create or replace function public.fn_agregar_al_carrito(
  p_token text,
  p_carrito_token text,
  p_producto_id bigint,
  p_cantidad int default 1
)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_link public.links_venta%rowtype;
  v_producto public.productos%rowtype;
  v_carrito public.carritos%rowtype;
  v_minutos numeric;
  v_tienda_id bigint;
begin
  if p_cantidad is null or p_cantidad < 1 then
    raise exception 'La cantidad debe ser al menos 1';
  end if;

  select * into v_link from public.links_venta where token = p_token;
  if not found or v_link.estado <> 'activo'
     or (v_link.fecha_vencimiento is not null and v_link.fecha_vencimiento < now()) then
    raise exception 'Enlace inválido o vencido';
  end if;

  if v_link.tipo <> 'catalogo'
     and not exists (select 1 from public.link_productos where link_id = v_link.id and producto_id = p_producto_id) then
    raise exception 'Esta pieza no forma parte del enlace';
  end if;

  select * into v_producto from public.productos where id = p_producto_id for update;
  if not found or v_producto.estado not in ('disponible_cedi','disponible_tienda') then
    raise exception 'La pieza ya no está disponible';
  end if;
  if v_producto.modo_inventario = 'pieza_unica' and p_cantidad <> 1 then
    raise exception 'Esta pieza es única — no admite cantidad';
  end if;

  if p_carrito_token is not null then
    select * into v_carrito from public.carritos
      where token = p_carrito_token and link_id = v_link.id and estado = 'abierto'
      for update;
  end if;

  if v_carrito.id is null then
    insert into public.carritos (link_id) values (v_link.id) returning * into v_carrito;
  end if;

  v_minutos := coalesce(public.fn_parametro('minutos_retencion_carrito')::numeric, 20);

  if v_producto.modo_inventario = 'pieza_unica' then
    if exists (select 1 from public.carrito_detalles where carrito_id = v_carrito.id and producto_id = p_producto_id) then
      return v_carrito.token;
    end if;

    update public.productos set estado = 'retenida' where id = p_producto_id;

    insert into public.carrito_detalles (carrito_id, producto_id, cantidad, fecha_expiracion)
    values (v_carrito.id, p_producto_id, 1, now() + (v_minutos || ' minutes')::interval);
  else
    -- Ya hay una reserva de esta referencia en este carrito: se
    -- amplía en la MISMA bodega donde ya se reservó, para no dejar
    -- una línea repartida entre dos bodegas.
    select tienda_id into v_tienda_id from public.carrito_detalles
      where carrito_id = v_carrito.id and producto_id = p_producto_id;

    if v_tienda_id is not null then
      update public.inventario_cantidad
        set cantidad_disponible = cantidad_disponible - p_cantidad,
            cantidad_reservada = cantidad_reservada + p_cantidad
        where producto_id = p_producto_id and tienda_id = v_tienda_id
          and cantidad_disponible >= p_cantidad;
      if not found then
        raise exception 'No hay suficiente stock de %', v_producto.codigo;
      end if;
    else
      -- Bodega con stock suficiente: se prefiere la "bodega base" del
      -- artículo (productos.tienda_id) y, si no alcanza, cualquier
      -- otra bodega que sí tenga la cantidad completa.
      select ic.tienda_id into v_tienda_id
        from public.inventario_cantidad ic
        where ic.producto_id = p_producto_id and ic.cantidad_disponible >= p_cantidad
        order by (ic.tienda_id = v_producto.tienda_id) desc, ic.cantidad_disponible desc
        limit 1
        for update;

      if v_tienda_id is null then
        raise exception 'No hay suficiente stock de %', v_producto.codigo;
      end if;

      update public.inventario_cantidad
        set cantidad_disponible = cantidad_disponible - p_cantidad,
            cantidad_reservada = cantidad_reservada + p_cantidad
        where producto_id = p_producto_id and tienda_id = v_tienda_id;
    end if;

    insert into public.carrito_detalles (carrito_id, producto_id, cantidad, fecha_expiracion, tienda_id)
    values (v_carrito.id, p_producto_id, p_cantidad, now() + (v_minutos || ' minutes')::interval, v_tienda_id)
    on conflict (carrito_id, producto_id) do update
      set cantidad = public.carrito_detalles.cantidad + excluded.cantidad,
          fecha_expiracion = excluded.fecha_expiracion;
  end if;

  insert into public.movimientos_inventario (producto_id, tipo, referencia, cantidad)
  values (p_producto_id, 'retencion_carrito', 'carrito:' || v_carrito.id, p_cantidad);

  return v_carrito.token;
end;
$$;

grant execute on function public.fn_agregar_al_carrito(text, text, bigint, int) to anon, authenticated;

-- ------------------------------------------------------------
-- 2) fn_quitar_del_carrito — misma firma. Libera desde la bodega
-- recordada en carrito_detalles.tienda_id.
-- ------------------------------------------------------------
create or replace function public.fn_quitar_del_carrito(p_carrito_token text, p_producto_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_carrito public.carritos%rowtype;
  v_detalle public.carrito_detalles%rowtype;
  v_producto public.productos%rowtype;
begin
  select * into v_carrito from public.carritos where token = p_carrito_token and estado = 'abierto' for update;
  if not found then
    raise exception 'Carrito no encontrado';
  end if;

  select * into v_detalle from public.carrito_detalles
    where carrito_id = v_carrito.id and producto_id = p_producto_id for update;
  if not found then
    raise exception 'La pieza no está en el carrito';
  end if;

  select * into v_producto from public.productos where id = p_producto_id for update;

  if v_producto.modo_inventario = 'pieza_unica' then
    perform public.fn_devolver_disponibilidad(p_producto_id);
  else
    update public.inventario_cantidad
      set cantidad_disponible = cantidad_disponible + v_detalle.cantidad,
          cantidad_reservada = cantidad_reservada - v_detalle.cantidad
      where producto_id = p_producto_id
        and tienda_id = coalesce(v_detalle.tienda_id, v_producto.tienda_id);
  end if;

  delete from public.carrito_detalles where id = v_detalle.id;

  insert into public.movimientos_inventario (producto_id, tipo, referencia, cantidad)
  values (p_producto_id, 'liberacion', 'quitada del carrito', v_detalle.cantidad);
end;
$$;

-- ------------------------------------------------------------
-- 3) fn_liberar_carrito_items_vencidos — misma firma. Idéntica idea.
-- ------------------------------------------------------------
create or replace function public.fn_liberar_carrito_items_vencidos()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_detalle record;
  v_producto public.productos%rowtype;
begin
  for v_detalle in
    select cd.id, cd.producto_id, cd.cantidad, cd.tienda_id from public.carrito_detalles cd
      join public.carritos c on c.id = cd.carrito_id
      where c.estado = 'abierto' and cd.fecha_expiracion < now()
  loop
    select * into v_producto from public.productos where id = v_detalle.producto_id for update;

    if v_producto.modo_inventario = 'pieza_unica' then
      if v_producto.estado = 'retenida' then
        perform public.fn_devolver_disponibilidad(v_detalle.producto_id);
        insert into public.movimientos_inventario (producto_id, tipo, referencia, cantidad)
        values (v_detalle.producto_id, 'liberacion', 'retención de carrito vencida', 1);
      end if;
    else
      update public.inventario_cantidad
        set cantidad_disponible = cantidad_disponible + v_detalle.cantidad,
            cantidad_reservada = cantidad_reservada - v_detalle.cantidad
        where producto_id = v_detalle.producto_id
          and tienda_id = coalesce(v_detalle.tienda_id, v_producto.tienda_id);

      insert into public.movimientos_inventario (producto_id, tipo, referencia, cantidad)
      values (v_detalle.producto_id, 'liberacion', 'retención de carrito vencida', v_detalle.cantidad);
    end if;

    delete from public.carrito_detalles where id = v_detalle.id;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 4) fn_confirmar_carrito — misma firma. Confirma la reserva de la
-- bodega recordada, no la de productos.tienda_id.
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
        where producto_id = v_detalle.producto_id
          and tienda_id = coalesce(v_detalle.tienda_id, v_producto.tienda_id) for update;
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
        where producto_id = v_detalle.producto_id
          and tienda_id = coalesce(v_detalle.tienda_id, v_producto.tienda_id);

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
-- 5) fn_registrar_venta — misma firma. El descuento por_cantidad
-- ahora suma/reparte entre todas las bodegas con existencia.
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
  v_fila record;
  v_restante int;
  v_tomar int;
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

      -- Se descuenta de todas las bodegas con existencia de esta
      -- referencia, empezando por la bodega base (productos.tienda_id)
      -- y siguiendo por el resto hasta cubrir p_cantidad completa.
      v_restante := p_cantidad;
      for v_fila in
        select ic.tienda_id, ic.cantidad_disponible
          from public.inventario_cantidad ic
          where ic.producto_id = v_id and ic.cantidad_disponible > 0
          order by (ic.tienda_id = v_producto.tienda_id) desc, ic.cantidad_disponible desc
          for update
      loop
        exit when v_restante <= 0;
        v_tomar := least(v_restante, v_fila.cantidad_disponible);
        update public.inventario_cantidad
          set cantidad_disponible = cantidad_disponible - v_tomar
          where producto_id = v_id and tienda_id = v_fila.tienda_id;
        v_restante := v_restante - v_tomar;
      end loop;

      if v_restante > 0 then
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
-- 6) fn_crear_traslado — misma firma. Se relaja la exigencia de
-- mover TODO el disponible: ahora acepta cualquier cantidad entre 1
-- y lo disponible en el origen.
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
        where producto_id = v_producto_id and tienda_id = p_tienda_origen_id for update;
      if v_disponible is null or v_disponible <= 0 then
        raise exception 'No hay existencia de % en la bodega de origen', v_producto.codigo;
      end if;
      if v_cantidad > v_disponible then
        raise exception 'Solo hay % disponibles de % en la bodega de origen', v_disponible, v_producto.codigo;
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
-- 7) fn_confirmar_recepcion_traslado — misma firma. Ya no fuerza
-- productos.tienda_id al destino en líneas por_cantidad (el stock
-- puede quedar repartido a propósito); solo pieza_unica sigue
-- actualizándolo, porque ahí sí hay una sola unidad física.
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
      -- productos.tienda_id ya NO se fuerza al destino: el stock de
      -- una referencia por_cantidad puede vivir en varias bodegas a
      -- la vez, y ventas/carrito ahora suman entre todas.
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
