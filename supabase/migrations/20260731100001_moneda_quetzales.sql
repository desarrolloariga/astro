-- ============================================================
-- ARIGA — Cambia la moneda del sistema de Peso mexicano (MXN) a
-- Quetzal guatemalteco (GTQ).
--
-- Se actualiza la fila existente en `monedas` (no se inserta una
-- nueva) para que `paises.moneda_id` y cualquier otra referencia
-- por id sigan intactas. Las dos funciones que buscan la moneda
-- por código literal ('MXN') se recrean para buscar 'GTQ' — si no
-- se actualizan, dejarían de encontrar la moneda tras el cambio de
-- código y las ventas quedarían sin moneda asociada.
-- ============================================================

update public.monedas
  set codigo = 'GTQ', nombre = 'Quetzal guatemalteco', simbolo = 'Q'
  where codigo = 'MXN';

-- Recrea fn_registrar_venta (versión activa: 20260720100002_permisos_rewire.sql)
-- solo para cambiar el código de moneda buscado; el resto del cuerpo es idéntico.
create or replace function public.fn_registrar_venta(
  p_producto_ids bigint[],
  p_cliente_nombre text,
  p_cliente_telefono text,
  p_metodo_pago text,
  p_monto numeric,
  p_referencia text default null,
  p_separado_id bigint default null
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
  v_canal text;
  v_tienda_id bigint;
  v_id bigint;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
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
    if p_separado_id is not null then
      if v_producto.estado <> 'separada' then
        raise exception 'La pieza % ya no está separada', v_producto.codigo;
      end if;
    elsif v_producto.estado not in ('disponible_cedi','disponible_tienda') then
      raise exception 'La pieza % no está disponible para vender (estado: %)',
        v_producto.codigo, v_producto.estado;
    end if;

    v_subtotal := v_subtotal + coalesce(v_producto.precio_venta, 0);
    v_tienda_id := coalesce(v_tienda_id, v_producto.tienda_id);
  end loop;

  v_cliente_id := public.fn_obtener_o_crear_cliente(p_cliente_nombre, p_cliente_telefono);

  v_descuento_pct := public.fn_descuento_desempeno(public.fn_usuario_id());
  v_descuento_monto := round(v_subtotal * v_descuento_pct / 100, 2);

  insert into public.ventas
    (vendedor_id, tienda_id, cliente_id, canal, subtotal, descuento_desempeno, total, moneda_id, separado_id)
  values
    (public.fn_usuario_id(), v_tienda_id, v_cliente_id, v_canal, v_subtotal, v_descuento_monto,
     v_subtotal - v_descuento_monto,
     (select id from public.monedas where codigo = 'GTQ'), p_separado_id)
  returning id into v_venta_id;

  foreach v_id in array p_producto_ids loop
    select * into v_producto from public.productos where id = v_id;

    insert into public.venta_detalles (venta_id, producto_id, precio)
    values (v_venta_id, v_id, coalesce(v_producto.precio_venta, 0));

    update public.productos set estado = 'vendida' where id = v_id;

    insert into public.movimientos_inventario (producto_id, tipo, usuario_id, referencia)
    values (v_id, 'venta', public.fn_usuario_id(), 'venta:' || v_venta_id);
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

-- Recrea fn_confirmar_carrito (versión activa: 20260717100003_enganche_comisiones.sql)
-- solo para cambiar el código de moneda buscado; el resto del cuerpo es idéntico.
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

    if v_producto.estado <> 'retenida' or v_detalle.fecha_expiracion < now() then
      raise exception 'La pieza % ya no está disponible; se venció el tiempo de retención', v_producto.codigo;
    end if;

    v_subtotal := v_subtotal + coalesce(v_producto.precio_venta, 0);
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

    insert into public.venta_detalles (venta_id, producto_id, precio)
    values (v_venta_id, v_detalle.producto_id, coalesce(v_producto.precio_venta, 0));

    update public.productos set estado = 'vendida' where id = v_detalle.producto_id;

    insert into public.movimientos_inventario (producto_id, tipo, referencia)
    values (v_detalle.producto_id, 'venta', 'venta:' || v_venta_id);
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

-- Verificación: debe mostrar la moneda ya renombrada a GTQ.
select id, codigo, nombre, simbolo from public.monedas;
