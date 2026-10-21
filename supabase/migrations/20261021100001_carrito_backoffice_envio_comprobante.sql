-- ============================================================
-- ASTRO — Fase 1 del flujo carrito → pedido → logística.
--
-- 1) Carrito también desde el backoffice (usuario logueado): hasta
--    ahora carritos.link_id era NOT NULL y todo el carrito asumía un
--    link público. Un carrito backoffice pertenece a un usuario
--    (carritos.usuario_id) y no tiene link.
-- 2) Checkout unificado: datos de envío estructurados (destinatario,
--    departamento, ciudad, dirección, referencia, lat/lng del pin del
--    mapa) que quedan en el PEDIDO — es lo que logística necesita —
--    y comprobante de pago OBLIGATORIO al confirmar (antes se subía
--    después, solo desde /ventas).
-- 3) La lógica de reservar/quitar/confirmar se extrae a funciones
--    internas compartidas por el carrito público y el backoffice, para
--    no duplicarla.
-- 4) Corrige una regresión: pagos.monto volvía a quedar en el
--    subtotal sin descuento (se había corregido en 20260815100001 y
--    se perdió en redefiniciones posteriores).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Carritos backoffice
-- ------------------------------------------------------------
alter table public.carritos alter column link_id drop not null;
alter table public.carritos add column usuario_id bigint references public.usuarios (id);
alter table public.carritos add constraint carritos_link_o_usuario
  check (link_id is not null or usuario_id is not null);

create unique index carritos_un_abierto_por_usuario
  on public.carritos (usuario_id)
  where estado = 'abierto' and usuario_id is not null;

comment on column public.carritos.usuario_id is
  'Dueño de un carrito armado desde el backoffice (sin link). NULL para carritos de catálogo público por link.';

drop policy if exists sel_carritos on public.carritos;
create policy sel_carritos on public.carritos
  for select to authenticated
  using (
    public.fn_rol_actual() in ('admin','coordinador')
    or usuario_id = public.fn_usuario_id()
    or (usuario_id is not null and public.fn_es_mi_descendiente(usuario_id))
    or exists (
      select 1 from public.links_venta l
      where l.id = link_id
        and (l.vendedor_id = public.fn_usuario_id() or public.fn_es_mi_descendiente(l.vendedor_id))
    )
  );

drop policy if exists sel_carrito_detalles on public.carrito_detalles;
create policy sel_carrito_detalles on public.carrito_detalles
  for select to authenticated
  using (
    exists (
      select 1 from public.carritos c
      left join public.links_venta l on l.id = c.link_id
      where c.id = carrito_id
        and (
          public.fn_rol_actual() in ('admin','coordinador')
          or c.usuario_id = public.fn_usuario_id()
          or (c.usuario_id is not null and public.fn_es_mi_descendiente(c.usuario_id))
          or l.vendedor_id = public.fn_usuario_id()
          or (l.vendedor_id is not null and public.fn_es_mi_descendiente(l.vendedor_id))
        )
    )
  );

-- ------------------------------------------------------------
-- 2. Datos de envío en el pedido
-- ------------------------------------------------------------
alter table public.pedidos
  add column para_cliente boolean not null default true,
  add column nombre_destinatario text,
  add column telefono_destinatario text,
  add column departamento text,
  add column ciudad text,
  add column referencia_entrega text,
  add column latitud numeric(9,6) check (latitud is null or latitud between -90 and 90),
  add column longitud numeric(9,6) check (longitud is null or longitud between -180 and 180),
  add column comprador_id bigint references public.usuarios (id);

comment on column public.pedidos.comprador_id is
  'Usuario que armó el carrito desde el backoffice (compra propia o para un cliente). NULL en compras del catálogo público.';

-- ------------------------------------------------------------
-- 3. Helpers internos (no expuestos a anon/authenticated)
-- ------------------------------------------------------------

-- Reserva una línea en un carrito ya existente: pieza_unica → retenida;
-- por_cantidad → reserva en una bodega con stock y la recuerda.
create or replace function public.fn_carrito_reservar_linea(
  p_carrito_id bigint,
  p_producto_id bigint,
  p_cantidad int
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
  v_minutos numeric;
  v_tienda_id bigint;
begin
  if p_cantidad is null or p_cantidad < 1 then
    raise exception 'La cantidad debe ser al menos 1';
  end if;

  select * into v_producto from public.productos where id = p_producto_id for update;
  if not found or v_producto.estado not in ('disponible_cedi','disponible_tienda') then
    raise exception 'La pieza ya no está disponible';
  end if;
  if v_producto.modo_inventario = 'pieza_unica' and p_cantidad <> 1 then
    raise exception 'Esta pieza es única — no admite cantidad';
  end if;

  v_minutos := coalesce(public.fn_parametro('minutos_retencion_carrito')::numeric, 20);

  if v_producto.modo_inventario = 'pieza_unica' then
    if exists (select 1 from public.carrito_detalles where carrito_id = p_carrito_id and producto_id = p_producto_id) then
      return;
    end if;

    update public.productos set estado = 'retenida' where id = p_producto_id;

    insert into public.carrito_detalles (carrito_id, producto_id, cantidad, fecha_expiracion)
    values (p_carrito_id, p_producto_id, 1, now() + (v_minutos || ' minutes')::interval);
  else
    select tienda_id into v_tienda_id from public.carrito_detalles
      where carrito_id = p_carrito_id and producto_id = p_producto_id;

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
    values (p_carrito_id, p_producto_id, p_cantidad, now() + (v_minutos || ' minutes')::interval, v_tienda_id)
    on conflict (carrito_id, producto_id) do update
      set cantidad = public.carrito_detalles.cantidad + excluded.cantidad,
          fecha_expiracion = excluded.fecha_expiracion;
  end if;

  insert into public.movimientos_inventario (producto_id, tipo, referencia, cantidad)
  values (p_producto_id, 'retencion_carrito', 'carrito:' || p_carrito_id, p_cantidad);
end;
$$;

-- Quita una línea y libera lo reservado.
create or replace function public.fn_carrito_quitar_linea(p_carrito_id bigint, p_producto_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_detalle public.carrito_detalles%rowtype;
  v_producto public.productos%rowtype;
begin
  select * into v_detalle from public.carrito_detalles
    where carrito_id = p_carrito_id and producto_id = p_producto_id for update;
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

-- Confirma un carrito: venta + detalles + pago + comprobante + pedido
-- con datos de envío. Lo usan el carrito público y el backoffice.
--   p_cliente: {nombre, telefono, correo}
--   p_envio:   {para_cliente, nombre_destinatario, telefono_destinatario,
--               departamento, ciudad, direccion, referencia, latitud, longitud}
--   p_pago:    {metodo, referencia, banco_origen, fecha_pago,
--               monto_declarado, url_archivo}
create or replace function public.fn_confirmar_carrito_interno(
  p_carrito_id bigint,
  p_vendedor_id bigint,
  p_canal text,
  p_link_id bigint,
  p_comprador_id bigint,
  p_cliente jsonb,
  p_envio jsonb,
  p_pago jsonb
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_detalle record;
  v_producto public.productos%rowtype;
  v_reservada int;
  v_cliente_id bigint;
  v_venta_id bigint;
  v_pago_id bigint;
  v_subtotal numeric := 0;
  v_descuento_pct numeric;
  v_descuento_monto numeric;
  v_items int := 0;
  v_metodo text := p_pago->>'metodo';
  v_archivo text := nullif(btrim(coalesce(p_pago->>'url_archivo', '')), '');
  v_nombre text := nullif(btrim(coalesce(p_cliente->>'nombre', '')), '');
  v_direccion text := nullif(btrim(coalesce(p_envio->>'direccion', '')), '');
  v_ciudad text := nullif(btrim(coalesce(p_envio->>'ciudad', '')), '');
  v_tel_destino text := nullif(btrim(coalesce(p_envio->>'telefono_destinatario', p_cliente->>'telefono', '')), '');
  v_nombre_destino text := nullif(btrim(coalesce(p_envio->>'nombre_destinatario', p_cliente->>'nombre', '')), '');
begin
  if v_metodo is null or v_metodo not in ('transferencia','deposito') then
    raise exception 'El pago debe ser por transferencia o depósito';
  end if;
  if v_archivo is null then
    raise exception 'Adjunta el comprobante de pago para confirmar el pedido';
  end if;
  if v_nombre is null then
    raise exception 'El nombre del cliente es obligatorio';
  end if;
  if v_direccion is null or v_ciudad is null then
    raise exception 'Indica la dirección y la ciudad de envío';
  end if;
  if v_tel_destino is null then
    raise exception 'Indica un teléfono de contacto para la entrega';
  end if;

  for v_detalle in
    select * from public.carrito_detalles where carrito_id = p_carrito_id order by id
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

  v_cliente_id := public.fn_obtener_o_crear_cliente_vendedor(
    p_vendedor_id, v_nombre, p_cliente->>'telefono', p_cliente->>'correo');

  v_descuento_pct := public.fn_descuento_desempeno(p_vendedor_id);
  v_descuento_monto := round(v_subtotal * v_descuento_pct / 100, 2);

  insert into public.ventas (vendedor_id, cliente_id, canal, link_id, subtotal, descuento_desempeno, total, moneda_id)
  values (p_vendedor_id, v_cliente_id, p_canal, p_link_id, v_subtotal, v_descuento_monto,
          v_subtotal - v_descuento_monto, (select id from public.monedas where codigo = 'GTQ'))
  returning id into v_venta_id;

  for v_detalle in
    select * from public.carrito_detalles where carrito_id = p_carrito_id order by id
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
  values (v_venta_id, v_metodo, v_subtotal - v_descuento_monto, nullif(btrim(coalesce(p_pago->>'referencia', '')), ''))
  returning id into v_pago_id;

  insert into public.comprobantes
    (pago_id, url_archivo, numero_referencia, banco_origen, fecha_pago, monto_declarado, subido_por)
  values
    (v_pago_id, v_archivo,
     nullif(btrim(coalesce(p_pago->>'referencia', '')), ''),
     nullif(btrim(coalesce(p_pago->>'banco_origen', '')), ''),
     nullif(p_pago->>'fecha_pago', '')::date,
     nullif(p_pago->>'monto_declarado', '')::numeric,
     public.fn_usuario_id());

  insert into public.pedidos
    (venta_id, direccion_entrega, para_cliente, nombre_destinatario, telefono_destinatario,
     departamento, ciudad, referencia_entrega, latitud, longitud, comprador_id)
  values
    (v_venta_id, v_direccion,
     coalesce((p_envio->>'para_cliente')::boolean, true),
     v_nombre_destino, v_tel_destino,
     nullif(btrim(coalesce(p_envio->>'departamento', '')), ''),
     v_ciudad,
     nullif(btrim(coalesce(p_envio->>'referencia', '')), ''),
     nullif(p_envio->>'latitud', '')::numeric,
     nullif(p_envio->>'longitud', '')::numeric,
     p_comprador_id);

  update public.carritos
    set estado = 'confirmado', nombre_cliente = v_nombre, telefono = p_cliente->>'telefono',
        correo = p_cliente->>'correo', direccion = v_direccion
    where id = p_carrito_id;

  perform public.fn_calcular_puntos(v_venta_id);
  perform public.fn_calcular_comisiones(v_venta_id);

  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
  values (p_vendedor_id, 'pedido_creado', 'Pedido recibido',
          'Se registró un pedido con su comprobante de pago — queda en revisión por contabilidad.',
          '/pedidos');

  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
  select u.id, 'comprobante_por_revisar', 'Comprobante por revisar',
         'Hay un comprobante de pago nuevo esperando revisión.', '/contabilidad/comprobantes'
    from public.usuarios u
    join public.roles r on r.id = u.rol_id
   where r.nombre = 'contabilidad' and u.activo;

  return v_venta_id;
end;
$$;

revoke all on function public.fn_carrito_reservar_linea(bigint, bigint, int) from public, anon, authenticated;
revoke all on function public.fn_carrito_quitar_linea(bigint, bigint) from public, anon, authenticated;
revoke all on function public.fn_confirmar_carrito_interno(bigint, bigint, text, bigint, bigint, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. Carrito público (por link) — mismas firmas salvo confirmar
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
  v_carrito public.carritos%rowtype;
begin
  select * into v_link from public.links_venta where token = p_token;
  if not found or v_link.estado <> 'activo'
     or (v_link.fecha_vencimiento is not null and v_link.fecha_vencimiento < now()) then
    raise exception 'Enlace inválido o vencido';
  end if;

  if v_link.tipo <> 'catalogo'
     and not exists (select 1 from public.link_productos where link_id = v_link.id and producto_id = p_producto_id) then
    raise exception 'Esta pieza no forma parte del enlace';
  end if;

  if p_carrito_token is not null then
    select * into v_carrito from public.carritos
      where token = p_carrito_token and link_id = v_link.id and estado = 'abierto'
      for update;
  end if;

  if v_carrito.id is null then
    insert into public.carritos (link_id) values (v_link.id) returning * into v_carrito;
  end if;

  perform public.fn_carrito_reservar_linea(v_carrito.id, p_producto_id, p_cantidad);

  return v_carrito.token;
end;
$$;

grant execute on function public.fn_agregar_al_carrito(text, text, bigint, int) to anon, authenticated;

create or replace function public.fn_quitar_del_carrito(p_carrito_token text, p_producto_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_carrito public.carritos%rowtype;
begin
  select * into v_carrito from public.carritos where token = p_carrito_token and estado = 'abierto' for update;
  if not found then
    raise exception 'Carrito no encontrado';
  end if;
  perform public.fn_carrito_quitar_linea(v_carrito.id, p_producto_id);
end;
$$;

grant execute on function public.fn_quitar_del_carrito(text, bigint) to anon, authenticated;

-- Firma nueva: datos de cliente/envío/pago estructurados + comprobante
-- obligatorio. DROP explícito para no dejar la firma vieja como
-- sobrecarga.
drop function if exists public.fn_confirmar_carrito(text, text, text, text, text, text, text);

create or replace function public.fn_confirmar_carrito(
  p_carrito_token text,
  p_cliente jsonb,
  p_envio jsonb,
  p_pago jsonb
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_carrito public.carritos%rowtype;
  v_link public.links_venta%rowtype;
begin
  select * into v_carrito from public.carritos where token = p_carrito_token and estado = 'abierto' for update;
  if not found or v_carrito.link_id is null then
    raise exception 'Carrito no encontrado o ya confirmado';
  end if;

  select * into v_link from public.links_venta where id = v_carrito.link_id;

  return public.fn_confirmar_carrito_interno(
    v_carrito.id, v_link.vendedor_id, 'link', v_link.id, null, p_cliente, p_envio, p_pago);
end;
$$;

grant execute on function public.fn_confirmar_carrito(text, jsonb, jsonb, jsonb) to anon, authenticated;

-- ------------------------------------------------------------
-- 5. Carrito backoffice (usuario logueado)
-- ------------------------------------------------------------
create or replace function public.fn_mi_carrito_abierto(p_crear boolean default false)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;

  select id into v_id from public.carritos
    where usuario_id = public.fn_usuario_id() and estado = 'abierto'
    for update;

  if v_id is null and p_crear then
    insert into public.carritos (usuario_id) values (public.fn_usuario_id()) returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.fn_mi_carrito_abierto(boolean) from public, anon, authenticated;

create or replace function public.fn_agregar_a_mi_carrito(p_producto_id bigint, p_cantidad int default 1)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('catalogo', 'ver') then
    raise exception 'No tienes permiso para comprar desde el catálogo';
  end if;
  perform public.fn_carrito_reservar_linea(public.fn_mi_carrito_abierto(true), p_producto_id, p_cantidad);
end;
$$;

create or replace function public.fn_quitar_de_mi_carrito(p_producto_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint := public.fn_mi_carrito_abierto(false);
begin
  if v_id is null then
    raise exception 'No tienes un carrito abierto';
  end if;
  perform public.fn_carrito_quitar_linea(v_id, p_producto_id);
end;
$$;

create or replace function public.fn_ver_mi_carrito()
returns table (
  producto_id bigint, codigo text, nombre text, precio_venta numeric,
  imagen_principal text, segundos_restantes int,
  cantidad int, modo_inventario text, stock_disponible int
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if public.fn_usuario_id() is null then
    return;
  end if;
  select token into v_token from public.carritos
    where usuario_id = public.fn_usuario_id() and estado = 'abierto';
  if v_token is null then
    return;
  end if;
  return query select * from public.fn_ver_carrito(v_token);
end;
$$;

create or replace function public.fn_confirmar_mi_carrito(
  p_para_cliente boolean,
  p_cliente jsonb,
  p_envio jsonb,
  p_pago jsonb
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint := public.fn_mi_carrito_abierto(false);
  v_usuario public.usuarios%rowtype;
  v_cliente jsonb := p_cliente;
  v_canal text;
begin
  if v_id is null then
    raise exception 'No tienes un carrito abierto';
  end if;

  select * into v_usuario from public.usuarios where id = public.fn_usuario_id();

  -- Compra para sí mismo: el cliente es el propio usuario.
  if not coalesce(p_para_cliente, false) then
    v_cliente := jsonb_build_object('nombre', v_usuario.nombre, 'telefono', v_usuario.telefono, 'correo', v_usuario.correo);
  end if;

  v_canal := case public.fn_rol_actual()
    when 'tienda' then 'tienda'
    when 'asesor' then 'asesor'
    when 'embajador' then 'embajador'
    else 'asesor'
  end;

  return public.fn_confirmar_carrito_interno(
    v_id, v_usuario.id, v_canal, null, v_usuario.id, v_cliente,
    coalesce(p_envio, '{}'::jsonb) || jsonb_build_object('para_cliente', coalesce(p_para_cliente, false)),
    p_pago);
end;
$$;

grant execute on function public.fn_agregar_a_mi_carrito(bigint, int) to authenticated;
grant execute on function public.fn_quitar_de_mi_carrito(bigint) to authenticated;
grant execute on function public.fn_ver_mi_carrito() to authenticated;
grant execute on function public.fn_confirmar_mi_carrito(boolean, jsonb, jsonb, jsonb) to authenticated;
