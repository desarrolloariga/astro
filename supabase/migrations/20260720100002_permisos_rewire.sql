-- ============================================================
-- ARIGA — Migración 0023: reemplaza los checks de rol fijo por
-- fn_tiene_permiso(modulo, accion) en las políticas y funciones
-- que corresponden exactamente a un permiso ya catalogado. Todo
-- lo que NO está en el catálogo (jerarquía, visibilidad de red,
-- canal de venta, etc.) sigue siendo rol fijo — a propósito.
-- ============================================================

-- ------------------------------------------------------------
-- usuarios / tiendas / parámetros
-- ------------------------------------------------------------
drop policy adm_usuarios on public.usuarios;
create policy adm_usuarios on public.usuarios
  for all to authenticated
  using (public.fn_tiene_permiso('usuarios','editar'))
  with check (public.fn_tiene_permiso('usuarios','editar'));

drop policy adm_tiendas on public.tiendas;
create policy adm_tiendas on public.tiendas
  for all to authenticated
  using (public.fn_tiene_permiso('tiendas','editar'))
  with check (public.fn_tiene_permiso('tiendas','editar'));

drop policy adm_parametros on public.parametros;
create policy adm_parametros on public.parametros
  for all to authenticated
  using (public.fn_tiene_permiso('parametros','editar'))
  with check (public.fn_tiene_permiso('parametros','editar'));

-- ------------------------------------------------------------
-- Incentivos: reglas de puntaje, topes y escalas de descuento
-- (todo lo que administra la página /admin/incentivos)
-- ------------------------------------------------------------
drop policy adm_reglas_puntaje on public.reglas_puntaje;
create policy adm_reglas_puntaje on public.reglas_puntaje
  for all to authenticated
  using (public.fn_tiene_permiso('incentivos','editar'))
  with check (public.fn_tiene_permiso('incentivos','editar'));

drop policy adm_topes_venta on public.topes_venta;
create policy adm_topes_venta on public.topes_venta
  for all to authenticated
  using (public.fn_tiene_permiso('incentivos','editar'))
  with check (public.fn_tiene_permiso('incentivos','editar'));

drop policy adm_escalas_descuento on public.escalas_descuento;
create policy adm_escalas_descuento on public.escalas_descuento
  for all to authenticated
  using (public.fn_tiene_permiso('incentivos','editar'))
  with check (public.fn_tiene_permiso('incentivos','editar'));

-- ------------------------------------------------------------
-- Academia: cursos, contenidos, evaluaciones y preguntas
-- (todo lo que administra la página /admin/academia)
-- ------------------------------------------------------------
drop policy adm_cursos on public.cursos;
create policy adm_cursos on public.cursos
  for all to authenticated
  using (public.fn_tiene_permiso('academia','editar'))
  with check (public.fn_tiene_permiso('academia','editar'));

drop policy adm_curso_contenidos on public.curso_contenidos;
create policy adm_curso_contenidos on public.curso_contenidos
  for all to authenticated
  using (public.fn_tiene_permiso('academia','editar'))
  with check (public.fn_tiene_permiso('academia','editar'));

drop policy adm_evaluaciones on public.evaluaciones;
create policy adm_evaluaciones on public.evaluaciones
  for all to authenticated
  using (public.fn_tiene_permiso('academia','editar'))
  with check (public.fn_tiene_permiso('academia','editar'));

drop policy adm_evaluacion_preguntas on public.evaluacion_preguntas;
create policy adm_evaluacion_preguntas on public.evaluacion_preguntas
  for all to authenticated
  using (public.fn_tiene_permiso('academia','editar'))
  with check (public.fn_tiene_permiso('academia','editar'));

-- ------------------------------------------------------------
-- Vistas financieras — finanzas.ver. Se auto-restringen con un
-- filtro embebido en su propio WHERE (mismo patrón que vw_catalogo/
-- vw_ranking, ver fase 8); ese filtro pasa de rol fijo a permiso.
-- ------------------------------------------------------------
create or replace view public.vw_ventas_kpi as
select
  v.id, v.fecha_creacion, v.canal, v.subtotal, v.descuento_desempeno, v.total, v.estado,
  v.tienda_id, t.nombre as tienda,
  v.vendedor_id, u.nombre as vendedor
from public.ventas v
join public.usuarios u on u.id = v.vendedor_id
left join public.tiendas t on t.id = v.tienda_id
where public.fn_tiene_permiso('finanzas','ver');

create or replace view public.vw_margen_producto as
select
  vd.id as detalle_id, v.id as venta_id, v.fecha_creacion, v.tienda_id, v.estado,
  p.id as producto_id, p.codigo, p.nombre, p.categoria_id, c.nombre as categoria,
  vd.precio as precio_venta, p.costo_produccion,
  (vd.precio - coalesce(p.costo_produccion, 0)) as margen,
  case when vd.precio > 0
    then round((vd.precio - coalesce(p.costo_produccion, 0)) / vd.precio * 100, 2)
    else null
  end as margen_pct
from public.venta_detalles vd
join public.ventas v on v.id = vd.venta_id
join public.productos p on p.id = vd.producto_id
left join public.categorias c on c.id = p.categoria_id
where v.estado <> 'anulada'
  and public.fn_tiene_permiso('finanzas','ver');

create or replace view public.vw_inventario_valorizado as
select
  p.tienda_id, t.nombre as tienda, t.tipo as tienda_tipo,
  count(*) as piezas,
  sum(coalesce(p.costo_produccion, 0)) as capital_inmovilizado,
  sum(coalesce(p.precio_venta, 0)) as valor_venta_potencial,
  count(*) filter (
    where coalesce(p.fecha_actualizacion, p.fecha_creacion) < now() - interval '60 days'
  ) as piezas_sin_movimiento_60d
from public.productos p
left join public.tiendas t on t.id = p.tienda_id
where p.activo and p.estado in ('disponible_cedi', 'disponible_tienda')
  and public.fn_tiene_permiso('finanzas','ver')
group by p.tienda_id, t.nombre, t.tipo;

create or replace view public.vw_red_comercial as
select
  u.id as usuario_id, u.nombre, r.nombre as rol, u.tienda_id, t.nombre as tienda,
  coalesce(vt.total_ventas, 0) as ventas_periodo,
  coalesce(vt.num_ventas, 0) as num_ventas_periodo,
  (coalesce(vt.num_ventas, 0) > 0) as activo_periodo
from public.usuarios u
join public.roles r on r.id = u.rol_id
left join public.tiendas t on t.id = u.tienda_id
left join lateral (
  select sum(v.total) as total_ventas, count(*) as num_ventas
    from public.ventas v
    where v.vendedor_id = u.id and v.estado <> 'anulada'
      and v.fecha_creacion >= date_trunc('month', now())
      and v.fecha_creacion < date_trunc('month', now()) + interval '1 month'
) vt on true
where u.activo and r.nombre in ('supervisor','asesor','embajador','tienda')
  and public.fn_tiene_permiso('finanzas','ver');

-- ------------------------------------------------------------
-- fn_separar_pieza — separados.crear
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
  if not public.fn_tiene_permiso('separados','crear') then
    raise exception 'No tienes permiso para separar piezas';
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
-- fn_anular_venta — ventas.anular
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
  if not public.fn_tiene_permiso('ventas','anular') then
    raise exception 'No tienes permiso para anular ventas';
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
-- fn_revisar_comprobante — comprobantes.aprobar
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
  if not public.fn_tiene_permiso('comprobantes','aprobar') then
    raise exception 'No tienes permiso para revisar comprobantes';
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
-- fn_registrar_venta — ventas.crear (el resto de la lógica,
-- incluida la atribución de canal por rol, no cambia)
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

  perform public.fn_calcular_puntos(v_venta_id);
  perform public.fn_calcular_comisiones(v_venta_id);

  return v_venta_id;
end;
$$;

-- ------------------------------------------------------------
-- fn_simular_regla_puntaje — incentivos.editar
-- ------------------------------------------------------------
create or replace function public.fn_simular_regla_puntaje(
  p_tipo text,
  p_valor numeric,
  p_multiplicador numeric,
  p_condiciones jsonb,
  p_periodo_id bigint
)
returns table (usuario_id bigint, usuario_nombre text, puntos_estimados numeric)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if public.fn_usuario_id() is null or not public.fn_tiene_permiso('incentivos','editar') then
    raise exception 'No tienes permiso para usar el simulador';
  end if;

  return query
    select v.vendedor_id, u.nombre,
           sum(public.fn_calcular_puntos_regla(p_tipo, p_valor, p_multiplicador, p_condiciones, v.id))
    from public.ventas v
    join public.usuarios u on u.id = v.vendedor_id
    join public.periodos per on per.id = p_periodo_id
    where v.estado <> 'anulada'
      and v.fecha_creacion >= per.fecha_inicio and v.fecha_creacion < per.fecha_fin
    group by v.vendedor_id, u.nombre
    having sum(public.fn_calcular_puntos_regla(p_tipo, p_valor, p_multiplicador, p_condiciones, v.id)) <> 0
    order by 3 desc;
end;
$$;

-- ------------------------------------------------------------
-- Conteo físico — inventario.ajustar (el permiso habilita la
-- acción; el rol 'tienda' sigue limitado a su propia tienda)
-- ------------------------------------------------------------
create or replace function public.fn_iniciar_conteo(p_tienda_id bigint)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_conteo_id bigint;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
  end if;
  if not public.fn_tiene_permiso('inventario','ajustar') then
    raise exception 'No tienes permiso para gestionar el conteo físico';
  end if;
  if public.fn_rol_actual() = 'tienda' and public.fn_mi_tienda_id() is distinct from p_tienda_id then
    raise exception 'Solo puedes iniciar el conteo de tu propia tienda';
  end if;
  if exists (select 1 from public.conteos_fisicos where tienda_id = p_tienda_id and estado = 'abierto') then
    raise exception 'Ya hay un conteo físico abierto para esta tienda';
  end if;

  insert into public.conteos_fisicos (tienda_id, iniciado_por)
  values (p_tienda_id, public.fn_usuario_id())
  returning id into v_conteo_id;

  insert into public.conteo_fisico_detalles (conteo_id, producto_id)
  select v_conteo_id, p.id
    from public.productos p
    where p.activo and p.tienda_id = p_tienda_id and p.estado = 'disponible_tienda';

  return v_conteo_id;
end;
$$;

create or replace function public.fn_marcar_pieza_contada(p_conteo_id bigint, p_producto_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_conteo public.conteos_fisicos%rowtype;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
  end if;
  if not public.fn_tiene_permiso('inventario','ajustar') then
    raise exception 'No tienes permiso para gestionar el conteo físico';
  end if;

  select * into v_conteo from public.conteos_fisicos where id = p_conteo_id;
  if not found or v_conteo.estado <> 'abierto' then
    raise exception 'El conteo no existe o ya está cerrado';
  end if;
  if public.fn_rol_actual() = 'tienda' and public.fn_mi_tienda_id() is distinct from v_conteo.tienda_id then
    raise exception 'No tienes acceso a este conteo';
  end if;

  update public.conteo_fisico_detalles
    set contado = true, fecha_conteo = now()
    where conteo_id = p_conteo_id and producto_id = p_producto_id;

  if not found then
    raise exception 'Esta pieza no forma parte del conteo (¿código correcto?)';
  end if;
end;
$$;

create or replace function public.fn_cerrar_conteo(p_conteo_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_conteo public.conteos_fisicos%rowtype;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
  end if;
  if not public.fn_tiene_permiso('inventario','ajustar') then
    raise exception 'No tienes permiso para gestionar el conteo físico';
  end if;

  select * into v_conteo from public.conteos_fisicos where id = p_conteo_id for update;
  if not found or v_conteo.estado <> 'abierto' then
    raise exception 'El conteo no existe o ya está cerrado';
  end if;
  if public.fn_rol_actual() = 'tienda' and public.fn_mi_tienda_id() is distinct from v_conteo.tienda_id then
    raise exception 'No tienes acceso a este conteo';
  end if;

  update public.conteos_fisicos set estado = 'cerrado', fecha_cierre = now() where id = p_conteo_id;
end;
$$;
