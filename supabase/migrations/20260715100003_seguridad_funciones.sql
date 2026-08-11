-- ============================================================
-- ARIGA — Migración 0009: corrección de seguridad en funciones RPC
--
-- Bug encontrado: `if public.fn_rol_actual() not in (...) then raise
-- exception` NUNCA se dispara cuando fn_rol_actual() devuelve NULL
-- (usuario autenticado en Supabase pero sin fila en public.usuarios —
-- p. ej. una cuenta del otro sistema que comparte este proyecto),
-- porque en SQL `NULL not in (...)` se evalúa como NULL, no TRUE, y
-- `if NULL then ...` no ejecuta la rama. Esto permitía que cualquier
-- usuario autenticado (de CUALQUIER app del proyecto compartido)
-- ejecutara estas funciones saltándose la validación de rol.
--
-- Corrección en dos capas (defensa en profundidad):
--   1) fn_rol_actual() ahora devuelve 'sin_rol' en vez de NULL, así
--      "not in (...)" siempre evalúa a TRUE/FALSE de forma segura.
--   2) Cada función que requiere sesión ARIGA agrega una guarda
--      explícita `if public.fn_usuario_id() is null then raise
--      exception ...` como primera línea — necesaria además del
--      punto 1 porque varias funciones comparan fn_usuario_id()
--      directamente (p. ej. `vendedor_id <> public.fn_usuario_id()`),
--      comparación que también es NULL-insegura.
--   3) Se revoca EXECUTE de PUBLIC (por lo tanto de `anon`) sobre
--      todas las funciones del esquema, presentes y futuras; se
--      re-otorga explícitamente a `authenticated`/`service_role`.
--      Las funciones que la fase 4 expondrá al cliente final
--      (anónimo, vía link) recibirán su propio GRANT explícito.
-- ============================================================

create or replace function public.fn_rol_actual()
returns text
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select r.nombre
       from public.usuarios u
       join public.roles r on r.id = u.rol_id
       where u.auth_uid = auth.uid() and u.activo),
    'sin_rol'
  );
$$;

-- ------------------------------------------------------------
-- fn_publicar_producto
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
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
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
-- fn_crear_transferencia
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
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
  end if;
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
-- fn_confirmar_recepcion
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
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
  end if;

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

-- ------------------------------------------------------------
-- fn_separar_pieza
-- ------------------------------------------------------------
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
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
  end if;
  if public.fn_rol_actual() not in ('tienda','asesor','embajador','admin') then
    raise exception 'Tu rol no puede separar piezas';
  end if;

  select * into v_producto from public.productos where id = p_producto_id for update;

  if not found then
    raise exception 'La pieza no existe';
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
-- fn_liberar_separado
-- ------------------------------------------------------------
create or replace function public.fn_liberar_separado(
  p_separado_id bigint,
  p_motivo text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_separado public.separados%rowtype;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
  end if;

  select * into v_separado from public.separados where id = p_separado_id for update;

  if not found then
    raise exception 'El separado no existe';
  end if;
  if v_separado.estado <> 'activo' then
    raise exception 'Este separado ya no está activo (estado: %)', v_separado.estado;
  end if;
  if v_separado.vendedor_id <> public.fn_usuario_id() and public.fn_rol_actual() <> 'admin' then
    raise exception 'Solo el vendedor que separó la pieza (o admin) puede liberarla';
  end if;

  update public.separados set estado = 'liberado' where id = p_separado_id;
  perform public.fn_devolver_disponibilidad(v_separado.producto_id);

  insert into public.movimientos_inventario (producto_id, tipo, usuario_id, referencia)
  values (v_separado.producto_id, 'liberacion', public.fn_usuario_id(),
          coalesce('manual: ' || p_motivo, 'liberación manual'));
end;
$$;

-- ------------------------------------------------------------
-- fn_registrar_venta
-- ------------------------------------------------------------
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
  v_canal text;
  v_tienda_id bigint;
  v_id bigint;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
  end if;
  if public.fn_rol_actual() not in ('tienda','asesor','embajador','admin') then
    raise exception 'Tu rol no puede registrar ventas';
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

  insert into public.ventas
    (vendedor_id, tienda_id, cliente_id, canal, subtotal, total, moneda_id, separado_id)
  values
    (public.fn_usuario_id(), v_tienda_id, v_cliente_id, v_canal, v_subtotal, v_subtotal,
     (select id from public.monedas where codigo = 'MXN'), p_separado_id)
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

  return v_venta_id;
end;
$$;

-- ------------------------------------------------------------
-- fn_anular_venta
-- ------------------------------------------------------------
create or replace function public.fn_anular_venta(p_venta_id bigint, p_motivo text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_venta public.ventas%rowtype;
  v_detalle record;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
  end if;
  if public.fn_rol_actual() <> 'admin' then
    raise exception 'Solo administración puede anular ventas';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'La anulación requiere un motivo';
  end if;

  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'La venta no existe';
  end if;
  if v_venta.estado = 'anulada' then
    raise exception 'La venta ya está anulada';
  end if;

  for v_detalle in
    select * from public.venta_detalles where venta_id = p_venta_id
  loop
    perform public.fn_devolver_disponibilidad(v_detalle.producto_id);
    insert into public.movimientos_inventario (producto_id, tipo, usuario_id, referencia)
    values (v_detalle.producto_id, 'devolucion', public.fn_usuario_id(),
            'anulación venta ' || p_venta_id || ': ' || p_motivo);
  end loop;

  update public.ventas set estado = 'anulada' where id = p_venta_id;
end;
$$;

-- ------------------------------------------------------------
-- fn_revisar_comprobante
-- ------------------------------------------------------------
create or replace function public.fn_revisar_comprobante(
  p_comprobante_id bigint,
  p_aprobado boolean,
  p_comentario text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_comprobante public.comprobantes%rowtype;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
  end if;
  if public.fn_rol_actual() not in ('contabilidad','admin') then
    raise exception 'Solo contabilidad puede revisar comprobantes';
  end if;

  select * into v_comprobante from public.comprobantes where id = p_comprobante_id for update;
  if not found then
    raise exception 'El comprobante no existe';
  end if;
  if v_comprobante.estado <> 'pendiente' then
    raise exception 'Este comprobante ya fue revisado';
  end if;

  update public.comprobantes
    set estado = case when p_aprobado then 'aprobado' else 'rechazado' end,
        revisado_por = public.fn_usuario_id(),
        comentario = p_comentario,
        fecha_revision = now()
    where id = p_comprobante_id;

  update public.pagos
    set estado = case when p_aprobado then 'confirmado' else 'rechazado' end
    where id = v_comprobante.pago_id;

  if p_aprobado then
    update public.ventas
      set estado = 'pagada'
      where id = (select venta_id from public.pagos where id = v_comprobante.pago_id);
  end if;

  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
  select v.vendedor_id,
         case when p_aprobado then 'comprobante_aprobado' else 'comprobante_rechazado' end,
         case when p_aprobado then 'Comprobante aprobado' else 'Comprobante rechazado' end,
         'Tu comprobante de la venta #' || v.id ||
           case when p_aprobado then ' fue aprobado.' else ' fue rechazado: ' || coalesce(p_comentario, '') end,
         '/ventas'
    from public.pagos p join public.ventas v on v.id = p.venta_id
    where p.id = v_comprobante.pago_id;
end;
$$;

-- ------------------------------------------------------------
-- fn_avanzar_pedido
-- ------------------------------------------------------------
create or replace function public.fn_avanzar_pedido(p_pedido_id bigint, p_nuevo_estado text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_venta public.ventas%rowtype;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
  end if;
  if p_nuevo_estado not in ('despachado','entregado') then
    raise exception 'Estado de pedido inválido';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe';
  end if;

  select * into v_venta from public.ventas where id = v_pedido.venta_id;

  if public.fn_rol_actual() not in ('admin','coordinador','tienda')
     and v_venta.vendedor_id <> public.fn_usuario_id() then
    raise exception 'No tienes permiso sobre este pedido';
  end if;

  if p_nuevo_estado = 'despachado' and v_pedido.estado <> 'en_espera' then
    raise exception 'Solo se despacha un pedido en espera (actual: %)', v_pedido.estado;
  end if;
  if p_nuevo_estado = 'entregado' and v_pedido.estado <> 'despachado' then
    raise exception 'Solo se confirma entrega de un pedido despachado (actual: %)', v_pedido.estado;
  end if;

  update public.pedidos
    set estado = p_nuevo_estado,
        fecha_despacho = case when p_nuevo_estado = 'despachado' then now() else fecha_despacho end,
        fecha_entrega = case when p_nuevo_estado = 'entregado' then now() else fecha_entrega end,
        confirmado_por = public.fn_usuario_id()
    where id = p_pedido_id;
end;
$$;

-- ============================================================
-- Cierre de privilegios: nadie ejecuta funciones de ARIGA por
-- ser PUBLIC/anon salvo lo explícitamente otorgado.
-- ============================================================
revoke execute on all functions in schema public from public;
alter default privileges in schema public revoke execute on functions from public;

grant execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public grant execute on functions to authenticated, service_role;
