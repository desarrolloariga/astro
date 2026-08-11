-- ============================================================
-- ARIGA — Migración 0011: RLS y funciones públicas del carrito
-- por link. Estas son las ÚNICAS funciones del esquema public
-- ejecutables por el rol `anon` (cliente final sin cuenta) —
-- ver el cierre de privilegios al final del archivo.
-- ============================================================

alter table public.links_venta enable row level security;
alter table public.link_productos enable row level security;
alter table public.carritos enable row level security;
alter table public.carrito_detalles enable row level security;

-- ------------------------------------------------------------
-- Links: el vendedor ve y gestiona los suyos; admin/coordinador
-- ven todos. Sin acceso directo para anon (solo vía RPC).
-- ------------------------------------------------------------
create policy sel_links_venta on public.links_venta
  for select to authenticated
  using (
    public.fn_rol_actual() in ('admin','coordinador')
    or vendedor_id = public.fn_usuario_id()
    or public.fn_es_mi_descendiente(vendedor_id)
  );

create policy sel_link_productos on public.link_productos
  for select to authenticated
  using (
    exists (
      select 1 from public.links_venta l
      where l.id = link_id
        and (
          public.fn_rol_actual() in ('admin','coordinador')
          or l.vendedor_id = public.fn_usuario_id()
          or public.fn_es_mi_descendiente(l.vendedor_id)
        )
    )
  );

-- ------------------------------------------------------------
-- Carritos: visibles para el vendedor dueño del link (+ su cadena)
-- y admin/coordinador. El cliente final los opera por RPC con su
-- propio token, nunca por SELECT/INSERT directo.
-- ------------------------------------------------------------
create policy sel_carritos on public.carritos
  for select to authenticated
  using (
    public.fn_rol_actual() in ('admin','coordinador')
    or exists (
      select 1 from public.links_venta l
      where l.id = link_id
        and (l.vendedor_id = public.fn_usuario_id() or public.fn_es_mi_descendiente(l.vendedor_id))
    )
  );

create policy sel_carrito_detalles on public.carrito_detalles
  for select to authenticated
  using (
    exists (
      select 1 from public.carritos c join public.links_venta l on l.id = c.link_id
      where c.id = carrito_id
        and (
          public.fn_rol_actual() in ('admin','coordinador')
          or l.vendedor_id = public.fn_usuario_id()
          or public.fn_es_mi_descendiente(l.vendedor_id)
        )
    )
  );

-- ============================================================
-- Generar un enlace de venta (autenticado: tienda/asesor/embajador/admin)
-- ============================================================
create or replace function public.fn_crear_link_venta(
  p_tipo text,
  p_producto_ids bigint[] default null
)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_link_id bigint;
  v_token text;
  v_dias numeric;
  v_id bigint;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
  end if;
  if public.fn_rol_actual() not in ('tienda','asesor','embajador','admin') then
    raise exception 'Tu rol no puede generar enlaces de venta';
  end if;
  if p_tipo not in ('catalogo','subconjunto','pieza') then
    raise exception 'Tipo de enlace inválido';
  end if;
  if p_tipo in ('subconjunto','pieza')
     and (p_producto_ids is null or array_length(p_producto_ids, 1) is null) then
    raise exception 'Selecciona al menos una pieza para este tipo de enlace';
  end if;
  if p_tipo = 'pieza' and array_length(p_producto_ids, 1) <> 1 then
    raise exception 'Un enlace de pieza única solo admite una pieza';
  end if;

  v_dias := coalesce(public.fn_parametro('dias_vigencia_link')::numeric, 7);

  insert into public.links_venta (vendedor_id, tipo, fecha_vencimiento)
  values (public.fn_usuario_id(), p_tipo, now() + (v_dias || ' days')::interval)
  returning id, token into v_link_id, v_token;

  if p_producto_ids is not null then
    foreach v_id in array p_producto_ids loop
      insert into public.link_productos (link_id, producto_id) values (v_link_id, v_id);
    end loop;
  end if;

  return v_token;
end;
$$;

-- ============================================================
-- Utilidad: cliente atribuido a un vendedor concreto (para el
-- flujo público, donde no hay fn_usuario_id() por ser anon)
-- ============================================================
create or replace function public.fn_obtener_o_crear_cliente_vendedor(
  p_vendedor_id bigint,
  p_nombre text,
  p_telefono text,
  p_correo text default null
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_cliente_id bigint;
begin
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre del cliente es obligatorio';
  end if;

  if p_telefono is not null and btrim(p_telefono) <> '' then
    select id into v_cliente_id
      from public.clientes
      where vendedor_id = p_vendedor_id and telefono = p_telefono
      limit 1;
  end if;

  if v_cliente_id is null then
    insert into public.clientes (nombre, telefono, correo, vendedor_id)
    values (btrim(p_nombre), nullif(btrim(p_telefono), ''), nullif(btrim(p_correo), ''), p_vendedor_id)
    returning id into v_cliente_id;
  end if;

  return v_cliente_id;
end;
$$;

-- ============================================================
-- Funciones públicas (rol anon) — cada una valida el token del
-- link y/o del carrito por sí misma; ninguna confía en auth.uid().
-- ============================================================

-- Info del enlace + incrementa el contador de visitas (una vez por carga de página)
create or replace function public.fn_link_info(p_token text)
returns table (vendedor_nombre text, tipo text, vigente boolean)
language plpgsql security definer
set search_path = public
as $$
declare
  v_link public.links_venta%rowtype;
begin
  select * into v_link from public.links_venta where token = p_token;

  if not found or v_link.estado <> 'activo'
     or (v_link.fecha_vencimiento is not null and v_link.fecha_vencimiento < now()) then
    return query select null::text, null::text, false;
    return;
  end if;

  update public.links_venta set contador_visitas = contador_visitas + 1 where id = v_link.id;

  return query
    select u.nombre, v_link.tipo, true
    from public.usuarios u where u.id = v_link.vendedor_id;
end;
$$;

-- Piezas visibles a través del enlace (sin costos, como vw_catalogo)
create or replace function public.fn_catalogo_por_token(p_token text)
returns table (
  id bigint, codigo text, nombre text, descripcion text,
  categoria text, material text, peso_gramos numeric, kilataje text, piedras text,
  precio_venta numeric, imagen_principal text, imagenes jsonb
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
      c.nombre, m.nombre, p.peso_gramos, p.kilataje, p.piedras, p.precio_venta,
      (select i.url from public.producto_imagenes i
         where i.producto_id = p.id order by i.es_principal desc, i.orden asc limit 1),
      (select coalesce(jsonb_agg(jsonb_build_object('url', i.url, 'orden', i.orden) order by i.orden), '[]'::jsonb)
         from public.producto_imagenes i where i.producto_id = p.id)
    from public.productos p
    left join public.categorias c on c.id = p.categoria_id
    left join public.materiales m on m.id = p.material_id
    where p.activo
      and p.estado in ('disponible_cedi','disponible_tienda')
      and (
        v_link.tipo = 'catalogo'
        or exists (select 1 from public.link_productos lp
                   where lp.link_id = v_link.id and lp.producto_id = p.id)
      );
end;
$$;

-- Agrega una pieza al carrito (crea el carrito si no existe uno válido)
create or replace function public.fn_agregar_al_carrito(
  p_token text,
  p_carrito_token text,
  p_producto_id bigint
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

  if p_carrito_token is not null then
    select * into v_carrito from public.carritos
      where token = p_carrito_token and link_id = v_link.id and estado = 'abierto'
      for update;
  end if;

  if v_carrito.id is null then
    insert into public.carritos (link_id) values (v_link.id) returning * into v_carrito;
  end if;

  if exists (select 1 from public.carrito_detalles where carrito_id = v_carrito.id and producto_id = p_producto_id) then
    return v_carrito.token;
  end if;

  v_minutos := coalesce(public.fn_parametro('minutos_retencion_carrito')::numeric, 20);

  update public.productos set estado = 'retenida' where id = p_producto_id;

  insert into public.carrito_detalles (carrito_id, producto_id, fecha_expiracion)
  values (v_carrito.id, p_producto_id, now() + (v_minutos || ' minutes')::interval);

  insert into public.movimientos_inventario (producto_id, tipo, referencia)
  values (p_producto_id, 'retencion_carrito', 'carrito:' || v_carrito.id);

  return v_carrito.token;
end;
$$;

-- Quita una pieza del carrito y la libera de inmediato
create or replace function public.fn_quitar_del_carrito(p_carrito_token text, p_producto_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_carrito public.carritos%rowtype;
  v_detalle public.carrito_detalles%rowtype;
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

  perform public.fn_devolver_disponibilidad(p_producto_id);
  delete from public.carrito_detalles where id = v_detalle.id;

  insert into public.movimientos_inventario (producto_id, tipo, referencia)
  values (p_producto_id, 'liberacion', 'quitada del carrito');
end;
$$;

-- Contenido del carrito con el tiempo de retención restante (segundos)
create or replace function public.fn_ver_carrito(p_carrito_token text)
returns table (
  producto_id bigint, codigo text, nombre text, precio_venta numeric,
  imagen_principal text, segundos_restantes int
)
language plpgsql security definer
set search_path = public
as $$
begin
  return query
    select
      p.id, p.codigo, p.nombre, p.precio_venta,
      (select i.url from public.producto_imagenes i
         where i.producto_id = p.id order by i.es_principal desc, i.orden asc limit 1),
      greatest(0, extract(epoch from (cd.fecha_expiracion - now()))::int)
    from public.carrito_detalles cd
    join public.productos p on p.id = cd.producto_id
    join public.carritos c on c.id = cd.carrito_id
    where c.token = p_carrito_token
    order by cd.fecha_creacion;
end;
$$;

-- Confirma el carrito: crea la venta atribuida al vendedor del enlace
-- (pago manual: transferencia o depósito, con comprobante posterior)
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

  insert into public.ventas (vendedor_id, cliente_id, canal, link_id, subtotal, total, moneda_id)
  values (v_link.vendedor_id, v_cliente_id, 'link', v_link.id, v_subtotal, v_subtotal,
          (select id from public.monedas where codigo = 'MXN'))
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

  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
  values (v_link.vendedor_id, 'venta_confirmada', 'Venta por enlace confirmada',
          'Se registró una venta por tu enlace. Sube o espera el comprobante para aprobarla.',
          '/ventas');

  return v_venta_id;
end;
$$;

-- ============================================================
-- Job pg_cron: libera piezas retenidas cuya ventana venció sin
-- confirmarse la compra (cada 2 minutos)
-- ============================================================
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
    select cd.id, cd.producto_id
      from public.carrito_detalles cd
      join public.carritos c on c.id = cd.carrito_id
      where c.estado = 'abierto' and cd.fecha_expiracion < now()
  loop
    select * into v_producto from public.productos where id = v_detalle.producto_id for update;

    if v_producto.estado = 'retenida' then
      perform public.fn_devolver_disponibilidad(v_detalle.producto_id);
      insert into public.movimientos_inventario (producto_id, tipo, referencia)
      values (v_detalle.producto_id, 'liberacion', 'retención de carrito vencida');
    end if;

    delete from public.carrito_detalles where id = v_detalle.id;
  end loop;
end;
$$;

select cron.schedule(
  'ariga_liberar_carrito_items_vencidos', '*/2 * * * *',
  $$select public.fn_liberar_carrito_items_vencidos();$$
);

-- Marca como vencidos los enlaces cuya fecha_vencimiento ya pasó
-- (cosmético para las listas del vendedor; la validación real de
-- vigencia ya la hacen todas las funciones públicas por sí mismas)
create or replace function public.fn_vencer_links()
returns void
language sql security definer
set search_path = public
as $$
  update public.links_venta
    set estado = 'vencido'
    where estado = 'activo' and fecha_vencimiento is not null and fecha_vencimiento < now();
$$;

select cron.schedule(
  'ariga_vencer_links', '0 * * * *',
  $$select public.fn_vencer_links();$$
);

-- ============================================================
-- Cierre de privilegios de esta migración: las funciones públicas
-- del carrito son las ÚNICAS a las que anon tiene EXECUTE.
-- ============================================================
grant execute on function public.fn_link_info(text) to anon, authenticated;
grant execute on function public.fn_catalogo_por_token(text) to anon, authenticated;
grant execute on function public.fn_agregar_al_carrito(text, text, bigint) to anon, authenticated;
grant execute on function public.fn_quitar_del_carrito(text, bigint) to anon, authenticated;
grant execute on function public.fn_ver_carrito(text) to anon, authenticated;
grant execute on function public.fn_confirmar_carrito(text, text, text, text, text, text, text) to anon, authenticated;
