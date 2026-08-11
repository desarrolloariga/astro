-- ============================================================
-- ASTRO — Piezas "por cantidad": una referencia con varias unidades
-- idénticas en stock, vendible de verdad (mostrador/asesor y el
-- carrito público de enlaces compartidos), no solo creable.
--
-- Principio central: productos.estado sigue siendo el único gate de
-- "¿es navegable/vendible esta referencia?" — tanto pieza_unica como
-- por_cantidad recorren el mismo en_produccion → disponible_cedi/
-- disponible_tienda. inventario_cantidad.cantidad_disponible/
-- cantidad_reservada es la capa de stock en vivo que se apoya SOLO
-- sobre filas por_cantidad; una venta o reserva de una referencia
-- por_cantidad NUNCA toca productos.estado — su disponibilidad real
-- vive enteramente en inventario_cantidad, y las vistas de catálogo
-- la excluyen solas al llegar a 0 (sin cron ni trigger).
--
-- De paso corrige dos bugs encontrados durante el diseño:
--   1. El carrito público está roto hoy: fn_agregar_al_carrito
--      inserta movimientos_inventario.tipo='retencion_carrito', pero
--      una migración posterior redefinió ese CHECK sin ese valor.
--   2. DROP FUNCTION en las 3 funciones que usa el catálogo público
--      (fn_agregar_al_carrito, fn_ver_carrito, fn_catalogo_por_token)
--      borra el GRANT EXECUTE a anon — hay que reotorgarlo o el
--      catálogo público entero deja de funcionar tras esta migración.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columnas nuevas
-- ------------------------------------------------------------
alter table public.productos add column cantidad_inicial int check (cantidad_inicial > 0);
comment on column public.productos.cantidad_inicial is
  'Solo para modo_inventario=por_cantidad. Se llena una vez al crear/cargar la referencia; fn_publicar_producto la consume para sembrar inventario_cantidad. Nunca se actualiza después — el número vivo vive en inventario_cantidad.';

comment on column public.productos.estado_sku is
  'Reservado para un futuro estado de SKU independiente del estado físico de pieza. No lo usa ningún código todavía (incluida esta migración) — productos.estado sigue siendo el único gate real.';

alter table public.venta_detalles add column cantidad int not null default 1 check (cantidad > 0);
alter table public.carrito_detalles add column cantidad int not null default 1 check (cantidad > 0);
alter table public.movimientos_inventario add column cantidad int not null default 1 check (cantidad > 0);

-- ------------------------------------------------------------
-- 2. Fix bug #1 — restaurar 'retencion_carrito' en el CHECK
-- ------------------------------------------------------------
alter table public.movimientos_inventario drop constraint movimientos_inventario_tipo_check;
alter table public.movimientos_inventario add constraint movimientos_inventario_tipo_check
  check (tipo in ('alta_cedi','salida_transferencia','entrada_transferencia','separado',
                  'liberacion','venta','devolucion','ajuste','baja','retenida','entrega',
                  'retencion_carrito'));

-- ------------------------------------------------------------
-- 3. fn_publicar_producto — misma firma, siembra inventario_cantidad
-- para referencias por_cantidad al publicar.
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
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
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

  if v_producto.nombre is null or v_producto.precio_venta is null
     or v_producto.categoria_id is null or v_producto.material_id is null then
    raise exception 'Ficha incompleta: nombre, precio, categoría y material son obligatorios';
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
    select id into v_cedi_id from public.tiendas where tipo = 'cedi' and activo limit 1;
  end if;
  if v_cedi_id is null then
    raise exception 'No hay CEDI activo configurado';
  end if;

  update public.productos
    set estado = 'disponible_cedi',
        tienda_id = v_cedi_id,
        fecha_publicacion = now()
    where id = p_producto_id;

  if v_producto.modo_inventario = 'por_cantidad' then
    -- INSERT simple (no upsert): el guard de estado='en_produccion' de
    -- arriba hace que esta fila no debería existir todavía; si algún
    -- día existiera, mejor fallar ruidoso que sumar stock en silencio.
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

-- ------------------------------------------------------------
-- 4. fn_registrar_venta — nueva firma (9º parámetro p_cantidad).
-- CREATE OR REPLACE no reemplaza si cambia la lista de argumentos —
-- se elimina la firma de 8 parámetros primero.
-- ------------------------------------------------------------
drop function if exists public.fn_registrar_venta(bigint[], text, text, text, numeric, text, bigint, numeric);

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

      update public.productos set estado = 'vendida' where id = v_id;

      insert into public.movimientos_inventario (producto_id, tipo, usuario_id, referencia, cantidad)
      values (v_id, 'venta', public.fn_usuario_id(), 'venta:' || v_venta_id, 1);
    else
      insert into public.venta_detalles (venta_id, producto_id, precio, cantidad)
      values (v_venta_id, v_id, coalesce(v_producto.precio_descuento, v_producto.precio_venta, 0), p_cantidad);

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
-- 5. fn_confirmar_carrito — misma firma (la cantidad ya viaja en
-- carrito_detalles.cantidad, sembrada por fn_agregar_al_carrito).
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
      update public.productos set estado = 'vendida' where id = v_detalle.producto_id;
    else
      update public.inventario_cantidad
        set cantidad_reservada = cantidad_reservada - v_detalle.cantidad
        where producto_id = v_detalle.producto_id and tienda_id = v_producto.tienda_id;
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
-- 6. fn_agregar_al_carrito — nueva firma (4º parámetro p_cantidad).
-- Anon-facing: requiere reotorgar EXECUTE (bug #2) tras el DROP.
-- ------------------------------------------------------------
drop function if exists public.fn_agregar_al_carrito(text, text, bigint);

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
    update public.inventario_cantidad
      set cantidad_disponible = cantidad_disponible - p_cantidad,
          cantidad_reservada = cantidad_reservada + p_cantidad
      where producto_id = p_producto_id and tienda_id = v_producto.tienda_id
        and cantidad_disponible >= p_cantidad;
    if not found then
      raise exception 'No hay suficiente stock de %', v_producto.codigo;
    end if;

    insert into public.carrito_detalles (carrito_id, producto_id, cantidad, fecha_expiracion)
    values (v_carrito.id, p_producto_id, p_cantidad, now() + (v_minutos || ' minutes')::interval)
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
-- 7. fn_quitar_del_carrito / fn_liberar_carrito_items_vencidos —
-- mismas firmas, ramifican por modo_inventario. fn_devolver_disponibilidad
-- (helper existente) solo sabe mutar productos.estado — no aplica a
-- por_cantidad, donde en su lugar se libera cantidad_reservada.
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
      where producto_id = p_producto_id and tienda_id = v_producto.tienda_id;
  end if;

  delete from public.carrito_detalles where id = v_detalle.id;

  insert into public.movimientos_inventario (producto_id, tipo, referencia, cantidad)
  values (p_producto_id, 'liberacion', 'quitada del carrito', v_detalle.cantidad);
end;
$$;

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
    select cd.id, cd.producto_id, cd.cantidad from public.carrito_detalles cd
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
        where producto_id = v_detalle.producto_id and tienda_id = v_producto.tienda_id;

      insert into public.movimientos_inventario (producto_id, tipo, referencia, cantidad)
      values (v_detalle.producto_id, 'liberacion', 'retención de carrito vencida', v_detalle.cantidad);
    end if;

    delete from public.carrito_detalles where id = v_detalle.id;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 8. fn_ver_carrito — nuevo return type (agrega cantidad,
-- modo_inventario, stock_disponible). Anon-facing: requiere
-- reotorgar EXECUTE (bug #2) tras el DROP. De paso corrige que el
-- precio mostrado no respetaba precio_descuento (inconsistente con
-- el resto del carrito/checkout).
-- ------------------------------------------------------------
drop function if exists public.fn_ver_carrito(text);

create or replace function public.fn_ver_carrito(p_carrito_token text)
returns table (
  producto_id bigint, codigo text, nombre text, precio_venta numeric,
  imagen_principal text, segundos_restantes int,
  cantidad int, modo_inventario text, stock_disponible int
)
language plpgsql security definer
set search_path = public
as $$
begin
  return query
    select
      p.id, p.codigo, p.nombre, coalesce(p.precio_descuento, p.precio_venta),
      (select i.url from public.producto_imagenes i
         where i.producto_id = p.id order by i.es_principal desc, i.orden asc limit 1),
      greatest(0, extract(epoch from (cd.fecha_expiracion - now()))::int),
      cd.cantidad,
      p.modo_inventario,
      case when p.modo_inventario = 'por_cantidad'
        then (select ic.cantidad_disponible from public.inventario_cantidad ic
              where ic.producto_id = p.id and ic.tienda_id = p.tienda_id)
        else null end
    from public.carrito_detalles cd
    join public.productos p on p.id = cd.producto_id
    join public.carritos c on c.id = cd.carrito_id
    where c.token = p_carrito_token
    order by cd.fecha_creacion;
end;
$$;

grant execute on function public.fn_ver_carrito(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 9. Comisiones y puntos: sum(precio) / count(*) asumían 1 fila = 1
-- unidad. Mismas firmas, un fix de una línea cada una.
-- ------------------------------------------------------------
create or replace function public.fn_calcular_comision_regla(
  p_tipo text,
  p_porcentaje numeric,
  p_monto_fijo numeric,
  p_condiciones jsonb,
  p_venta_id bigint
)
returns numeric
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_venta public.ventas%rowtype;
  v_categoria_id bigint;
  v_base numeric;
begin
  if p_tipo <> 'por_venta' then
    return 0;
  end if;

  select * into v_venta from public.ventas where id = p_venta_id;
  if not found then
    return 0;
  end if;

  v_categoria_id := (p_condiciones ->> 'categoria_id')::bigint;
  if v_categoria_id is not null then
    select coalesce(sum(vd.precio * vd.cantidad), 0) into v_base
      from public.venta_detalles vd join public.productos p on p.id = vd.producto_id
      where vd.venta_id = p_venta_id and p.categoria_id = v_categoria_id;
  else
    v_base := v_venta.total;
  end if;

  return round(coalesce(p_monto_fijo, 0) + v_base * coalesce(p_porcentaje, 0) / 100, 2);
end;
$$;

create or replace function public.fn_calcular_puntos_regla(
  p_tipo text,
  p_valor numeric,
  p_multiplicador numeric,
  p_condiciones jsonb,
  p_venta_id bigint
)
returns numeric
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_venta public.ventas%rowtype;
  v_total numeric := 0;
  v_categoria_id bigint;
  v_margen_minimo numeric;
  v_por_cada numeric;
  v_cnt int;
  v_es_primera boolean;
  v_es_cliente_nuevo boolean;
begin
  select * into v_venta from public.ventas where id = p_venta_id;
  if not found then
    return 0;
  end if;

  case p_tipo
    when 'por_venta_fija' then
      v_total := p_valor;

    when 'por_monto' then
      v_por_cada := coalesce((p_condiciones ->> 'por_cada')::numeric, 100);
      if v_por_cada > 0 then
        v_total := floor(v_venta.total / v_por_cada) * p_valor;
      end if;

    when 'por_categoria' then
      v_categoria_id := (p_condiciones ->> 'categoria_id')::bigint;
      if v_categoria_id is not null then
        select coalesce(sum(vd.cantidad), 0)::int into v_cnt
          from public.venta_detalles vd join public.productos p on p.id = vd.producto_id
          where vd.venta_id = p_venta_id and p.categoria_id = v_categoria_id;
        v_total := v_cnt * p_valor;
      end if;

    when 'por_margen' then
      v_margen_minimo := coalesce((p_condiciones ->> 'margen_minimo')::numeric, 0);
      select coalesce(sum(vd.cantidad), 0)::int into v_cnt
        from public.venta_detalles vd join public.productos p on p.id = vd.producto_id
        where vd.venta_id = p_venta_id
          and p.costo_produccion is not null and p.costo_produccion > 0 and vd.precio > 0
          and ((vd.precio - p.costo_produccion) / vd.precio * 100) >= v_margen_minimo;
      v_total := v_cnt * p_valor;

    when 'primera_venta_mes' then
      select not exists (
        select 1 from public.ventas v2
        where v2.vendedor_id = v_venta.vendedor_id
          and v2.id <> v_venta.id
          and v2.estado <> 'anulada'
          and v2.fecha_creacion >= date_trunc('month', v_venta.fecha_creacion)
          and v2.fecha_creacion < v_venta.fecha_creacion
      ) into v_es_primera;
      if v_es_primera then
        v_total := p_valor;
      end if;

    when 'cliente_nuevo' then
      if v_venta.cliente_id is not null then
        select not exists (
          select 1 from public.ventas v2
          where v2.cliente_id = v_venta.cliente_id
            and v2.id <> v_venta.id
            and v2.estado <> 'anulada'
            and v2.fecha_creacion < v_venta.fecha_creacion
        ) into v_es_cliente_nuevo;
        if v_es_cliente_nuevo then
          v_total := p_valor;
        end if;
      end if;

    else
      v_total := 0;
  end case;

  return round(v_total * coalesce(p_multiplicador, 1), 2);
end;
$$;

-- ------------------------------------------------------------
-- 10. Guardas — sin esto, fn_crear_transferencia y fn_separar_pieza
-- podrían mutar productos.estado de una referencia por_cantidad,
-- dejando su stock real (inventario_cantidad, atado a la bodega de
-- origen) huérfano. Mismas firmas.
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
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
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
    if v_producto.modo_inventario <> 'pieza_unica' then
      raise exception 'Esta operación no aplica a piezas con inventario por cantidad';
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

create or replace function public.fn_separar_pieza(
  p_producto_id bigint,
  p_cliente_nombre text,
  p_cliente_telefono text default null
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
  v_cliente_id bigint;
  v_separado_id bigint;
  v_horas numeric;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if not public.fn_tiene_permiso('separados','crear') then
    raise exception 'No tienes permiso para separar piezas';
  end if;

  select * into v_producto from public.productos where id = p_producto_id for update;

  if not found then
    raise exception 'La pieza no existe';
  end if;
  if v_producto.modo_inventario <> 'pieza_unica' then
    raise exception 'Esta operación no aplica a piezas con inventario por cantidad';
  end if;
  if v_producto.estado not in ('disponible_cedi','disponible_tienda') then
    raise exception 'La pieza % no está disponible para separar (estado: %)',
      v_producto.codigo, v_producto.estado;
  end if;

  v_cliente_id := public.fn_obtener_o_crear_cliente(p_cliente_nombre, p_cliente_telefono);
  v_horas := coalesce(public.fn_parametro('horas_separado')::numeric, 48);

  update public.productos set estado = 'separada' where id = p_producto_id;

  insert into public.separados (producto_id, vendedor_id, cliente_id, fecha_expiracion)
  values (p_producto_id, public.fn_usuario_id(), v_cliente_id, now() + (v_horas || ' hours')::interval)
  returning id into v_separado_id;

  insert into public.movimientos_inventario (producto_id, tipo, usuario_id, referencia)
  values (p_producto_id, 'separado', public.fn_usuario_id(), 'separado:' || v_separado_id);

  return v_separado_id;
end;
$$;

-- ------------------------------------------------------------
-- 11. vw_catalogo — agrega columnas al final (regla de solo-agregar
-- de CREATE OR REPLACE VIEW). Una referencia por_cantidad desaparece
-- sola del catálogo al llegar a 0 unidades, sin cron ni trigger.
-- ------------------------------------------------------------
create or replace view public.vw_catalogo as
select
  p.id,
  p.codigo,
  p.nombre,
  p.descripcion,
  p.categoria_id,
  c.nombre  as categoria,
  p.material_id,
  m.nombre  as material,
  p.peso_gramos,
  p.kilataje,
  p.piedras,
  coalesce(p.precio_descuento, p.precio_venta) as precio_venta,
  p.moneda_id,
  p.estado,
  p.tienda_id,
  t.nombre  as tienda,
  (select i.url from public.producto_imagenes i
     where i.producto_id = p.id
     order by i.es_principal desc, i.orden asc limit 1) as imagen_principal,
  (select coalesce(jsonb_agg(jsonb_build_object('url', i.url, 'orden', i.orden)
                             order by i.orden), '[]'::jsonb)
     from public.producto_imagenes i where i.producto_id = p.id) as imagenes,
  p.precio_venta as precio_lista,
  (p.precio_descuento is not null) as en_descuento,
  p.modo_inventario,
  case when p.modo_inventario = 'por_cantidad' then coalesce(ic.cantidad_disponible, 0) else null end as stock_disponible
from public.productos p
left join public.categorias c on c.id = p.categoria_id
left join public.materiales m on m.id = p.material_id
left join public.tiendas t on t.id = p.tienda_id
left join public.inventario_cantidad ic on ic.producto_id = p.id and ic.tienda_id = p.tienda_id
where p.activo
  and (
    p.estado in ('disponible_cedi','disponible_tienda')
    or (p.estado = 'en_transito'
        and public.fn_parametro('politica_piezas_transito') = 'proximamente')
  )
  and (p.modo_inventario = 'pieza_unica' or coalesce(ic.cantidad_disponible, 0) > 0);

grant select on public.vw_catalogo to authenticated;
revoke all on public.vw_catalogo from anon;

-- ------------------------------------------------------------
-- 12. fn_catalogo_por_token — nuevo return type. Anon-facing:
-- requiere reotorgar EXECUTE (bug #2) tras el DROP.
-- ------------------------------------------------------------
drop function if exists public.fn_catalogo_por_token(text);

create or replace function public.fn_catalogo_por_token(p_token text)
returns table (
  id bigint, codigo text, nombre text, descripcion text,
  categoria text, material text, peso_gramos numeric, kilataje text, piedras text,
  precio_venta numeric, imagen_principal text, imagenes jsonb,
  modo_inventario text, stock_disponible int
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_link public.links_venta%rowtype;
begin
  select * into v_link from public.links_venta where token = p_token;
  if not found or v_link.estado <> 'activo'
     or (v_link.fecha_vencimiento is not null and v_link.fecha_vencimiento < now()) then
    raise exception 'Enlace inválido o vencido';
  end if;

  return query
    select
      p.id, p.codigo, p.nombre, p.descripcion,
      c.nombre, m.nombre, p.peso_gramos, p.kilataje, p.piedras,
      coalesce(p.precio_descuento, p.precio_venta),
      (select i.url from public.producto_imagenes i
         where i.producto_id = p.id order by i.es_principal desc, i.orden asc limit 1),
      (select coalesce(jsonb_agg(jsonb_build_object('url', i.url, 'orden', i.orden) order by i.orden), '[]'::jsonb)
         from public.producto_imagenes i where i.producto_id = p.id),
      p.modo_inventario,
      case when p.modo_inventario = 'por_cantidad'
        then coalesce((select ic.cantidad_disponible from public.inventario_cantidad ic
                       where ic.producto_id = p.id and ic.tienda_id = p.tienda_id), 0)
        else null end
    from public.productos p
    left join public.categorias c on c.id = p.categoria_id
    left join public.materiales m on m.id = p.material_id
    where p.activo
      and p.estado in ('disponible_cedi','disponible_tienda')
      and (
        p.modo_inventario = 'pieza_unica'
        or coalesce((select ic.cantidad_disponible from public.inventario_cantidad ic
                     where ic.producto_id = p.id and ic.tienda_id = p.tienda_id), 0) > 0
      )
      and (
        v_link.tipo = 'catalogo'
        or exists (select 1 from public.link_productos lp
                   where lp.link_id = v_link.id and lp.producto_id = p.id)
      );
end;
$$;

grant execute on function public.fn_catalogo_por_token(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 13. vw_inventario_tienda — agrega columnas al final (ya tenía
-- categoria_id/material_id agregados por una migración anterior).
-- ------------------------------------------------------------
create or replace view public.vw_inventario_tienda as
select
  p.id, p.codigo, p.nombre,
  c.nombre as categoria,
  m.nombre as material,
  p.peso_gramos, p.kilataje, p.piedras,
  p.estado,
  coalesce(p.precio_descuento, p.precio_venta) as precio_venta,
  p.precio_venta as precio_lista,
  (p.precio_descuento is not null) as en_descuento,
  p.costo_produccion, p.moneda_id,
  p.tienda_id,
  t.nombre as tienda, t.tipo as tienda_tipo,
  (select i.url from public.producto_imagenes i
     where i.producto_id = p.id
     order by i.es_principal desc, i.orden asc limit 1) as imagen_principal,
  p.fecha_actualizacion, p.fecha_creacion,
  p.categoria_id, p.material_id,
  p.modo_inventario,
  case when p.modo_inventario = 'por_cantidad' then ic.cantidad_disponible else null end as cantidad_disponible
from public.productos p
left join public.categorias c on c.id = p.categoria_id
left join public.materiales m on m.id = p.material_id
left join public.tiendas t on t.id = p.tienda_id
left join public.inventario_cantidad ic on ic.producto_id = p.id and ic.tienda_id = p.tienda_id
where p.activo
  and (
    public.fn_rol_actual() in ('admin','coordinador','contabilidad','supervisor')
    or (public.fn_rol_actual() = 'tienda' and p.tienda_id = public.fn_mi_tienda_id())
  );

grant select on public.vw_inventario_tienda to authenticated;
revoke all on public.vw_inventario_tienda from anon;

-- ------------------------------------------------------------
-- 14. vw_inventario_valorizado — agregación consciente de cantidad.
-- piezas_sin_movimiento_60d excluye por_cantidad: una venta por
-- cantidad nunca toca productos.fecha_actualizacion (el diseño la
-- delega enteramente a inventario_cantidad), así que ese campo no es
-- solo menos preciso para esas filas, es inaplicable.
-- ------------------------------------------------------------
create or replace view public.vw_inventario_valorizado as
select
  p.tienda_id, t.nombre as tienda, t.tipo as tienda_tipo,
  sum(case when p.modo_inventario = 'por_cantidad' then coalesce(ic.cantidad_disponible, 0) else 1 end) as piezas,
  sum(coalesce(p.costo_produccion, 0) *
      case when p.modo_inventario = 'por_cantidad' then coalesce(ic.cantidad_disponible, 0) else 1 end
  ) as capital_inmovilizado,
  sum(coalesce(p.precio_venta, 0) *
      case when p.modo_inventario = 'por_cantidad' then coalesce(ic.cantidad_disponible, 0) else 1 end
  ) as valor_venta_potencial,
  count(*) filter (
    where p.modo_inventario = 'pieza_unica'
      and coalesce(p.fecha_actualizacion, p.fecha_creacion)
        < now() - ((select valor from public.parametros where clave = 'dias_pieza_lenta') || ' days')::interval
  ) as piezas_sin_movimiento_60d
from public.productos p
left join public.tiendas t on t.id = p.tienda_id
left join public.inventario_cantidad ic on ic.producto_id = p.id and ic.tienda_id = p.tienda_id
where p.activo and p.estado in ('disponible_cedi', 'disponible_tienda')
  and public.fn_tiene_permiso('finanzas','ver')
group by p.tienda_id, t.nombre, t.tipo;

grant select on public.vw_inventario_valorizado to authenticated;
revoke all on public.vw_inventario_valorizado from anon;

-- ------------------------------------------------------------
-- 15. fn_registrar_historico_inventario_diario — mismo tratamiento
-- que 14, más piezas_en_descuento (propia de esta función, no existe
-- en vw_inventario_valorizado) con el mismo multiplicador.
-- ------------------------------------------------------------
create or replace function public.fn_registrar_historico_inventario_diario()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_fecha date := (now() at time zone 'America/Guatemala')::date;
  v_dias_pieza_lenta text;
begin
  select valor into v_dias_pieza_lenta from public.parametros where clave = 'dias_pieza_lenta';

  insert into public.inventario_historico_diario
    (fecha, tienda_id, piezas, capital_inmovilizado, valor_venta_potencial,
     piezas_sin_movimiento, piezas_en_descuento)
  select
    v_fecha,
    p.tienda_id,
    sum(case when p.modo_inventario = 'por_cantidad' then coalesce(ic.cantidad_disponible, 0) else 1 end),
    sum(coalesce(p.costo_produccion, 0) *
        case when p.modo_inventario = 'por_cantidad' then coalesce(ic.cantidad_disponible, 0) else 1 end),
    sum(coalesce(p.precio_venta, 0) *
        case when p.modo_inventario = 'por_cantidad' then coalesce(ic.cantidad_disponible, 0) else 1 end),
    count(*) filter (
      where p.modo_inventario = 'pieza_unica'
        and coalesce(p.fecha_actualizacion, p.fecha_creacion)
          < now() - (coalesce(v_dias_pieza_lenta, '60') || ' days')::interval
    ),
    sum(case when p.precio_descuento is not null
      then case when p.modo_inventario = 'por_cantidad' then coalesce(ic.cantidad_disponible, 0) else 1 end
      else 0 end)
  from public.productos p
  left join public.inventario_cantidad ic on ic.producto_id = p.id and ic.tienda_id = p.tienda_id
  where p.activo
    and p.estado in ('disponible_cedi', 'disponible_tienda')
    and p.tienda_id is not null
  group by p.tienda_id
  on conflict (fecha, tienda_id) do update
    set piezas = excluded.piezas,
        capital_inmovilizado = excluded.capital_inmovilizado,
        valor_venta_potencial = excluded.valor_venta_potencial,
        piezas_sin_movimiento = excluded.piezas_sin_movimiento,
        piezas_en_descuento = excluded.piezas_en_descuento;
end;
$$;

-- ------------------------------------------------------------
-- 16. Logística: vw_rotacion_producto NO cambia — su propio
-- where estado in ('vendida','entregada') ya excluye para siempre
-- las filas por_cantidad (nunca llegan a ese estado bajo este
-- diseño). Es una dependencia implícita de la elección de diseño de
-- este archivo — si el estado-machine cambia algún día, revisar esto.
--
-- vw_alertas_quiebre_stock y vw_piezas_lentas SÍ necesitan excluir
-- por_cantidad explícitamente (su estado sí las incluiría para
-- siempre). Gap real, no solo impreciso: un modelo popular puede
-- pasar de 500 a 0 unidades sin ninguna alerta — pendiente para una
-- fase futura de analítica consciente de cantidad.
-- ------------------------------------------------------------
create or replace view public.vw_alertas_quiebre_stock as
select
  p.categoria_id, c.nombre as categoria, p.material_id, m.nombre as material,
  count(*) as piezas_disponibles
from public.productos p
join public.categorias c on c.id = p.categoria_id
join public.materiales m on m.id = p.material_id
where p.activo
  and p.estado in ('disponible_cedi','disponible_tienda')
  and p.modo_inventario = 'pieza_unica'
  and public.fn_tiene_permiso('logistica','gestionar')
group by p.categoria_id, c.nombre, p.material_id, m.nombre
having count(*) <= (select valor::int from public.parametros where clave = 'umbral_quiebre_stock');

grant select on public.vw_alertas_quiebre_stock to authenticated;
revoke all on public.vw_alertas_quiebre_stock from anon;

create or replace view public.vw_piezas_lentas as
select
  p.id, p.codigo, p.nombre, c.nombre as categoria, m.nombre as material,
  p.tienda_id, t.nombre as tienda, p.precio_venta,
  coalesce(p.fecha_actualizacion, p.fecha_creacion) as ultimo_movimiento,
  extract(day from now() - coalesce(p.fecha_actualizacion, p.fecha_creacion))::int as dias_sin_movimiento
from public.productos p
left join public.categorias c on c.id = p.categoria_id
left join public.materiales m on m.id = p.material_id
left join public.tiendas t on t.id = p.tienda_id
where p.activo
  and p.estado in ('disponible_cedi','disponible_tienda')
  and p.modo_inventario = 'pieza_unica'
  and coalesce(p.fecha_actualizacion, p.fecha_creacion)
    < now() - ((select valor from public.parametros where clave = 'dias_pieza_lenta') || ' days')::interval
  and (
    public.fn_rol_actual() in ('admin','coordinador','supervisor','contabilidad')
    or (public.fn_rol_actual() = 'tienda' and p.tienda_id = public.fn_mi_tienda_id())
  );

grant select on public.vw_piezas_lentas to authenticated;
revoke all on public.vw_piezas_lentas from anon;

-- Verificación
select grantee, routine_name from information_schema.role_routine_grants
  where routine_name in ('fn_agregar_al_carrito','fn_ver_carrito','fn_catalogo_por_token')
    and grantee = 'anon';
