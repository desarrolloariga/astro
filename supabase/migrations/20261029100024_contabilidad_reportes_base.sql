-- ============================================================
-- ASTRO — Reportes contables base (vista previa; el formato SAT con
-- encabezado de 4 líneas y foliación llega en la fase 7).
--
--   fn_balance_saldos   saldo anterior, debe, haber y saldo final por
--                       cuenta; las cuentas Madre suman a sus subcuentas
--                       por prefijo de código. Ingresos, costos y gastos
--                       arrancan cada 1 de enero (saldo anterior desde el
--                       inicio del año de p_desde).
--   fn_libro_diario     partidas contabilizadas con sus líneas, paginado
--   fn_libro_mayor      movimientos de una cuenta (Madre: incluye las
--                       subcuentas) con saldo corrido
--
-- Saldos con signo: positivo = deudor, negativo = acreedor.
-- Solo cuentan partidas contabilizadas. Requiere la migración 022.
-- ============================================================

create index if not exists idx_partidas_contabilizadas_fecha
  on public.partidas (fecha, id) where estado = 'contabilizada';

create or replace function public.fn_balance_saldos(
  p_desde date, p_hasta date, p_nivel int default 4, p_centro_costo_id bigint default null)
returns table (
  cuenta_id bigint, codigo text, nombre text, tipo text, naturaleza text, es_detalle boolean, nivel smallint,
  saldo_anterior numeric, debe numeric, haber numeric, saldo_final numeric)
language plpgsql stable security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.fn_tiene_permiso('contabilidad', 'ver') then
    raise exception 'No tienes permiso para ver reportes contables';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Rango de fechas no válido';
  end if;

  return query
  with mov as (
    select l.cuenta_id,
           sum(case when p.fecha < p_desde then l.debe - l.haber else 0 end) as anterior,
           sum(case when p.fecha >= p_desde then l.debe else 0 end) as debe,
           sum(case when p.fecha >= p_desde then l.haber else 0 end) as haber
    from public.partida_lineas l
    join public.partidas p on p.id = l.partida_id and p.estado = 'contabilizada'
    join public.cuentas_contables c on c.id = l.cuenta_id
    where p.fecha <= p_hasta
      and (c.tipo in ('activo', 'pasivo', 'patrimonio') or p.fecha >= date_trunc('year', p_desde)::date)
      and (p_centro_costo_id is null or l.centro_costo_id = p_centro_costo_id)
    group by l.cuenta_id
  ),
  detalle as (
    select c.codigo, m.anterior, m.debe, m.haber
    from mov m join public.cuentas_contables c on c.id = m.cuenta_id
  )
  select a.id, a.codigo, a.nombre, a.tipo, a.naturaleza, a.es_detalle, a.nivel,
         round(coalesce(sum(d.anterior), 0), 2),
         round(coalesce(sum(d.debe), 0), 2),
         round(coalesce(sum(d.haber), 0), 2),
         round(coalesce(sum(d.anterior + d.debe - d.haber), 0), 2)
  from public.cuentas_contables a
  left join detalle d on d.codigo = a.codigo or d.codigo like a.codigo || '.%'
  where a.nivel <= coalesce(p_nivel, 4)
  group by a.id
  order by string_to_array(a.codigo, '.')::int[];
end;
$$;

grant execute on function public.fn_balance_saldos(date, date, int, bigint) to authenticated;

create or replace function public.fn_libro_diario(
  p_desde date, p_hasta date, p_offset int default 0, p_limit int default 50)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_total int;
  v_totales jsonb;
  v_partidas jsonb;
begin
  if not public.fn_tiene_permiso('contabilidad', 'ver') then
    raise exception 'No tienes permiso para ver reportes contables';
  end if;

  select count(*), jsonb_build_object('debe', coalesce(sum(total_debe), 0), 'haber', coalesce(sum(total_haber), 0))
    into v_total, v_totales
    from public.partidas
    where estado = 'contabilizada' and fecha between p_desde and p_hasta;

  select coalesce(jsonb_agg(x.fila order by x.fecha, x.anio, x.numero), '[]'::jsonb) into v_partidas
  from (
    select p.fecha, p.anio, p.numero,
           jsonb_build_object(
             'id', p.id, 'anio', p.anio, 'numero', p.numero, 'fecha', p.fecha, 'tipo', p.tipo,
             'origen', p.origen, 'origen_id', p.origen_id, 'descripcion', p.descripcion,
             'total_debe', p.total_debe, 'total_haber', p.total_haber,
             'revertida', p.revertida_por_id is not null,
             'lineas', (
               select coalesce(jsonb_agg(jsonb_build_object(
                        'codigo', c.codigo, 'cuenta', c.nombre, 'centro_costo', cc.codigo,
                        'debe', l.debe, 'haber', l.haber, 'descripcion', l.descripcion) order by l.debe = 0, l.linea), '[]'::jsonb)
               from public.partida_lineas l
               join public.cuentas_contables c on c.id = l.cuenta_id
               left join public.centros_costo cc on cc.id = l.centro_costo_id
               where l.partida_id = p.id)
           ) as fila
    from public.partidas p
    where p.estado = 'contabilizada' and p.fecha between p_desde and p_hasta
    order by p.fecha, p.anio, p.numero
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 50), 1), 500)
  ) x;

  return jsonb_build_object('total', v_total, 'totales', v_totales, 'partidas', v_partidas);
end;
$$;

grant execute on function public.fn_libro_diario(date, date, int, int) to authenticated;

create or replace function public.fn_libro_mayor(
  p_cuenta_id bigint, p_desde date, p_hasta date, p_centro_costo_id bigint default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_cuenta public.cuentas_contables%rowtype;
  v_inicio date;
  v_anterior numeric;
  v_movs jsonb;
  v_debe numeric;
  v_haber numeric;
  v_cantidad int;
begin
  if not public.fn_tiene_permiso('contabilidad', 'ver') then
    raise exception 'No tienes permiso para ver reportes contables';
  end if;
  select * into v_cuenta from public.cuentas_contables where id = p_cuenta_id;
  if not found then
    raise exception 'La cuenta no existe';
  end if;
  v_inicio := case when v_cuenta.tipo in ('activo', 'pasivo', 'patrimonio') then null else date_trunc('year', p_desde)::date end;

  select coalesce(sum(l.debe - l.haber), 0) into v_anterior
  from public.partida_lineas l
  join public.partidas p on p.id = l.partida_id and p.estado = 'contabilizada'
  join public.cuentas_contables c on c.id = l.cuenta_id
  where (c.id = v_cuenta.id or c.codigo like v_cuenta.codigo || '.%')
    and p.fecha < p_desde and (v_inicio is null or p.fecha >= v_inicio)
    and (p_centro_costo_id is null or l.centro_costo_id = p_centro_costo_id);

  with lineas as (
    select p.id as partida_id, p.anio, p.numero, p.fecha, p.descripcion as partida, l.linea,
           c.codigo, c.nombre as cuenta, cc.codigo as centro_costo, l.debe, l.haber, l.descripcion
    from public.partida_lineas l
    join public.partidas p on p.id = l.partida_id and p.estado = 'contabilizada'
    join public.cuentas_contables c on c.id = l.cuenta_id
    left join public.centros_costo cc on cc.id = l.centro_costo_id
    where (c.id = v_cuenta.id or c.codigo like v_cuenta.codigo || '.%')
      and p.fecha between p_desde and p_hasta
      and (p_centro_costo_id is null or l.centro_costo_id = p_centro_costo_id)
  ),
  corrido as (
    select *, v_anterior + sum(debe - haber) over (order by fecha, anio, numero, linea rows unbounded preceding) as saldo
    from lineas
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'partida_id', partida_id, 'anio', anio, 'numero', numero, 'fecha', fecha, 'partida', partida,
           'codigo', codigo, 'cuenta', cuenta, 'centro_costo', centro_costo, 'debe', debe, 'haber', haber,
           'descripcion', descripcion, 'saldo', round(saldo, 2)) order by fecha, anio, numero, linea), '[]'::jsonb),
         coalesce(sum(debe), 0), coalesce(sum(haber), 0), count(*)
    into v_movs, v_debe, v_haber, v_cantidad
  from (select * from corrido order by fecha, anio, numero, linea limit 5000) z;

  return jsonb_build_object(
    'cuenta', jsonb_build_object('id', v_cuenta.id, 'codigo', v_cuenta.codigo, 'nombre', v_cuenta.nombre,
                                 'tipo', v_cuenta.tipo, 'naturaleza', v_cuenta.naturaleza, 'es_detalle', v_cuenta.es_detalle),
    'saldo_anterior', round(v_anterior, 2),
    'debe', v_debe, 'haber', v_haber,
    'saldo_final', round(v_anterior + v_debe - v_haber, 2),
    'cantidad', v_cantidad,
    'movimientos', v_movs);
end;
$$;

grant execute on function public.fn_libro_mayor(bigint, date, date, bigint) to authenticated;

-- Resumen por mes para la pantalla de cierre: partidas por estado y totales.
create or replace function public.fn_resumen_periodos_contables(p_anio int)
returns table (mes int, contabilizadas int, borradores int, total_debe numeric, total_haber numeric)
language plpgsql stable security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.fn_tiene_permiso('contabilidad', 'ver') then
    raise exception 'No tienes permiso para ver la contabilidad';
  end if;
  return query
  select m.mes,
         count(p.id) filter (where p.estado = 'contabilizada')::int,
         count(p.id) filter (where p.estado = 'borrador')::int,
         coalesce(sum(p.total_debe) filter (where p.estado = 'contabilizada'), 0),
         coalesce(sum(p.total_haber) filter (where p.estado = 'contabilizada'), 0)
  from generate_series(1, 12) as m(mes)
  left join public.partidas p
    on p.fecha >= make_date(p_anio, m.mes, 1)
   and p.fecha < make_date(p_anio, m.mes, 1) + interval '1 month'
   and p.estado in ('contabilizada', 'borrador')
  group by m.mes
  order by m.mes;
end;
$$;

grant execute on function public.fn_resumen_periodos_contables(int) to authenticated;

-- Verificación
select count(*) as funciones from pg_proc
where proname in ('fn_balance_saldos', 'fn_libro_diario', 'fn_libro_mayor', 'fn_resumen_periodos_contables');
