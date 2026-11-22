-- ============================================================
-- ASTRO — Recursos humanos (fase 3): planilla quincenal.
--
--   planillas                 una por tipo (contrato laboral / otros pagos por
--                             servicios), año, mes y quincena (1: del 1 al 15,
--                             2: del 16 al fin de mes). Borrador → aprobada →
--                             pagada; una aprobada se puede anular.
--   planilla_lineas           una por colaborador: foto del salario y datos de
--                             pago al generar, lo que se captura (horas extra,
--                             comisiones, bonos, descuentos) y lo calculado.
--   planilla_linea_deducciones  préstamos, anticipos y embargos aplicados
--
-- Cálculo (contrato laboral), quincena = 15 días comerciales:
--   salario y bonificación incentiva proporcionales a los días laborados (se
--   descuentan ausencias aprobadas sin goce de salario); horas extra al 150 %
--   del valor de la hora ordinaria según la jornada (8, 7 o 6 horas);
--   IGSS laboral 4.83 % y patronal 12.67 % (IGSS 10.67 % + INTECAP 1 % + IRTRA 1 %)
--   sobre salario, extras, comisiones y bonos — la bonificación incentiva no
--   cotiza (Decreto 37-2001); ISR proyectado al año: renta afecta − Q48,000 −
--   IGSS, 5 % hasta Q300,000 y Q15,000 + 7 % del excedente, repartido entre
--   las quincenas que faltan (Decreto 10-2012). Provisiones de aguinaldo, bono
--   14, vacaciones e indemnización sobre el salario ordinario.
-- Otros pagos (servicios): honorarios proporcionales a los días, extras y
--   otros pagos; sin IGSS ni prestaciones; retención de ISR 5 % si aplica.
-- Porcentajes en rrhh_config (editables).
--
-- Contabilidad (si la contabilización automática está encendida): al aprobar,
-- partida de devengo; al pagar, movimiento bancario que salda Sueldos por pagar.
-- ============================================================

insert into public.permisos (modulo, accion, descripcion) values
  ('planilla', 'ver', 'Ver planillas, boletas e historial de pagos'),
  ('planilla', 'gestionar', 'Generar planillas y capturar horas extra, comisiones y descuentos'),
  ('planilla', 'aprobar', 'Aprobar y anular planillas'),
  ('planilla', 'pagar', 'Registrar el pago de planillas en bancos')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from public.roles r
join public.permisos p on p.modulo = 'planilla'
where r.nombre in ('admin', 'contabilidad')
on conflict (rol_id, permiso_id) do nothing;

-- Porcentajes de ley y provisiones
alter table public.rrhh_config
  add column if not exists igss_laboral_pct numeric(5,2) not null default 4.83,
  add column if not exists igss_patronal_pct numeric(5,2) not null default 12.67,
  add column if not exists isr_deduccion_personal numeric(12,2) not null default 48000,
  add column if not exists isr_retencion_servicios_pct numeric(5,2) not null default 5,
  add column if not exists prov_aguinaldo_pct numeric(5,2) not null default 8.33,
  add column if not exists prov_bono14_pct numeric(5,2) not null default 8.33,
  add column if not exists prov_vacaciones_pct numeric(5,2) not null default 4.17,
  add column if not exists prov_indemnizacion_pct numeric(5,2) not null default 9.72;

-- Cuentas contables de la planilla (Datos contables → Mapeo de cuentas)
insert into public.config_contable_eventos (clave, grupo, descripcion, cuenta_id, centro_costo_id, requiere_cuenta, orden)
select e.clave, 'Planilla', e.descripcion, c.id, cc.id, true, e.orden
from (values
  ('planilla.sueldos', 'Sueldos, extras, comisiones y bonificación incentiva', '6.01.01.001', 'CC-ADM', 100),
  ('planilla.igss_patronal', 'Cuota patronal IGSS, INTECAP e IRTRA', '6.01.01.002', 'CC-ADM', 101),
  ('planilla.prestaciones', 'Provisión de prestaciones laborales (gasto)', '6.01.01.003', 'CC-ADM', 102),
  ('planilla.honorarios', 'Planilla de otros pagos (servicios)', '6.01.02.007', 'CC-ADM', 103),
  ('planilla.por_pagar', 'Sueldos por pagar (líquido a recibir)', '2.01.06.001', null, 104),
  ('planilla.igss_por_pagar', 'Cuotas IGSS por pagar (laboral y patronal)', '2.01.06.002', null, 105),
  ('planilla.isr_por_pagar', 'ISR retenido por pagar', '2.01.05.003', null, 106),
  ('planilla.retenciones', 'Descuentos a colaboradores (préstamos, embargos, otros)', '2.01.05.004', null, 107),
  ('planilla.prov_indemnizacion', 'Provisión de indemnizaciones', '2.01.06.003', null, 108),
  ('planilla.prov_aguinaldo', 'Provisión de aguinaldo', '2.01.06.004', null, 109),
  ('planilla.prov_bono14', 'Provisión de bono 14', '2.01.06.005', null, 110),
  ('planilla.prov_vacaciones', 'Provisión de vacaciones', '2.01.06.006', null, 111)
) as e(clave, descripcion, codigo, cc, orden)
left join public.cuentas_contables c on c.codigo = e.codigo
left join public.centros_costo cc on cc.codigo = e.cc
on conflict (clave) do nothing;

-- Pago de planilla como origen de movimiento bancario
alter table public.movimientos_banco drop constraint if exists movimientos_banco_origen_check;
alter table public.movimientos_banco add constraint movimientos_banco_origen_check check (origen in (
  'cobro_venta', 'gasto', 'otro_ingreso', 'pago_proveedor', 'pago_comisiones', 'transferencia',
  'comision_bancaria', 'ajuste', 'otro', 'nota_debito', 'nota_credito', 'pago_planilla'));

-- ------------------------------------------------------------
-- 1. Tablas
-- ------------------------------------------------------------
create table public.planillas (
  id bigint generated always as identity primary key,
  codigo text not null,
  tipo text not null check (tipo in ('contrato', 'servicios')),
  anio int not null check (anio between 2020 and 2100),
  mes int not null check (mes between 1 and 12),
  quincena int not null check (quincena in (1, 2)),
  fecha_inicio date not null,
  fecha_fin date not null,
  fecha_pago date,
  estado text not null default 'borrador' check (estado in ('borrador', 'aprobada', 'pagada', 'anulada')),
  empleados int not null default 0,
  total_devengado numeric(14,2) not null default 0,
  total_descuentos numeric(14,2) not null default 0,
  total_liquido numeric(14,2) not null default 0,
  total_patronal numeric(14,2) not null default 0,
  total_provisiones numeric(14,2) not null default 0,
  partida_id bigint references public.partidas (id),
  cuenta_bancaria_id bigint references public.cuentas_bancarias (id),
  movimiento_banco_id bigint references public.movimientos_banco (id),
  notas text,
  creado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now(),
  aprobado_por bigint references public.usuarios (id),
  fecha_aprobacion timestamptz,
  pagado_por bigint references public.usuarios (id),
  fecha_pagada timestamptz,
  anulado_por bigint references public.usuarios (id),
  fecha_anulacion timestamptz,
  motivo_anulacion text,
  calculada_en timestamptz
);
create unique index uq_planilla_periodo on public.planillas (tipo, anio, mes, quincena) where estado <> 'anulada';
create index idx_planillas_periodo on public.planillas (anio desc, mes desc, quincena desc);

create table public.planilla_lineas (
  id bigint generated always as identity primary key,
  planilla_id bigint not null references public.planillas (id) on delete cascade,
  colaborador_id bigint not null references public.colaboradores (id),
  -- Foto al generar o recalcular
  nombre text not null,
  puesto text,
  departamento text,
  fecha_ingreso date,
  centro_costo_id bigint references public.centros_costo (id),
  tipo_salario text not null,
  salario_base numeric(12,2) not null,
  bonificacion_mensual numeric(12,2) not null default 0,
  otras_bonificaciones_mensual numeric(12,2) not null default 0,
  jornada text,
  aplica_igss boolean not null,
  aplica_isr boolean not null,
  forma_pago text,
  banco text,
  tipo_cuenta text,
  numero_cuenta text,
  -- Captura
  dias_manual numeric(5,2) check (dias_manual >= 0 and dias_manual <= 31),
  horas_extra numeric(7,2) not null default 0 check (horas_extra >= 0),
  extras_monto numeric(12,2) not null default 0 check (extras_monto >= 0),
  comisiones numeric(12,2) not null default 0 check (comisiones >= 0),
  bonos_adicionales numeric(12,2) not null default 0 check (bonos_adicionales >= 0),
  otros_descuentos numeric(12,2) not null default 0 check (otros_descuentos >= 0),
  otros_descuentos_detalle text,
  notas text,
  -- Cálculo
  dias_periodo numeric(5,2) not null default 0,
  dias_sin_goce numeric(5,2) not null default 0,
  dias_laborados numeric(5,2) not null default 0,
  salario_devengado numeric(12,2) not null default 0,
  bonificacion_incentiva numeric(12,2) not null default 0,
  otros_bonos numeric(12,2) not null default 0,
  valor_horas_extra numeric(12,2) not null default 0,
  renta_afecta numeric(12,2) not null default 0,
  total_devengado numeric(12,2) not null default 0,
  igss_laboral numeric(12,2) not null default 0,
  isr numeric(12,2) not null default 0,
  deducciones numeric(12,2) not null default 0,
  total_descuentos numeric(12,2) not null default 0,
  liquido numeric(12,2) not null default 0,
  igss_patronal numeric(12,2) not null default 0,
  prov_aguinaldo numeric(12,2) not null default 0,
  prov_bono14 numeric(12,2) not null default 0,
  prov_vacaciones numeric(12,2) not null default 0,
  prov_indemnizacion numeric(12,2) not null default 0,
  unique (planilla_id, colaborador_id)
);
create index idx_planilla_lineas_colaborador on public.planilla_lineas (colaborador_id);

create table public.planilla_linea_deducciones (
  id bigint generated always as identity primary key,
  linea_id bigint not null references public.planilla_lineas (id) on delete cascade,
  deduccion_id bigint not null references public.colaborador_deducciones (id),
  monto numeric(12,2) not null check (monto > 0)
);
create index idx_planilla_linea_deducciones on public.planilla_linea_deducciones (linea_id);

-- ------------------------------------------------------------
-- 2. Cálculo
-- ------------------------------------------------------------
-- ISR anual de asalariados sobre la renta imponible (Decreto 10-2012, art. 73).
create or replace function public.fn_rrhh_isr_anual(p_renta numeric)
returns numeric
language sql immutable
as $$
  select case when coalesce(p_renta, 0) <= 0 then 0
              when p_renta <= 300000 then round(p_renta * 0.05, 2)
              else round(15000 + (p_renta - 300000) * 0.07, 2) end
$$;

grant execute on function public.fn_rrhh_isr_anual(numeric) to authenticated;

create or replace function public.fn_rrhh_planilla_calcular_linea(p_linea_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  l public.planilla_lineas%rowtype;
  p public.planillas%rowtype;
  c public.colaboradores%rowtype;
  cfg public.rrhh_config%rowtype;
  d record;
  acum record;
  v_ini date;
  v_fin date;
  v_dias_periodo numeric;
  v_sin_goce numeric := 0;
  v_dias numeric;
  v_horas int;
  v_diario numeric;
  v_sal numeric;
  v_bono numeric := 0;
  v_otros numeric;
  v_extras numeric;
  v_afecto numeric;
  v_total numeric;
  v_igss numeric := 0;
  v_patronal numeric := 0;
  v_isr numeric := 0;
  v_ded numeric := 0;
  v_disp numeric;
  v_cuota numeric;
  v_n int;
  v_rest int;
  v_normal numeric;
  v_igss_normal numeric;
  v_base_prest numeric := 0;
begin
  select * into l from public.planilla_lineas where id = p_linea_id;
  select * into p from public.planillas where id = l.planilla_id;
  select * into c from public.colaboradores where id = l.colaborador_id;
  select * into cfg from public.rrhh_config where id = 1;

  -- Días del período: 15 comerciales, menos los días antes del ingreso o después de la baja.
  v_ini := greatest(p.fecha_inicio, coalesce(c.fecha_ingreso, p.fecha_inicio));
  v_fin := least(p.fecha_fin, coalesce(c.fecha_baja, p.fecha_fin));
  if v_fin < v_ini then
    v_dias_periodo := 0;
  else
    v_dias_periodo := greatest(15 - (v_ini - p.fecha_inicio) - (p.fecha_fin - v_fin), 0);
  end if;

  -- Ausencias aprobadas sin goce: licencias por días de calendario; permisos y faltas por días hábiles.
  if v_dias_periodo > 0 then
    for d in
      select a.fecha_inicio, a.fecha_fin, a.dias, t.categoria
      from public.rrhh_ausencias a join public.rrhh_tipos_ausencia t on t.id = a.tipo_ausencia_id
      where a.colaborador_id = c.id and a.estado = 'aprobada' and not a.con_goce
        and a.fecha_inicio <= v_fin and a.fecha_fin >= v_ini
    loop
      if d.categoria = 'licencia' then
        v_sin_goce := v_sin_goce + (least(d.fecha_fin, v_fin) - greatest(d.fecha_inicio, v_ini) + 1);
      elsif d.fecha_inicio >= v_ini and d.fecha_fin <= v_fin then
        v_sin_goce := v_sin_goce + d.dias;
      else
        v_sin_goce := v_sin_goce + public.fn_rrhh_dias_habiles(greatest(d.fecha_inicio, v_ini), least(d.fecha_fin, v_fin));
      end if;
    end loop;
  end if;
  v_sin_goce := least(v_sin_goce, v_dias_periodo);
  v_dias := coalesce(l.dias_manual, v_dias_periodo - v_sin_goce);

  v_horas := case l.jornada when 'mixta' then 7 when 'nocturna' then 6 else 8 end;
  v_diario := case l.tipo_salario when 'por_dia' then l.salario_base
                                  when 'por_hora' then l.salario_base * v_horas
                                  else l.salario_base / 30 end;
  v_sal := round(v_diario * v_dias, 2);
  v_otros := round(l.otras_bonificaciones_mensual / 30 * v_dias, 2);

  if p.tipo = 'contrato' then
    v_bono := round(l.bonificacion_mensual / 30 * v_dias, 2);
    v_extras := round(l.horas_extra * v_diario / v_horas * 1.5, 2);
    v_afecto := v_sal + v_extras + l.comisiones + v_otros + l.bonos_adicionales;
    if l.aplica_igss then
      v_igss := round(v_afecto * cfg.igss_laboral_pct / 100, 2);
      v_patronal := round(v_afecto * cfg.igss_patronal_pct / 100, 2);
    end if;
    if l.aplica_isr and v_afecto > 0 then
      v_n := (p.mes - 1) * 2 + p.quincena;
      v_rest := 24 - v_n;
      if c.fecha_baja is not null and extract(year from c.fecha_baja) = p.anio then
        v_rest := greatest(least(v_rest,
          ((extract(month from c.fecha_baja)::int - 1) * 2 + case when extract(day from c.fecha_baja) > 15 then 2 else 1 end) - v_n), 0);
      end if;
      select coalesce(sum(pl.renta_afecta), 0) as renta, coalesce(sum(pl.igss_laboral), 0) as igss, coalesce(sum(pl.isr), 0) as isr
        into acum
        from public.planilla_lineas pl join public.planillas pp on pp.id = pl.planilla_id
        where pl.colaborador_id = c.id and pp.tipo = 'contrato' and pp.anio = p.anio and pp.estado in ('aprobada', 'pagada')
          and (pp.mes - 1) * 2 + pp.quincena < v_n;
      v_normal := v_diario * 15 + l.otras_bonificaciones_mensual / 2;
      v_igss_normal := case when l.aplica_igss then round(v_normal * cfg.igss_laboral_pct / 100, 2) else 0 end;
      v_isr := greatest(round((public.fn_rrhh_isr_anual(greatest(
                 acum.renta + v_afecto + v_normal * v_rest - cfg.isr_deduccion_personal - (acum.igss + v_igss + v_igss_normal * v_rest), 0))
               - acum.isr) / (v_rest + 1), 2), 0);
    end if;
    v_base_prest := v_sal + l.comisiones + v_otros + l.bonos_adicionales;
    v_total := v_afecto + v_bono;
  else
    v_extras := l.extras_monto;
    v_afecto := v_sal + v_extras + l.comisiones + v_otros + l.bonos_adicionales;
    if l.aplica_isr then
      v_isr := round(v_afecto * cfg.isr_retencion_servicios_pct / 100, 2);
    end if;
    v_total := v_afecto;
  end if;

  -- Deducciones autorizadas: primero embargos; nunca dejan el líquido negativo.
  delete from public.planilla_linea_deducciones where linea_id = l.id;
  v_disp := v_total - v_igss - v_isr - l.otros_descuentos;
  for d in
    select id, cuota, saldo, monto_total from public.colaborador_deducciones
    where colaborador_id = c.id and activa and fecha_inicio <= p.fecha_fin and (monto_total is null or coalesce(saldo, 0) > 0)
    order by (tipo = 'embargo') desc, id
  loop
    exit when v_disp <= 0 or v_dias <= 0;
    v_cuota := least(d.cuota, case when d.monto_total is null then d.cuota else d.saldo end, v_disp);
    continue when v_cuota <= 0;
    insert into public.planilla_linea_deducciones (linea_id, deduccion_id, monto) values (l.id, d.id, round(v_cuota, 2));
    v_ded := v_ded + round(v_cuota, 2);
    v_disp := v_disp - round(v_cuota, 2);
  end loop;

  update public.planilla_lineas set
    dias_periodo = v_dias_periodo, dias_sin_goce = v_sin_goce, dias_laborados = v_dias,
    salario_devengado = v_sal, bonificacion_incentiva = v_bono, otros_bonos = v_otros, valor_horas_extra = v_extras,
    renta_afecta = v_afecto, total_devengado = v_total, igss_laboral = v_igss, isr = v_isr, deducciones = v_ded,
    total_descuentos = v_igss + v_isr + v_ded + l.otros_descuentos,
    liquido = v_total - v_igss - v_isr - v_ded - l.otros_descuentos,
    igss_patronal = v_patronal,
    prov_aguinaldo = round(v_base_prest * cfg.prov_aguinaldo_pct / 100, 2),
    prov_bono14 = round(v_base_prest * cfg.prov_bono14_pct / 100, 2),
    prov_vacaciones = round(v_base_prest * cfg.prov_vacaciones_pct / 100, 2),
    prov_indemnizacion = round(v_base_prest * cfg.prov_indemnizacion_pct / 100, 2)
  where id = l.id;
end;
$$;

revoke all on function public.fn_rrhh_planilla_calcular_linea(bigint) from public, anon, authenticated;

create or replace function public.fn_rrhh_planilla_totales(p_id bigint)
returns void
language sql security definer
set search_path = public
as $$
  update public.planillas p set
    empleados = t.empleados, total_devengado = t.devengado, total_descuentos = t.descuentos, total_liquido = t.liquido,
    total_patronal = t.patronal, total_provisiones = t.provisiones, calculada_en = clock_timestamp()
  from (select count(*) filter (where total_devengado > 0) as empleados,
               coalesce(sum(total_devengado), 0) as devengado, coalesce(sum(total_descuentos), 0) as descuentos,
               coalesce(sum(liquido), 0) as liquido, coalesce(sum(igss_patronal), 0) as patronal,
               coalesce(sum(prov_aguinaldo + prov_bono14 + prov_vacaciones + prov_indemnizacion), 0) as provisiones
        from public.planilla_lineas where planilla_id = p_id) t
  where p.id = p_id;
$$;

revoke all on function public.fn_rrhh_planilla_totales(bigint) from public, anon, authenticated;

-- Agrega a quien corresponde y actualiza la foto de salario y datos de pago (conserva lo capturado).
create or replace function public.fn_rrhh_planilla_cargar(p_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  p public.planillas%rowtype;
  r record;
begin
  select * into p from public.planillas where id = p_id;
  insert into public.planilla_lineas (planilla_id, colaborador_id, nombre, puesto, departamento, fecha_ingreso, centro_costo_id,
    tipo_salario, salario_base, bonificacion_mensual, otras_bonificaciones_mensual, jornada, aplica_igss, aplica_isr,
    forma_pago, banco, tipo_cuenta, numero_cuenta)
  select p.id, c.id, c.nombres || ' ' || c.apellidos, pu.nombre, de.nombre, c.fecha_ingreso,
    coalesce(c.centro_costo_id,
             (select cc.id from public.centros_costo cc where cc.tienda_id = c.tienda_id and cc.activo order by cc.id limit 1),
             public.fn_ctb_cc(case when p.tipo = 'contrato' then 'planilla.sueldos' else 'planilla.honorarios' end)),
    s.tipo_salario, s.salario_base, case when p.tipo = 'contrato' then s.bonificacion_incentiva else 0 end, s.otras_bonificaciones,
    c.jornada, s.aplica_igss and p.tipo = 'contrato', s.aplica_isr, s.forma_pago, s.banco, s.tipo_cuenta, s.numero_cuenta
  from public.colaboradores c
  join public.colaborador_salarios s on s.colaborador_id = c.id
  left join public.rrhh_puestos pu on pu.id = c.puesto_id
  left join public.rrhh_departamentos de on de.id = c.departamento_id
  where c.tipo_planilla = p.tipo
    and c.fecha_ingreso is not null and c.fecha_ingreso <= p.fecha_fin
    and (c.fecha_baja is null or c.fecha_baja >= p.fecha_inicio)
    and c.estado <> 'suspendido'
    and (c.estado <> 'baja' or c.fecha_baja is not null)
  on conflict (planilla_id, colaborador_id) do update set
    nombre = excluded.nombre, puesto = excluded.puesto, departamento = excluded.departamento, fecha_ingreso = excluded.fecha_ingreso,
    centro_costo_id = excluded.centro_costo_id, tipo_salario = excluded.tipo_salario, salario_base = excluded.salario_base,
    bonificacion_mensual = excluded.bonificacion_mensual, otras_bonificaciones_mensual = excluded.otras_bonificaciones_mensual,
    jornada = excluded.jornada, aplica_igss = excluded.aplica_igss, aplica_isr = excluded.aplica_isr, forma_pago = excluded.forma_pago,
    banco = excluded.banco, tipo_cuenta = excluded.tipo_cuenta, numero_cuenta = excluded.numero_cuenta;
  for r in select id from public.planilla_lineas where planilla_id = p_id loop
    perform public.fn_rrhh_planilla_calcular_linea(r.id);
  end loop;
  perform public.fn_rrhh_planilla_totales(p_id);
end;
$$;

revoke all on function public.fn_rrhh_planilla_cargar(bigint) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Flujo: generar, capturar, recalcular, aprobar, pagar, anular
-- ------------------------------------------------------------
create or replace function public.fn_rrhh_planilla_generar(p_tipo text, p_anio int, p_mes int, p_quincena int, p_fecha_pago date default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_ini date;
  v_fin date;
  v_id bigint;
begin
  if not public.fn_tiene_permiso('planilla', 'gestionar') then
    raise exception 'No tienes permiso para generar planillas';
  end if;
  if p_tipo not in ('contrato', 'servicios') or p_quincena not in (1, 2) or p_mes not between 1 and 12 then
    raise exception 'Indica el tipo de planilla, el mes y la quincena';
  end if;
  if exists (select 1 from public.planillas where tipo = p_tipo and anio = p_anio and mes = p_mes and quincena = p_quincena and estado <> 'anulada') then
    raise exception 'Ya existe la planilla de esa quincena';
  end if;
  v_ini := make_date(p_anio, p_mes, case when p_quincena = 1 then 1 else 16 end);
  v_fin := case when p_quincena = 1 then make_date(p_anio, p_mes, 15)
                else (make_date(p_anio, p_mes, 1) + interval '1 month' - interval '1 day')::date end;
  insert into public.planillas (codigo, tipo, anio, mes, quincena, fecha_inicio, fecha_fin, fecha_pago, creado_por)
  values (case when p_tipo = 'contrato' then 'PC-' else 'PS-' end || p_anio || lpad(p_mes::text, 2, '0') || '-Q' || p_quincena,
          p_tipo, p_anio, p_mes, p_quincena, v_ini, v_fin, coalesce(p_fecha_pago, v_fin), public.fn_usuario_id())
  returning id into v_id;
  perform public.fn_rrhh_planilla_cargar(v_id);
  return v_id;
end;
$$;

grant execute on function public.fn_rrhh_planilla_generar(text, int, int, int, date) to authenticated;

create or replace function public.fn_rrhh_planilla_recalcular(p_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('planilla', 'gestionar') then
    raise exception 'No tienes permiso para modificar planillas';
  end if;
  perform 1 from public.planillas where id = p_id and estado = 'borrador' for update;
  if not found then
    raise exception 'Solo se recalcula una planilla en borrador';
  end if;
  perform public.fn_rrhh_planilla_cargar(p_id);
end;
$$;

grant execute on function public.fn_rrhh_planilla_recalcular(bigint) to authenticated;

-- p_datos: {dias_manual ("" = automático), horas_extra, extras_monto, comisiones, bonos_adicionales,
--           otros_descuentos, otros_descuentos_detalle, notas}
create or replace function public.fn_rrhh_planilla_editar_linea(p_linea_id bigint, p_datos jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_planilla bigint;
  v_n numeric;
  k text;
begin
  if not public.fn_tiene_permiso('planilla', 'gestionar') then
    raise exception 'No tienes permiso para modificar planillas';
  end if;
  select l.planilla_id into v_planilla from public.planilla_lineas l join public.planillas p on p.id = l.planilla_id
    where l.id = p_linea_id and p.estado = 'borrador' for update of p;
  if v_planilla is null then
    raise exception 'Solo se modifica una planilla en borrador';
  end if;
  foreach k in array array['horas_extra', 'extras_monto', 'comisiones', 'bonos_adicionales', 'otros_descuentos', 'dias_manual'] loop
    v_n := nullif(p_datos ->> k, '')::numeric;
    if v_n < 0 then
      raise exception 'Los montos y las horas no pueden ser negativos';
    end if;
  end loop;
  if nullif(p_datos ->> 'dias_manual', '')::numeric > 15 then
    raise exception 'Los días de una quincena no pueden pasar de 15';
  end if;
  update public.planilla_lineas set
    dias_manual = nullif(p_datos ->> 'dias_manual', '')::numeric,
    horas_extra = coalesce(nullif(p_datos ->> 'horas_extra', '')::numeric, 0),
    extras_monto = coalesce(nullif(p_datos ->> 'extras_monto', '')::numeric, 0),
    comisiones = coalesce(nullif(p_datos ->> 'comisiones', '')::numeric, 0),
    bonos_adicionales = coalesce(nullif(p_datos ->> 'bonos_adicionales', '')::numeric, 0),
    otros_descuentos = coalesce(nullif(p_datos ->> 'otros_descuentos', '')::numeric, 0),
    otros_descuentos_detalle = nullif(btrim(coalesce(p_datos ->> 'otros_descuentos_detalle', '')), ''),
    notas = nullif(btrim(coalesce(p_datos ->> 'notas', '')), '')
  where id = p_linea_id;
  perform public.fn_rrhh_planilla_calcular_linea(p_linea_id);
  perform public.fn_rrhh_planilla_totales(v_planilla);
end;
$$;

grant execute on function public.fn_rrhh_planilla_editar_linea(bigint, jsonb) to authenticated;

create or replace function public.fn_rrhh_planilla_eliminar(p_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('planilla', 'gestionar') then
    raise exception 'No tienes permiso para eliminar planillas';
  end if;
  delete from public.planillas where id = p_id and estado = 'borrador';
  if not found then
    raise exception 'Solo se elimina una planilla en borrador';
  end if;
end;
$$;

grant execute on function public.fn_rrhh_planilla_eliminar(bigint) to authenticated;

-- Partida de devengo agrupada por centro de costo.
create or replace function public.fn_rrhh_planilla_contabilizar(p_id bigint)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  p public.planillas%rowtype;
  v_emp public.empresa_contable%rowtype;
  v_lineas jsonb := '[]'::jsonb;
  v_desc text;
  t record;
begin
  select * into p from public.planillas where id = p_id;
  select * into v_emp from public.empresa_contable where id = 1;
  if not found or not v_emp.contabilizacion_automatica or v_emp.fecha_inicio_contable is null or p.fecha_fin < v_emp.fecha_inicio_contable then
    return null;
  end if;
  v_desc := 'Planilla ' || p.codigo;
  if p.tipo = 'contrato' then
    select v_lineas || coalesce(jsonb_agg(x), '[]'::jsonb) into v_lineas from (
      select public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.sueldos'), coalesce(centro_costo_id, public.fn_ctb_cc('planilla.sueldos')),
                                 sum(total_devengado), 0, v_desc) as x
        from public.planilla_lineas where planilla_id = p_id group by coalesce(centro_costo_id, public.fn_ctb_cc('planilla.sueldos'))
      union all
      select public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.igss_patronal'), coalesce(centro_costo_id, public.fn_ctb_cc('planilla.igss_patronal')),
                                 sum(igss_patronal), 0, 'Cuota patronal ' || p.codigo)
        from public.planilla_lineas where planilla_id = p_id group by coalesce(centro_costo_id, public.fn_ctb_cc('planilla.igss_patronal'))
      union all
      select public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.prestaciones'), coalesce(centro_costo_id, public.fn_ctb_cc('planilla.prestaciones')),
                                 sum(prov_aguinaldo + prov_bono14 + prov_vacaciones + prov_indemnizacion), 0, 'Provisión de prestaciones ' || p.codigo)
        from public.planilla_lineas where planilla_id = p_id group by coalesce(centro_costo_id, public.fn_ctb_cc('planilla.prestaciones'))
    ) q;
    select * into t from (
      select coalesce(sum(liquido), 0) liquido, coalesce(sum(igss_laboral + igss_patronal), 0) igss, coalesce(sum(isr), 0) isr,
             coalesce(sum(deducciones + otros_descuentos), 0) retenciones,
             coalesce(sum(prov_indemnizacion), 0) indem, coalesce(sum(prov_aguinaldo), 0) agui,
             coalesce(sum(prov_bono14), 0) b14, coalesce(sum(prov_vacaciones), 0) vac
      from public.planilla_lineas where planilla_id = p_id) s;
    v_lineas := v_lineas || jsonb_build_array(
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.por_pagar'), null, 0, t.liquido, 'Líquido a pagar ' || p.codigo),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.igss_por_pagar'), null, 0, t.igss, 'IGSS laboral y patronal ' || p.codigo),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.isr_por_pagar'), null, 0, t.isr, 'ISR retenido ' || p.codigo),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.retenciones'), null, 0, t.retenciones, 'Descuentos ' || p.codigo),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.prov_indemnizacion'), null, 0, t.indem, 'Provisión de indemnización'),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.prov_aguinaldo'), null, 0, t.agui, 'Provisión de aguinaldo'),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.prov_bono14'), null, 0, t.b14, 'Provisión de bono 14'),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.prov_vacaciones'), null, 0, t.vac, 'Provisión de vacaciones'));
  else
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_lineas from (
      select public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.honorarios'), coalesce(centro_costo_id, public.fn_ctb_cc('planilla.honorarios')),
                                 sum(total_devengado), 0, v_desc) as x
        from public.planilla_lineas where planilla_id = p_id group by coalesce(centro_costo_id, public.fn_ctb_cc('planilla.honorarios'))
    ) q;
    select * into t from (
      select coalesce(sum(liquido), 0) liquido, coalesce(sum(isr), 0) isr, coalesce(sum(deducciones + otros_descuentos), 0) retenciones
      from public.planilla_lineas where planilla_id = p_id) s;
    v_lineas := v_lineas || jsonb_build_array(
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.por_pagar'), null, 0, t.liquido, 'Líquido a pagar ' || p.codigo),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.isr_por_pagar'), null, 0, t.isr, 'ISR retenido ' || p.codigo),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.retenciones'), null, 0, t.retenciones, 'Descuentos ' || p.codigo));
  end if;
  return public.fn_ctb_registrar_auto('planilla', p_id, p.fecha_fin,
    v_desc || ' — ' || case when p.tipo = 'contrato' then 'contrato laboral' else 'otros pagos (servicios)' end
      || ', quincena ' || p.quincena || ' de ' || to_char(p.fecha_inicio, 'MM/YYYY'), v_lineas);
end;
$$;

revoke all on function public.fn_rrhh_planilla_contabilizar(bigint) from public, anon, authenticated;

create or replace function public.fn_rrhh_planilla_aprobar(p_id bigint)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  p public.planillas%rowtype;
  v_partida bigint;
begin
  if not public.fn_tiene_permiso('planilla', 'aprobar') then
    raise exception 'No tienes permiso para aprobar planillas';
  end if;
  select * into p from public.planillas where id = p_id for update;
  if not found or p.estado <> 'borrador' then
    raise exception 'Solo se aprueba una planilla en borrador';
  end if;
  if not exists (select 1 from public.planilla_lineas where planilla_id = p_id and total_devengado > 0) then
    raise exception 'La planilla no tiene montos a pagar';
  end if;
  if exists (select 1 from public.planilla_lineas where planilla_id = p_id and liquido < 0) then
    raise exception 'Hay colaboradores con líquido negativo: revisa los descuentos';
  end if;
  -- Una quincena anterior del mismo tipo que siga en borrador desordenaría el ISR acumulado.
  if exists (select 1 from public.planillas where tipo = p.tipo and estado = 'borrador' and id <> p_id
             and (anio, mes, quincena) < (p.anio, p.mes, p.quincena)) then
    raise exception 'Primero aprueba (o elimina) las planillas anteriores que siguen en borrador';
  end if;
  -- Si después de calcularla se aprobó o anuló una quincena anterior, el ISR acumulado cambió.
  if exists (select 1 from public.planillas where tipo = p.tipo and anio = p.anio and id <> p_id
             and (anio, mes, quincena) < (p.anio, p.mes, p.quincena)
             and greatest(fecha_aprobacion, fecha_anulacion) > p.calculada_en) then
    raise exception 'Se aprobó o anuló una quincena anterior después de calcular esta: recalcula la planilla antes de aprobarla';
  end if;
  -- Un préstamo no puede descontar más que su saldo actual.
  if exists (select 1 from public.planilla_linea_deducciones ld join public.planilla_lineas l on l.id = ld.linea_id
             join public.colaborador_deducciones d on d.id = ld.deduccion_id
             where l.planilla_id = p_id and d.monto_total is not null
             group by d.id, d.saldo having sum(ld.monto) > d.saldo) then
    raise exception 'El saldo de un préstamo o anticipo cambió: recalcula la planilla antes de aprobarla';
  end if;

  -- Rebaja el saldo de préstamos y anticipos; al llegar a cero la deducción se desactiva.
  update public.colaborador_deducciones d
    set saldo = case when d.monto_total is null then d.saldo else greatest(d.saldo - x.monto, 0) end,
        activa = case when d.monto_total is not null and d.saldo - x.monto <= 0 then false else d.activa end
  from (select ld.deduccion_id, sum(ld.monto) monto
        from public.planilla_linea_deducciones ld join public.planilla_lineas l on l.id = ld.linea_id
        where l.planilla_id = p_id group by ld.deduccion_id) x
  where d.id = x.deduccion_id;

  v_partida := public.fn_rrhh_planilla_contabilizar(p_id);
  update public.planillas
    set estado = 'aprobada', aprobado_por = public.fn_usuario_id(), fecha_aprobacion = now(), partida_id = v_partida
    where id = p_id;
  return v_partida;
end;
$$;

grant execute on function public.fn_rrhh_planilla_aprobar(bigint) to authenticated;

create or replace function public.fn_rrhh_planilla_pagar(p_id bigint, p_cuenta_bancaria_id bigint, p_fecha date, p_referencia text default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  p public.planillas%rowtype;
  v_mov bigint;
begin
  if not public.fn_tiene_permiso('planilla', 'pagar') then
    raise exception 'No tienes permiso para pagar planillas';
  end if;
  select * into p from public.planillas where id = p_id for update;
  if not found or p.estado <> 'aprobada' then
    raise exception 'Solo se paga una planilla aprobada';
  end if;
  if p.total_liquido <= 0 then
    raise exception 'La planilla no tiene líquido a pagar';
  end if;
  v_mov := public.fn_banco_insertar(p_cuenta_bancaria_id, coalesce(p_fecha, public.fn_ctb_hoy()), 'egreso', 'pago_planilla',
    p.total_liquido, 'Pago de planilla ' || p.codigo || ' (' || p.empleados || ' colaboradores)', p_referencia);
  update public.movimientos_banco set cuenta_contrapartida_id = public.fn_ctb_cuenta('planilla.por_pagar') where id = v_mov;
  update public.planillas
    set estado = 'pagada', cuenta_bancaria_id = p_cuenta_bancaria_id, movimiento_banco_id = v_mov,
        fecha_pago = coalesce(p_fecha, public.fn_ctb_hoy()), pagado_por = public.fn_usuario_id(), fecha_pagada = now()
    where id = p_id;
  return v_mov;
end;
$$;

grant execute on function public.fn_rrhh_planilla_pagar(bigint, bigint, date, text) to authenticated;

create or replace function public.fn_rrhh_planilla_anular(p_id bigint, p_motivo text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  p public.planillas%rowtype;
begin
  if not public.fn_tiene_permiso('planilla', 'aprobar') then
    raise exception 'No tienes permiso para anular planillas';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Indica el motivo de la anulación';
  end if;
  select * into p from public.planillas where id = p_id for update;
  if not found or p.estado <> 'aprobada' then
    raise exception '%', case when p.estado = 'pagada'
      then 'La planilla ya se pagó: anula primero el pago en Bancos'
      else 'Solo se anula una planilla aprobada (una en borrador se elimina)' end;
  end if;
  if exists (select 1 from public.planillas where tipo = p.tipo and estado in ('aprobada', 'pagada') and id <> p_id
             and (anio, mes, quincena) > (p.anio, p.mes, p.quincena)) then
    raise exception 'Hay planillas posteriores aprobadas: anúlalas primero (el ISR acumulado depende de esta)';
  end if;
  if p.partida_id is not null then
    perform public.fn_ctb_revertir_interno(p.partida_id, p.fecha_fin, 'anulación de la planilla ' || p.codigo || ': ' || btrim(p_motivo));
  end if;
  -- Devuelve el saldo de los préstamos.
  update public.colaborador_deducciones d
    set saldo = case when d.monto_total is null then d.saldo else least(d.saldo + x.monto, d.monto_total) end,
        activa = true
  from (select ld.deduccion_id, sum(ld.monto) monto
        from public.planilla_linea_deducciones ld join public.planilla_lineas l on l.id = ld.linea_id
        where l.planilla_id = p_id group by ld.deduccion_id) x
  where d.id = x.deduccion_id;
  update public.planillas
    set estado = 'anulada', anulado_por = public.fn_usuario_id(), fecha_anulacion = now(), motivo_anulacion = btrim(p_motivo)
    where id = p_id;
end;
$$;

grant execute on function public.fn_rrhh_planilla_anular(bigint, text) to authenticated;

-- Si en Bancos se anula el pago, la planilla vuelve a "aprobada".
create or replace function public.fn_trg_pago_planilla_anulado()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.anulado and not old.anulado and new.origen = 'pago_planilla' then
    update public.planillas
      set estado = 'aprobada', movimiento_banco_id = null, cuenta_bancaria_id = null, pagado_por = null, fecha_pagada = null
      where movimiento_banco_id = new.id and estado = 'pagada';
  end if;
  return new;
end;
$$;

create trigger trg_pago_planilla_anulado after update of anulado on public.movimientos_banco
  for each row execute function public.fn_trg_pago_planilla_anulado();

-- ------------------------------------------------------------
-- 4. Auditoría y RLS (lectura con planilla.ver; escritura solo por funciones)
-- ------------------------------------------------------------
create trigger trg_auditar_planillas after insert or update or delete on public.planillas
  for each row execute function public.fn_auditar();

do $$
declare t text;
begin
  foreach t in array array['planillas', 'planilla_lineas', 'planilla_linea_deducciones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy sel_%1$s on public.%1$I for select to authenticated using ((select public.fn_tiene_permiso(''planilla'', ''ver'')))', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
