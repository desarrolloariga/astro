-- ============================================================
-- ASTRO — Recursos humanos (fase 4): finalización de la relación laboral,
-- liquidación, finiquito, y planillas de aguinaldo y bono 14.
--
--   rrhh_finalizaciones          salida del colaborador: fecha, tipo, motivo,
--                                entrevista de salida y la liquidación calculada.
--                                Borrador → aprobada (el colaborador queda de baja)
--                                → pagada por bancos; una aprobada se puede anular.
--   rrhh_finalizacion_deducciones  préstamos y embargos descontados al liquidar
--
-- Liquidación (contrato laboral):
--   salario pendiente desde el día siguiente a la última planilla aprobada
--   (+ bonificación incentiva proporcional); vacaciones pendientes (incluye lo
--   proporcional del período en curso); aguinaldo proporcional (período 1 dic –
--   30 nov, Decreto 76-78) y bono 14 proporcional (1 jul – 30 jun, Decreto
--   42-92) sobre el salario ordinario promedio; indemnización (art. 82 del
--   Código de Trabajo) solo si aplica: salario promedio de los últimos 6 meses
--   (ordinario y extraordinario) + 1/6 por aguinaldo y bono 14, por año de
--   servicio y proporcional. IGSS sobre salario y vacaciones; ajuste final de
--   ISR del año. Se descuenta el saldo de préstamos y lo que se indique.
-- Servicios: solo honorarios pendientes, otros pagos y retención de ISR.
--
-- Planillas de aguinaldo (AG-AAAA, se paga en diciembre) y bono 14 (B14-AAAA,
-- en julio): promedio de salario ordinario del período × días laborados / días
-- del período; sin IGSS ni ISR; la partida rebaja la provisión acumulada.
-- ============================================================

insert into public.permisos (modulo, accion, descripcion) values
  ('rrhh', 'finalizar', 'Registrar la finalización de la relación laboral y calcular la liquidación')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from public.roles r
join public.permisos p on p.modulo = 'rrhh' and p.accion = 'finalizar'
where r.nombre in ('admin', 'contabilidad')
on conflict (rol_id, permiso_id) do nothing;

-- Pago de liquidación como origen bancario
alter table public.movimientos_banco drop constraint if exists movimientos_banco_origen_check;
alter table public.movimientos_banco add constraint movimientos_banco_origen_check check (origen in (
  'cobro_venta', 'gasto', 'otro_ingreso', 'pago_proveedor', 'pago_comisiones', 'transferencia',
  'comision_bancaria', 'ajuste', 'otro', 'nota_debito', 'nota_credito', 'pago_planilla', 'pago_liquidacion'));

-- Planillas de aguinaldo y bono 14
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.planillas'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%tipo%' loop
    execute format('alter table public.planillas drop constraint %I', r.conname);
  end loop;
  for r in select conname from pg_constraint
           where conrelid = 'public.planilla_lineas'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%dias_manual%' loop
    execute format('alter table public.planilla_lineas drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.planillas add constraint planillas_tipo_check check (tipo in ('contrato', 'servicios', 'aguinaldo', 'bono14'));
alter table public.planilla_lineas add constraint planilla_lineas_dias_manual_check check (dias_manual >= 0 and dias_manual <= 366);
alter table public.planilla_lineas add column if not exists salario_promedio numeric(12,2) not null default 0;

-- ------------------------------------------------------------
-- 1. Finalización
-- ------------------------------------------------------------
create table public.rrhh_finalizaciones (
  id bigint generated always as identity primary key,
  colaborador_id bigint not null references public.colaboradores (id),
  estado text not null default 'borrador' check (estado in ('borrador', 'aprobada', 'pagada', 'anulada')),
  tipo text not null check (tipo in ('renuncia', 'despido_justificado', 'despido_injustificado', 'mutuo_acuerdo', 'fin_contrato',
                                     'abandono', 'fallecimiento', 'jubilacion', 'otro')),
  fecha_salida date not null,
  motivo text,
  aplica_indemnizacion boolean not null default false,
  incluir_salario boolean not null default true,
  -- Entrevista de salida
  entrevista_fecha date,
  entrevista_por text,
  entrevista_motivo text,
  entrevista_comentarios text,
  recontratable boolean,
  -- Base del cálculo
  tipo_planilla text,
  fecha_ingreso date,
  salario_base numeric(12,2) not null default 0,
  bonificacion_mensual numeric(12,2) not null default 0,
  salario_promedio numeric(12,2) not null default 0,
  salario_promedio_ordinario numeric(12,2) not null default 0,
  -- Captura
  dias_salario_manual numeric(6,2) check (dias_salario_manual >= 0),
  dias_vacaciones_manual numeric(6,2) check (dias_vacaciones_manual >= 0),
  otros_pagos numeric(12,2) not null default 0 check (otros_pagos >= 0),
  otros_pagos_detalle text,
  otros_descuentos numeric(12,2) not null default 0 check (otros_descuentos >= 0),
  otros_descuentos_detalle text,
  notas text,
  -- Cálculo
  salario_desde date,
  dias_salario numeric(6,2) not null default 0,
  salario_pendiente numeric(12,2) not null default 0,
  bonificacion_pendiente numeric(12,2) not null default 0,
  dias_vacaciones numeric(6,2) not null default 0,
  vacaciones_monto numeric(12,2) not null default 0,
  aguinaldo_desde date,
  aguinaldo_dias int not null default 0,
  aguinaldo_monto numeric(12,2) not null default 0,
  bono14_desde date,
  bono14_dias int not null default 0,
  bono14_monto numeric(12,2) not null default 0,
  anios_servicio numeric(8,4) not null default 0,
  indemnizacion_monto numeric(12,2) not null default 0,
  total_ingresos numeric(12,2) not null default 0,
  igss_laboral numeric(12,2) not null default 0,
  isr numeric(12,2) not null default 0,
  prestamos numeric(12,2) not null default 0,
  total_descuentos numeric(12,2) not null default 0,
  liquido numeric(12,2) not null default 0,
  igss_patronal numeric(12,2) not null default 0,
  calculada_en timestamptz,
  -- Flujo
  estado_colaborador_anterior text,
  partida_id bigint references public.partidas (id),
  cuenta_bancaria_id bigint references public.cuentas_bancarias (id),
  movimiento_banco_id bigint references public.movimientos_banco (id),
  creado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now(),
  aprobado_por bigint references public.usuarios (id),
  fecha_aprobacion timestamptz,
  pagado_por bigint references public.usuarios (id),
  fecha_pagada timestamptz,
  fecha_pago date,
  anulado_por bigint references public.usuarios (id),
  fecha_anulacion timestamptz,
  motivo_anulacion text
);
create unique index uq_finalizacion_vigente on public.rrhh_finalizaciones (colaborador_id) where estado <> 'anulada';
create index idx_finalizaciones_fecha on public.rrhh_finalizaciones (fecha_salida desc);

create table public.rrhh_finalizacion_deducciones (
  id bigint generated always as identity primary key,
  finalizacion_id bigint not null references public.rrhh_finalizaciones (id) on delete cascade,
  deduccion_id bigint not null references public.colaborador_deducciones (id),
  monto numeric(12,2) not null check (monto > 0)
);

-- ------------------------------------------------------------
-- 2. Apoyos de cálculo
-- ------------------------------------------------------------
-- Salario mensual promedio en un rango, según las planillas por contrato aprobadas
-- (por día laborado × 30). Sin planillas, el salario vigente.
create or replace function public.fn_rrhh_salario_promedio(p_colaborador_id bigint, p_desde date, p_hasta date, p_con_extras boolean)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select round(sum(l.salario_devengado + l.comisiones + l.otros_bonos + l.bonos_adicionales
                      + case when p_con_extras then l.valor_horas_extra else 0 end) / nullif(sum(l.dias_laborados), 0) * 30, 2)
       from public.planilla_lineas l join public.planillas p on p.id = l.planilla_id
      where l.colaborador_id = p_colaborador_id and p.tipo = 'contrato' and p.estado in ('aprobada', 'pagada')
        and p.fecha_fin >= p_desde and p.fecha_inicio <= p_hasta),
    (select round(case s.tipo_salario when 'por_dia' then s.salario_base * 30 when 'por_hora' then s.salario_base * 8 * 30
                                      else s.salario_base end + s.otras_bonificaciones, 2)
       from public.colaborador_salarios s where s.colaborador_id = p_colaborador_id),
    0)
$$;

revoke all on function public.fn_rrhh_salario_promedio(bigint, date, date, boolean) from public, anon, authenticated;

-- ¿La liquidación de este colaborador ya cubre el pago de esta planilla?
create or replace function public.fn_rrhh_excluido_por_finalizacion(p_colaborador_id bigint, p_tipo text, p_fin date)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.rrhh_finalizaciones f
    where f.colaborador_id = p_colaborador_id and f.estado <> 'anulada'
      and case when p_tipo in ('aguinaldo', 'bono14') then f.fecha_salida <= p_fin
               else f.incluir_salario and coalesce(f.salario_desde, f.fecha_salida) <= p_fin end)
$$;

revoke all on function public.fn_rrhh_excluido_por_finalizacion(bigint, text, date) from public, anon, authenticated;

-- Línea de aguinaldo o bono 14.
create or replace function public.fn_rrhh_planilla_calcular_prestacion(p_linea_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  l public.planilla_lineas%rowtype;
  p public.planillas%rowtype;
  c public.colaboradores%rowtype;
  v_ini date;
  v_fin date;
  v_dias numeric;
  v_periodo numeric;
  v_prom numeric;
  v_monto numeric;
begin
  select * into l from public.planilla_lineas where id = p_linea_id;
  select * into p from public.planillas where id = l.planilla_id;
  select * into c from public.colaboradores where id = l.colaborador_id;
  v_ini := greatest(p.fecha_inicio, coalesce(c.fecha_ingreso, p.fecha_inicio));
  v_fin := least(p.fecha_fin, coalesce(c.fecha_baja, p.fecha_fin));
  v_periodo := case when v_fin < v_ini then 0 else v_fin - v_ini + 1 end;
  v_dias := coalesce(l.dias_manual, v_periodo);
  v_prom := public.fn_rrhh_salario_promedio(c.id, p.fecha_inicio, p.fecha_fin, false);
  v_monto := round(v_prom * v_dias / (p.fecha_fin - p.fecha_inicio + 1), 2);
  delete from public.planilla_linea_deducciones where linea_id = l.id;
  update public.planilla_lineas set
    dias_periodo = v_periodo, dias_sin_goce = 0, dias_laborados = v_dias, salario_promedio = v_prom,
    salario_devengado = v_monto, bonificacion_incentiva = 0, otros_bonos = 0, valor_horas_extra = 0, renta_afecta = 0,
    total_devengado = v_monto + l.bonos_adicionales, igss_laboral = 0, isr = 0, deducciones = 0,
    total_descuentos = l.otros_descuentos, liquido = v_monto + l.bonos_adicionales - l.otros_descuentos,
    igss_patronal = 0, prov_aguinaldo = 0, prov_bono14 = 0, prov_vacaciones = 0, prov_indemnizacion = 0
  where id = l.id;
end;
$$;

revoke all on function public.fn_rrhh_planilla_calcular_prestacion(bigint) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Planilla: aguinaldo y bono 14, y exclusión de quien ya se liquidó
--    (mismas funciones de la 037 con esos cambios)
-- ------------------------------------------------------------

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
  if p.tipo in ('aguinaldo', 'bono14') then
    perform public.fn_rrhh_planilla_calcular_prestacion(p_linea_id);
    return;
  end if;

  -- Días del período: 15 comerciales, menos los días antes del ingreso o después de la baja.
  v_ini := greatest(p.fecha_inicio, coalesce(c.fecha_ingreso, p.fecha_inicio));
  v_fin := least(p.fecha_fin, coalesce(c.fecha_baja,
    (select f.fecha_salida from public.rrhh_finalizaciones f
      where f.colaborador_id = c.id and f.estado <> 'anulada' and not f.incluir_salario), p.fecha_fin));
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
  where c.tipo_planilla = case when p.tipo in ('aguinaldo', 'bono14') then 'contrato' else p.tipo end
    and not public.fn_rrhh_excluido_por_finalizacion(c.id, p.tipo, p.fecha_fin)
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
  delete from public.planilla_lineas l
    where l.planilla_id = p_id and public.fn_rrhh_excluido_por_finalizacion(l.colaborador_id, p.tipo, p.fecha_fin);
  for r in select id from public.planilla_lineas where planilla_id = p_id loop
    perform public.fn_rrhh_planilla_calcular_linea(r.id);
  end loop;
  perform public.fn_rrhh_planilla_totales(p_id);
end;
$$;

create or replace function public.fn_rrhh_planilla_generar(p_tipo text, p_anio int, p_mes int, p_quincena int, p_fecha_pago date default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_ini date;
  v_fin date;
  v_id bigint;
  v_mes int := p_mes;
  v_q int := p_quincena;
  v_codigo text;
begin
  if not public.fn_tiene_permiso('planilla', 'gestionar') then
    raise exception 'No tienes permiso para generar planillas';
  end if;
  if p_tipo = 'aguinaldo' then
    v_mes := 12; v_q := 1; v_ini := make_date(p_anio - 1, 12, 1); v_fin := make_date(p_anio, 11, 30); v_codigo := 'AG-' || p_anio;
  elsif p_tipo = 'bono14' then
    v_mes := 7; v_q := 1; v_ini := make_date(p_anio - 1, 7, 1); v_fin := make_date(p_anio, 6, 30); v_codigo := 'B14-' || p_anio;
  elsif p_tipo in ('contrato', 'servicios') and p_quincena in (1, 2) and p_mes between 1 and 12 then
    v_ini := make_date(p_anio, p_mes, case when p_quincena = 1 then 1 else 16 end);
    v_fin := case when p_quincena = 1 then make_date(p_anio, p_mes, 15)
                  else (make_date(p_anio, p_mes, 1) + interval '1 month' - interval '1 day')::date end;
    v_codigo := case when p_tipo = 'contrato' then 'PC-' else 'PS-' end || p_anio || lpad(p_mes::text, 2, '0') || '-Q' || p_quincena;
  else
    raise exception 'Indica el tipo de planilla, el mes y la quincena';
  end if;
  if exists (select 1 from public.planillas where tipo = p_tipo and anio = p_anio and mes = v_mes and quincena = v_q and estado <> 'anulada') then
    raise exception '%', case p_tipo when 'aguinaldo' then 'Ya existe la planilla de aguinaldo de ' || p_anio
                                     when 'bono14' then 'Ya existe la planilla de bono 14 de ' || p_anio
                                     else 'Ya existe la planilla de esa quincena' end;
  end if;
  insert into public.planillas (codigo, tipo, anio, mes, quincena, fecha_inicio, fecha_fin, fecha_pago, creado_por)
  values (v_codigo, p_tipo, p_anio, v_mes, v_q, v_ini, v_fin,
          coalesce(p_fecha_pago, case p_tipo when 'aguinaldo' then make_date(p_anio, 12, 15) when 'bono14' then make_date(p_anio, 7, 15) else v_fin end),
          public.fn_usuario_id())
  returning id into v_id;
  perform public.fn_rrhh_planilla_cargar(v_id);
  return v_id;
end;
$$;

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
  if nullif(p_datos ->> 'dias_manual', '')::numeric > (select case when tipo in ('aguinaldo', 'bono14') then fecha_fin - fecha_inicio + 1 else 15 end
                                                        from public.planillas where id = v_planilla) then
    raise exception 'Los días no pueden pasar de los del período';
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
  if p.tipo in ('aguinaldo', 'bono14') then
    select * into t from (
      select coalesce(sum(total_devengado), 0) devengado, coalesce(sum(liquido), 0) liquido, coalesce(sum(otros_descuentos), 0) retenciones
      from public.planilla_lineas where planilla_id = p_id) s;
    v_lineas := jsonb_build_array(
      public.fn_ctb_linea(public.fn_ctb_cuenta(case when p.tipo = 'aguinaldo' then 'planilla.prov_aguinaldo' else 'planilla.prov_bono14' end),
                          null, t.devengado, 0, v_desc),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.por_pagar'), null, 0, t.liquido, 'Líquido a pagar ' || p.codigo),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.retenciones'), null, 0, t.retenciones, 'Descuentos ' || p.codigo));
  elsif p.tipo = 'contrato' then
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
  return public.fn_ctb_registrar_auto('planilla', p_id,
    case when p.tipo in ('aguinaldo', 'bono14') then coalesce(p.fecha_pago, p.fecha_fin) else p.fecha_fin end,
    v_desc || ' — ' || case p.tipo when 'contrato' then 'contrato laboral, quincena ' || p.quincena || ' de ' || to_char(p.fecha_inicio, 'MM/YYYY')
                              when 'servicios' then 'otros pagos (servicios), quincena ' || p.quincena || ' de ' || to_char(p.fecha_inicio, 'MM/YYYY')
                              when 'aguinaldo' then 'aguinaldo ' || p.anio
                              else 'bono 14 ' || p.anio end, v_lineas);
end;
$$;

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
  if exists (select 1 from public.planilla_lineas l where l.planilla_id = p_id
             and public.fn_rrhh_excluido_por_finalizacion(l.colaborador_id, p.tipo, p.fecha_fin)) then
    raise exception 'Hay colaboradores cuya liquidación laboral ya cubre esta planilla: recalcula la planilla';
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
    perform public.fn_ctb_revertir_interno(p.partida_id, (select fecha from public.partidas where id = p.partida_id), 'anulación de la planilla ' || p.codigo || ': ' || btrim(p_motivo));
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

-- ------------------------------------------------------------
-- 4. Liquidación: cálculo y flujo
-- ------------------------------------------------------------
-- Desde cuándo se debe salario: día siguiente a la última planilla aprobada del
-- colaborador; sin planillas, el inicio de la quincena de la salida.
create or replace function public.fn_rrhh_finalizacion_salario_desde(p_colaborador_id bigint, p_tipo_planilla text, p_salida date)
returns date
language sql stable security definer
set search_path = public
as $$
  select greatest(
    coalesce(
      (select max(p.fecha_fin) + 1 from public.planilla_lineas l join public.planillas p on p.id = l.planilla_id
        where l.colaborador_id = p_colaborador_id and p.tipo = p_tipo_planilla and p.estado in ('aprobada', 'pagada') and l.total_devengado > 0),
      case when extract(day from p_salida) <= 15 then date_trunc('month', p_salida)::date
           else date_trunc('month', p_salida)::date + 15 end),
    coalesce((select fecha_ingreso from public.colaboradores where id = p_colaborador_id), p_salida))
$$;

revoke all on function public.fn_rrhh_finalizacion_salario_desde(bigint, text, date) from public, anon, authenticated;

create or replace function public.fn_rrhh_finalizacion_calcular(p_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  f public.rrhh_finalizaciones%rowtype;
  c public.colaboradores%rowtype;
  s public.colaborador_salarios%rowtype;
  cfg public.rrhh_config%rowtype;
  d record;
  acum record;
  v_contrato boolean;
  v_salida date;
  v_desde date;
  v_q date;
  v_q_ini date;
  v_q_fin date;
  v_dias numeric := 0;
  v_horas int;
  v_diario numeric := 0;
  v_sal numeric := 0;
  v_bono numeric := 0;
  v_prom numeric := 0;
  v_prom_ord numeric := 0;
  v_vac_dias numeric := 0;
  v_vac numeric := 0;
  v_ag_desde date;
  v_ag_dias int := 0;
  v_ag numeric := 0;
  v_b_desde date;
  v_b_dias int := 0;
  v_b numeric := 0;
  v_anios numeric := 0;
  v_indem numeric := 0;
  v_afecto numeric := 0;
  v_igss numeric := 0;
  v_patronal numeric := 0;
  v_isr numeric := 0;
  v_total numeric;
  v_disp numeric;
  v_monto numeric;
  v_ded numeric := 0;
  v_anio int;
begin
  select * into f from public.rrhh_finalizaciones where id = p_id;
  select * into c from public.colaboradores where id = f.colaborador_id;
  select * into s from public.colaborador_salarios where colaborador_id = c.id;
  select * into cfg from public.rrhh_config where id = 1;
  v_contrato := c.tipo_planilla = 'contrato';
  v_salida := f.fecha_salida;
  v_anio := extract(year from v_salida)::int;
  v_horas := case c.jornada when 'mixta' then 7 when 'nocturna' then 6 else 8 end;

  -- Salario pendiente en días comerciales (15 por quincena).
  v_desde := public.fn_rrhh_finalizacion_salario_desde(c.id, c.tipo_planilla, v_salida);
  if f.incluir_salario and v_desde <= v_salida then
    v_q := v_desde;
    while v_q <= v_salida loop
      v_q_ini := case when extract(day from v_q) <= 15 then date_trunc('month', v_q)::date else date_trunc('month', v_q)::date + 15 end;
      v_q_fin := case when extract(day from v_q) <= 15 then date_trunc('month', v_q)::date + 14
                      else (date_trunc('month', v_q) + interval '1 month' - interval '1 day')::date end;
      v_dias := v_dias + greatest(15 - (greatest(v_q_ini, v_desde) - v_q_ini) - (v_q_fin - least(v_q_fin, v_salida)), 0);
      v_q := v_q_fin + 1;
    end loop;
  end if;
  if not f.incluir_salario then
    v_dias := 0;
  end if;
  v_dias := coalesce(f.dias_salario_manual, v_dias);
  if s.colaborador_id is not null then
    v_diario := case s.tipo_salario when 'por_dia' then s.salario_base when 'por_hora' then s.salario_base * v_horas
                                    else s.salario_base / 30 end;
    v_sal := round(v_diario * v_dias + s.otras_bonificaciones / 30 * v_dias, 2);
    if v_contrato then
      v_bono := round(s.bonificacion_incentiva / 30 * v_dias, 2);
    end if;
  end if;

  if v_contrato then
    v_prom := public.fn_rrhh_salario_promedio(c.id, (v_salida - interval '6 months')::date + 1, v_salida, true);
    v_prom_ord := public.fn_rrhh_salario_promedio(c.id, (v_salida - interval '1 year')::date + 1, v_salida, false);

    -- Vacaciones: acumulado a la salida (las aprobadas para después de la salida no se gozarán).
    select coalesce(sum(ganados) - sum(gozados), 0) into v_vac_dias from public.fn_rrhh_vacaciones_periodos(c.id, v_salida);
    v_vac_dias := v_vac_dias + coalesce((
      select sum(a.dias) from public.rrhh_ausencias a join public.rrhh_tipos_ausencia t on t.id = a.tipo_ausencia_id
      where a.colaborador_id = c.id and a.estado = 'aprobada' and t.descuenta_vacaciones and a.fecha_inicio > v_salida), 0);
    v_vac_dias := round(coalesce(f.dias_vacaciones_manual, greatest(v_vac_dias, 0)), 2);
    v_vac := round(v_prom / 30 * v_vac_dias, 2);

    -- Aguinaldo: período 1 de diciembre – 30 de noviembre (si sale en diciembre sin haber cobrado el del año, se paga completo).
    v_ag_desde := make_date(case when extract(month from v_salida) = 12 then v_anio else v_anio - 1 end, 12, 1);
    if extract(month from v_salida) = 12 and not exists (
        select 1 from public.planilla_lineas l join public.planillas p on p.id = l.planilla_id
        where l.colaborador_id = c.id and p.tipo = 'aguinaldo' and p.anio = v_anio and p.estado in ('aprobada', 'pagada')) then
      v_ag_desde := make_date(v_anio - 1, 12, 1);
    end if;
    v_ag_desde := greatest(v_ag_desde, c.fecha_ingreso);
    v_ag_dias := greatest(v_salida - v_ag_desde + 1, 0);
    v_ag := round(v_prom_ord * v_ag_dias / 365, 2);

    -- Bono 14: período 1 de julio – 30 de junio.
    v_b_desde := make_date(case when extract(month from v_salida) >= 7 then v_anio else v_anio - 1 end, 7, 1);
    if extract(month from v_salida) = 7 and not exists (
        select 1 from public.planilla_lineas l join public.planillas p on p.id = l.planilla_id
        where l.colaborador_id = c.id and p.tipo = 'bono14' and p.anio = v_anio and p.estado in ('aprobada', 'pagada')) then
      v_b_desde := make_date(v_anio - 1, 7, 1);
    end if;
    v_b_desde := greatest(v_b_desde, c.fecha_ingreso);
    v_b_dias := greatest(v_salida - v_b_desde + 1, 0);
    v_b := round(v_prom_ord * v_b_dias / 365, 2);

    -- Indemnización: promedio × 7/6 (incluye 1/12 de aguinaldo y 1/12 de bono 14) por año de servicio.
    v_anios := round((v_salida - c.fecha_ingreso + 1)::numeric / 365, 4);
    if f.aplica_indemnizacion then
      v_indem := round(v_prom * 7 / 6 * v_anios, 2);
    end if;

    v_afecto := v_sal + v_vac;
    if coalesce(s.aplica_igss, true) then
      v_igss := round(v_afecto * cfg.igss_laboral_pct / 100, 2);
      v_patronal := round(v_afecto * cfg.igss_patronal_pct / 100, 2);
    end if;
    -- Ajuste final del ISR del año (aguinaldo, bono 14 e indemnización están exentos).
    if coalesce(s.aplica_isr, true) and v_afecto > 0 then
      select coalesce(sum(l.renta_afecta), 0) as renta, coalesce(sum(l.igss_laboral), 0) as igss, coalesce(sum(l.isr), 0) as isr
        into acum
        from public.planilla_lineas l join public.planillas p on p.id = l.planilla_id
        where l.colaborador_id = c.id and p.tipo = 'contrato' and p.anio = v_anio and p.estado in ('aprobada', 'pagada');
      v_isr := greatest(public.fn_rrhh_isr_anual(greatest(acum.renta + v_afecto - cfg.isr_deduccion_personal - (acum.igss + v_igss), 0)) - acum.isr, 0);
    end if;
  else
    if coalesce(s.aplica_isr, false) then
      v_isr := round((v_sal + f.otros_pagos) * cfg.isr_retencion_servicios_pct / 100, 2);
    end if;
  end if;

  v_total := v_sal + v_bono + v_vac + v_ag + v_b + v_indem + f.otros_pagos;

  -- Préstamos y embargos: se descuenta el saldo (los recurrentes, una cuota) sin dejar el líquido negativo.
  delete from public.rrhh_finalizacion_deducciones where finalizacion_id = f.id;
  v_disp := v_total - v_igss - v_isr - f.otros_descuentos;
  for d in
    select id, cuota, saldo, monto_total from public.colaborador_deducciones
    where colaborador_id = c.id and activa and (monto_total is null or coalesce(saldo, 0) > 0)
    order by (tipo = 'embargo') desc, id
  loop
    exit when v_disp <= 0;
    v_monto := round(least(case when d.monto_total is null then d.cuota else d.saldo end, v_disp), 2);
    continue when v_monto <= 0;
    insert into public.rrhh_finalizacion_deducciones (finalizacion_id, deduccion_id, monto) values (f.id, d.id, v_monto);
    v_ded := v_ded + v_monto;
    v_disp := v_disp - v_monto;
  end loop;

  update public.rrhh_finalizaciones set
    tipo_planilla = c.tipo_planilla, fecha_ingreso = c.fecha_ingreso,
    salario_base = coalesce(s.salario_base, 0), bonificacion_mensual = case when v_contrato then coalesce(s.bonificacion_incentiva, 0) else 0 end,
    salario_promedio = v_prom, salario_promedio_ordinario = v_prom_ord,
    salario_desde = v_desde, dias_salario = v_dias, salario_pendiente = v_sal, bonificacion_pendiente = v_bono,
    dias_vacaciones = v_vac_dias, vacaciones_monto = v_vac,
    aguinaldo_desde = case when v_contrato then v_ag_desde end, aguinaldo_dias = v_ag_dias, aguinaldo_monto = v_ag,
    bono14_desde = case when v_contrato then v_b_desde end, bono14_dias = v_b_dias, bono14_monto = v_b,
    anios_servicio = v_anios, indemnizacion_monto = v_indem,
    total_ingresos = v_total, igss_laboral = v_igss, isr = v_isr, prestamos = v_ded,
    total_descuentos = v_igss + v_isr + v_ded + f.otros_descuentos,
    liquido = v_total - v_igss - v_isr - v_ded - f.otros_descuentos,
    igss_patronal = v_patronal, calculada_en = clock_timestamp()
  where id = f.id;
end;
$$;

revoke all on function public.fn_rrhh_finalizacion_calcular(bigint) from public, anon, authenticated;

create or replace function public.fn_rrhh_finalizacion_crear(p_colaborador_id bigint, p_tipo text, p_fecha_salida date, p_motivo text default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  c public.colaboradores%rowtype;
  v_id bigint;
begin
  if not public.fn_tiene_permiso('rrhh', 'finalizar') then
    raise exception 'No tienes permiso para finalizar relaciones laborales';
  end if;
  select * into c from public.colaboradores where id = p_colaborador_id for update;
  if not found then
    raise exception 'El colaborador no existe';
  end if;
  if c.estado = 'baja' then
    raise exception 'El colaborador ya está de baja';
  end if;
  if c.fecha_ingreso is null then
    raise exception 'Registra la fecha de ingreso en el expediente antes de liquidar';
  end if;
  if p_fecha_salida is null or p_fecha_salida < c.fecha_ingreso then
    raise exception 'La fecha de salida no puede ser antes del ingreso';
  end if;
  if exists (select 1 from public.rrhh_finalizaciones where colaborador_id = p_colaborador_id and estado <> 'anulada') then
    raise exception 'Ya hay una finalización registrada para este colaborador';
  end if;
  insert into public.rrhh_finalizaciones (colaborador_id, tipo, fecha_salida, motivo, aplica_indemnizacion, creado_por)
  values (p_colaborador_id, p_tipo, p_fecha_salida, nullif(btrim(coalesce(p_motivo, '')), ''),
          p_tipo = 'despido_injustificado' and c.tipo_planilla = 'contrato', public.fn_usuario_id())
  returning id into v_id;
  perform public.fn_rrhh_finalizacion_calcular(v_id);
  return v_id;
end;
$$;

grant execute on function public.fn_rrhh_finalizacion_crear(bigint, text, date, text) to authenticated;

-- p_datos: {tipo, fecha_salida, motivo, aplica_indemnizacion, incluir_salario, dias_salario_manual, dias_vacaciones_manual,
--           otros_pagos, otros_pagos_detalle, otros_descuentos, otros_descuentos_detalle, notas,
--           entrevista_fecha, entrevista_por, entrevista_motivo, entrevista_comentarios, recontratable}
create or replace function public.fn_rrhh_finalizacion_editar(p_id bigint, p_datos jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  f public.rrhh_finalizaciones%rowtype;
  v_ingreso date;
begin
  if not public.fn_tiene_permiso('rrhh', 'finalizar') then
    raise exception 'No tienes permiso para modificar la liquidación';
  end if;
  select * into f from public.rrhh_finalizaciones where id = p_id for update;
  if not found or f.estado <> 'borrador' then
    raise exception 'Solo se modifica una liquidación en borrador';
  end if;
  select fecha_ingreso into v_ingreso from public.colaboradores where id = f.colaborador_id;
  if coalesce(nullif(p_datos ->> 'fecha_salida', '')::date, f.fecha_salida) < v_ingreso then
    raise exception 'La fecha de salida no puede ser antes del ingreso';
  end if;
  if coalesce(nullif(p_datos ->> 'otros_pagos', '')::numeric, 0) < 0 or coalesce(nullif(p_datos ->> 'otros_descuentos', '')::numeric, 0) < 0
     or coalesce(nullif(p_datos ->> 'dias_salario_manual', '')::numeric, 0) < 0 or coalesce(nullif(p_datos ->> 'dias_vacaciones_manual', '')::numeric, 0) < 0 then
    raise exception 'Los montos y los días no pueden ser negativos';
  end if;
  update public.rrhh_finalizaciones set
    tipo = coalesce(nullif(p_datos ->> 'tipo', ''), tipo),
    fecha_salida = coalesce(nullif(p_datos ->> 'fecha_salida', '')::date, fecha_salida),
    motivo = nullif(btrim(coalesce(p_datos ->> 'motivo', '')), ''),
    aplica_indemnizacion = coalesce((p_datos ->> 'aplica_indemnizacion')::boolean, aplica_indemnizacion) and tipo_planilla = 'contrato',
    incluir_salario = coalesce((p_datos ->> 'incluir_salario')::boolean, incluir_salario),
    dias_salario_manual = nullif(p_datos ->> 'dias_salario_manual', '')::numeric,
    dias_vacaciones_manual = nullif(p_datos ->> 'dias_vacaciones_manual', '')::numeric,
    otros_pagos = coalesce(nullif(p_datos ->> 'otros_pagos', '')::numeric, 0),
    otros_pagos_detalle = nullif(btrim(coalesce(p_datos ->> 'otros_pagos_detalle', '')), ''),
    otros_descuentos = coalesce(nullif(p_datos ->> 'otros_descuentos', '')::numeric, 0),
    otros_descuentos_detalle = nullif(btrim(coalesce(p_datos ->> 'otros_descuentos_detalle', '')), ''),
    notas = nullif(btrim(coalesce(p_datos ->> 'notas', '')), ''),
    entrevista_fecha = nullif(p_datos ->> 'entrevista_fecha', '')::date,
    entrevista_por = nullif(btrim(coalesce(p_datos ->> 'entrevista_por', '')), ''),
    entrevista_motivo = nullif(btrim(coalesce(p_datos ->> 'entrevista_motivo', '')), ''),
    entrevista_comentarios = nullif(btrim(coalesce(p_datos ->> 'entrevista_comentarios', '')), ''),
    recontratable = case when p_datos ? 'recontratable' then nullif(p_datos ->> 'recontratable', '')::boolean else recontratable end
  where id = p_id;
  perform public.fn_rrhh_finalizacion_calcular(p_id);
end;
$$;

grant execute on function public.fn_rrhh_finalizacion_editar(bigint, jsonb) to authenticated;

create or replace function public.fn_rrhh_finalizacion_recalcular(p_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('rrhh', 'finalizar') then
    raise exception 'No tienes permiso para modificar la liquidación';
  end if;
  perform 1 from public.rrhh_finalizaciones where id = p_id and estado = 'borrador' for update;
  if not found then
    raise exception 'Solo se recalcula una liquidación en borrador';
  end if;
  perform public.fn_rrhh_finalizacion_calcular(p_id);
end;
$$;

grant execute on function public.fn_rrhh_finalizacion_recalcular(bigint) to authenticated;

create or replace function public.fn_rrhh_finalizacion_eliminar(p_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('rrhh', 'finalizar') then
    raise exception 'No tienes permiso para eliminar la liquidación';
  end if;
  delete from public.rrhh_finalizaciones where id = p_id and estado = 'borrador';
  if not found then
    raise exception 'Solo se elimina una liquidación en borrador';
  end if;
end;
$$;

grant execute on function public.fn_rrhh_finalizacion_eliminar(bigint) to authenticated;

create or replace function public.fn_rrhh_finalizacion_contabilizar(p_id bigint)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  f public.rrhh_finalizaciones%rowtype;
  c public.colaboradores%rowtype;
  v_emp public.empresa_contable%rowtype;
  v_hoy date := public.fn_ctb_hoy();
  v_cc bigint;
  v_desc text;
  v_lineas jsonb;
begin
  select * into f from public.rrhh_finalizaciones where id = p_id;
  select * into c from public.colaboradores where id = f.colaborador_id;
  select * into v_emp from public.empresa_contable where id = 1;
  if not found or not v_emp.contabilizacion_automatica or v_emp.fecha_inicio_contable is null or v_hoy < v_emp.fecha_inicio_contable then
    return null;
  end if;
  v_cc := coalesce(c.centro_costo_id,
                   (select cc.id from public.centros_costo cc where cc.tienda_id = c.tienda_id and cc.activo order by cc.id limit 1),
                   public.fn_ctb_cc(case when f.tipo_planilla = 'contrato' then 'planilla.sueldos' else 'planilla.honorarios' end));
  v_desc := 'Liquidación laboral de ' || c.nombres || ' ' || c.apellidos || ' (' || c.codigo || ')';
  if f.tipo_planilla = 'contrato' then
    v_lineas := jsonb_build_array(
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.sueldos'), v_cc, f.salario_pendiente + f.bonificacion_pendiente + f.otros_pagos, 0, 'Salario pendiente y otros pagos'),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.igss_patronal'), v_cc, f.igss_patronal, 0, 'Cuota patronal'),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.prov_vacaciones'), null, f.vacaciones_monto, 0, 'Vacaciones pagadas'),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.prov_aguinaldo'), null, f.aguinaldo_monto, 0, 'Aguinaldo proporcional'),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.prov_bono14'), null, f.bono14_monto, 0, 'Bono 14 proporcional'),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.prov_indemnizacion'), null, f.indemnizacion_monto, 0, 'Indemnización'),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.por_pagar'), null, 0, f.liquido, 'Líquido de la liquidación'),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.igss_por_pagar'), null, 0, f.igss_laboral + f.igss_patronal, 'IGSS laboral y patronal'),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.isr_por_pagar'), null, 0, f.isr, 'ISR'),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.retenciones'), null, 0, f.prestamos + f.otros_descuentos, 'Préstamos y descuentos'));
  else
    v_lineas := jsonb_build_array(
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.honorarios'), v_cc, f.salario_pendiente + f.otros_pagos, 0, 'Honorarios pendientes'),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.por_pagar'), null, 0, f.liquido, 'Líquido de la liquidación'),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.isr_por_pagar'), null, 0, f.isr, 'Retención de ISR'),
      public.fn_ctb_linea(public.fn_ctb_cuenta('planilla.retenciones'), null, 0, f.prestamos + f.otros_descuentos, 'Préstamos y descuentos'));
  end if;
  return public.fn_ctb_registrar_auto('liquidacion_laboral', p_id, v_hoy, v_desc, v_lineas);
end;
$$;

revoke all on function public.fn_rrhh_finalizacion_contabilizar(bigint) from public, anon, authenticated;

create or replace function public.fn_rrhh_finalizacion_aprobar(p_id bigint)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  f public.rrhh_finalizaciones%rowtype;
  c public.colaboradores%rowtype;
  v_equipo int;
  v_partida bigint;
begin
  if not public.fn_tiene_permiso('planilla', 'aprobar') then
    raise exception 'No tienes permiso para aprobar liquidaciones';
  end if;
  select * into f from public.rrhh_finalizaciones where id = p_id for update;
  if not found or f.estado <> 'borrador' then
    raise exception 'Solo se aprueba una liquidación en borrador';
  end if;
  select * into c from public.colaboradores where id = f.colaborador_id for update;
  select count(*) into v_equipo from public.colaborador_asignaciones where colaborador_id = c.id and estado = 'asignado';
  if v_equipo > 0 then
    raise exception 'Tiene % artículo(s) de uniforme o equipo sin devolver: registra la devolución (o márcalos como extraviados o dañados)', v_equipo;
  end if;
  if f.liquido < 0 then
    raise exception 'El líquido de la liquidación es negativo: revisa los descuentos';
  end if;
  if f.salario_desde is distinct from public.fn_rrhh_finalizacion_salario_desde(c.id, c.tipo_planilla, f.fecha_salida)
     or exists (select 1 from public.planillas p join public.planilla_lineas l on l.planilla_id = p.id
                where l.colaborador_id = c.id and greatest(p.fecha_aprobacion, p.fecha_anulacion) > f.calculada_en) then
    raise exception 'Cambiaron las planillas desde que se calculó la liquidación: recalcúlala antes de aprobarla';
  end if;
  if exists (select 1 from public.colaborador_deducciones d join public.rrhh_finalizacion_deducciones fd on fd.deduccion_id = d.id
             where fd.finalizacion_id = p_id and d.monto_total is not null and fd.monto > d.saldo) then
    raise exception 'El saldo de un préstamo cambió: recalcula la liquidación antes de aprobarla';
  end if;

  -- Préstamos: se rebaja lo descontado.
  update public.colaborador_deducciones d
    set saldo = case when d.monto_total is null then d.saldo else greatest(d.saldo - fd.monto, 0) end,
        activa = case when d.monto_total is null or d.saldo - fd.monto <= 0 then false else d.activa end
  from public.rrhh_finalizacion_deducciones fd
  where fd.finalizacion_id = p_id and d.id = fd.deduccion_id;

  -- Ausencias después de la salida: se cancelan.
  update public.rrhh_ausencias
    set estado = 'cancelada', resuelto_por = public.fn_usuario_id(), fecha_resolucion = now(),
        comentario_resolucion = 'Finalización de la relación laboral'
    where colaborador_id = c.id and estado in ('solicitada', 'aprobada') and fecha_inicio > f.fecha_salida;

  -- El colaborador queda de baja (y el movimiento queda en su historial).
  perform set_config('rrhh.movimiento', jsonb_build_object('tipo', 'cambio_estado', 'fecha', f.fecha_salida,
    'motivo', 'Finalización de la relación laboral: ' || replace(f.tipo, '_', ' ') || coalesce(' — ' || f.motivo, ''))::text, true);
  update public.colaboradores set estado = 'baja', fecha_baja = f.fecha_salida where id = c.id;

  v_partida := public.fn_rrhh_finalizacion_contabilizar(p_id);
  update public.rrhh_finalizaciones
    set estado = 'aprobada', estado_colaborador_anterior = c.estado, aprobado_por = public.fn_usuario_id(), fecha_aprobacion = now(),
        partida_id = v_partida
    where id = p_id;
  return v_partida;
end;
$$;

grant execute on function public.fn_rrhh_finalizacion_aprobar(bigint) to authenticated;

create or replace function public.fn_rrhh_finalizacion_pagar(p_id bigint, p_cuenta_bancaria_id bigint, p_fecha date, p_referencia text default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  f public.rrhh_finalizaciones%rowtype;
  v_nombre text;
  v_mov bigint;
begin
  if not public.fn_tiene_permiso('planilla', 'pagar') then
    raise exception 'No tienes permiso para pagar liquidaciones';
  end if;
  select * into f from public.rrhh_finalizaciones where id = p_id for update;
  if not found or f.estado <> 'aprobada' then
    raise exception 'Solo se paga una liquidación aprobada';
  end if;
  if f.liquido <= 0 then
    raise exception 'La liquidación no tiene líquido a pagar';
  end if;
  select nombres || ' ' || apellidos into v_nombre from public.colaboradores where id = f.colaborador_id;
  v_mov := public.fn_banco_insertar(p_cuenta_bancaria_id, coalesce(p_fecha, public.fn_ctb_hoy()), 'egreso', 'pago_liquidacion',
    f.liquido, 'Liquidación laboral de ' || v_nombre, p_referencia);
  update public.movimientos_banco set cuenta_contrapartida_id = public.fn_ctb_cuenta('planilla.por_pagar') where id = v_mov;
  update public.rrhh_finalizaciones
    set estado = 'pagada', cuenta_bancaria_id = p_cuenta_bancaria_id, movimiento_banco_id = v_mov,
        fecha_pago = coalesce(p_fecha, public.fn_ctb_hoy()), pagado_por = public.fn_usuario_id(), fecha_pagada = now()
    where id = p_id;
  return v_mov;
end;
$$;

grant execute on function public.fn_rrhh_finalizacion_pagar(bigint, bigint, date, text) to authenticated;

create or replace function public.fn_rrhh_finalizacion_anular(p_id bigint, p_motivo text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  f public.rrhh_finalizaciones%rowtype;
begin
  if not public.fn_tiene_permiso('planilla', 'aprobar') then
    raise exception 'No tienes permiso para anular liquidaciones';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Indica el motivo de la anulación';
  end if;
  select * into f from public.rrhh_finalizaciones where id = p_id for update;
  if not found or f.estado <> 'aprobada' then
    raise exception '%', case when f.estado = 'pagada' then 'La liquidación ya se pagó: anula primero el pago en Bancos'
                              else 'Solo se anula una liquidación aprobada (un borrador se elimina)' end;
  end if;
  if f.partida_id is not null then
    perform public.fn_ctb_revertir_interno(f.partida_id, public.fn_ctb_hoy(), 'anulación de la liquidación laboral: ' || btrim(p_motivo));
  end if;
  update public.colaborador_deducciones d
    set saldo = case when d.monto_total is null then d.saldo else least(d.saldo + fd.monto, d.monto_total) end,
        activa = true
  from public.rrhh_finalizacion_deducciones fd
  where fd.finalizacion_id = p_id and d.id = fd.deduccion_id;
  perform set_config('rrhh.movimiento', jsonb_build_object('tipo', 'cambio_estado', 'fecha', public.fn_ctb_hoy(),
    'motivo', 'Anulación de la finalización laboral: ' || btrim(p_motivo))::text, true);
  update public.colaboradores set estado = coalesce(f.estado_colaborador_anterior, 'activo'), fecha_baja = null where id = f.colaborador_id;
  update public.rrhh_finalizaciones
    set estado = 'anulada', anulado_por = public.fn_usuario_id(), fecha_anulacion = now(), motivo_anulacion = btrim(p_motivo)
    where id = p_id;
end;
$$;

grant execute on function public.fn_rrhh_finalizacion_anular(bigint, text) to authenticated;

-- Pago anulado en Bancos: la planilla o la liquidación vuelve a "aprobada".
create or replace function public.fn_trg_pago_planilla_anulado()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.anulado and not old.anulado then
    if new.origen = 'pago_planilla' then
      update public.planillas
        set estado = 'aprobada', movimiento_banco_id = null, cuenta_bancaria_id = null, pagado_por = null, fecha_pagada = null
        where movimiento_banco_id = new.id and estado = 'pagada';
    elsif new.origen = 'pago_liquidacion' then
      update public.rrhh_finalizaciones
        set estado = 'aprobada', movimiento_banco_id = null, cuenta_bancaria_id = null, pagado_por = null, fecha_pagada = null, fecha_pago = null
        where movimiento_banco_id = new.id and estado = 'pagada';
    end if;
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 5. Auditoría y RLS
-- ------------------------------------------------------------
create trigger trg_auditar_rrhh_finalizaciones after insert or update or delete on public.rrhh_finalizaciones
  for each row execute function public.fn_auditar();

alter table public.rrhh_finalizaciones enable row level security;
create policy sel_rrhh_finalizaciones on public.rrhh_finalizaciones for select to authenticated
  using ((select public.fn_tiene_permiso('rrhh', 'finalizar')) or (select public.fn_tiene_permiso('planilla', 'ver')));
grant select on public.rrhh_finalizaciones to authenticated;

alter table public.rrhh_finalizacion_deducciones enable row level security;
create policy sel_rrhh_finalizacion_deducciones on public.rrhh_finalizacion_deducciones for select to authenticated
  using ((select public.fn_tiene_permiso('rrhh', 'finalizar')) or (select public.fn_tiene_permiso('planilla', 'ver')));
grant select on public.rrhh_finalizacion_deducciones to authenticated;
