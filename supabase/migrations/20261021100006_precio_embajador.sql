-- ============================================================
-- ASTRO — Precio embajador en el catálogo del backoffice.
--
-- El precio público sale del motor de precios:
--   precio_final = precio_antes_embajador × (1 + comisión%) × (1 + IVA%)
-- El precio embajador es ese mismo precio SIN el recargo de su
-- comisión:  precio público ÷ (1 + comisión%), con el % de comisión
-- que se usó la última vez que se calculó el precio de la pieza
-- (producto_precio_historial); si la pieza nunca pasó por el motor, el
-- parámetro vigente para su categoría / nivel de ganancia.
--
-- Aplica solo cuando un usuario con rol embajador compra "para mí"
-- desde el carrito del backoffice. Los enlaces públicos y las compras
-- "para un cliente" siguen con precio pleno. Esas compras quedan
-- marcadas (ventas.precio_embajador) y no le generan su comisión
-- directa por venta (el descuento ya es su comisión); las comisiones
-- de liderazgo de su red sí se calculan.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Marca en la venta
-- ------------------------------------------------------------
alter table public.ventas add column if not exists precio_embajador boolean not null default false;

-- ------------------------------------------------------------
-- 2. Precio embajador de una pieza
-- ------------------------------------------------------------
create or replace function public.fn_precio_embajador(p_producto_id bigint)
returns numeric
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
  v_publico numeric;
  v_pct numeric;
begin
  select * into v_producto from public.productos where id = p_producto_id;
  if not found then
    return null;
  end if;
  v_publico := coalesce(v_producto.precio_descuento, v_producto.precio_venta);
  if v_publico is null then
    return null;
  end if;

  select h.factor_comision_pct into v_pct
    from public.producto_precio_historial h
    where h.producto_id = p_producto_id
    order by h.id desc
    limit 1;

  if v_pct is null then
    v_pct := public.fn_buscar_parametro_precio(
      'factor_comision_embajador', v_producto.categoria_id, v_producto.id, now(), v_producto.nivel_ganancia);
  end if;

  if v_pct is null or v_pct <= 0 then
    return round(v_publico, 2);
  end if;
  return round(v_publico / (1 + v_pct / 100), 2);
end;
$$;

revoke all on function public.fn_precio_embajador(bigint) from public, anon, authenticated;

-- Precio que se cobra en una línea del carrito.
create or replace function public.fn_precio_linea(p_producto_id bigint, p_precio_embajador boolean)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select case
    when coalesce(p_precio_embajador, false) then coalesce(public.fn_precio_embajador(p.id), 0)
    else coalesce(p.precio_descuento, p.precio_venta, 0)
  end
  from public.productos p where p.id = p_producto_id;
$$;

revoke all on function public.fn_precio_linea(bigint, boolean) from public, anon, authenticated;

-- Para pintar el catálogo: solo devuelve filas a un embajador.
create or replace function public.fn_precios_embajador(p_producto_ids bigint[])
returns table (producto_id bigint, precio_publico numeric, precio_embajador numeric)
language sql stable security definer
set search_path = public
as $$
  select p.id, coalesce(p.precio_descuento, p.precio_venta), public.fn_precio_embajador(p.id)
  from public.productos p
  where p.id = any(p_producto_ids)
    and public.fn_rol_actual() = 'embajador';
$$;

grant execute on function public.fn_precios_embajador(bigint[]) to authenticated;

-- ------------------------------------------------------------
-- 3. fn_confirmar_carrito_interno — nuevo parámetro opcional
-- p_precio_embajador (DROP: cambia la lista de argumentos). Quien lo
-- llama con 8 argumentos (fn_confirmar_carrito del enlace público)
-- sigue funcionando con el default false = precio pleno.
-- ------------------------------------------------------------
drop function if exists public.fn_confirmar_carrito_interno(bigint, bigint, text, bigint, bigint, jsonb, jsonb, jsonb);

create or replace function public.fn_confirmar_carrito_interno(
  p_carrito_id bigint,
  p_vendedor_id bigint,
  p_canal text,
  p_link_id bigint,
  p_comprador_id bigint,
  p_cliente jsonb,
  p_envio jsonb,
  p_pago jsonb,
  p_precio_embajador boolean default false
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

  insert into public.ventas (vendedor_id, cliente_id, canal, link_id, subtotal, descuento_desempeno, total, moneda_id, precio_embajador)
  values (p_vendedor_id, v_cliente_id, p_canal, p_link_id, v_subtotal, v_descuento_monto,
          v_subtotal - v_descuento_monto, (select id from public.monedas where codigo = 'GTQ'), coalesce(p_precio_embajador, false))
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

revoke all on function public.fn_confirmar_carrito_interno(bigint, bigint, text, bigint, bigint, jsonb, jsonb, jsonb, boolean)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. fn_confirmar_mi_carrito — misma firma
-- ------------------------------------------------------------
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

  -- Precio embajador: solo el embajador, y solo cuando compra para sí.
  return public.fn_confirmar_carrito_interno(
    v_id, v_usuario.id, v_canal, null, v_usuario.id, v_cliente,
    coalesce(p_envio, '{}'::jsonb) || jsonb_build_object('para_cliente', coalesce(p_para_cliente, false)),
    p_pago,
    public.fn_rol_actual() = 'embajador' and not coalesce(p_para_cliente, false));
end;
$$;

grant execute on function public.fn_confirmar_mi_carrito(boolean, jsonb, jsonb, jsonb) to authenticated;

-- ------------------------------------------------------------
-- 5. fn_calcular_comisiones — misma firma; sin comisión directa del
-- vendedor en compras a precio embajador
-- ------------------------------------------------------------
create or replace function public.fn_calcular_comisiones(p_venta_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_venta public.ventas%rowtype;
  v_periodo_id bigint;
  v_rol_vendedor bigint;
  v_rol_embajador_id bigint;
  v_nombre_vendedor text;
  v_regla record;
  v_ancestro record;
  v_monto numeric;
  v_pct_catalogo numeric;
  v_descuento_restante numeric;
  v_aplicado numeric;
begin
  select * into v_venta from public.ventas where id = p_venta_id;
  if not found then
    return;
  end if;

  v_periodo_id := public.fn_obtener_periodo_actual();
  select rol_id, nombre into v_rol_vendedor, v_nombre_vendedor
    from public.usuarios where id = v_venta.vendedor_id;
  select id into v_rol_embajador_id from public.roles where nombre = 'embajador';
  v_descuento_restante := coalesce(v_venta.descuento_embajador, 0);

  -- Comisión directa por venta. Una compra a precio embajador ya trae
  -- el descuento de su comisión: no se le paga otra vez.
  for v_regla in
    select * from public.reglas_comision
      where activo and tipo = 'por_venta'
        and (rol_id is null or rol_id = v_rol_vendedor)
        and not coalesce(v_venta.precio_embajador, false)
        and (vigencia_inicio is null or vigencia_inicio <= v_venta.fecha_creacion)
        and (vigencia_fin is null or vigencia_fin >= v_venta.fecha_creacion)
  loop
    v_monto := public.fn_calcular_comision_regla(
      v_regla.tipo, v_regla.porcentaje, v_regla.monto_fijo, v_regla.condiciones, p_venta_id);

    if v_rol_vendedor = v_rol_embajador_id and v_descuento_restante > 0 and v_monto > 0 then
      v_aplicado := least(v_monto, v_descuento_restante);
      v_monto := v_monto - v_aplicado;
      v_descuento_restante := v_descuento_restante - v_aplicado;
    end if;

    if v_monto <> 0 then
      insert into public.comisiones (usuario_id, venta_id, regla_id, regla_version, periodo_id, monto, motivo)
      values (v_venta.vendedor_id, p_venta_id, v_regla.id, v_regla.version, v_periodo_id, v_monto, v_regla.nombre);
    end if;
  end loop;

  -- Comisión de liderazgo: cada ascendente cuyo rol coincide con
  -- regla.rol_id gana un % de esta venta (red de supervisión) —
  -- el subtotal usado aquí NUNCA se reduce por descuento_embajador,
  -- ese costo lo absorbe únicamente el embajador.
  for v_regla in
    select * from public.reglas_comision
      where activo and tipo = 'liderazgo'
        and (vigencia_inicio is null or vigencia_inicio <= v_venta.fecha_creacion)
        and (vigencia_fin is null or vigencia_fin >= v_venta.fecha_creacion)
  loop
    for v_ancestro in
      select u.id from public.vw_cadena_mando cm
        join public.usuarios u on u.id = cm.ancestro_id
        where cm.descendiente_id = v_venta.vendedor_id
          and (v_regla.rol_id is null or u.rol_id = v_regla.rol_id)
    loop
      v_monto := round(coalesce(v_regla.monto_fijo, 0) + v_venta.total * coalesce(v_regla.porcentaje, 0) / 100, 2);
      if v_monto <> 0 then
        insert into public.comisiones (usuario_id, venta_id, regla_id, regla_version, periodo_id, monto, motivo)
        values (v_ancestro.id, p_venta_id, v_regla.id, v_regla.version, v_periodo_id, v_monto,
                v_regla.nombre || ' — red de ' || v_nombre_vendedor);
      end if;
    end loop;
  end loop;

  -- Comisión por catálogo compartido (solo ventas por enlace, y
  -- solo si hay al menos una regla catalogo_embajador activa)
  if v_venta.canal = 'link' and v_venta.link_id is not null then
    select coalesce(
      (select comision_embajador_pct from public.links_venta where id = v_venta.link_id),
      (select valor::numeric from public.parametros where clave = 'comision_embajador_catalogo_pct_default')
    ) into v_pct_catalogo;

    if v_pct_catalogo is not null and v_pct_catalogo <> 0 then
      for v_regla in
        select * from public.reglas_comision
          where activo and tipo = 'catalogo_embajador'
            and (vigencia_inicio is null or vigencia_inicio <= v_venta.fecha_creacion)
            and (vigencia_fin is null or vigencia_fin >= v_venta.fecha_creacion)
      loop
        v_monto := round(v_venta.total * v_pct_catalogo / 100, 2);
        if v_monto <> 0 then
          insert into public.comisiones (usuario_id, venta_id, regla_id, regla_version, periodo_id, monto, motivo)
          values (v_venta.vendedor_id, p_venta_id, v_regla.id, v_regla.version, v_periodo_id, v_monto,
                  'Comisión por catálogo compartido (' || v_pct_catalogo || '%)');
        end if;
      end loop;
    end if;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- Verificación: una sola fila por función
-- ------------------------------------------------------------
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('fn_confirmar_carrito_interno', 'fn_confirmar_mi_carrito', 'fn_calcular_comisiones',
                    'fn_precio_embajador', 'fn_precio_linea', 'fn_precios_embajador')
order by 1;
