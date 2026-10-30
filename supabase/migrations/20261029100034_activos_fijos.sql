-- ============================================================
-- ASTRO — Activos fijos (fase 8).
--
--   tipos_activo            prefijo de código, vida útil, % anual y cuentas
--                           (activo, depreciación acumulada, gasto)
--   activos_fijos           número de activo por tipo (COMP-0001…), costo,
--                           ubicación, responsable, centro de costo, origen
--                           (línea de factura de CxP o alta manual)
--   depreciaciones_activos  depreciación mensual en línea recta
--
-- Contabilidad:
--   Alta desde CxP   sin partida (la factura ya cargó la cuenta del activo)
--   Depreciación     D Gasto de depreciación [CC]   H Depreciación acumulada
--                    (una partida por mes; corre sola al cerrar el mes)
--   Baja             D Depreciación acumulada + cobro (si es venta) + pérdida
--                    H Activo (costo) + ganancia
-- Usa los permisos de contabilidad. Requiere 022–033.
-- ============================================================

create table public.tipos_activo (
  id bigint generated always as identity primary key,
  prefijo text not null unique check (prefijo ~ '^[A-Z]{2,6}$'),
  nombre text not null,
  vida_util_meses int not null check (vida_util_meses > 0),
  porcentaje_anual numeric(6,2) not null check (porcentaje_anual > 0 and porcentaje_anual <= 100),
  cuenta_activo_id bigint not null references public.cuentas_contables (id),
  cuenta_depreciacion_id bigint not null references public.cuentas_contables (id),
  cuenta_gasto_id bigint not null references public.cuentas_contables (id),
  centro_costo_id bigint references public.centros_costo (id),
  ultimo_correlativo int not null default 0,
  activo boolean not null default true
);

insert into public.tipos_activo (prefijo, nombre, vida_util_meses, porcentaje_anual, cuenta_activo_id, cuenta_depreciacion_id, cuenta_gasto_id, centro_costo_id)
select t.prefijo, t.nombre, t.meses, t.pct, a.id, d.id, g.id, cc.id
from (values
  ('MOB', 'Mobiliario y equipo', 60, 20.00, '1.02.01.001', '1.02.02.001', '6.01.04.001'),
  ('COMP', 'Equipo de cómputo', 36, 33.33, '1.02.01.002', '1.02.02.002', '6.01.04.002'),
  ('VEH', 'Vehículos', 60, 20.00, '1.02.01.003', '1.02.02.003', '6.01.04.003'),
  ('HERR', 'Herramientas y equipo de taller', 48, 25.00, '1.02.01.004', '1.02.02.004', '6.01.04.004'),
  ('MEJ', 'Mejoras a locales arrendados', 60, 20.00, '1.02.01.005', '1.02.02.005', '6.01.04.005'),
  ('SOFT', 'Software y licencias', 36, 33.33, '1.02.03.001', '1.02.02.005', '6.01.04.005')
) as t(prefijo, nombre, meses, pct, c_activo, c_dep, c_gasto)
join public.cuentas_contables a on a.codigo = t.c_activo
join public.cuentas_contables d on d.codigo = t.c_dep
join public.cuentas_contables g on g.codigo = t.c_gasto
join public.centros_costo cc on cc.codigo = 'CC-ADM'
on conflict (prefijo) do nothing;

create table public.activos_fijos (
  id bigint generated always as identity primary key,
  codigo text not null unique,
  tipo_id bigint not null references public.tipos_activo (id),
  descripcion text not null check (btrim(descripcion) <> ''),
  marca text,
  modelo text,
  serie text,
  tienda_id bigint references public.tiendas (id),
  responsable_id bigint references public.usuarios (id),
  centro_costo_id bigint not null references public.centros_costo (id),
  fecha_adquisicion date not null,
  fecha_inicio_depreciacion date not null,
  costo numeric(14,2) not null check (costo > 0),
  valor_residual numeric(14,2) not null default 0 check (valor_residual >= 0),
  vida_util_meses int not null check (vida_util_meses > 0),
  depreciacion_inicial numeric(14,2) not null default 0 check (depreciacion_inicial >= 0),
  factura_proveedor_id bigint references public.facturas_proveedor (id),
  factura_linea_id bigint references public.factura_proveedor_lineas (id),
  estado text not null default 'activo' check (estado in ('activo', 'baja')),
  fecha_baja date,
  tipo_baja text check (tipo_baja in ('desecho', 'venta', 'donacion', 'perdida')),
  motivo_baja text,
  precio_venta numeric(14,2),
  notas text,
  registrado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now(),
  check (valor_residual + depreciacion_inicial < costo)
);
create index idx_activos_fijos_linea on public.activos_fijos (factura_linea_id) where factura_linea_id is not null;

create table public.depreciaciones_activos (
  id bigint generated always as identity primary key,
  activo_id bigint not null references public.activos_fijos (id),
  anio int not null,
  mes smallint not null check (mes between 1 and 12),
  monto numeric(14,2) not null check (monto > 0),
  partida_id bigint references public.partidas (id),
  fecha_creacion timestamptz not null default now(),
  unique (activo_id, anio, mes)
);
create index idx_depreciaciones_mes on public.depreciaciones_activos (anio, mes);

create trigger trg_auditar_tipos_activo after insert or update or delete on public.tipos_activo
  for each row execute function public.fn_auditar();
create trigger trg_auditar_activos_fijos after insert or update or delete on public.activos_fijos
  for each row execute function public.fn_auditar();

do $$
declare t text;
begin
  foreach t in array array['tipos_activo', 'activos_fijos', 'depreciaciones_activos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy sel_%1$s on public.%1$I for select to authenticated using ((select public.fn_tiene_permiso(''contabilidad'', ''ver'')))', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

insert into public.config_contable_eventos (clave, grupo, descripcion, cuenta_id, centro_costo_id, requiere_cuenta, orden)
select e.clave, 'Activos fijos', e.descripcion, c.id, cc.id, true, e.orden
from (values
  ('activo.ganancia_baja', 'Ganancia en baja o venta de activos fijos', '4.02.01.002', null, 130),
  ('activo.perdida_baja', 'Pérdida en baja o venta de activos fijos', '6.01.02.010', 'CC-ADM', 131)
) as e(clave, descripcion, codigo, cc_codigo, orden)
join public.cuentas_contables c on c.codigo = e.codigo
left join public.centros_costo cc on cc.codigo = e.cc_codigo
on conflict (clave) do nothing;

-- ------------------------------------------------------------
-- 1. Utilidades
-- ------------------------------------------------------------
-- Depreciación acumulada de un activo hasta un mes (incluida la inicial).
create or replace function public.fn_af_acumulada(p_activo_id bigint, p_hasta date default null)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select a.depreciacion_inicial + coalesce((
    select sum(d.monto) from public.depreciaciones_activos d
    where d.activo_id = a.id and (p_hasta is null or make_date(d.anio, d.mes, 1) <= p_hasta)), 0)
  from public.activos_fijos a where a.id = p_activo_id;
$$;

revoke all on function public.fn_af_acumulada(bigint, date) from public, anon, authenticated;

create or replace function public.fn_af_guardar_tipo(
  p_id bigint, p_prefijo text, p_nombre text, p_vida_util_meses int, p_porcentaje numeric,
  p_cuenta_activo_id bigint, p_cuenta_depreciacion_id bigint, p_cuenta_gasto_id bigint, p_centro_costo_id bigint, p_activo boolean default true)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.fn_tiene_permiso('contabilidad', 'configurar') then
    raise exception 'No tienes permiso para configurar tipos de activo';
  end if;
  if exists (select 1 from public.cuentas_contables where id in (p_cuenta_activo_id, p_cuenta_depreciacion_id, p_cuenta_gasto_id) and not es_detalle) then
    raise exception 'Las cuentas deben ser de detalle';
  end if;
  if p_id is null then
    insert into public.tipos_activo (prefijo, nombre, vida_util_meses, porcentaje_anual, cuenta_activo_id, cuenta_depreciacion_id, cuenta_gasto_id, centro_costo_id, activo)
    values (upper(btrim(p_prefijo)), btrim(p_nombre), p_vida_util_meses, p_porcentaje, p_cuenta_activo_id, p_cuenta_depreciacion_id, p_cuenta_gasto_id,
            p_centro_costo_id, coalesce(p_activo, true))
    returning id into v_id;
  else
    update public.tipos_activo
      set nombre = btrim(p_nombre), vida_util_meses = p_vida_util_meses, porcentaje_anual = p_porcentaje,
          cuenta_activo_id = p_cuenta_activo_id, cuenta_depreciacion_id = p_cuenta_depreciacion_id, cuenta_gasto_id = p_cuenta_gasto_id,
          centro_costo_id = p_centro_costo_id, activo = coalesce(p_activo, activo)
      where id = p_id
      returning id into v_id;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Ya existe un tipo de activo con el prefijo %', upper(btrim(p_prefijo));
end;
$$;

grant execute on function public.fn_af_guardar_tipo(bigint, text, text, int, numeric, bigint, bigint, bigint, bigint, boolean) to authenticated;

-- ------------------------------------------------------------
-- 2. Alta de activos
-- ------------------------------------------------------------
-- p_datos: {descripcion, marca, modelo, serie, tienda_id, responsable_id, centro_costo_id, fecha_inicio_depreciacion,
--           vida_util_meses, valor_residual, notas}
create or replace function public.fn_af_insertar(
  p_tipo_id bigint, p_costo numeric, p_fecha_adquisicion date, p_datos jsonb,
  p_factura_id bigint default null, p_linea_id bigint default null, p_depreciacion_inicial numeric default 0)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  t public.tipos_activo%rowtype;
  v_corr int;
  v_id bigint;
  v_inicio date;
begin
  select * into t from public.tipos_activo where id = p_tipo_id for update;
  if not found or not t.activo then
    raise exception 'Elige un tipo de activo activo';
  end if;
  if coalesce(btrim(p_datos ->> 'descripcion'), '') = '' then
    raise exception 'Describe el activo';
  end if;
  update public.tipos_activo set ultimo_correlativo = ultimo_correlativo + 1 where id = t.id returning ultimo_correlativo into v_corr;
  -- Por defecto la depreciación empieza el mes siguiente a la adquisición.
  v_inicio := coalesce(nullif(p_datos ->> 'fecha_inicio_depreciacion', '')::date,
                       (date_trunc('month', p_fecha_adquisicion) + interval '1 month')::date);
  insert into public.activos_fijos (codigo, tipo_id, descripcion, marca, modelo, serie, tienda_id, responsable_id, centro_costo_id,
    fecha_adquisicion, fecha_inicio_depreciacion, costo, valor_residual, vida_util_meses, depreciacion_inicial,
    factura_proveedor_id, factura_linea_id, notas, registrado_por)
  values (t.prefijo || '-' || lpad(v_corr::text, 4, '0'), t.id, btrim(p_datos ->> 'descripcion'),
    nullif(btrim(coalesce(p_datos ->> 'marca', '')), ''), nullif(btrim(coalesce(p_datos ->> 'modelo', '')), ''),
    nullif(btrim(coalesce(p_datos ->> 'serie', '')), ''), nullif(p_datos ->> 'tienda_id', '')::bigint,
    nullif(p_datos ->> 'responsable_id', '')::bigint,
    coalesce(nullif(p_datos ->> 'centro_costo_id', '')::bigint, t.centro_costo_id),
    p_fecha_adquisicion, date_trunc('month', v_inicio)::date, round(p_costo, 2),
    round(coalesce(nullif(p_datos ->> 'valor_residual', '')::numeric, 0), 2),
    coalesce(nullif(p_datos ->> 'vida_util_meses', '')::int, t.vida_util_meses),
    round(coalesce(p_depreciacion_inicial, 0), 2), p_factura_id, p_linea_id,
    nullif(btrim(coalesce(p_datos ->> 'notas', '')), ''), public.fn_usuario_id())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.fn_af_insertar(bigint, numeric, date, jsonb, bigint, bigint, numeric) from public, anon, authenticated;

-- Desde una línea de factura de proveedor (cuenta de activo fijo). p_cantidad > 1 crea varios activos con el costo repartido.
create or replace function public.fn_af_crear_desde_factura(p_linea_id bigint, p_tipo_id bigint, p_cantidad int, p_datos jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  l public.factura_proveedor_lineas%rowtype;
  f public.facturas_proveedor%rowtype;
  t public.tipos_activo%rowtype;
  v_ya numeric;
  v_cant int := greatest(coalesce(p_cantidad, 1), 1);
  v_unit numeric;
  v_ids bigint[] := '{}';
  i int;
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para registrar activos fijos';
  end if;
  select * into l from public.factura_proveedor_lineas where id = p_linea_id;
  select * into f from public.facturas_proveedor where id = l.factura_id;
  select * into t from public.tipos_activo where id = p_tipo_id;
  if l.id is null or f.estado <> 'vigente' then
    raise exception 'La línea de factura no existe o la factura está anulada';
  end if;
  if t.cuenta_activo_id <> l.cuenta_id then
    raise exception 'La línea está cargada a otra cuenta: el tipo «%» usa la cuenta de activo %', t.nombre,
      (select codigo || ' ' || nombre from public.cuentas_contables where id = t.cuenta_activo_id);
  end if;
  select coalesce(sum(costo), 0) into v_ya from public.activos_fijos where factura_linea_id = p_linea_id;
  if v_ya > 0 then
    raise exception 'Esa línea de factura ya está registrada como activo fijo';
  end if;
  v_unit := round(l.monto / v_cant, 2);
  for i in 1 .. v_cant loop
    v_ids := v_ids || public.fn_af_insertar(p_tipo_id,
      case when i = v_cant then l.monto - v_unit * (v_cant - 1) else v_unit end,
      f.fecha_emision,
      p_datos || jsonb_build_object('descripcion', coalesce(nullif(btrim(coalesce(p_datos ->> 'descripcion', '')), ''), l.descripcion, f.descripcion,
                                                            t.nombre) || case when v_cant > 1 then ' (' || i || '/' || v_cant || ')' else '' end),
      f.id, l.id, 0);
  end loop;
  return to_jsonb(v_ids);
end;
$$;

grant execute on function public.fn_af_crear_desde_factura(bigint, bigint, int, jsonb) to authenticated;

-- Alta manual (activos que ya existían): con su depreciación acumulada a la fecha de inicio del sistema.
create or replace function public.fn_af_crear_manual(p_tipo_id bigint, p_costo numeric, p_fecha_adquisicion date,
  p_depreciacion_inicial numeric, p_datos jsonb)
returns bigint
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para registrar activos fijos';
  end if;
  if coalesce(p_costo, 0) <= 0 or p_fecha_adquisicion is null then
    raise exception 'Indica el costo y la fecha de adquisición';
  end if;
  return public.fn_af_insertar(p_tipo_id, p_costo, p_fecha_adquisicion, p_datos, null, null, p_depreciacion_inicial);
end;
$$;

grant execute on function public.fn_af_crear_manual(bigint, numeric, date, numeric, jsonb) to authenticated;

create or replace function public.fn_af_actualizar(p_id bigint, p_datos jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para editar activos fijos';
  end if;
  update public.activos_fijos
    set descripcion = coalesce(nullif(btrim(coalesce(p_datos ->> 'descripcion', '')), ''), descripcion),
        marca = nullif(btrim(coalesce(p_datos ->> 'marca', '')), ''), modelo = nullif(btrim(coalesce(p_datos ->> 'modelo', '')), ''),
        serie = nullif(btrim(coalesce(p_datos ->> 'serie', '')), ''), tienda_id = nullif(p_datos ->> 'tienda_id', '')::bigint,
        responsable_id = nullif(p_datos ->> 'responsable_id', '')::bigint,
        centro_costo_id = coalesce(nullif(p_datos ->> 'centro_costo_id', '')::bigint, centro_costo_id),
        notas = nullif(btrim(coalesce(p_datos ->> 'notas', '')), '')
    where id = p_id and estado = 'activo';
  if not found then
    raise exception 'El activo no existe o está dado de baja';
  end if;
end;
$$;

grant execute on function public.fn_af_actualizar(bigint, jsonb) to authenticated;

-- ------------------------------------------------------------
-- 3. Depreciación mensual
-- ------------------------------------------------------------
-- Calcula y contabiliza la depreciación del mes (una partida). Devuelve el id de la partida (o null si no hay nada que depreciar).
create or replace function public.fn_af_depreciar_mes_interno(p_anio int, p_mes int)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_ini date := make_date(p_anio, p_mes, 1);
  v_fin date := (make_date(p_anio, p_mes, 1) + interval '1 month' - interval '1 day')::date;
  a record;
  v_cuota numeric;
  v_restante numeric;
  v_lineas jsonb := '[]'::jsonb;
  v_partida bigint;
begin
  if exists (select 1 from public.partidas where origen = 'depreciacion' and origen_id = p_anio * 100 + p_mes
             and estado = 'contabilizada' and revertida_por_id is null) then
    return null;  -- ya depreciado
  end if;
  create temp table if not exists tmp_dep (activo_id bigint, monto numeric, cuenta_gasto bigint, cuenta_dep bigint, cc bigint) on commit drop;
  truncate tmp_dep;
  for a in
    select af.*, t.cuenta_gasto_id, t.cuenta_depreciacion_id
    from public.activos_fijos af join public.tipos_activo t on t.id = af.tipo_id
    where af.fecha_inicio_depreciacion <= v_ini
      and (af.estado = 'activo' or af.fecha_baja > v_fin)
      and not exists (select 1 from public.depreciaciones_activos d where d.activo_id = af.id and d.anio = p_anio and d.mes = p_mes)
  loop
    v_restante := a.costo - a.valor_residual - public.fn_af_acumulada(a.id);
    continue when v_restante <= 0;
    v_cuota := least(round((a.costo - a.valor_residual) / a.vida_util_meses, 2), v_restante);
    insert into tmp_dep values (a.id, v_cuota, a.cuenta_gasto_id, a.cuenta_depreciacion_id, a.centro_costo_id);
  end loop;
  if not exists (select 1 from tmp_dep) then
    return null;
  end if;
  select coalesce(jsonb_agg(public.fn_ctb_linea(cuenta_gasto, cc, s, 0, 'Depreciación del mes')), '[]'::jsonb)
    into v_lineas from (select cuenta_gasto, cc, sum(monto) s from tmp_dep group by 1, 2) g;
  select v_lineas || coalesce(jsonb_agg(public.fn_ctb_linea(cuenta_dep, null, 0, s, 'Depreciación acumulada')), '[]'::jsonb)
    into v_lineas from (select cuenta_dep, sum(monto) s from tmp_dep group by 1) g;
  v_partida := public.fn_ctb_registrar_auto('depreciacion', p_anio * 100 + p_mes, v_fin,
    'Depreciación de activos fijos de ' || to_char(v_ini, 'MM/YYYY'), v_lineas);
  insert into public.depreciaciones_activos (activo_id, anio, mes, monto, partida_id)
  select activo_id, p_anio, p_mes, monto, v_partida from tmp_dep;
  return v_partida;
end;
$$;

revoke all on function public.fn_af_depreciar_mes_interno(int, int) from public, anon, authenticated;

create or replace function public.fn_af_depreciar_mes(p_anio int, p_mes int)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_partida bigint;
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para depreciar activos';
  end if;
  v_partida := public.fn_af_depreciar_mes_interno(p_anio, p_mes);
  return jsonb_build_object('partida_id', v_partida,
    'activos', (select count(*) from public.depreciaciones_activos where anio = p_anio and mes = p_mes),
    'monto', (select coalesce(sum(monto), 0) from public.depreciaciones_activos where anio = p_anio and mes = p_mes));
end;
$$;

grant execute on function public.fn_af_depreciar_mes(int, int) to authenticated;

-- Revierte la depreciación de un mes abierto (para recalcularla).
create or replace function public.fn_af_revertir_depreciacion(p_anio int, p_mes int)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_partida bigint;
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para revertir depreciaciones';
  end if;
  select id into v_partida from public.partidas
    where origen = 'depreciacion' and origen_id = p_anio * 100 + p_mes and estado = 'contabilizada' and revertida_por_id is null;
  if v_partida is null then
    raise exception 'No hay depreciación contabilizada para ese mes';
  end if;
  perform public.fn_ctb_revertir_interno(v_partida, (make_date(p_anio, p_mes, 1) + interval '1 month' - interval '1 day')::date,
                                         'recalcular la depreciación del mes');
  delete from public.depreciaciones_activos where anio = p_anio and mes = p_mes;
end;
$$;

grant execute on function public.fn_af_revertir_depreciacion(int, int) to authenticated;

-- ------------------------------------------------------------
-- 4. Baja de activos
-- ------------------------------------------------------------
create or replace function public.fn_af_dar_baja(p_id bigint, p_fecha date, p_tipo text, p_motivo text,
  p_precio_venta numeric default null, p_cuenta_cobro_id bigint default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  a public.activos_fijos%rowtype;
  t public.tipos_activo%rowtype;
  v_acum numeric;
  v_precio numeric := round(coalesce(p_precio_venta, 0), 2);
  v_resultado numeric;
  v_partida bigint;
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para dar de baja activos';
  end if;
  if p_tipo not in ('desecho', 'venta', 'donacion', 'perdida') then
    raise exception 'Tipo de baja no válido';
  end if;
  if coalesce(btrim(p_motivo), '') = '' or p_fecha is null then
    raise exception 'Indica la fecha y el motivo de la baja';
  end if;
  select * into a from public.activos_fijos where id = p_id for update;
  if not found or a.estado <> 'activo' then
    raise exception 'El activo no existe o ya está dado de baja';
  end if;
  if p_tipo = 'venta' and (v_precio <= 0 or p_cuenta_cobro_id is null) then
    raise exception 'En una venta indica el precio y la cuenta donde se cobró (banco, caja o por cobrar)';
  end if;
  if exists (select 1 from public.depreciaciones_activos where activo_id = p_id and make_date(anio, mes, 1) > p_fecha) then
    raise exception 'El activo tiene depreciación registrada después de la fecha de baja: revierte esos meses primero';
  end if;
  select * into t from public.tipos_activo where id = a.tipo_id;
  v_acum := public.fn_af_acumulada(p_id);
  v_resultado := v_precio - (a.costo - v_acum);  -- + ganancia / − pérdida

  v_partida := public.fn_ctb_registrar_auto('baja_activo', p_id, p_fecha,
    'Baja por ' || p_tipo || ' del activo ' || a.codigo || ' · ' || a.descripcion,
    jsonb_build_array(
      public.fn_ctb_linea(t.cuenta_depreciacion_id, null, v_acum, 0, 'Depreciación acumulada'),
      public.fn_ctb_linea(p_cuenta_cobro_id, null, case when p_tipo = 'venta' then v_precio else 0 end, 0, 'Cobro de la venta'),
      public.fn_ctb_linea(public.fn_ctb_cuenta('activo.perdida_baja'), coalesce(public.fn_ctb_cc('activo.perdida_baja'), a.centro_costo_id),
                          greatest(-v_resultado, 0), 0, 'Pérdida en baja'),
      public.fn_ctb_linea(t.cuenta_activo_id, null, 0, a.costo, 'Costo del activo'),
      public.fn_ctb_linea(public.fn_ctb_cuenta('activo.ganancia_baja'), public.fn_ctb_cc('activo.ganancia_baja'),
                          0, greatest(v_resultado, 0), 'Ganancia en venta')));
  update public.activos_fijos
    set estado = 'baja', fecha_baja = p_fecha, tipo_baja = p_tipo, motivo_baja = btrim(p_motivo),
        precio_venta = case when p_tipo = 'venta' then v_precio end
    where id = p_id;
  return v_partida;
end;
$$;

grant execute on function public.fn_af_dar_baja(bigint, date, text, text, numeric, bigint) to authenticated;

-- ------------------------------------------------------------
-- 5. Consultas
-- ------------------------------------------------------------
create or replace function public.fn_af_consulta(p_hasta date default null, p_buscar text default null, p_tipo_id bigint default null,
  p_estado text default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_hasta date := coalesce(p_hasta, public.fn_ctb_hoy());
  v_q text := nullif(btrim(coalesce(p_buscar, '')), '');
  v_filas jsonb;
  v_totales jsonb;
begin
  if not public.fn_tiene_permiso('contabilidad', 'ver') then
    raise exception 'No tienes permiso para ver activos fijos';
  end if;
  with b as (
    select a.id, a.codigo, a.descripcion, a.marca, a.modelo, a.serie, a.estado, a.fecha_adquisicion, a.fecha_baja, a.tipo_baja,
           a.costo, a.vida_util_meses, t.nombre as tipo, ti.nombre as ubicacion, u.nombre as responsable, cc.codigo as centro_costo,
           public.fn_af_acumulada(a.id, v_hasta) as acumulada, a.factura_proveedor_id
    from public.activos_fijos a
    join public.tipos_activo t on t.id = a.tipo_id
    left join public.tiendas ti on ti.id = a.tienda_id
    left join public.usuarios u on u.id = a.responsable_id
    left join public.centros_costo cc on cc.id = a.centro_costo_id
    where a.fecha_adquisicion <= v_hasta
      and (p_tipo_id is null or a.tipo_id = p_tipo_id)
      and (p_estado is null or a.estado = p_estado)
      and (v_q is null or a.codigo ilike '%' || v_q || '%' or a.descripcion ilike '%' || v_q || '%' or a.serie ilike '%' || v_q || '%')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'codigo', codigo, 'descripcion', descripcion, 'marca', marca, 'modelo', modelo, 'serie', serie, 'estado', estado,
           'fecha_adquisicion', fecha_adquisicion, 'fecha_baja', fecha_baja, 'tipo_baja', tipo_baja, 'tipo', tipo, 'ubicacion', ubicacion,
           'responsable', responsable, 'centro_costo', centro_costo, 'costo', costo, 'acumulada', acumulada,
           'valor_libros', case when estado = 'baja' and fecha_baja <= v_hasta then 0 else costo - acumulada end,
           'vida_util_meses', vida_util_meses, 'factura_proveedor_id', factura_proveedor_id) order by codigo), '[]'::jsonb),
         jsonb_build_object(
           'activos', count(*) filter (where estado = 'activo' or fecha_baja > v_hasta),
           'costo', coalesce(sum(costo) filter (where estado = 'activo' or fecha_baja > v_hasta), 0),
           'acumulada', coalesce(sum(acumulada) filter (where estado = 'activo' or fecha_baja > v_hasta), 0),
           'valor_libros', coalesce(sum(costo - acumulada) filter (where estado = 'activo' or fecha_baja > v_hasta), 0))
    into v_filas, v_totales from b;
  return jsonb_build_object('hasta', v_hasta, 'filas', v_filas, 'totales', v_totales);
end;
$$;

grant execute on function public.fn_af_consulta(date, text, bigint, text) to authenticated;

-- Ficha con calendario de depreciación (registrada y proyectada).
create or replace function public.fn_af_activo(p_id bigint)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  a public.activos_fijos%rowtype;
  v_cuota numeric;
  v_acum numeric;
begin
  if not public.fn_tiene_permiso('contabilidad', 'ver') then
    raise exception 'No tienes permiso para ver activos fijos';
  end if;
  select * into a from public.activos_fijos where id = p_id;
  if not found then
    raise exception 'El activo no existe';
  end if;
  v_cuota := round((a.costo - a.valor_residual) / a.vida_util_meses, 2);
  v_acum := public.fn_af_acumulada(p_id);
  return jsonb_build_object(
    'activo', to_jsonb(a) || jsonb_build_object(
      'tipo', (select to_jsonb(t) - 'ultimo_correlativo' from public.tipos_activo t where t.id = a.tipo_id),
      'ubicacion', (select nombre from public.tiendas where id = a.tienda_id),
      'responsable', (select nombre from public.usuarios where id = a.responsable_id),
      'centro_costo', (select codigo || ' · ' || nombre from public.centros_costo where id = a.centro_costo_id),
      'factura', (select concat_ws('-', serie, numero) || ' · ' || nombre from public.facturas_proveedor where id = a.factura_proveedor_id)),
    'cuota_mensual', v_cuota,
    'acumulada', v_acum,
    'valor_libros', case when a.estado = 'baja' then 0 else a.costo - v_acum end,
    'pendiente', case when a.estado = 'baja' then 0 else greatest(a.costo - a.valor_residual - v_acum, 0) end,
    'meses_restantes', case when a.estado = 'baja' or v_cuota = 0 then 0 else ceil(greatest(a.costo - a.valor_residual - v_acum, 0) / v_cuota) end,
    'depreciaciones', coalesce((select jsonb_agg(jsonb_build_object('anio', anio, 'mes', mes, 'monto', monto, 'partida_id', partida_id)
                                                 order by anio, mes) from public.depreciaciones_activos where activo_id = p_id), '[]'::jsonb),
    'partida_baja', (select id from public.partidas where origen = 'baja_activo' and origen_id = p_id and revertida_por_id is null limit 1));
end;
$$;

grant execute on function public.fn_af_activo(bigint) to authenticated;

-- Líneas de facturas de proveedor cargadas a cuentas de activo fijo que aún no están registradas como activo.
create or replace function public.fn_af_lineas_pendientes()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select case when public.fn_tiene_permiso('contabilidad', 'ver') then coalesce((
    select jsonb_agg(jsonb_build_object('linea_id', l.id, 'factura_id', f.id, 'documento', concat_ws('-', f.serie, f.numero),
                                        'proveedor', f.nombre, 'fecha', f.fecha_emision, 'cuenta', c.codigo || ' ' || c.nombre,
                                        'descripcion', coalesce(l.descripcion, f.descripcion), 'monto', l.monto,
                                        'tipo_sugerido', (select id from public.tipos_activo t where t.cuenta_activo_id = l.cuenta_id and t.activo order by id limit 1))
                     order by f.fecha_emision desc)
    from public.factura_proveedor_lineas l
    join public.facturas_proveedor f on f.id = l.factura_id and f.estado = 'vigente'
    join public.cuentas_contables c on c.id = l.cuenta_id
    where exists (select 1 from public.tipos_activo t where t.cuenta_activo_id = l.cuenta_id)
      and not exists (select 1 from public.activos_fijos a where a.factura_linea_id = l.id)), '[]'::jsonb)
  else '[]'::jsonb end;
$$;

grant execute on function public.fn_af_lineas_pendientes() to authenticated;

-- ------------------------------------------------------------
-- 6. El cierre de mes deprecia automáticamente
-- ------------------------------------------------------------
create or replace function public.fn_cerrar_mes_contable(p_anio int, p_mes int, p_notas text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_ultimo record;
  v_fin date := (make_date(p_anio, p_mes, 1) + interval '1 month' - interval '1 day')::date;
  v_borradores int;
  v_descuadre numeric;
  v_bancos text;
begin
  if not public.fn_tiene_permiso('contabilidad', 'cerrar_periodo') then
    raise exception 'No tienes permiso para cerrar meses contables';
  end if;
  select anio, mes into v_ultimo from public.periodos_contables
    where estado = 'cerrado' order by anio desc, mes desc limit 1;
  if found then
    if (p_anio * 12 + p_mes) <= (v_ultimo.anio * 12 + v_ultimo.mes) then
      raise exception 'Ese mes ya está cerrado';
    end if;
    if (p_anio * 12 + p_mes) <> (v_ultimo.anio * 12 + v_ultimo.mes + 1) then
      raise exception 'Los meses se cierran en orden: primero cierra %/%',
        case when v_ultimo.mes = 12 then 1 else v_ultimo.mes + 1 end,
        case when v_ultimo.mes = 12 then v_ultimo.anio + 1 else v_ultimo.anio end;
    end if;
  end if;

  -- Depreciación automática de activos fijos del mes (si aún no se registró).
  perform public.fn_af_depreciar_mes_interno(p_anio, p_mes);

  select count(*) into v_borradores from public.partidas where estado = 'borrador' and fecha <= v_fin;
  if v_borradores > 0 then
    raise exception 'Hay % partida(s) en borrador con fecha hasta el %: contabilízalas o descártalas antes de cerrar',
      v_borradores, to_char(v_fin, 'DD/MM/YYYY');
  end if;

  select coalesce(sum(l.debe) - sum(l.haber), 0) into v_descuadre
    from public.partida_lineas l join public.partidas p on p.id = l.partida_id
    where p.estado = 'contabilizada' and p.fecha <= v_fin;
  if v_descuadre <> 0 then
    raise exception 'La contabilidad no cuadra (diferencia Q %): revisa antes de cerrar', v_descuadre;
  end if;

  -- Requisito: conciliación bancaria cerrada al fin de mes en cada cuenta (no caja) con movimientos en el mes.
  select string_agg(c.nombre, ', ' order by c.nombre) into v_bancos
    from public.cuentas_bancarias c
    where c.activa and c.tipo <> 'caja'
      and exists (select 1 from public.movimientos_banco m where m.cuenta_id = c.id and not m.anulado
                  and m.fecha between make_date(p_anio, p_mes, 1) and v_fin)
      and not exists (select 1 from public.conciliaciones_bancarias cb where cb.cuenta_id = c.id and cb.hasta >= v_fin);
  if v_bancos is not null then
    raise exception 'Antes de cerrar el mes concilia y cierra el estado de cuenta de: %', v_bancos;
  end if;

  insert into public.periodos_contables (anio, mes, estado, cerrado_por, fecha_cierre, notas)
  values (p_anio, p_mes, 'cerrado', public.fn_usuario_id(), now(), nullif(btrim(coalesce(p_notas, '')), ''))
  on conflict (anio, mes) do update
    set estado = 'cerrado', cerrado_por = excluded.cerrado_por, fecha_cierre = now(),
        notas = coalesce(excluded.notas, public.periodos_contables.notas);
end;
$$;

-- Verificación
select
  (select count(*) from public.tipos_activo) as tipos_activo,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('activos_fijos', 'depreciaciones_activos')) as tablas;
