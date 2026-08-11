-- ============================================================
-- ARIGA — Migración 0008: RLS y funciones de negocio de
-- clientes, separados, ventas y pedidos.
-- Todas las escrituras críticas pasan por funciones
-- security definer con SELECT … FOR UPDATE: cero doble venta.
-- ============================================================

alter table public.clientes enable row level security;
alter table public.separados enable row level security;
alter table public.ventas enable row level security;
alter table public.venta_detalles enable row level security;
alter table public.pagos enable row level security;
alter table public.comprobantes enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_documentos enable row level security;

-- ------------------------------------------------------------
-- Clientes: visibles para admin/coordinador/contabilidad,
-- para quien los captó y para su cadena de mando ascendente.
-- El alta ocurre dentro de fn_separar_pieza / fn_registrar_venta;
-- se permite UPDATE directo al dueño para corregir datos de contacto.
-- ------------------------------------------------------------
create policy sel_clientes on public.clientes
  for select to authenticated
  using (
    public.fn_rol_actual() in ('admin','coordinador','contabilidad')
    or vendedor_id = public.fn_usuario_id()
    or public.fn_es_mi_descendiente(vendedor_id)
  );

create policy upd_clientes on public.clientes
  for update to authenticated
  using (vendedor_id = public.fn_usuario_id() or public.fn_rol_actual() = 'admin')
  with check (vendedor_id = public.fn_usuario_id() or public.fn_rol_actual() = 'admin');

create policy adm_clientes on public.clientes
  for all to authenticated
  using (public.fn_rol_actual() = 'admin')
  with check (public.fn_rol_actual() = 'admin');

-- ------------------------------------------------------------
-- Separados: solo lectura directa; toda escritura vía RPC.
-- ------------------------------------------------------------
create policy sel_separados on public.separados
  for select to authenticated
  using (
    public.fn_rol_actual() in ('admin','coordinador','contabilidad')
    or vendedor_id = public.fn_usuario_id()
    or public.fn_es_mi_descendiente(vendedor_id)
  );

-- ------------------------------------------------------------
-- Ventas / venta_detalles: solo lectura directa; escritura vía RPC.
-- ------------------------------------------------------------
create policy sel_ventas on public.ventas
  for select to authenticated
  using (
    public.fn_rol_actual() in ('admin','coordinador','contabilidad')
    or vendedor_id = public.fn_usuario_id()
    or public.fn_es_mi_descendiente(vendedor_id)
    or (public.fn_rol_actual() = 'tienda' and tienda_id = public.fn_mi_tienda_id())
  );

create policy sel_venta_detalles on public.venta_detalles
  for select to authenticated
  using (
    exists (
      select 1 from public.ventas v
      where v.id = venta_id
        and (
          public.fn_rol_actual() in ('admin','coordinador','contabilidad')
          or v.vendedor_id = public.fn_usuario_id()
          or public.fn_es_mi_descendiente(v.vendedor_id)
          or (public.fn_rol_actual() = 'tienda' and v.tienda_id = public.fn_mi_tienda_id())
        )
    )
  );

-- ------------------------------------------------------------
-- Pagos: lectura según la venta asociada; escritura vía RPC.
-- ------------------------------------------------------------
create policy sel_pagos on public.pagos
  for select to authenticated
  using (
    public.fn_rol_actual() in ('admin','coordinador','contabilidad')
    or exists (
      select 1 from public.ventas v
      where v.id = venta_id
        and (v.vendedor_id = public.fn_usuario_id() or public.fn_es_mi_descendiente(v.vendedor_id))
    )
  );

-- ------------------------------------------------------------
-- Comprobantes: el vendedor dueño de la venta puede subir el
-- comprobante de su propio pago; contabilidad/admin ven todo y
-- resuelven vía fn_revisar_comprobante.
-- ------------------------------------------------------------
create policy sel_comprobantes on public.comprobantes
  for select to authenticated
  using (
    public.fn_rol_actual() in ('admin','coordinador','contabilidad')
    or exists (
      select 1 from public.pagos p join public.ventas v on v.id = p.venta_id
      where p.id = pago_id
        and (v.vendedor_id = public.fn_usuario_id() or public.fn_es_mi_descendiente(v.vendedor_id))
    )
  );

create policy ins_comprobantes on public.comprobantes
  for insert to authenticated
  with check (
    exists (
      select 1 from public.pagos p join public.ventas v on v.id = p.venta_id
      where p.id = pago_id and v.vendedor_id = public.fn_usuario_id()
    )
  );

-- ------------------------------------------------------------
-- Pedidos: visibles para admin/coordinador/contabilidad, la
-- tienda involucrada y el vendedor de la venta (+ su cadena).
-- Avance de estado vía RPC.
-- ------------------------------------------------------------
create policy sel_pedidos on public.pedidos
  for select to authenticated
  using (
    public.fn_rol_actual() in ('admin','coordinador','contabilidad')
    or exists (
      select 1 from public.ventas v
      where v.id = venta_id
        and (
          v.vendedor_id = public.fn_usuario_id()
          or public.fn_es_mi_descendiente(v.vendedor_id)
          or (public.fn_rol_actual() = 'tienda' and v.tienda_id = public.fn_mi_tienda_id())
        )
    )
  );

create policy sel_pedido_documentos on public.pedido_documentos
  for select to authenticated
  using (
    exists (
      select 1 from public.pedidos pe join public.ventas v on v.id = pe.venta_id
      where pe.id = pedido_id
        and (
          public.fn_rol_actual() in ('admin','coordinador','contabilidad')
          or v.vendedor_id = public.fn_usuario_id()
          or public.fn_es_mi_descendiente(v.vendedor_id)
          or (public.fn_rol_actual() = 'tienda' and v.tienda_id = public.fn_mi_tienda_id())
        )
    )
  );

create policy ins_pedido_documentos on public.pedido_documentos
  for insert to authenticated
  with check (
    exists (
      select 1 from public.pedidos pe join public.ventas v on v.id = pe.venta_id
      where pe.id = pedido_id
        and (
          v.vendedor_id = public.fn_usuario_id()
          or (public.fn_rol_actual() = 'tienda' and v.tienda_id = public.fn_mi_tienda_id())
        )
    )
  );

-- ============================================================
-- Utilidad: ubicar/crear el cliente del vendedor actual
-- (no expuesta directamente; usada por separar/vender)
-- ============================================================
create or replace function public.fn_obtener_o_crear_cliente(
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
    raise exception 'El cliente necesita un nombre';
  end if;

  if p_telefono is not null and btrim(p_telefono) <> '' then
    select id into v_cliente_id
      from public.clientes
      where vendedor_id = public.fn_usuario_id() and telefono = p_telefono
      limit 1;
  end if;

  if v_cliente_id is null then
    insert into public.clientes (nombre, telefono, correo, vendedor_id)
    values (btrim(p_nombre), nullif(btrim(p_telefono), ''), nullif(btrim(p_correo), ''),
            public.fn_usuario_id())
    returning id into v_cliente_id;
  end if;

  return v_cliente_id;
end;
$$;

-- ============================================================
-- Separar una pieza (reserva con promesa de venta)
-- ============================================================
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

-- Devuelve la pieza a disponible según dónde esté (CEDI o tienda)
create or replace function public.fn_devolver_disponibilidad(p_producto_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_tipo_tienda text;
  v_tienda_id bigint;
begin
  select tienda_id into v_tienda_id from public.productos where id = p_producto_id;
  select tipo into v_tipo_tienda from public.tiendas where id = v_tienda_id;

  update public.productos
    set estado = case when v_tipo_tienda = 'cedi' then 'disponible_cedi' else 'disponible_tienda' end
    where id = p_producto_id;
end;
$$;

-- Liberación manual por el vendedor (o admin)
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

-- Job pg_cron: libera separados vencidos cada 5 minutos
create or replace function public.fn_liberar_separados_vencidos()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_separado record;
begin
  for v_separado in
    select * from public.separados
      where estado = 'activo' and fecha_expiracion < now()
      for update skip locked
  loop
    update public.separados set estado = 'vencido' where id = v_separado.id;
    perform public.fn_devolver_disponibilidad(v_separado.producto_id);

    insert into public.movimientos_inventario (producto_id, tipo, usuario_id, referencia)
    values (v_separado.producto_id, 'liberacion', null, 'vencimiento automático');

    insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
    values (v_separado.vendedor_id, 'separado_vencido', 'Separado vencido',
            'El separado #' || v_separado.id || ' venció y la pieza volvió al catálogo.',
            '/separados');
  end loop;
end;
$$;

-- Job pg_cron: avisa separados por vencer (una sola vez por separado)
create or replace function public.fn_avisar_separados_por_vencer()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_horas_aviso numeric := coalesce(public.fn_parametro('horas_aviso_vencimiento_separado')::numeric, 6);
begin
  update public.separados
    set aviso_enviado = true
    where estado = 'activo'
      and not aviso_enviado
      and fecha_expiracion <= now() + (v_horas_aviso || ' hours')::interval;

  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
  select s.vendedor_id, 'separado_por_vencer', 'Separado por vencer',
         'El separado #' || s.id || ' vence pronto. Confirma la venta o libéralo.',
         '/separados'
    from public.separados s
    where s.estado = 'activo'
      and s.aviso_enviado
      and s.fecha_expiracion <= now() + (v_horas_aviso || ' hours')::interval
      and not exists (
        select 1 from public.notificaciones n
        where n.usuario_id = s.vendedor_id
          and n.tipo = 'separado_por_vencer'
          and n.url_destino = '/separados'
          and n.mensaje like '%#' || s.id || ' %'
      );
end;
$$;

select cron.schedule(
  'ariga_liberar_separados_vencidos', '*/5 * * * *',
  $$select public.fn_liberar_separados_vencidos();$$
);

select cron.schedule(
  'ariga_avisar_separados_por_vencer', '*/15 * * * *',
  $$select public.fn_avisar_separados_por_vencer();$$
);

-- ============================================================
-- Registrar una venta (directa o a partir de un separado)
-- ============================================================
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

  -- El motor de descuentos por desempeño se conecta en la fase de incentivos;
  -- por ahora la venta se registra sin descuento (descuento_desempeno = 0).
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

-- ============================================================
-- Anular una venta (operación sensible: solo admin)
-- ============================================================
create or replace function public.fn_anular_venta(p_venta_id bigint, p_motivo text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_venta public.ventas%rowtype;
  v_detalle record;
begin
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

-- ============================================================
-- Revisar comprobante de pago (contabilidad)
-- ============================================================
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

-- ============================================================
-- Avanzar el estado de un pedido
-- ============================================================
create or replace function public.fn_avanzar_pedido(p_pedido_id bigint, p_nuevo_estado text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_venta public.ventas%rowtype;
begin
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
-- Bucket privado para comprobantes de pago (documentos sensibles:
-- sin acceso público; se sirven con URLs firmadas desde el servidor)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('ariga-comprobantes', 'ariga-comprobantes', false)
on conflict (id) do nothing;
