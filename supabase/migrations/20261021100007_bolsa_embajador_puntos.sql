-- ============================================================
-- ASTRO — Bolsa del embajador + puntos 1 Q = 1 punto.
--
-- BOLSA: saldo de comisión acumulada del embajador, redimible en
-- productos.
--   - Abono: cuando el pago de una venta queda aprobado (venta pasa a
--     "pagada"), el vendedor embajador recibe en su bolsa la comisión
--     de esa venta = precio cobrado − precio embajador, línea por
--     línea (precio × c% / (100 + c%), con el % de comisión de cada
--     pieza), menos el descuento personal que haya dado
--     (ventas.descuento_embajador). Sus compras propias a precio
--     embajador no abonan.
--   - Redención: al comprar "para mí" en el backoffice puede pagar con
--     la bolsa. Si el saldo cubre todo, la venta queda pagada y el
--     pedido pasa directo a logística (sin comprobante ni aprobación).
--     Si no alcanza, se usa todo el saldo y el resto se paga con
--     transferencia/depósito + comprobante, que sí pasa por
--     contabilidad (pago mixto).
--   - Reverso: si una venta se anula, se revierte su abono y/o la
--     redención que pagó.
--   - "En espera": comisión de ventas aún sin pago aprobado (solo se
--     muestra; no se puede gastar).
--
-- PUNTOS: 1 quetzal = 1 punto sobre el total de las ventas a
-- clientes (directas y por enlaces), cuando se aprueba el pago. Las
-- compras propias a precio embajador no suman.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Movimientos de la bolsa
-- ------------------------------------------------------------
create table public.movimientos_bolsa (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references public.usuarios (id),
  tipo text not null check (tipo in ('abono', 'redencion', 'reverso', 'ajuste')),
  monto numeric(12,2) not null,           -- + entra a la bolsa, − sale
  venta_id bigint references public.ventas (id),
  comentario text,
  creado_por bigint references public.usuarios (id),
  fecha timestamptz not null default now()
);

create index idx_movimientos_bolsa_usuario on public.movimientos_bolsa (usuario_id, fecha desc);
create unique index uq_movimientos_bolsa_abono on public.movimientos_bolsa (venta_id) where tipo = 'abono';

alter table public.movimientos_bolsa enable row level security;

create policy sel_movimientos_bolsa on public.movimientos_bolsa
  for select to authenticated
  using (
    usuario_id = public.fn_usuario_id()
    or public.fn_rol_actual() in ('admin', 'coordinador', 'contabilidad')
    or public.fn_es_mi_descendiente(usuario_id)
  );

grant select on public.movimientos_bolsa to authenticated;

create trigger trg_auditar_movimientos_bolsa
  after insert or update or delete on public.movimientos_bolsa
  for each row execute function public.fn_auditar();

-- ------------------------------------------------------------
-- 2. Pago con bolsa como método de pago
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.pagos'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%metodo%'
  loop
    execute format('alter table public.pagos drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.pagos add constraint pagos_metodo_check
  check (metodo in ('tarjeta', 'transferencia', 'deposito', 'pasarela', 'bolsa'));

-- ------------------------------------------------------------
-- 3. Cálculos
-- ------------------------------------------------------------
-- % de comisión de embajador de una pieza: el usado en su último
-- cálculo de precio; si nunca pasó por el motor, el parámetro vigente.
create or replace function public.fn_pct_comision_embajador(p_producto_id bigint)
returns numeric
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
  v_pct numeric;
begin
  select h.factor_comision_pct into v_pct
    from public.producto_precio_historial h
    where h.producto_id = p_producto_id
    order by h.id desc
    limit 1;
  if v_pct is null then
    select * into v_producto from public.productos where id = p_producto_id;
    if found then
      v_pct := public.fn_buscar_parametro_precio(
        'factor_comision_embajador', v_producto.categoria_id, v_producto.id, now(), v_producto.nivel_ganancia);
    end if;
  end if;
  return greatest(coalesce(v_pct, 0), 0);
end;
$$;

revoke all on function public.fn_pct_comision_embajador(bigint) from public, anon, authenticated;

-- Comisión de bolsa de una venta (precio cobrado − precio embajador).
create or replace function public.fn_comision_bolsa_venta(p_venta_id bigint)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select greatest(
    0,
    round(
      coalesce((
        select sum(vd.precio * vd.cantidad * c.pct / (100 + c.pct))
        from public.venta_detalles vd
        cross join lateral (select public.fn_pct_comision_embajador(vd.producto_id) as pct) c
        where vd.venta_id = v.id
      ), 0) - coalesce(v.descuento_embajador, 0),
      2)
  )
  from public.ventas v
  where v.id = p_venta_id;
$$;

revoke all on function public.fn_comision_bolsa_venta(bigint) from public, anon, authenticated;

create or replace function public.fn_saldo_bolsa(p_usuario_id bigint)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select coalesce(sum(monto), 0) from public.movimientos_bolsa where usuario_id = p_usuario_id;
$$;

revoke all on function public.fn_saldo_bolsa(bigint) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. Abono y reverso
-- ------------------------------------------------------------
create or replace function public.fn_abonar_bolsa(p_venta_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_venta public.ventas%rowtype;
  v_monto numeric;
begin
  select * into v_venta from public.ventas where id = p_venta_id;
  if not found or v_venta.estado <> 'pagada' or coalesce(v_venta.precio_embajador, false) then
    return;
  end if;
  if not exists (
    select 1 from public.usuarios u join public.roles r on r.id = u.rol_id
    where u.id = v_venta.vendedor_id and r.nombre = 'embajador'
  ) then
    return;
  end if;
  if exists (select 1 from public.movimientos_bolsa where venta_id = p_venta_id and tipo = 'abono') then
    return;
  end if;

  v_monto := public.fn_comision_bolsa_venta(p_venta_id);
  if v_monto <= 0 then
    return;
  end if;

  insert into public.movimientos_bolsa (usuario_id, tipo, monto, venta_id, comentario)
  values (v_venta.vendedor_id, 'abono', v_monto, p_venta_id, 'Comisión de la venta #' || p_venta_id);

  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
  values (v_venta.vendedor_id, 'bolsa_abono', 'Sumaste a tu bolsa',
          'Se aprobó el pago de la venta #' || p_venta_id || ' y se abonaron Q ' || to_char(v_monto, 'FM999G999G990D00')
            || ' a tu bolsa.',
          '/red');
end;
$$;

revoke all on function public.fn_abonar_bolsa(bigint) from public, anon, authenticated;

create or replace function public.fn_revertir_bolsa(p_venta_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
begin
  -- Un reverso por cada abono/redención de la venta que aún no tenga el suyo.
  for r in
    select m.* from public.movimientos_bolsa m
    where m.venta_id = p_venta_id and m.tipo in ('abono', 'redencion')
      and not exists (
        select 1 from public.movimientos_bolsa x
        where x.venta_id = p_venta_id and x.tipo = 'reverso' and x.usuario_id = m.usuario_id
          and x.comentario like '%' || m.tipo || '%'
      )
  loop
    insert into public.movimientos_bolsa (usuario_id, tipo, monto, venta_id, comentario, creado_por)
    values (r.usuario_id, 'reverso', -r.monto, p_venta_id,
            'Venta #' || p_venta_id || ' anulada — reverso de ' || r.tipo, public.fn_usuario_id());
  end loop;
end;
$$;

revoke all on function public.fn_revertir_bolsa(bigint) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5. Puntos: 1 Q = 1 punto, solo con el pago aprobado
-- ------------------------------------------------------------
insert into public.reglas_puntaje (nombre, tipo, condiciones, valor)
select 'Puntos por venta — 1 Q = 1 punto', 'por_monto', '{"por_cada": 1}'::jsonb, 1
where not exists (select 1 from public.reglas_puntaje where nombre = 'Puntos por venta — 1 Q = 1 punto');

-- Misma firma. Antes se llamaba al crear la venta; ahora solo otorga
-- cuando la venta ya está pagada (se dispara desde el trigger de abajo)
-- y nunca dos veces por la misma venta.
create or replace function public.fn_calcular_puntos(p_venta_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_venta public.ventas%rowtype;
  v_periodo_id bigint;
  v_regla record;
  v_puntos numeric;
begin
  select * into v_venta from public.ventas where id = p_venta_id;
  if not found or v_venta.estado <> 'pagada' or coalesce(v_venta.precio_embajador, false) then
    return;
  end if;
  if exists (select 1 from public.puntos where venta_id = p_venta_id) then
    return;
  end if;

  v_periodo_id := public.fn_obtener_periodo_actual();

  for v_regla in
    select * from public.reglas_puntaje
      where activo
        and (vigencia_inicio is null or vigencia_inicio <= v_venta.fecha_creacion)
        and (vigencia_fin is null or vigencia_fin >= v_venta.fecha_creacion)
  loop
    v_puntos := public.fn_calcular_puntos_regla(
      v_regla.tipo, v_regla.valor, v_regla.multiplicador, v_regla.condiciones, p_venta_id);

    if v_puntos <> 0 then
      insert into public.puntos (usuario_id, venta_id, regla_id, regla_version, periodo_id, cantidad, motivo)
      values (v_venta.vendedor_id, p_venta_id, v_regla.id, v_regla.version, v_periodo_id, v_puntos, v_regla.nombre);
    end if;
  end loop;

  perform public.fn_actualizar_nivel(v_venta.vendedor_id, v_periodo_id);
  perform public.fn_evaluar_insignias(v_venta.vendedor_id, v_periodo_id);
end;
$$;

-- ------------------------------------------------------------
-- 6. Trigger: pago aprobado → bolsa + puntos; anulada → reversos
-- ------------------------------------------------------------
create or replace function public.fn_trg_venta_bolsa_puntos()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.estado = 'pagada' and old.estado is distinct from 'pagada' then
    perform public.fn_abonar_bolsa(new.id);
    perform public.fn_calcular_puntos(new.id);
  elsif new.estado = 'anulada' and old.estado is distinct from 'anulada' then
    perform public.fn_revertir_bolsa(new.id);
    delete from public.puntos where venta_id = new.id;
  end if;
  return new;
end;
$$;

create trigger trg_venta_bolsa_puntos
  after update of estado on public.ventas
  for each row execute function public.fn_trg_venta_bolsa_puntos();

-- ------------------------------------------------------------
-- 7. fn_confirmar_carrito_interno — nuevo parámetro p_usar_bolsa
-- (DROP: cambia la lista de argumentos; quien la llama sin él sigue
-- funcionando con el default false)
-- ------------------------------------------------------------
drop function if exists public.fn_confirmar_carrito_interno(bigint, bigint, text, bigint, bigint, jsonb, jsonb, jsonb, boolean);

create or replace function public.fn_confirmar_carrito_interno(
  p_carrito_id bigint,
  p_vendedor_id bigint,
  p_canal text,
  p_link_id bigint,
  p_comprador_id bigint,
  p_cliente jsonb,
  p_envio jsonb,
  p_pago jsonb,
  p_precio_embajador boolean default false,
  p_usar_bolsa boolean default false
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
  v_total numeric;
  v_bolsa numeric := 0;
  v_restante numeric;
  v_pedido_id bigint;
  v_nombre_destino text := nullif(btrim(coalesce(p_envio->>'nombre_destinatario', p_cliente->>'nombre', '')), '');
begin
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

    v_subtotal := v_subtotal + public.fn_precio_linea(v_producto.id, p_precio_embajador) * v_detalle.cantidad;
    v_items := v_items + 1;
  end loop;

  if v_items = 0 then
    raise exception 'El carrito está vacío';
  end if;

  v_cliente_id := public.fn_obtener_o_crear_cliente_vendedor(
    p_vendedor_id, v_nombre, p_cliente->>'telefono', p_cliente->>'correo');

  v_descuento_pct := public.fn_descuento_desempeno(p_vendedor_id);
  v_descuento_monto := round(v_subtotal * v_descuento_pct / 100, 2);
  v_total := v_subtotal - v_descuento_monto;

  -- Bolsa: se usa todo el saldo disponible hasta cubrir el total; el
  -- bloqueo sobre el usuario evita gastar el mismo saldo dos veces.
  if coalesce(p_usar_bolsa, false) and p_comprador_id is not null then
    perform 1 from public.usuarios where id = p_comprador_id for update;
    v_bolsa := least(greatest(public.fn_saldo_bolsa(p_comprador_id), 0), v_total);
  end if;
  v_restante := v_total - v_bolsa;

  if v_restante > 0 then
    if v_metodo is null or v_metodo not in ('transferencia','deposito') then
      raise exception 'El pago debe ser por transferencia o depósito';
    end if;
    if v_archivo is null then
      raise exception 'Adjunta el comprobante de pago para confirmar el pedido';
    end if;
  end if;

  insert into public.ventas (vendedor_id, cliente_id, canal, link_id, subtotal, descuento_desempeno, total, moneda_id, precio_embajador, estado)
  values (p_vendedor_id, v_cliente_id, p_canal, p_link_id, v_subtotal, v_descuento_monto,
          v_total, (select id from public.monedas where codigo = 'GTQ'), coalesce(p_precio_embajador, false),
          case when v_restante = 0 then 'pagada' else 'registrada' end)
  returning id into v_venta_id;

  for v_detalle in
    select * from public.carrito_detalles where carrito_id = p_carrito_id order by id
  loop
    select * into v_producto from public.productos where id = v_detalle.producto_id;

    insert into public.venta_detalles (venta_id, producto_id, precio, cantidad)
    values (v_venta_id, v_detalle.producto_id, public.fn_precio_linea(v_producto.id, p_precio_embajador), v_detalle.cantidad);

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

  if v_bolsa > 0 then
    insert into public.pagos (venta_id, metodo, monto, referencia, estado)
    values (v_venta_id, 'bolsa', v_bolsa, 'Saldo de bolsa', 'confirmado');

    insert into public.movimientos_bolsa (usuario_id, tipo, monto, venta_id, comentario, creado_por)
    values (p_comprador_id, 'redencion', -v_bolsa, v_venta_id, 'Compra #' || v_venta_id || ' pagada con bolsa', public.fn_usuario_id());
  end if;

  if v_restante > 0 then
    insert into public.pagos (venta_id, metodo, monto, referencia)
    values (v_venta_id, v_metodo, v_restante, nullif(btrim(coalesce(p_pago->>'referencia', '')), ''))
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
  end if;

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
     p_comprador_id)
  returning id into v_pedido_id;

  -- Pagada por completo con bolsa: no pasa por contabilidad, va directo a logística.
  if v_restante = 0 then
    update public.pedidos
      set estado = 'listo_para_despacho', fecha_listo_despacho = now(),
          fecha_aprobacion_pago = now(), aprobado_por = public.fn_usuario_id()
      where id = v_pedido_id;
    perform public.fn_registrar_evento_pedido(v_pedido_id, 'listo_para_despacho', 'Pagado con bolsa — sin aprobación de pago');

    insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
    select distinct u.id, 'pedido_listo_despacho', 'Pedido listo para despacho',
           'El pedido #' || v_pedido_id || ' se pagó con bolsa — listo para preparar y enviar.', '/logistica'
      from public.usuarios u
      join public.roles_permisos rp on rp.rol_id = u.rol_id
      join public.permisos pm on pm.id = rp.permiso_id
     where pm.modulo = 'pedidos' and pm.accion = 'despachar' and u.activo;
  end if;

  update public.carritos
    set estado = 'confirmado', nombre_cliente = v_nombre, telefono = p_cliente->>'telefono',
        correo = p_cliente->>'correo', direccion = v_direccion
    where id = p_carrito_id;

  perform public.fn_calcular_puntos(v_venta_id);
  perform public.fn_calcular_comisiones(v_venta_id);

  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
  values (p_vendedor_id, 'pedido_creado', 'Pedido recibido',
          case when v_restante = 0
            then 'Se registró un pedido pagado con bolsa — pasa directo a despacho.'
            else 'Se registró un pedido con su comprobante de pago — queda en revisión por contabilidad.' end,
          '/pedidos');

  if v_restante > 0 then
    insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
    select u.id, 'comprobante_por_revisar', 'Comprobante por revisar',
           'Hay un comprobante de pago nuevo esperando revisión.', '/contabilidad/comprobantes'
      from public.usuarios u
      join public.roles r on r.id = u.rol_id
     where r.nombre = 'contabilidad' and u.activo;
  end if;

  return v_venta_id;
end;
$$;

revoke all on function public.fn_confirmar_carrito_interno(bigint, bigint, text, bigint, bigint, jsonb, jsonb, jsonb, boolean, boolean)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- 8. fn_confirmar_mi_carrito — nuevo parámetro p_usar_bolsa (DROP +
-- re-grant)
-- ------------------------------------------------------------
drop function if exists public.fn_confirmar_mi_carrito(boolean, jsonb, jsonb, jsonb);

create or replace function public.fn_confirmar_mi_carrito(
  p_para_cliente boolean,
  p_cliente jsonb,
  p_envio jsonb,
  p_pago jsonb,
  p_usar_bolsa boolean default false
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

  -- Precio embajador: solo el embajador, y solo cuando compra para sí.
  return public.fn_confirmar_carrito_interno(
    v_id, v_usuario.id, v_canal, null, v_usuario.id, v_cliente,
    coalesce(p_envio, '{}'::jsonb) || jsonb_build_object('para_cliente', coalesce(p_para_cliente, false)),
    p_pago,
    public.fn_rol_actual() = 'embajador' and not coalesce(p_para_cliente, false),
    -- La bolsa solo la usa el embajador en compras para sí.
    coalesce(p_usar_bolsa, false) and public.fn_rol_actual() = 'embajador' and not coalesce(p_para_cliente, false));
end;
$$;

grant execute on function public.fn_confirmar_mi_carrito(boolean, jsonb, jsonb, jsonb, boolean) to authenticated;

-- ------------------------------------------------------------
-- 9. Lecturas para la app
-- ------------------------------------------------------------
-- Comisión de ventas propias aún sin pago aprobado (solo embajador).
create or replace function public.fn_bolsa_en_espera(p_usuario_id bigint)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select coalesce(sum(public.fn_comision_bolsa_venta(v.id)), 0)
  from public.ventas v
  join public.usuarios u on u.id = v.vendedor_id
  join public.roles r on r.id = u.rol_id
  where v.vendedor_id = p_usuario_id
    and r.nombre = 'embajador'
    and v.estado = 'registrada'
    and not coalesce(v.precio_embajador, false);
$$;

revoke all on function public.fn_bolsa_en_espera(bigint) from public, anon, authenticated;

create or replace function public.fn_mi_bolsa()
returns table (disponible numeric, en_espera numeric, abonado numeric, redimido numeric)
language sql stable security definer
set search_path = public
as $$
  select
    public.fn_saldo_bolsa(public.fn_usuario_id()),
    public.fn_bolsa_en_espera(public.fn_usuario_id()),
    coalesce((select sum(monto) from public.movimientos_bolsa
              where usuario_id = public.fn_usuario_id() and tipo = 'abono'), 0),
    coalesce((select -sum(monto) from public.movimientos_bolsa
              where usuario_id = public.fn_usuario_id() and tipo = 'redencion'), 0)
  where public.fn_usuario_id() is not null;
$$;

grant execute on function public.fn_mi_bolsa() to authenticated;

-- Puntos y bolsa de los embajadores visibles (yo, mi red; admin/coordinador: todos).
create or replace function public.fn_red_puntos_bolsa()
returns table (
  usuario_id bigint,
  nombre text,
  puntos_periodo numeric,
  puntos_total numeric,
  bolsa_disponible numeric,
  bolsa_en_espera numeric
)
language sql stable security definer
set search_path = public
as $$
  select
    u.id,
    u.nombre,
    coalesce((select sum(p.cantidad) from public.puntos p
              where p.usuario_id = u.id and p.periodo_id = public.fn_obtener_periodo_actual()), 0),
    coalesce((select sum(p.cantidad) from public.puntos p where p.usuario_id = u.id), 0),
    public.fn_saldo_bolsa(u.id),
    public.fn_bolsa_en_espera(u.id)
  from public.usuarios u
  join public.roles r on r.id = u.rol_id
  where r.nombre = 'embajador'
    and u.activo
    and public.fn_usuario_id() is not null
    and (
      public.fn_rol_actual() in ('admin', 'coordinador')
      or u.id = public.fn_usuario_id()
      or public.fn_es_mi_descendiente(u.id)
    );
$$;

grant execute on function public.fn_red_puntos_bolsa() to authenticated;

-- ------------------------------------------------------------
-- Verificación: una sola fila por función
-- ------------------------------------------------------------
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('fn_confirmar_carrito_interno', 'fn_confirmar_mi_carrito', 'fn_calcular_puntos',
                    'fn_abonar_bolsa', 'fn_revertir_bolsa', 'fn_mi_bolsa', 'fn_red_puntos_bolsa')
order by 1;
