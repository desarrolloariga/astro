-- ============================================================
-- ASTRO — Inventario (fase 3b): toma física de inventario.
--
--   1. Iniciar: se toma la existencia del sistema de una bodega (opcional
--      por categoría). Hoja a ciegas (los contadores no ven la existencia)
--      o con existencias.
--   2. Contar: por código o código de barras; se puede sumar o fijar.
--   3. Revisar: diferencias en unidades y en quetzales (costo PEPS).
--   4. Aprobar: ajusta existencias (bajas/sobrantes), registra el Kardex
--      (faltante_toma / sobrante_toma) y genera la partida de ajuste
--      (D Mermas y faltantes / H Inventario; D Inventario / H Sobrantes).
-- Si una existencia cambió durante el conteo (venta, traslado), la
-- aprobación se detiene para recontar o actualizar esa línea.
-- Requiere 022–028.
-- ============================================================

insert into public.permisos (modulo, accion, descripcion) values
  ('toma_fisica', 'crear', 'Iniciar y cancelar tomas físicas de inventario'),
  ('toma_fisica', 'contar', 'Registrar conteos en tomas físicas'),
  ('toma_fisica', 'aprobar', 'Ver existencias del sistema, revisar diferencias y aprobar ajustes de toma física')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('admin', 'crear'), ('admin', 'contar'), ('admin', 'aprobar'),
  ('contabilidad', 'crear'), ('contabilidad', 'contar'), ('contabilidad', 'aprobar'),
  ('coordinador', 'crear'), ('coordinador', 'contar'),
  ('produccion', 'contar'), ('logistica', 'contar')
) as base(rol_nombre, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = 'toma_fisica' and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

create table public.tomas_fisicas (
  id bigint generated always as identity primary key,
  bodega_id bigint not null references public.tiendas (id),
  ciega boolean not null default true,
  categoria_id bigint references public.categorias (id),
  estado text not null default 'en_conteo' check (estado in ('en_conteo', 'en_revision', 'aprobada', 'cancelada')),
  notas text,
  total_faltante numeric(14,2) not null default 0,
  total_sobrante numeric(14,2) not null default 0,
  creado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now(),
  cerrado_por bigint references public.usuarios (id),
  fecha_cierre timestamptz,
  aprobado_por bigint references public.usuarios (id),
  fecha_aprobacion timestamptz,
  motivo_cancelacion text
);
create unique index uq_toma_fisica_abierta on public.tomas_fisicas (bodega_id) where estado in ('en_conteo', 'en_revision');

create table public.toma_fisica_lineas (
  id bigint generated always as identity primary key,
  toma_id bigint not null references public.tomas_fisicas (id) on delete cascade,
  producto_id bigint not null references public.productos (id),
  cantidad_sistema numeric(14,3) not null default 0,
  cantidad_contada numeric(14,3) check (cantidad_contada >= 0),
  costo_unitario numeric(14,4),
  agregada boolean not null default false,
  contado_por bigint references public.usuarios (id),
  fecha_conteo timestamptz,
  comentario text,
  unique (toma_id, producto_id)
);

create trigger trg_auditar_tomas_fisicas after insert or update or delete on public.tomas_fisicas
  for each row execute function public.fn_auditar();
create trigger trg_auditar_toma_fisica_lineas after insert or update or delete on public.toma_fisica_lineas
  for each row execute function public.fn_auditar();

alter table public.tomas_fisicas enable row level security;
alter table public.toma_fisica_lineas enable row level security;
create policy sel_tomas_fisicas on public.tomas_fisicas for select to authenticated
  using ((select public.fn_tiene_permiso('toma_fisica', 'contar')) or (select public.fn_tiene_permiso('toma_fisica', 'aprobar')));
-- Las líneas (con la existencia del sistema) solo las ve quien aprueba; quien cuenta usa fn_toma_lineas.
create policy sel_toma_fisica_lineas on public.toma_fisica_lineas for select to authenticated
  using ((select public.fn_tiene_permiso('toma_fisica', 'aprobar')));
grant select on public.tomas_fisicas, public.toma_fisica_lineas to authenticated;

-- Existencia física que el sistema espera en una bodega.
create or replace function public.fn_toma_existencia_sistema(p_producto_id bigint, p_bodega_id bigint)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select case when coalesce(p.modo_inventario, 'pieza_unica') = 'por_cantidad'
    then coalesce((select i.cantidad_disponible + i.cantidad_reservada from public.inventario_cantidad i
                   where i.producto_id = p.id and i.tienda_id = p_bodega_id), 0)
    else case when p.tienda_id = p_bodega_id and p.activo
                   and p.estado in ('disponible_cedi', 'disponible_tienda', 'separada', 'retenida') then 1 else 0 end
  end
  from public.productos p where p.id = p_producto_id;
$$;

create or replace function public.fn_toma_iniciar(p_bodega_id bigint, p_ciega boolean, p_categoria_id bigint default null, p_notas text default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.fn_tiene_permiso('toma_fisica', 'crear') then
    raise exception 'No tienes permiso para iniciar tomas físicas';
  end if;
  if not exists (select 1 from public.tiendas where id = p_bodega_id and activo) then
    raise exception 'La bodega no existe o está inactiva';
  end if;
  if exists (select 1 from public.tomas_fisicas where bodega_id = p_bodega_id and estado in ('en_conteo', 'en_revision')) then
    raise exception 'Ya hay una toma física abierta en esa bodega';
  end if;
  insert into public.tomas_fisicas (bodega_id, ciega, categoria_id, notas, creado_por)
  values (p_bodega_id, coalesce(p_ciega, true), p_categoria_id, nullif(btrim(coalesce(p_notas, '')), ''), public.fn_usuario_id())
  returning id into v_id;

  insert into public.toma_fisica_lineas (toma_id, producto_id, cantidad_sistema)
  select v_id, x.id, x.cantidad from (
    select p.id, 1::numeric as cantidad from public.productos p
    where coalesce(p.modo_inventario, 'pieza_unica') = 'pieza_unica' and p.activo and p.tienda_id = p_bodega_id
      and p.estado in ('disponible_cedi', 'disponible_tienda', 'separada', 'retenida')
      and (p_categoria_id is null or p.categoria_id = p_categoria_id)
    union all
    select p.id, (i.cantidad_disponible + i.cantidad_reservada)::numeric from public.inventario_cantidad i
    join public.productos p on p.id = i.producto_id
    where p.modo_inventario = 'por_cantidad' and p.activo and i.tienda_id = p_bodega_id
      and i.cantidad_disponible + i.cantidad_reservada > 0
      and (p_categoria_id is null or p.categoria_id = p_categoria_id)
  ) x;
  return v_id;
end;
$$;

grant execute on function public.fn_toma_iniciar(bigint, boolean, bigint, text) to authenticated;

-- Registrar un conteo por código o código de barras. p_sumar: suma al conteo previo (escaneo pieza por pieza).
create or replace function public.fn_toma_registrar(p_toma_id bigint, p_codigo text, p_cantidad numeric, p_sumar boolean default false)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  t public.tomas_fisicas%rowtype;
  p public.productos%rowtype;
  v_linea public.toma_fisica_lineas%rowtype;
  v_nueva numeric;
begin
  if not public.fn_tiene_permiso('toma_fisica', 'contar') then
    raise exception 'No tienes permiso para contar';
  end if;
  select * into t from public.tomas_fisicas where id = p_toma_id;
  if not found or t.estado <> 'en_conteo' then
    raise exception 'La toma física no está en conteo';
  end if;
  if coalesce(p_cantidad, -1) < 0 then
    raise exception 'La cantidad debe ser 0 o mayor';
  end if;
  select * into p from public.productos
    where activo and (upper(codigo) = upper(btrim(p_codigo)) or codigo_barras = btrim(p_codigo))
    order by (upper(codigo) = upper(btrim(p_codigo))) desc limit 1;
  if not found then
    raise exception 'No existe un producto activo con el código %', btrim(p_codigo);
  end if;
  if t.categoria_id is not null and p.categoria_id is distinct from t.categoria_id then
    raise exception 'El producto % no es de la categoría de esta toma', p.codigo;
  end if;

  select * into v_linea from public.toma_fisica_lineas where toma_id = p_toma_id and producto_id = p.id for update;
  if not found then
    insert into public.toma_fisica_lineas (toma_id, producto_id, cantidad_sistema, agregada)
    values (p_toma_id, p.id, public.fn_toma_existencia_sistema(p.id, t.bodega_id), true)
    returning * into v_linea;
  end if;
  v_nueva := case when p_sumar then coalesce(v_linea.cantidad_contada, 0) + p_cantidad else p_cantidad end;
  if coalesce(p.modo_inventario, 'pieza_unica') = 'pieza_unica' and v_nueva > 1 then
    raise exception 'La pieza % es única: el conteo solo puede ser 0 o 1', p.codigo;
  end if;
  if coalesce(p.modo_inventario, 'pieza_unica') = 'por_cantidad' and v_nueva <> trunc(v_nueva) then
    raise exception 'Cuenta unidades enteras';
  end if;
  update public.toma_fisica_lineas
    set cantidad_contada = v_nueva, contado_por = public.fn_usuario_id(), fecha_conteo = now()
    where id = v_linea.id;
  return jsonb_build_object('producto_id', p.id, 'codigo', p.codigo, 'nombre', p.nombre, 'cantidad_contada', v_nueva,
                            'agregada', v_linea.agregada);
end;
$$;

grant execute on function public.fn_toma_registrar(bigint, text, numeric, boolean) to authenticated;

-- Líneas para la pantalla de conteo: oculta la existencia del sistema en tomas a ciegas
-- (salvo a quien aprueba, y siempre una vez cerrado el conteo).
create or replace function public.fn_toma_lineas(p_toma_id bigint)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  t public.tomas_fisicas%rowtype;
  v_ver boolean;
begin
  if not (public.fn_tiene_permiso('toma_fisica', 'contar') or public.fn_tiene_permiso('toma_fisica', 'aprobar')) then
    raise exception 'No tienes permiso para ver tomas físicas';
  end if;
  select * into t from public.tomas_fisicas where id = p_toma_id;
  if not found then
    raise exception 'La toma física no existe';
  end if;
  v_ver := not t.ciega or public.fn_tiene_permiso('toma_fisica', 'aprobar') or t.estado <> 'en_conteo';
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', l.id, 'producto_id', p.id, 'codigo', p.codigo, 'nombre', p.nombre, 'modo_inventario', p.modo_inventario,
      'categoria', c.nombre, 'peso_gramos', p.peso_gramos,
      'cantidad_sistema', case when v_ver then l.cantidad_sistema end,
      'cantidad_actual', case when v_ver then public.fn_toma_existencia_sistema(p.id, t.bodega_id) end,
      'cantidad_contada', l.cantidad_contada, 'agregada', l.agregada, 'comentario', l.comentario,
      'costo_unitario', case when public.fn_tiene_permiso('toma_fisica', 'aprobar')
                              then coalesce(l.costo_unitario, public.fn_kdx_costo_actual(p.id)) end,
      'contado_por', u.nombre, 'fecha_conteo', l.fecha_conteo) order by c.nombre nulls last, p.codigo)
    from public.toma_fisica_lineas l
    join public.productos p on p.id = l.producto_id
    left join public.categorias c on c.id = p.categoria_id
    left join public.usuarios u on u.id = l.contado_por
    where l.toma_id = p_toma_id), '[]'::jsonb);
end;
$$;

grant execute on function public.fn_toma_lineas(bigint) to authenticated;

create or replace function public.fn_toma_cerrar_conteo(p_toma_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('toma_fisica', 'contar') then
    raise exception 'No tienes permiso para contar';
  end if;
  update public.tomas_fisicas set estado = 'en_revision', cerrado_por = public.fn_usuario_id(), fecha_cierre = now()
    where id = p_toma_id and estado = 'en_conteo';
  if not found then
    raise exception 'La toma física no está en conteo';
  end if;
end;
$$;

grant execute on function public.fn_toma_cerrar_conteo(bigint) to authenticated;

create or replace function public.fn_toma_reabrir_conteo(p_toma_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('toma_fisica', 'aprobar') then
    raise exception 'No tienes permiso para reabrir el conteo';
  end if;
  update public.tomas_fisicas set estado = 'en_conteo' where id = p_toma_id and estado = 'en_revision';
  if not found then
    raise exception 'Solo se reabre una toma en revisión';
  end if;
end;
$$;

grant execute on function public.fn_toma_reabrir_conteo(bigint) to authenticated;

-- Iguala la existencia del sistema de las líneas que cambiaron durante el conteo.
create or replace function public.fn_toma_actualizar_sistema(p_toma_id bigint)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  t public.tomas_fisicas%rowtype;
  n int;
begin
  if not public.fn_tiene_permiso('toma_fisica', 'aprobar') then
    raise exception 'No tienes permiso para aprobar tomas físicas';
  end if;
  select * into t from public.tomas_fisicas where id = p_toma_id;
  if not found or t.estado not in ('en_conteo', 'en_revision') then
    raise exception 'La toma física ya no está abierta';
  end if;
  update public.toma_fisica_lineas l
    set cantidad_sistema = public.fn_toma_existencia_sistema(l.producto_id, t.bodega_id),
        comentario = concat_ws(' · ', l.comentario, 'Existencia del sistema actualizada')
    where l.toma_id = p_toma_id and l.cantidad_sistema <> public.fn_toma_existencia_sistema(l.producto_id, t.bodega_id);
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.fn_toma_actualizar_sistema(bigint) to authenticated;

create or replace function public.fn_toma_aprobar(p_toma_id bigint)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  t public.tomas_fisicas%rowtype;
  l record;
  v_dif numeric;
  v_cambios text;
  v_total numeric;
  v_costo numeric;
  v_faltante numeric := 0;
  v_sobrante numeric := 0;
  v_estado_disp text;
begin
  if not public.fn_tiene_permiso('toma_fisica', 'aprobar') then
    raise exception 'No tienes permiso para aprobar tomas físicas';
  end if;
  select * into t from public.tomas_fisicas where id = p_toma_id for update;
  if not found or t.estado <> 'en_revision' then
    raise exception 'Primero cierra el conteo (la toma debe estar en revisión)';
  end if;
  select string_agg(p.codigo, ', ' order by p.codigo) into v_cambios
    from public.toma_fisica_lineas x join public.productos p on p.id = x.producto_id
    where x.toma_id = p_toma_id and x.cantidad_sistema <> public.fn_toma_existencia_sistema(x.producto_id, t.bodega_id);
  if v_cambios is not null then
    raise exception 'La existencia cambió durante el conteo en: %. Recuenta esas piezas o usa «Actualizar existencias del sistema».', v_cambios;
  end if;
  v_estado_disp := case when (select tipo from public.tiendas where id = t.bodega_id) = 'tienda' then 'disponible_tienda' else 'disponible_cedi' end;

  for l in
    select x.*, p.codigo, p.estado, p.tienda_id, coalesce(p.modo_inventario, 'pieza_unica') as modo
    from public.toma_fisica_lineas x join public.productos p on p.id = x.producto_id
    where x.toma_id = p_toma_id
    order by x.id
  loop
    v_dif := coalesce(l.cantidad_contada, 0) - l.cantidad_sistema;
    continue when v_dif = 0;

    if v_dif < 0 then
      -- Faltante
      if l.modo = 'por_cantidad' then
        update public.inventario_cantidad set cantidad_disponible = cantidad_disponible + v_dif
          where producto_id = l.producto_id and tienda_id = t.bodega_id and cantidad_disponible + v_dif >= 0;
        if not found then
          raise exception 'El faltante de % incluye unidades reservadas en carritos: libéralas y vuelve a aprobar', l.codigo;
        end if;
      else
        if l.estado in ('separada', 'retenida') then
          raise exception 'La pieza % está % : resuelve el separado o carrito antes de darla de baja', l.codigo, l.estado;
        end if;
        update public.productos set estado = 'baja' where id = l.producto_id;
      end if;
      insert into public.movimientos_inventario (producto_id, tipo, tienda_origen_id, usuario_id, referencia, cantidad)
      values (l.producto_id, 'baja', t.bodega_id, public.fn_usuario_id(), 'toma_fisica:' || p_toma_id, -v_dif);
      v_total := public.fn_kdx_salida(l.producto_id, -v_dif, 'faltante_toma', 'toma_fisica', p_toma_id,
                                      'Toma física #' || p_toma_id, t.bodega_id);
      v_faltante := v_faltante + v_total;
      v_costo := round(v_total / -v_dif, 4);
    else
      -- Sobrante
      v_costo := public.fn_kdx_costo_actual(l.producto_id);
      if l.modo = 'por_cantidad' then
        insert into public.inventario_cantidad (producto_id, tienda_id, cantidad_disponible)
        values (l.producto_id, t.bodega_id, v_dif)
        on conflict (producto_id, tienda_id)
          do update set cantidad_disponible = public.inventario_cantidad.cantidad_disponible + excluded.cantidad_disponible;
        perform public.fn_kdx_entrada(l.producto_id, v_dif, v_costo, 'sobrante_toma', 'toma_fisica', p_toma_id,
                                      'Toma física #' || p_toma_id, t.bodega_id);
        v_sobrante := v_sobrante + round(v_dif * v_costo, 2);
      else
        if l.estado in ('disponible_cedi', 'disponible_tienda') then
          -- Estaba registrada en otra bodega: solo se reubica, sin efecto en el valor.
          v_costo := 0;
        elsif l.estado = 'baja' then
          perform public.fn_kdx_entrada(l.producto_id, 1, public.fn_kdx_costo_actual(l.producto_id), 'sobrante_toma', 'toma_fisica',
                                        p_toma_id, 'Toma física #' || p_toma_id, t.bodega_id);
          v_sobrante := v_sobrante + round(v_costo, 2);
        else
          raise exception 'La pieza % aparece en el conteo pero está % en el sistema: revísala antes de aprobar', l.codigo, l.estado;
        end if;
        update public.productos set estado = v_estado_disp, tienda_id = t.bodega_id where id = l.producto_id;
      end if;
      insert into public.movimientos_inventario (producto_id, tipo, tienda_destino_id, usuario_id, referencia, cantidad)
      values (l.producto_id, 'ajuste', t.bodega_id, public.fn_usuario_id(), 'toma_fisica:' || p_toma_id, v_dif);
    end if;
    update public.toma_fisica_lineas set costo_unitario = v_costo where id = l.id;
  end loop;

  update public.tomas_fisicas
    set estado = 'aprobada', aprobado_por = public.fn_usuario_id(), fecha_aprobacion = now(),
        total_faltante = v_faltante, total_sobrante = v_sobrante
    where id = p_toma_id;
  perform public.fn_ctb_despachar('toma', p_toma_id, 'contabilizar');
  return jsonb_build_object('faltante', v_faltante, 'sobrante', v_sobrante);
end;
$$;

grant execute on function public.fn_toma_aprobar(bigint) to authenticated;

create or replace function public.fn_toma_cancelar(p_toma_id bigint, p_motivo text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('toma_fisica', 'crear') then
    raise exception 'No tienes permiso para cancelar tomas físicas';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo de la cancelación';
  end if;
  update public.tomas_fisicas set estado = 'cancelada', motivo_cancelacion = btrim(p_motivo)
    where id = p_toma_id and estado in ('en_conteo', 'en_revision');
  if not found then
    raise exception 'Solo se cancelan tomas abiertas';
  end if;
end;
$$;

grant execute on function public.fn_toma_cancelar(bigint, text) to authenticated;

revoke all on function public.fn_toma_existencia_sistema(bigint, bigint) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Contabilidad: partida de ajuste de la toma
-- ------------------------------------------------------------
insert into public.config_contable_eventos (clave, grupo, descripcion, cuenta_id, centro_costo_id, requiere_cuenta, orden)
select e.clave, e.grupo, e.descripcion, c.id, cc.id, true, e.orden
from (values
  ('toma.faltantes', 'Toma física', 'Mermas y faltantes de inventario', '5.01.01.002', 'CC-LOG', 105),
  ('toma.sobrantes', 'Toma física', 'Sobrantes de inventario', '4.02.01.003', null, 106)
) as e(clave, grupo, descripcion, codigo, cc_codigo, orden)
left join public.cuentas_contables c on c.codigo = e.codigo
left join public.centros_costo cc on cc.codigo = e.cc_codigo
on conflict (clave) do nothing;

create or replace function public.fn_ctb_b_toma(p_id bigint, p_fecha date)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  t public.tomas_fisicas%rowtype;
  v_inv bigint;
begin
  select * into t from public.tomas_fisicas where id = p_id;
  if not found or t.estado <> 'aprobada' then
    return;
  end if;
  v_inv := public.fn_ctb_cuenta('venta.inventario');
  perform public.fn_ctb_registrar_auto('toma', p_id, p_fecha,
    'Ajuste por toma física #' || p_id || ' · ' || (select nombre from public.tiendas where id = t.bodega_id),
    jsonb_build_array(
      public.fn_ctb_linea(public.fn_ctb_cuenta('toma.faltantes'), public.fn_ctb_cc('toma.faltantes'), t.total_faltante, 0, 'Faltantes'),
      public.fn_ctb_linea(v_inv, null, 0, t.total_faltante, 'Faltantes'),
      public.fn_ctb_linea(v_inv, null, t.total_sobrante, 0, 'Sobrantes'),
      public.fn_ctb_linea(public.fn_ctb_cuenta('toma.sobrantes'), public.fn_ctb_cc('toma.sobrantes'), 0, t.total_sobrante, 'Sobrantes')));
end;
$$;

revoke all on function public.fn_ctb_b_toma(bigint, date) from public, anon, authenticated;

-- El motor reconoce el nuevo origen «toma».
create or replace function public.fn_ctb_fecha_evento(p_origen text, p_id bigint)
returns date
language plpgsql stable security definer
set search_path = public
as $$
begin
  return case p_origen
    when 'venta' then (
      select public.fn_ctb_fecha(coalesce(
        (select max(c.fecha_revision) from public.comprobantes c join public.pagos p on p.id = c.pago_id
          where p.venta_id = v.id and c.estado = 'aprobado'),
        (select max(coalesce(p.fecha_actualizacion, p.fecha_creacion)) from public.pagos p
          where p.venta_id = v.id and p.estado = 'confirmado'),
        v.fecha_creacion))
      from public.ventas v where v.id = p_id)
    when 'pago' then (
      select public.fn_ctb_fecha(coalesce(
        (select max(c.fecha_revision) from public.comprobantes c where c.pago_id = p.id and c.estado = 'aprobado'),
        p.fecha_actualizacion, p.fecha_creacion))
      from public.pagos p where p.id = p_id)
    when 'bolsa' then (select public.fn_ctb_fecha(fecha) from public.movimientos_bolsa where id = p_id)
    when 'gasto' then (select fecha from public.gastos where id = p_id)
    when 'banco' then (select fecha from public.movimientos_banco where id = p_id)
    when 'compra' then (
      select public.fn_ctb_fecha(coalesce(fecha_recepcion_total, fecha_actualizacion, fecha_creacion))
      from public.ordenes_compra where id = p_id)
    when 'metal' then (
      select public.fn_ctb_fecha(coalesce(fecha_confirmacion, fecha_actualizacion, fecha_creacion))
      from public.recepciones_metal where id = p_id)
    when 'liquidacion' then (
      select public.fn_ctb_fecha(coalesce(fecha_aprobacion, fecha_actualizacion, fecha_creacion))
      from public.liquidaciones where id = p_id)
    when 'canje' then (
      select public.fn_ctb_fecha(coalesce(fecha_atencion, fecha_creacion)) from public.canjes_premios where id = p_id)
    when 'saldo_banco' then (select fecha_saldo_inicial from public.cuentas_bancarias where id = p_id)
    when 'toma' then (select public.fn_ctb_fecha(coalesce(fecha_aprobacion, now())) from public.tomas_fisicas where id = p_id)
  end;
end;
$$;

create or replace function public.fn_ctb_construir(p_origen text, p_id bigint, p_fecha date)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  case p_origen
    when 'venta' then perform public.fn_ctb_b_venta(p_id, p_fecha);
    when 'pago' then perform public.fn_ctb_b_pago(p_id, p_fecha);
    when 'bolsa' then perform public.fn_ctb_b_bolsa(p_id, p_fecha);
    when 'gasto' then perform public.fn_ctb_b_gasto(p_id, p_fecha);
    when 'banco' then perform public.fn_ctb_b_banco(p_id, p_fecha);
    when 'compra' then perform public.fn_ctb_b_compra(p_id, p_fecha);
    when 'metal' then perform public.fn_ctb_b_metal(p_id, p_fecha);
    when 'liquidacion' then perform public.fn_ctb_b_liquidacion(p_id, p_fecha);
    when 'canje' then perform public.fn_ctb_b_canje(p_id, p_fecha);
    when 'saldo_banco' then perform public.fn_ctb_b_saldo_banco(p_id, p_fecha);
    when 'toma' then perform public.fn_ctb_b_toma(p_id, p_fecha);
    else raise exception 'Origen contable desconocido: %', p_origen;
  end case;
end;
$$;

revoke all on function public.fn_ctb_construir(text, bigint, date) from public, anon, authenticated;
revoke all on function public.fn_ctb_fecha_evento(text, bigint) from public, anon, authenticated;

-- Verificación
select
  (select count(*) from public.permisos where modulo = 'toma_fisica') as permisos,
  (select count(*) from public.config_contable_eventos where clave like 'toma.%' and cuenta_id is not null) as eventos_toma;
