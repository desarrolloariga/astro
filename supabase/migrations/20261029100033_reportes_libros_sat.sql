-- ============================================================
-- ASTRO — Reportes financieros y libros SAT (fase 7).
--
--   fn_ctb_balance_general         activo = pasivo + patrimonio (+ resultado)
--   fn_ctb_estado_resultados_cc    ingresos, costos y gastos por centro de costo
--   fn_ctb_flujo_efectivo          método directo e indirecto (ambos cuadran
--                                  con la variación del efectivo)
--   fn_libro_mayor_general         libro mayor de todas las cuentas
--   fn_libro_compras / fn_libro_ventas
--   libros_folios / libros_emisiones
--                                  foliación: el folio inicial se define una
--                                  vez por libro; cada emisión oficial continúa
--                                  el correlativo y queda registrada
--   fn_ctb_generar_cierre_anual    partida de cierre del ejercicio (borrador)
-- Requiere 022–032.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Balance general
-- ------------------------------------------------------------
create or replace function public.fn_ctb_balance_general(p_fecha date, p_nivel int default 3)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_inicio date := make_date(extract(year from p_fecha)::int, 1, 1);
  v_filas jsonb;
  v_activo numeric;
  v_pasivo numeric;
  v_patrimonio numeric;
  v_resultado numeric;
  v_anteriores numeric;
begin
  if not public.fn_tiene_permiso('contabilidad', 'ver') then
    raise exception 'No tienes permiso para ver reportes contables';
  end if;
  create temp table if not exists tmp_bg on commit drop as
    select * from public.fn_balance_saldos(v_inicio, p_fecha, 4, null) limit 0;
  truncate tmp_bg;
  insert into tmp_bg select * from public.fn_balance_saldos(v_inicio, p_fecha, 4, null);

  select coalesce(sum(saldo_final) filter (where tipo = 'activo'), 0),
         coalesce(-sum(saldo_final) filter (where tipo = 'pasivo'), 0),
         coalesce(-sum(saldo_final) filter (where tipo = 'patrimonio'), 0),
         coalesce(-sum(saldo_final) filter (where tipo in ('ingreso', 'costo', 'gasto')), 0)
    into v_activo, v_pasivo, v_patrimonio, v_resultado
    from tmp_bg where nivel = 1;
  -- Resultados de años anteriores que aún no tienen partida de cierre.
  select coalesce(-sum(saldo_final), 0) into v_anteriores
    from public.fn_balance_saldos(date '1900-01-01', v_inicio - 1, 1, null)
    where tipo in ('ingreso', 'costo', 'gasto');

  select coalesce(jsonb_agg(jsonb_build_object(
           'codigo', codigo, 'nombre', nombre, 'tipo', tipo, 'nivel', nivel, 'es_detalle', es_detalle,
           'saldo', case when tipo = 'activo' then saldo_final else -saldo_final end)
         order by string_to_array(codigo, '.')::int[]), '[]'::jsonb)
    into v_filas
    from tmp_bg
    where tipo in ('activo', 'pasivo', 'patrimonio') and nivel <= coalesce(p_nivel, 3) and saldo_final <> 0;

  return jsonb_build_object(
    'fecha', p_fecha, 'filas', v_filas,
    'total_activo', round(v_activo, 2), 'total_pasivo', round(v_pasivo, 2),
    'patrimonio_contable', round(v_patrimonio, 2),
    'resultado_ejercicio', round(v_resultado, 2),
    'resultados_anteriores', round(v_anteriores, 2),
    'total_patrimonio', round(v_patrimonio + v_resultado + v_anteriores, 2),
    'total_pasivo_patrimonio', round(v_pasivo + v_patrimonio + v_resultado + v_anteriores, 2),
    'cuadra', round(v_activo, 2) = round(v_pasivo + v_patrimonio + v_resultado + v_anteriores, 2));
end;
$$;

grant execute on function public.fn_ctb_balance_general(date, int) to authenticated;

-- ------------------------------------------------------------
-- 2. Estado de resultados por centro de costo
-- ------------------------------------------------------------
create or replace function public.fn_ctb_estado_resultados_cc(p_desde date, p_hasta date, p_nivel int default 3)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_centros jsonb;
  v_filas jsonb;
  v_resumen jsonb;
begin
  if not public.fn_tiene_permiso('contabilidad', 'ver') then
    raise exception 'No tienes permiso para ver reportes contables';
  end if;
  with mov as (
    -- Ingresos en positivo (haber − debe); costos y gastos en positivo (debe − haber). Sin la partida de cierre.
    select c.codigo, coalesce(l.centro_costo_id, 0) as cc,
           sum(case when c.tipo = 'ingreso' then l.haber - l.debe else l.debe - l.haber end) as monto
    from public.partida_lineas l
    join public.partidas p on p.id = l.partida_id and p.estado = 'contabilizada' and p.tipo <> 'cierre'
    join public.cuentas_contables c on c.id = l.cuenta_id
    where p.fecha between p_desde and p_hasta and c.tipo in ('ingreso', 'costo', 'gasto')
    group by c.codigo, coalesce(l.centro_costo_id, 0)
  ),
  centros as (select distinct cc from mov),
  filas as (
    select a.codigo, a.nombre, a.tipo, a.nivel, a.es_detalle, m.cc, sum(m.monto) as monto
    from public.cuentas_contables a
    join mov m on m.codigo = a.codigo or m.codigo like a.codigo || '.%'
    where a.tipo in ('ingreso', 'costo', 'gasto') and a.nivel <= coalesce(p_nivel, 3)
    group by a.codigo, a.nombre, a.tipo, a.nivel, a.es_detalle, m.cc
  )
  select
    (select coalesce(jsonb_agg(jsonb_build_object('id', x.cc, 'codigo', coalesce(cc.codigo, 'Sin centro'), 'nombre', coalesce(cc.nombre, 'Sin centro de costo'))
                               order by cc.codigo nulls last), '[]'::jsonb)
       from centros x left join public.centros_costo cc on cc.id = x.cc),
    (select coalesce(jsonb_agg(jsonb_build_object('codigo', codigo, 'nombre', nombre, 'tipo', tipo, 'nivel', nivel, 'es_detalle', es_detalle,
                                                  'por_cc', por_cc, 'total', total)
                               order by array_position(array['ingreso', 'costo', 'gasto'], tipo), string_to_array(codigo, '.')::int[]), '[]'::jsonb)
       from (select codigo, nombre, tipo, nivel, es_detalle, jsonb_object_agg(cc::text, round(monto, 2)) as por_cc, round(sum(monto), 2) as total
             from filas group by codigo, nombre, tipo, nivel, es_detalle having round(sum(abs(monto)), 2) <> 0) f),
    (select coalesce(jsonb_object_agg(cc::text, jsonb_build_object(
               'ingresos', round(ing, 2), 'costos', round(cos, 2), 'gastos', round(gas, 2), 'utilidad', round(ing - cos - gas, 2))), '{}'::jsonb)
       from (select cc, coalesce(sum(monto) filter (where t = 'ingreso'), 0) ing, coalesce(sum(monto) filter (where t = 'costo'), 0) cos,
                    coalesce(sum(monto) filter (where t = 'gasto'), 0) gas
             from (select m.cc, m.monto, c.tipo t from mov m join public.cuentas_contables c on c.codigo = m.codigo) z
             group by cc
             union all
             select -1, coalesce(sum(monto) filter (where t = 'ingreso'), 0), coalesce(sum(monto) filter (where t = 'costo'), 0),
                    coalesce(sum(monto) filter (where t = 'gasto'), 0)
             from (select m.monto, c.tipo t from mov m join public.cuentas_contables c on c.codigo = m.codigo) z2) r)
    into v_centros, v_filas, v_resumen;
  return jsonb_build_object('desde', p_desde, 'hasta', p_hasta, 'centros', v_centros, 'filas', v_filas, 'resumen', v_resumen);
end;
$$;

grant execute on function public.fn_ctb_estado_resultados_cc(date, date, int) to authenticated;

-- ------------------------------------------------------------
-- 3. Flujo de efectivo
-- ------------------------------------------------------------
-- Efectivo y equivalentes: caja, bancos y el tránsito entre cuentas propias.
create or replace function public.fn_ctb_cuentas_efectivo()
returns bigint[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct id), '{}') from (
    select cuenta_contable_id as id from public.cuentas_bancarias where cuenta_contable_id is not null
    union select id from public.cuentas_contables where es_detalle and (codigo like '1.01.01.%' or codigo like '1.01.02.%')
    union select cuenta_id from public.config_contable_eventos where clave = 'banco.transito' and cuenta_id is not null
  ) x;
$$;

revoke all on function public.fn_ctb_cuentas_efectivo() from public, anon, authenticated;

-- Clasificación de la contrapartida para el método directo.
create or replace function public.fn_ctb_categoria_flujo(p_codigo text, p_tipo text)
returns text
language sql immutable
as $$
  select case
    when p_codigo like '1.02.%' then 'inversion'
    when p_codigo like '2.01.07.%' or p_codigo like '2.02.%' or p_tipo = 'patrimonio' then 'financiamiento'
    when p_codigo like '2.01.04.%' or p_codigo like '1.01.03.%' or p_codigo in ('1.01.04.001', '1.01.04.002') or p_tipo = 'ingreso' then 'cobros_clientes'
    when p_codigo like '2.01.01.%' or p_codigo like '2.01.02.%' or p_codigo like '1.01.06.%' or p_codigo = '1.01.04.004' or p_tipo = 'costo' then 'pagos_proveedores'
    when p_codigo like '2.01.03.%' then 'pagos_red'
    when p_codigo like '2.01.06.%' or p_codigo like '6.01.01.%' then 'pagos_personal'
    when p_codigo like '2.01.05.%' or p_codigo like '1.01.05.%' then 'impuestos'
    when p_tipo = 'gasto' or p_codigo like '1.01.07.%' then 'gastos_operacion'
    else 'otros_operacion'
  end;
$$;

create or replace function public.fn_ctb_flujo_efectivo(p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_efe bigint[] := public.fn_ctb_cuentas_efectivo();
  v_inicial numeric;
  v_final numeric;
  v_directo jsonb;
  v_utilidad numeric;
  v_indirecto jsonb;
  v_ct jsonb;
begin
  if not public.fn_tiene_permiso('contabilidad', 'ver') then
    raise exception 'No tienes permiso para ver reportes contables';
  end if;
  select coalesce(sum(l.debe - l.haber) filter (where p.fecha < p_desde), 0), coalesce(sum(l.debe - l.haber), 0)
    into v_inicial, v_final
    from public.partida_lineas l join public.partidas p on p.id = l.partida_id and p.estado = 'contabilizada'
    where l.cuenta_id = any (v_efe) and p.fecha <= p_hasta;

  -- Directo: en cada partida que mueve efectivo, sus contrapartidas explican la entrada o salida.
  with con_efectivo as (
    select distinct l.partida_id from public.partida_lineas l join public.partidas p on p.id = l.partida_id
    where p.estado = 'contabilizada' and p.fecha between p_desde and p_hasta and l.cuenta_id = any (v_efe)
  )
  select coalesce(jsonb_object_agg(cat, round(monto, 2)), '{}'::jsonb) into v_directo
  from (
    select public.fn_ctb_categoria_flujo(c.codigo, c.tipo) as cat, sum(l.haber - l.debe) as monto
    from public.partida_lineas l join con_efectivo x on x.partida_id = l.partida_id
    join public.cuentas_contables c on c.id = l.cuenta_id
    where not (l.cuenta_id = any (v_efe))
    group by 1 having round(sum(l.haber - l.debe), 2) <> 0
  ) d;

  -- Indirecto: utilidad + partidas que no son efectivo − variaciones de las demás cuentas de balance.
  select coalesce(sum(l.haber - l.debe), 0) into v_utilidad
    from public.partida_lineas l join public.partidas p on p.id = l.partida_id and p.estado = 'contabilizada' and p.tipo <> 'cierre'
    join public.cuentas_contables c on c.id = l.cuenta_id
    where p.fecha between p_desde and p_hasta and c.tipo in ('ingreso', 'costo', 'gasto');

  with bal as (
    select c.codigo, c.tipo, sum(l.haber - l.debe) as efecto
    from public.partida_lineas l join public.partidas p on p.id = l.partida_id and p.estado = 'contabilizada' and p.tipo <> 'cierre'
    join public.cuentas_contables c on c.id = l.cuenta_id
    where p.fecha between p_desde and p_hasta and c.tipo in ('activo', 'pasivo', 'patrimonio') and not (l.cuenta_id = any (v_efe))
    group by c.codigo, c.tipo
  ),
  grupos as (
    select case when codigo like '1.02.02.%' then 'depreciacion'
                when codigo like '2.01.07.%' or codigo like '2.02.%' or tipo = 'patrimonio' then 'financiamiento'
                when codigo like '1.02.%' then 'inversion'
                else 'capital_trabajo' end as grupo, codigo, efecto
    from bal
  )
  select jsonb_build_object(
           'depreciacion', round(coalesce(sum(efecto) filter (where grupo = 'depreciacion'), 0), 2),
           'capital_trabajo', round(coalesce(sum(efecto) filter (where grupo = 'capital_trabajo'), 0), 2),
           'inversion', round(coalesce(sum(efecto) filter (where grupo = 'inversion'), 0), 2),
           'financiamiento', round(coalesce(sum(efecto) filter (where grupo = 'financiamiento'), 0), 2)),
         coalesce((select jsonb_agg(jsonb_build_object('codigo', m.codigo, 'nombre', m.nombre, 'efecto', round(x.efecto, 2)) order by m.codigo)
                   from (select left(g.codigo, 7) as mayor, sum(g.efecto) as efecto from grupos g where g.grupo = 'capital_trabajo'
                         group by 1 having round(sum(g.efecto), 2) <> 0) x
                   join public.cuentas_contables m on m.codigo = x.mayor), '[]'::jsonb)
    into v_indirecto, v_ct
    from grupos;

  return jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'efectivo_inicial', round(v_inicial, 2), 'efectivo_final', round(v_final, 2), 'variacion', round(v_final - v_inicial, 2),
    'directo', v_directo,
    'indirecto', v_indirecto || jsonb_build_object('utilidad', round(v_utilidad, 2), 'detalle_capital_trabajo', v_ct));
end;
$$;

grant execute on function public.fn_ctb_flujo_efectivo(date, date) to authenticated;

-- ------------------------------------------------------------
-- 4. Libros
-- ------------------------------------------------------------
create or replace function public.fn_libro_mayor_general(p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  r record;
  v jsonb := '[]'::jsonb;
begin
  if not public.fn_tiene_permiso('contabilidad', 'ver') then
    raise exception 'No tienes permiso para ver libros contables';
  end if;
  for r in
    select distinct c.id, string_to_array(c.codigo, '.')::int[] as orden
    from public.partida_lineas l join public.partidas p on p.id = l.partida_id and p.estado = 'contabilizada'
    join public.cuentas_contables c on c.id = l.cuenta_id
    where p.fecha between p_desde and p_hasta
    order by 2
  loop
    v := v || public.fn_libro_mayor(r.id, p_desde, p_hasta, null);
  end loop;
  return v;
end;
$$;

grant execute on function public.fn_libro_mayor_general(date, date) to authenticated;

-- Libro de compras: bienes / servicios / sin crédito fiscal (pequeño contribuyente, recibos) / IVA.
create or replace function public.fn_libro_compras(p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_filas jsonb;
  v_totales jsonb;
begin
  if not public.fn_tiene_permiso('contabilidad', 'ver') then
    raise exception 'No tienes permiso para ver libros contables';
  end if;
  with base as (
    select f.id, f.correlativo, f.fecha_emision, f.tipo_documento, f.serie, f.numero, f.nit, f.nombre, f.estado,
           f.total, f.iva_credito, f.total - f.iva_credito as neto,
           case when f.origen = 'orden_compra' then f.total - f.iva_credito
                else coalesce((select sum(l.monto) from public.factura_proveedor_lineas l join public.cuentas_contables c on c.id = l.cuenta_id
                               where l.factura_id = f.id and c.tipo = 'activo'), 0) end as bienes
    from public.facturas_proveedor f
    where f.fecha_emision between p_desde and p_hasta
  ),
  libro as (
    select id, correlativo, fecha_emision, tipo_documento, serie, numero, nit, nombre, estado,
           case when estado = 'anulada' or tipo_documento <> 'factura' then 0 else bienes end as bienes,
           case when estado = 'anulada' or tipo_documento <> 'factura' then 0 else neto - bienes end as servicios,
           case when estado = 'anulada' or tipo_documento = 'factura' then 0 else neto end as sin_credito,
           case when estado = 'anulada' then 0 else iva_credito end as iva,
           case when estado = 'anulada' then 0 else total end as total
    from base
  )
  select coalesce(jsonb_agg(to_jsonb(libro) order by fecha_emision, correlativo), '[]'::jsonb),
         jsonb_build_object('documentos', count(*), 'bienes', coalesce(sum(bienes), 0), 'servicios', coalesce(sum(servicios), 0),
                            'sin_credito', coalesce(sum(sin_credito), 0), 'iva', coalesce(sum(iva), 0), 'total', coalesce(sum(total), 0))
    into v_filas, v_totales from libro;
  return jsonb_build_object('filas', v_filas, 'totales', v_totales);
end;
$$;

grant execute on function public.fn_libro_compras(date, date) to authenticated;

create or replace function public.fn_libro_ventas(p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_filas jsonb;
  v_totales jsonb;
begin
  if not public.fn_tiene_permiso('contabilidad', 'ver') then
    raise exception 'No tienes permiso para ver libros contables';
  end if;
  with libro as (
    select f.correlativo, f.fecha_emision, f.serie, f.numero, f.nit, f.nombre, f.estado, f.venta_id,
           case when f.estado = 'anulada' then 0 else f.base end as base,
           case when f.estado = 'anulada' then 0 else f.impuesto end as impuesto,
           case when f.estado = 'anulada' then 0 else f.total end as total
    from public.facturas_venta f
    where f.fecha_emision between p_desde and p_hasta
  )
  select coalesce(jsonb_agg(to_jsonb(libro) order by fecha_emision, serie, numero), '[]'::jsonb),
         jsonb_build_object('documentos', count(*), 'anuladas', count(*) filter (where estado = 'anulada'),
                            'base', coalesce(sum(base), 0), 'impuesto', coalesce(sum(impuesto), 0), 'total', coalesce(sum(total), 0))
    into v_filas, v_totales from libro;
  return jsonb_build_object('filas', v_filas, 'totales', v_totales,
                            'regimen', (select regimen_iva from public.empresa_contable where id = 1));
end;
$$;

grant execute on function public.fn_libro_ventas(date, date) to authenticated;

-- ------------------------------------------------------------
-- 5. Foliación de libros
-- ------------------------------------------------------------
create table public.libros_folios (
  libro text primary key check (libro in ('diario', 'mayor', 'diario_mayor', 'compras', 'ventas', 'inventarios')),
  folio_inicial int not null check (folio_inicial > 0),
  ultimo_folio int not null,
  definido_por bigint references public.usuarios (id),
  fecha_definicion timestamptz not null default now()
);

create table public.libros_emisiones (
  id bigint generated always as identity primary key,
  libro text not null references public.libros_folios (libro),
  desde date not null,
  hasta date not null,
  folio_desde int not null,
  folio_hasta int not null,
  paginas int not null check (paginas > 0),
  emitido_por bigint references public.usuarios (id),
  fecha_emision timestamptz not null default now(),
  check (folio_hasta = folio_desde + paginas - 1)
);

create trigger trg_auditar_libros_folios after insert or update or delete on public.libros_emisiones
  for each row execute function public.fn_auditar();

alter table public.libros_folios enable row level security;
alter table public.libros_emisiones enable row level security;
create policy sel_libros_folios on public.libros_folios for select to authenticated using ((select public.fn_tiene_permiso('contabilidad', 'ver')));
create policy sel_libros_emisiones on public.libros_emisiones for select to authenticated using ((select public.fn_tiene_permiso('contabilidad', 'ver')));
grant select on public.libros_folios, public.libros_emisiones to authenticated;

-- El folio inicial se define una sola vez por libro (antes de la primera emisión).
create or replace function public.fn_libro_definir_folio_inicial(p_libro text, p_folio int)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('contabilidad', 'configurar') then
    raise exception 'No tienes permiso para definir la foliación';
  end if;
  if coalesce(p_folio, 0) <= 0 then
    raise exception 'El folio inicial debe ser mayor a 0';
  end if;
  if exists (select 1 from public.libros_folios where libro = p_libro) then
    raise exception 'El folio inicial de este libro ya está definido: la foliación continúa automáticamente';
  end if;
  insert into public.libros_folios (libro, folio_inicial, ultimo_folio, definido_por)
  values (p_libro, p_folio, p_folio - 1, public.fn_usuario_id());
end;
$$;

grant execute on function public.fn_libro_definir_folio_inicial(text, int) to authenticated;

create or replace function public.fn_libro_siguiente_folio(p_libro text)
returns int
language sql stable security definer
set search_path = public
as $$
  select ultimo_folio + 1 from public.libros_folios where libro = p_libro;
$$;

grant execute on function public.fn_libro_siguiente_folio(text) to authenticated;

-- Registra una emisión oficial ya generada desde p_folio_desde; falla si otro usuario emitió antes.
create or replace function public.fn_libro_registrar_emision(p_libro text, p_desde date, p_hasta date, p_folio_desde int, p_paginas int)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_ultimo int;
  v_id bigint;
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para emitir libros oficiales';
  end if;
  select ultimo_folio into v_ultimo from public.libros_folios where libro = p_libro for update;
  if not found then
    raise exception 'Primero define el folio inicial del libro';
  end if;
  if v_ultimo + 1 <> p_folio_desde then
    raise exception 'Otro usuario emitió este libro mientras se generaba: vuelve a emitirlo';
  end if;
  insert into public.libros_emisiones (libro, desde, hasta, folio_desde, folio_hasta, paginas, emitido_por)
  values (p_libro, p_desde, p_hasta, p_folio_desde, p_folio_desde + p_paginas - 1, p_paginas, public.fn_usuario_id())
  returning id into v_id;
  update public.libros_folios set ultimo_folio = p_folio_desde + p_paginas - 1 where libro = p_libro;
  return v_id;
end;
$$;

grant execute on function public.fn_libro_registrar_emision(text, date, date, int, int) to authenticated;

-- ------------------------------------------------------------
-- 6. Partida de cierre del ejercicio
-- ------------------------------------------------------------
insert into public.config_contable_eventos (clave, grupo, descripcion, cuenta_id, requiere_cuenta, orden)
select 'cierre.resultado', 'Apertura', 'Resultado del ejercicio (partida de cierre anual)', c.id, true, 121
from public.cuentas_contables c where c.codigo = '3.03.01.003'
on conflict (clave) do nothing;

create or replace function public.fn_ctb_generar_cierre_anual(p_anio int)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_fin date := make_date(p_anio, 12, 31);
  v_lineas jsonb := '[]'::jsonb;
  r record;
  v_neto numeric := 0;
begin
  if not public.fn_tiene_permiso('contabilidad', 'cerrar_periodo') then
    raise exception 'No tienes permiso para generar la partida de cierre';
  end if;
  if exists (select 1 from public.partidas where origen = 'cierre' and origen_id = p_anio and estado <> 'anulada' and revertida_por_id is null) then
    raise exception 'Ya existe la partida de cierre de %: revísala o reviértela', p_anio;
  end if;
  if exists (select 1 from public.partidas where estado = 'borrador' and fecha between make_date(p_anio, 1, 1) and v_fin and origen <> 'cierre') then
    raise exception 'Hay partidas en borrador en %: contabilízalas o descártalas primero', p_anio;
  end if;
  for r in
    select l.cuenta_id, l.centro_costo_id, sum(l.debe - l.haber) as saldo
    from public.partida_lineas l join public.partidas p on p.id = l.partida_id and p.estado = 'contabilizada'
    join public.cuentas_contables c on c.id = l.cuenta_id
    where p.fecha between make_date(p_anio, 1, 1) and v_fin and c.tipo in ('ingreso', 'costo', 'gasto')
    group by l.cuenta_id, l.centro_costo_id
    having round(sum(l.debe - l.haber), 2) <> 0
  loop
    v_lineas := v_lineas || public.fn_ctb_linea(r.cuenta_id, r.centro_costo_id, -r.saldo, 0, 'Cierre del ejercicio');
    v_neto := v_neto + r.saldo;
  end loop;
  if jsonb_array_length(v_lineas) = 0 then
    raise exception 'No hay saldos de resultados en %', p_anio;
  end if;
  v_lineas := v_lineas || public.fn_ctb_linea(public.fn_ctb_cuenta('cierre.resultado'), null, v_neto, 0,
                                              case when v_neto < 0 then 'Utilidad del ejercicio' else 'Pérdida del ejercicio' end);
  return public.fn_ctb_registrar_auto('cierre', p_anio, v_fin,
    'Partida de cierre del ejercicio ' || p_anio || ' (traslada ingresos, costos y gastos a Resultado del ejercicio)', v_lineas, 'cierre');
end;
$$;

grant execute on function public.fn_ctb_generar_cierre_anual(int) to authenticated;

-- Verificación
select count(*) as funciones from pg_proc
where proname in ('fn_ctb_balance_general', 'fn_ctb_estado_resultados_cc', 'fn_ctb_flujo_efectivo', 'fn_libro_mayor_general',
                  'fn_libro_compras', 'fn_libro_ventas', 'fn_libro_registrar_emision', 'fn_ctb_generar_cierre_anual');
