-- ============================================================
-- ASTRO — Recursos humanos (fase 2): movimientos laborales, vacaciones y
-- permisos, uniformes y equipo.
--
--   colaborador_movimientos   ascensos, traslados, cambios de jefe, de contrato
--                             y de estado (anterior → nuevo, fecha, responsable).
--                             Se registran solos al cambiar esos datos del
--                             expediente, también si se editan directamente.
--   rrhh_config               días de vacaciones por año y si el sábado es laboral
--   rrhh_feriados             asuetos (cuentan para los días hábiles)
--   rrhh_tipos_ausencia       vacaciones, permisos de ley, licencias IGSS, faltas
--   rrhh_ausencias            solicitudes y su autorización (saldo e historial)
--   rrhh_vacaciones_ajustes   saldos iniciales y correcciones de días
--   colaborador_asignaciones  uniformes (talla) y equipo (computadora, teléfono,
--                             herramientas…), ligado a activos fijos si aplica
--
-- Permiso nuevo: rrhh.autorizar (aprobar vacaciones y permisos). El jefe
-- inmediato que tiene usuario también puede autorizar a su equipo.
-- ============================================================

insert into public.permisos (modulo, accion, descripcion) values
  ('rrhh', 'autorizar', 'Autorizar vacaciones, permisos y licencias; ajustar saldos de vacaciones')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from public.roles r
join public.permisos p on p.modulo = 'rrhh' and p.accion = 'autorizar'
where r.nombre in ('admin', 'contabilidad')
on conflict (rol_id, permiso_id) do nothing;

-- Tallas de uniforme en el expediente
alter table public.colaboradores
  add column if not exists talla_camisa text,
  add column if not exists talla_pantalon text,
  add column if not exists talla_calzado text;

-- Ayudantes de acceso (security definer: evitan recursión de RLS)
create or replace function public.fn_rrhh_es_propio(p_colaborador_id bigint)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.colaboradores
                 where id = p_colaborador_id and usuario_id is not null and usuario_id = public.fn_usuario_id())
$$;

create or replace function public.fn_rrhh_es_jefe_de(p_colaborador_id bigint)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.colaboradores c join public.colaboradores j on j.id = c.jefe_id
                 where c.id = p_colaborador_id and j.usuario_id is not null and j.usuario_id = public.fn_usuario_id())
$$;

grant execute on function public.fn_rrhh_es_propio(bigint) to authenticated;
grant execute on function public.fn_rrhh_es_jefe_de(bigint) to authenticated;

-- ------------------------------------------------------------
-- 1. Movimientos laborales
-- ------------------------------------------------------------
create table public.colaborador_movimientos (
  id bigint generated always as identity primary key,
  colaborador_id bigint not null references public.colaboradores (id),
  tipo text not null check (tipo in ('ascenso', 'cambio_puesto', 'traslado', 'cambio_jefe', 'cambio_contrato', 'cambio_estado', 'otro')),
  fecha_efectiva date not null,
  puesto_anterior_id bigint references public.rrhh_puestos (id),
  puesto_nuevo_id bigint references public.rrhh_puestos (id),
  departamento_anterior_id bigint references public.rrhh_departamentos (id),
  departamento_nuevo_id bigint references public.rrhh_departamentos (id),
  area_anterior_id bigint references public.rrhh_areas (id),
  area_nueva_id bigint references public.rrhh_areas (id),
  tienda_anterior_id bigint references public.tiendas (id),
  tienda_nueva_id bigint references public.tiendas (id),
  jefe_anterior_id bigint references public.colaboradores (id),
  jefe_nuevo_id bigint references public.colaboradores (id),
  contrato_anterior text,
  contrato_nuevo text,
  estado_anterior text,
  estado_nuevo text,
  motivo text,
  responsable text,
  registrado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now()
);
create index idx_colaborador_movimientos on public.colaborador_movimientos (colaborador_id, fecha_efectiva desc);

-- Registra el movimiento cuando cambian puesto, departamento, área, sucursal, jefe,
-- contrato o estado. fn_rrhh_registrar_movimiento deja tipo, fecha, motivo y
-- responsable en la variable de sesión rrhh.movimiento; si se editó el expediente
-- directamente, el tipo se deduce y el motivo es "Edición del expediente".
create or replace function public.fn_trg_colaborador_movimiento()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_cfg jsonb := nullif(current_setting('rrhh.movimiento', true), '')::jsonb;
  v_puesto boolean := new.puesto_id is distinct from old.puesto_id;
  v_lugar boolean := new.departamento_id is distinct from old.departamento_id or new.area_id is distinct from old.area_id
                     or new.tienda_id is distinct from old.tienda_id;
  v_jefe boolean := new.jefe_id is distinct from old.jefe_id;
  v_contrato boolean := new.tipo_contrato is distinct from old.tipo_contrato;
  v_estado boolean := new.estado is distinct from old.estado;
  v_tipo text;
begin
  if not (v_puesto or v_lugar or v_jefe or v_contrato or v_estado) then
    return new;
  end if;
  v_tipo := coalesce(v_cfg ->> 'tipo',
    case when v_puesto then 'cambio_puesto' when v_lugar then 'traslado' when v_jefe then 'cambio_jefe'
         when v_contrato then 'cambio_contrato' else 'cambio_estado' end);
  insert into public.colaborador_movimientos (colaborador_id, tipo, fecha_efectiva,
    puesto_anterior_id, puesto_nuevo_id, departamento_anterior_id, departamento_nuevo_id, area_anterior_id, area_nueva_id,
    tienda_anterior_id, tienda_nueva_id, jefe_anterior_id, jefe_nuevo_id, contrato_anterior, contrato_nuevo,
    estado_anterior, estado_nuevo, motivo, responsable, registrado_por)
  values (new.id, v_tipo, coalesce(nullif(v_cfg ->> 'fecha', '')::date, public.fn_ctb_hoy()),
    case when v_puesto then old.puesto_id end, case when v_puesto then new.puesto_id end,
    case when new.departamento_id is distinct from old.departamento_id then old.departamento_id end,
    case when new.departamento_id is distinct from old.departamento_id then new.departamento_id end,
    case when new.area_id is distinct from old.area_id then old.area_id end,
    case when new.area_id is distinct from old.area_id then new.area_id end,
    case when new.tienda_id is distinct from old.tienda_id then old.tienda_id end,
    case when new.tienda_id is distinct from old.tienda_id then new.tienda_id end,
    case when v_jefe then old.jefe_id end, case when v_jefe then new.jefe_id end,
    case when v_contrato then old.tipo_contrato end, case when v_contrato then new.tipo_contrato end,
    case when v_estado then old.estado end, case when v_estado then new.estado end,
    coalesce(nullif(v_cfg ->> 'motivo', ''), 'Edición del expediente'), nullif(v_cfg ->> 'responsable', ''),
    public.fn_usuario_id());
  perform set_config('rrhh.movimiento', '', true);
  return new;
end;
$$;

create trigger trg_colaborador_movimiento after update on public.colaboradores
  for each row execute function public.fn_trg_colaborador_movimiento();

-- p_cambios: claves presentes = campos que cambian {puesto_id, departamento_id, area_id, tienda_id, jefe_id, tipo_contrato, estado}
create or replace function public.fn_rrhh_registrar_movimiento(p_colaborador_id bigint, p_tipo text, p_fecha date,
  p_cambios jsonb, p_motivo text, p_responsable text default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_c public.colaboradores%rowtype;
  v_id bigint;
  v_jefe bigint;
begin
  if not public.fn_tiene_permiso('rrhh', 'editar') then
    raise exception 'No tienes permiso para registrar movimientos laborales';
  end if;
  if p_tipo not in ('ascenso', 'cambio_puesto', 'traslado', 'cambio_jefe', 'cambio_contrato', 'cambio_estado', 'otro') then
    raise exception 'Tipo de movimiento no válido';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Indica el motivo del movimiento';
  end if;
  select * into v_c from public.colaboradores where id = p_colaborador_id for update;
  if not found then
    raise exception 'El colaborador no existe';
  end if;
  if v_c.estado = 'baja' then
    raise exception 'El colaborador está de baja';
  end if;
  p_cambios := coalesce(p_cambios, '{}'::jsonb);
  if p_cambios ? 'estado' and p_cambios ->> 'estado' = 'baja' then
    raise exception 'La baja se registra en Finalización de la relación laboral';
  end if;
  if p_tipo in ('ascenso', 'cambio_puesto')
     and (not p_cambios ? 'puesto_id' or nullif(p_cambios ->> 'puesto_id', '')::bigint is not distinct from v_c.puesto_id) then
    raise exception 'Selecciona el nuevo puesto';
  end if;
  v_jefe := case when p_cambios ? 'jefe_id' then nullif(p_cambios ->> 'jefe_id', '')::bigint else v_c.jefe_id end;
  if v_jefe = p_colaborador_id then
    raise exception 'El colaborador no puede ser su propio jefe';
  end if;

  perform set_config('rrhh.movimiento', jsonb_build_object('tipo', p_tipo, 'fecha', coalesce(p_fecha, public.fn_ctb_hoy()),
    'motivo', btrim(p_motivo), 'responsable', nullif(btrim(coalesce(p_responsable, '')), ''))::text, true);
  update public.colaboradores set
    puesto_id = case when p_cambios ? 'puesto_id' then nullif(p_cambios ->> 'puesto_id', '')::bigint else puesto_id end,
    departamento_id = case when p_cambios ? 'departamento_id' then nullif(p_cambios ->> 'departamento_id', '')::bigint else departamento_id end,
    area_id = case when p_cambios ? 'area_id' then nullif(p_cambios ->> 'area_id', '')::bigint else area_id end,
    tienda_id = case when p_cambios ? 'tienda_id' then nullif(p_cambios ->> 'tienda_id', '')::bigint else tienda_id end,
    jefe_id = v_jefe,
    tipo_contrato = case when p_cambios ? 'tipo_contrato' then nullif(p_cambios ->> 'tipo_contrato', '') else tipo_contrato end,
    estado = case when p_cambios ? 'estado' then coalesce(nullif(p_cambios ->> 'estado', ''), estado) else estado end
  where id = p_colaborador_id;

  -- Si el trigger no registró nada (no cambió ningún dato), "otro" se guarda como nota; los demás tipos piden un cambio.
  if nullif(current_setting('rrhh.movimiento', true), '') is null then
    select max(id) into v_id from public.colaborador_movimientos where colaborador_id = p_colaborador_id;
    return v_id;
  end if;
  perform set_config('rrhh.movimiento', '', true);
  if p_tipo <> 'otro' then
    raise exception 'No hay cambios que registrar';
  end if;
  insert into public.colaborador_movimientos (colaborador_id, tipo, fecha_efectiva, motivo, responsable, registrado_por)
  values (p_colaborador_id, 'otro', coalesce(p_fecha, public.fn_ctb_hoy()), btrim(p_motivo),
    nullif(btrim(coalesce(p_responsable, '')), ''), public.fn_usuario_id())
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.fn_rrhh_registrar_movimiento(bigint, text, date, jsonb, text, text) to authenticated;

-- ------------------------------------------------------------
-- 2. Vacaciones y permisos
-- ------------------------------------------------------------
create table public.rrhh_config (
  id int primary key default 1 check (id = 1),
  dias_vacaciones numeric(4,1) not null default 15 check (dias_vacaciones >= 15),
  sabado_laboral text not null default 'no' check (sabado_laboral in ('no', 'medio', 'completo')),
  fecha_actualizacion timestamptz
);
insert into public.rrhh_config (id) values (1) on conflict (id) do nothing;

create table public.rrhh_feriados (
  id bigint generated always as identity primary key,
  fecha date not null unique,
  nombre text not null check (btrim(nombre) <> ''),
  medio_dia boolean not null default false
);

insert into public.rrhh_feriados (fecha, nombre, medio_dia) values
  ('2026-01-01', 'Año Nuevo', false),
  ('2026-04-02', 'Jueves Santo', false),
  ('2026-04-03', 'Viernes Santo', false),
  ('2026-04-04', 'Sábado Santo', false),
  ('2026-05-01', 'Día del Trabajo', false),
  ('2026-06-30', 'Día del Ejército', false),
  ('2026-09-15', 'Día de la Independencia', false),
  ('2026-10-20', 'Día de la Revolución', false),
  ('2026-11-01', 'Día de Todos los Santos', false),
  ('2026-12-24', 'Nochebuena (medio día)', true),
  ('2026-12-25', 'Navidad', false),
  ('2026-12-31', 'Fin de año (medio día)', true),
  ('2027-01-01', 'Año Nuevo', false),
  ('2027-03-25', 'Jueves Santo', false),
  ('2027-03-26', 'Viernes Santo', false),
  ('2027-03-27', 'Sábado Santo', false),
  ('2027-05-01', 'Día del Trabajo', false),
  ('2027-06-30', 'Día del Ejército', false),
  ('2027-09-15', 'Día de la Independencia', false),
  ('2027-10-20', 'Día de la Revolución', false),
  ('2027-11-01', 'Día de Todos los Santos', false),
  ('2027-12-24', 'Nochebuena (medio día)', true),
  ('2027-12-25', 'Navidad', false),
  ('2027-12-31', 'Fin de año (medio día)', true)
on conflict (fecha) do nothing;

create table public.rrhh_tipos_ausencia (
  id bigint generated always as identity primary key,
  clave text not null unique,
  nombre text not null check (btrim(nombre) <> ''),
  categoria text not null check (categoria in ('vacaciones', 'permiso', 'licencia', 'falta')),
  con_goce boolean not null,
  descuenta_vacaciones boolean not null default false,
  dias_maximos numeric(5,1),
  requiere_documento boolean not null default false,
  referencia_legal text,
  orden int not null default 0,
  activo boolean not null default true
);

insert into public.rrhh_tipos_ausencia (clave, nombre, categoria, con_goce, descuenta_vacaciones, dias_maximos, requiere_documento, referencia_legal, orden) values
  ('vacaciones', 'Vacaciones', 'vacaciones', true, true, null, false, 'Código de Trabajo, art. 130', 1),
  ('permiso_con_goce', 'Permiso personal con goce de salario', 'permiso', true, false, null, false, 'Código de Trabajo, art. 61 ñ', 10),
  ('permiso_sin_goce', 'Permiso personal sin goce de salario', 'permiso', false, false, null, false, null, 11),
  ('fallecimiento', 'Fallecimiento de cónyuge, conviviente, padres o hijos', 'permiso', true, false, 3, false, 'Código de Trabajo, art. 61 ñ', 12),
  ('matrimonio', 'Matrimonio', 'permiso', true, false, 5, true, 'Código de Trabajo, art. 61 ñ', 13),
  ('nacimiento_hijo', 'Nacimiento de hijo', 'permiso', true, false, 2, true, 'Código de Trabajo, art. 61 ñ', 14),
  ('citacion', 'Citación judicial o administrativa', 'permiso', true, false, null, true, 'Código de Trabajo, art. 61 ñ', 15),
  ('consulta_igss', 'Consulta médica en el IGSS', 'permiso', true, false, null, true, null, 16),
  ('suspension_igss', 'Suspensión por enfermedad o accidente (IGSS)', 'licencia', false, false, null, true, 'Subsidio a cargo del IGSS', 20),
  ('maternidad', 'Licencia de maternidad (IGSS)', 'licencia', false, false, 84, true, 'Código de Trabajo, art. 152', 21),
  ('licencia_sin_goce', 'Licencia sin goce de salario', 'licencia', false, false, null, false, null, 22),
  ('falta_injustificada', 'Falta injustificada', 'falta', false, false, null, false, null, 30),
  ('suspension_disciplinaria', 'Suspensión disciplinaria', 'falta', false, false, null, false, 'Reglamento Interior de Trabajo', 31)
on conflict (clave) do nothing;

create table public.rrhh_ausencias (
  id bigint generated always as identity primary key,
  colaborador_id bigint not null references public.colaboradores (id),
  tipo_ausencia_id bigint not null references public.rrhh_tipos_ausencia (id),
  fecha_inicio date not null,
  fecha_fin date not null,
  dias numeric(6,1) not null check (dias > 0),
  con_goce boolean not null,
  motivo text,
  estado text not null default 'solicitada' check (estado in ('solicitada', 'aprobada', 'rechazada', 'cancelada')),
  documento_url text,
  solicitado_por bigint references public.usuarios (id),
  fecha_solicitud timestamptz not null default now(),
  resuelto_por bigint references public.usuarios (id),
  fecha_resolucion timestamptz,
  comentario_resolucion text,
  check (fecha_fin >= fecha_inicio)
);
create index idx_rrhh_ausencias_colaborador on public.rrhh_ausencias (colaborador_id, fecha_inicio desc);
create index idx_rrhh_ausencias_fechas on public.rrhh_ausencias (fecha_inicio, fecha_fin) where estado in ('solicitada', 'aprobada');

create table public.rrhh_vacaciones_ajustes (
  id bigint generated always as identity primary key,
  colaborador_id bigint not null references public.colaboradores (id),
  fecha date not null,
  dias numeric(6,1) not null check (dias <> 0),
  motivo text not null check (btrim(motivo) <> ''),
  registrado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now()
);
create index idx_rrhh_vacaciones_ajustes on public.rrhh_vacaciones_ajustes (colaborador_id);

-- Días hábiles entre dos fechas: lunes a viernes, el sábado según rrhh_config, sin domingos ni asuetos.
create or replace function public.fn_rrhh_dias_habiles(p_desde date, p_hasta date)
returns numeric
language sql stable
set search_path = public
as $$
  select coalesce(sum(
    case
      when extract(isodow from g.d) = 7 then 0
      when f.id is not null and not f.medio_dia then 0
      else (case when extract(isodow from g.d) = 6
                 then case c.sabado_laboral when 'completo' then 1 when 'medio' then 0.5 else 0 end
                 else 1 end)
           * case when f.medio_dia then 0.5 else 1 end
    end), 0)::numeric
  from generate_series(p_desde, p_hasta, interval '1 day') as g(d)
  cross join public.rrhh_config c
  left join public.rrhh_feriados f on f.fecha = g.d::date
$$;

grant execute on function public.fn_rrhh_dias_habiles(date, date) to authenticated;

-- Vacaciones por período anual (desde la fecha de ingreso). Los días gozados
-- (vacaciones aprobadas, incluidas las programadas) y los ajustes negativos se
-- aplican a los períodos más antiguos primero; los ajustes positivos son el
-- período 0. El período en curso muestra lo proporcional ganado a la fecha.
create or replace function public.fn_rrhh_vacaciones_periodos(p_colaborador_id bigint, p_fecha date default null)
returns table (periodo int, desde date, hasta date, completo boolean, ganados numeric, gozados numeric, pendientes numeric)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_c public.colaboradores%rowtype;
  v_dias numeric;
  v_corte date;
  v_pool numeric;
  v_extra numeric;
  v_i int := 0;
  v_desde date;
  v_hasta date;
  v_ganados numeric;
  v_goz numeric;
begin
  if not (public.fn_tiene_permiso('rrhh', 'ver') or public.fn_rrhh_es_propio(p_colaborador_id) or public.fn_rrhh_es_jefe_de(p_colaborador_id)) then
    raise exception 'No tienes acceso a este expediente';
  end if;
  select * into v_c from public.colaboradores where id = p_colaborador_id;
  if not found or v_c.fecha_ingreso is null then
    return;
  end if;
  select dias_vacaciones into v_dias from public.rrhh_config where id = 1;
  v_corte := least(coalesce(p_fecha, public.fn_ctb_hoy()), coalesce(v_c.fecha_baja, 'infinity'::date));
  select coalesce(sum(a.dias), 0) into v_pool
    from public.rrhh_ausencias a join public.rrhh_tipos_ausencia t on t.id = a.tipo_ausencia_id
    where a.colaborador_id = p_colaborador_id and a.estado = 'aprobada' and t.descuenta_vacaciones;
  select coalesce(sum(-dias) filter (where dias < 0), 0), coalesce(sum(dias) filter (where dias > 0), 0)
    into v_goz, v_extra
    from public.rrhh_vacaciones_ajustes where colaborador_id = p_colaborador_id;
  v_pool := v_pool + v_goz;

  if v_extra > 0 then
    v_goz := least(v_pool, v_extra);
    v_pool := v_pool - v_goz;
    periodo := 0; desde := null; hasta := null; completo := true; ganados := v_extra; gozados := v_goz; pendientes := v_extra - v_goz;
    return next;
  end if;

  v_desde := v_c.fecha_ingreso;
  while v_desde <= v_corte loop
    v_i := v_i + 1;
    v_hasta := (v_c.fecha_ingreso + make_interval(years => v_i))::date - 1;
    if v_hasta <= v_corte then
      v_ganados := v_dias;
    else
      v_ganados := round(v_dias * (v_corte - v_desde + 1)::numeric / (v_hasta - v_desde + 1), 2);
    end if;
    -- El período en curso absorbe lo que sobre (días anticipados → pendiente negativo).
    v_goz := case when v_hasta > v_corte then v_pool else least(v_pool, v_ganados) end;
    v_pool := v_pool - v_goz;
    periodo := v_i; desde := v_desde; hasta := v_hasta; completo := v_hasta <= v_corte;
    ganados := v_ganados; gozados := v_goz; pendientes := v_ganados - v_goz;
    return next;
    v_desde := v_hasta + 1;
  end loop;
  -- Si el corte cae justo en un aniversario el último período quedó completo y no absorbió el resto.
  if v_pool > 0 then
    periodo := v_i + 1; desde := v_corte + 1; hasta := (v_c.fecha_ingreso + make_interval(years => v_i + 1))::date - 1;
    completo := false; ganados := 0; gozados := v_pool; pendientes := -v_pool;
    return next;
  end if;
end;
$$;

grant execute on function public.fn_rrhh_vacaciones_periodos(bigint, date) to authenticated;

-- Resumen del saldo: disponibles = períodos completos + ajustes − gozados (lo que se puede solicitar);
-- acumulado = incluye lo proporcional del período en curso (lo que se pagaría al finalizar).
create or replace function public.fn_rrhh_saldo_vacaciones(p_colaborador_id bigint)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_res jsonb;
  v_hoy date := public.fn_ctb_hoy();
begin
  select jsonb_build_object(
      'ganados_completos', coalesce(sum(p.ganados) filter (where p.completo), 0),
      'proporcional', coalesce(sum(p.ganados) filter (where not p.completo), 0),
      'total_gozados', coalesce(sum(p.gozados), 0),
      'disponibles', coalesce(sum(p.ganados) filter (where p.completo), 0) - coalesce(sum(p.gozados), 0),
      'acumulado', coalesce(sum(p.ganados), 0) - coalesce(sum(p.gozados), 0))
    into v_res
    from public.fn_rrhh_vacaciones_periodos(p_colaborador_id) p;
  return v_res || (
    select jsonb_build_object(
      'gozados', coalesce(sum(a.dias) filter (where a.estado = 'aprobada' and a.fecha_inicio <= v_hoy), 0),
      'programados', coalesce(sum(a.dias) filter (where a.estado = 'aprobada' and a.fecha_inicio > v_hoy), 0),
      'solicitados', coalesce(sum(a.dias) filter (where a.estado = 'solicitada'), 0))
    from public.rrhh_ausencias a join public.rrhh_tipos_ausencia t on t.id = a.tipo_ausencia_id
    where a.colaborador_id = p_colaborador_id and t.descuenta_vacaciones);
end;
$$;

grant execute on function public.fn_rrhh_saldo_vacaciones(bigint) to authenticated;

create or replace function public.fn_rrhh_resolver_ausencia(p_id bigint, p_aprobar boolean, p_comentario text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_a public.rrhh_ausencias%rowtype;
begin
  select * into v_a from public.rrhh_ausencias where id = p_id for update;
  if not found then
    raise exception 'La solicitud no existe';
  end if;
  if public.fn_rrhh_es_propio(v_a.colaborador_id) then
    raise exception 'No puedes autorizar tu propia solicitud';
  end if;
  if not (public.fn_tiene_permiso('rrhh', 'autorizar') or public.fn_rrhh_es_jefe_de(v_a.colaborador_id)) then
    raise exception 'No tienes permiso para autorizar esta solicitud';
  end if;
  if v_a.estado <> 'solicitada' then
    raise exception 'La solicitud ya fue resuelta';
  end if;
  if not p_aprobar and coalesce(btrim(p_comentario), '') = '' then
    raise exception 'Indica el motivo del rechazo';
  end if;
  update public.rrhh_ausencias
    set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
        resuelto_por = public.fn_usuario_id(), fecha_resolucion = now(),
        comentario_resolucion = nullif(btrim(coalesce(p_comentario, '')), '')
    where id = p_id;
end;
$$;

grant execute on function public.fn_rrhh_resolver_ausencia(bigint, boolean, text) to authenticated;

create or replace function public.fn_rrhh_solicitar_ausencia(p_colaborador_id bigint, p_tipo_id bigint, p_desde date, p_hasta date,
  p_dias numeric default null, p_motivo text default null, p_documento_url text default null,
  p_aprobar boolean default false, p_anticipar boolean default false)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_c public.colaboradores%rowtype;
  v_t public.rrhh_tipos_ausencia%rowtype;
  v_dias numeric;
  v_saldo jsonb;
  v_libres numeric;
  v_id bigint;
begin
  if not (public.fn_tiene_permiso('rrhh', 'editar') or public.fn_rrhh_es_propio(p_colaborador_id)) then
    raise exception 'No tienes permiso para registrar ausencias';
  end if;
  select * into v_c from public.colaboradores where id = p_colaborador_id;
  if not found then
    raise exception 'El colaborador no existe';
  end if;
  if v_c.estado = 'baja' then
    raise exception 'El colaborador está de baja';
  end if;
  select * into v_t from public.rrhh_tipos_ausencia where id = p_tipo_id and activo;
  if not found then
    raise exception 'Tipo de ausencia no válido';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Revisa las fechas: la fecha final no puede ser antes de la inicial';
  end if;
  if v_c.fecha_ingreso is not null and p_desde < v_c.fecha_ingreso then
    raise exception 'La ausencia no puede ser antes de la fecha de ingreso';
  end if;
  v_dias := coalesce(nullif(p_dias, 0), public.fn_rrhh_dias_habiles(p_desde, p_hasta));
  if v_dias <= 0 then
    raise exception 'Las fechas no incluyen días hábiles';
  end if;
  if v_dias > (p_hasta - p_desde + 1) then
    raise exception 'Los días no pueden ser más que los días del calendario';
  end if;
  if v_t.dias_maximos is not null and v_dias > v_t.dias_maximos then
    raise exception '% permite como máximo % días', v_t.nombre, v_t.dias_maximos;
  end if;
  if exists (select 1 from public.rrhh_ausencias
             where colaborador_id = p_colaborador_id and estado in ('solicitada', 'aprobada')
               and daterange(fecha_inicio, fecha_fin, '[]') && daterange(p_desde, p_hasta, '[]')) then
    raise exception 'Ya hay una ausencia registrada en esas fechas';
  end if;
  if v_t.descuenta_vacaciones and not p_anticipar then
    v_saldo := public.fn_rrhh_saldo_vacaciones(p_colaborador_id);
    v_libres := (v_saldo ->> 'disponibles')::numeric - (v_saldo ->> 'solicitados')::numeric;
    if v_dias > v_libres then
      raise exception 'Solo tiene % días de vacaciones disponibles (% acumulados con lo proporcional). Marca "anticipar" para concederlos de todos modos',
        greatest(v_libres, 0), round((v_saldo ->> 'acumulado')::numeric, 2);
    end if;
  end if;

  insert into public.rrhh_ausencias (colaborador_id, tipo_ausencia_id, fecha_inicio, fecha_fin, dias, con_goce, motivo,
    documento_url, solicitado_por)
  values (p_colaborador_id, p_tipo_id, p_desde, p_hasta, v_dias, v_t.con_goce, nullif(btrim(coalesce(p_motivo, '')), ''),
    nullif(p_documento_url, ''), public.fn_usuario_id())
  returning id into v_id;
  if p_aprobar then
    perform public.fn_rrhh_resolver_ausencia(v_id, true, null);
  end if;
  return v_id;
end;
$$;

grant execute on function public.fn_rrhh_solicitar_ausencia(bigint, bigint, date, date, numeric, text, text, boolean, boolean) to authenticated;

-- Cancelar: una solicitud pendiente la cancela quien la registró (RRHH o el propio colaborador);
-- una ya aprobada solo quien puede autorizar.
create or replace function public.fn_rrhh_cancelar_ausencia(p_id bigint, p_motivo text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_a public.rrhh_ausencias%rowtype;
begin
  select * into v_a from public.rrhh_ausencias where id = p_id for update;
  if not found then
    raise exception 'La ausencia no existe';
  end if;
  if v_a.estado not in ('solicitada', 'aprobada') then
    raise exception 'La ausencia ya está %', v_a.estado;
  end if;
  if v_a.estado = 'aprobada' and not public.fn_tiene_permiso('rrhh', 'autorizar') then
    raise exception 'Solo quien autoriza puede cancelar una ausencia aprobada';
  end if;
  if v_a.estado = 'solicitada' and not (public.fn_tiene_permiso('rrhh', 'editar') or public.fn_rrhh_es_propio(v_a.colaborador_id)
                                        or public.fn_tiene_permiso('rrhh', 'autorizar')) then
    raise exception 'No tienes permiso para cancelar esta solicitud';
  end if;
  update public.rrhh_ausencias
    set estado = 'cancelada', resuelto_por = public.fn_usuario_id(), fecha_resolucion = now(),
        comentario_resolucion = coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), comentario_resolucion)
    where id = p_id;
end;
$$;

grant execute on function public.fn_rrhh_cancelar_ausencia(bigint, text) to authenticated;

create or replace function public.fn_rrhh_ajustar_vacaciones(p_colaborador_id bigint, p_fecha date, p_dias numeric, p_motivo text)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.fn_tiene_permiso('rrhh', 'autorizar') then
    raise exception 'No tienes permiso para ajustar vacaciones';
  end if;
  if coalesce(p_dias, 0) = 0 then
    raise exception 'Indica los días del ajuste';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Indica el motivo del ajuste';
  end if;
  if not exists (select 1 from public.colaboradores where id = p_colaborador_id) then
    raise exception 'El colaborador no existe';
  end if;
  insert into public.rrhh_vacaciones_ajustes (colaborador_id, fecha, dias, motivo, registrado_por)
  values (p_colaborador_id, coalesce(p_fecha, public.fn_ctb_hoy()), round(p_dias, 1), btrim(p_motivo), public.fn_usuario_id())
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.fn_rrhh_ajustar_vacaciones(bigint, date, numeric, text) to authenticated;

-- ------------------------------------------------------------
-- 3. Uniformes y equipo
-- ------------------------------------------------------------
create table public.colaborador_asignaciones (
  id bigint generated always as identity primary key,
  colaborador_id bigint not null references public.colaboradores (id),
  categoria text not null check (categoria in ('uniforme', 'computadora', 'telefono', 'papeleria', 'herramienta', 'vehiculo', 'otro')),
  descripcion text not null check (btrim(descripcion) <> ''),
  talla text,
  cantidad numeric(10,2) not null default 1 check (cantidad > 0),
  marca_modelo text,
  numero_serie text,
  activo_fijo_id bigint references public.activos_fijos (id),
  valor numeric(14,2) check (valor >= 0),
  fecha_entrega date not null,
  entregado_por text,
  responsiva_url text,
  estado text not null default 'asignado' check (estado in ('asignado', 'devuelto', 'extraviado', 'danado')),
  fecha_devolucion date,
  recibido_por text,
  notas text,
  notas_devolucion text,
  registrado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now(),
  check (estado = 'asignado' or fecha_devolucion is not null),
  check (fecha_devolucion is null or fecha_devolucion >= fecha_entrega)
);
create index idx_colaborador_asignaciones on public.colaborador_asignaciones (colaborador_id, estado);
create unique index uq_asignacion_activo_vigente on public.colaborador_asignaciones (activo_fijo_id)
  where activo_fijo_id is not null and estado = 'asignado';

-- El activo fijo asignado queda a cargo del usuario del colaborador (si tiene usuario);
-- al devolverlo deja de estar a su cargo.
create or replace function public.fn_trg_asignacion_activo()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_usuario bigint;
begin
  if tg_op = 'INSERT' then
    new.registrado_por := coalesce(new.registrado_por, public.fn_usuario_id());
  end if;
  if new.estado = 'asignado' then
    new.fecha_devolucion := null;
  end if;
  if new.activo_fijo_id is not null then
    select usuario_id into v_usuario from public.colaboradores where id = new.colaborador_id;
    if v_usuario is not null then
      if new.estado = 'asignado' then
        update public.activos_fijos set responsable_id = v_usuario where id = new.activo_fijo_id and responsable_id is distinct from v_usuario;
      else
        update public.activos_fijos set responsable_id = null where id = new.activo_fijo_id and responsable_id = v_usuario;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_asignacion_activo before insert or update on public.colaborador_asignaciones
  for each row execute function public.fn_trg_asignacion_activo();

-- ------------------------------------------------------------
-- 4. Auditoría y RLS
-- ------------------------------------------------------------
create trigger trg_auditar_colaborador_movimientos after insert or update or delete on public.colaborador_movimientos
  for each row execute function public.fn_auditar();
create trigger trg_auditar_rrhh_ausencias after insert or update or delete on public.rrhh_ausencias
  for each row execute function public.fn_auditar();
create trigger trg_auditar_rrhh_vacaciones_ajustes after insert or update or delete on public.rrhh_vacaciones_ajustes
  for each row execute function public.fn_auditar();
create trigger trg_auditar_colaborador_asignaciones after insert or update or delete on public.colaborador_asignaciones
  for each row execute function public.fn_auditar();
create trigger trg_auditar_rrhh_config after update on public.rrhh_config
  for each row execute function public.fn_auditar();

do $$
declare t text;
begin
  -- Catálogos de consulta general (no sensibles): cualquier usuario los lee; RRHH los edita.
  foreach t in array array['rrhh_config', 'rrhh_feriados', 'rrhh_tipos_ausencia'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy sel_%1$s on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy ins_%1$s on public.%1$I for insert to authenticated with check ((select public.fn_tiene_permiso(''rrhh'', ''editar'')))', t);
    execute format('create policy upd_%1$s on public.%1$I for update to authenticated using ((select public.fn_tiene_permiso(''rrhh'', ''editar''))) with check ((select public.fn_tiene_permiso(''rrhh'', ''editar'')))', t);
    execute format('create policy del_%1$s on public.%1$I for delete to authenticated using ((select public.fn_tiene_permiso(''rrhh'', ''editar'')))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Movimientos y ajustes: lectura con rrhh.ver; se escriben solo por funciones y triggers.
alter table public.colaborador_movimientos enable row level security;
create policy sel_colaborador_movimientos on public.colaborador_movimientos for select to authenticated
  using ((select public.fn_tiene_permiso('rrhh', 'ver')));
grant select on public.colaborador_movimientos to authenticated;

alter table public.rrhh_vacaciones_ajustes enable row level security;
create policy sel_rrhh_vacaciones_ajustes on public.rrhh_vacaciones_ajustes for select to authenticated
  using ((select public.fn_tiene_permiso('rrhh', 'ver')) or public.fn_rrhh_es_propio(colaborador_id));
grant select on public.rrhh_vacaciones_ajustes to authenticated;

-- Ausencias: RRHH, el propio colaborador y su jefe inmediato; escritura por funciones.
alter table public.rrhh_ausencias enable row level security;
create policy sel_rrhh_ausencias on public.rrhh_ausencias for select to authenticated
  using ((select public.fn_tiene_permiso('rrhh', 'ver')) or public.fn_rrhh_es_propio(colaborador_id) or public.fn_rrhh_es_jefe_de(colaborador_id));
grant select on public.rrhh_ausencias to authenticated;

-- Adjuntar (o reemplazar) el documento de respaldo de una ausencia.
create or replace function public.fn_rrhh_adjuntar_documento_ausencia(p_id bigint, p_documento_url text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_colaborador bigint;
begin
  select colaborador_id into v_colaborador from public.rrhh_ausencias where id = p_id;
  if not found then
    raise exception 'La ausencia no existe';
  end if;
  if not (public.fn_tiene_permiso('rrhh', 'editar') or public.fn_rrhh_es_propio(v_colaborador)) then
    raise exception 'No tienes permiso para adjuntar documentos';
  end if;
  update public.rrhh_ausencias set documento_url = nullif(p_documento_url, '') where id = p_id;
end;
$$;

grant execute on function public.fn_rrhh_adjuntar_documento_ausencia(bigint, text) to authenticated;

-- Uniformes y equipo: RRHH lee y edita; el colaborador ve lo que tiene asignado.
alter table public.colaborador_asignaciones enable row level security;
create policy sel_colaborador_asignaciones on public.colaborador_asignaciones for select to authenticated
  using ((select public.fn_tiene_permiso('rrhh', 'ver')) or public.fn_rrhh_es_propio(colaborador_id));
create policy ins_colaborador_asignaciones on public.colaborador_asignaciones for insert to authenticated
  with check ((select public.fn_tiene_permiso('rrhh', 'editar')));
create policy upd_colaborador_asignaciones on public.colaborador_asignaciones for update to authenticated
  using ((select public.fn_tiene_permiso('rrhh', 'editar'))) with check ((select public.fn_tiene_permiso('rrhh', 'editar')));
create policy del_colaborador_asignaciones on public.colaborador_asignaciones for delete to authenticated
  using ((select public.fn_tiene_permiso('rrhh', 'editar')));
grant select, insert, update, delete on public.colaborador_asignaciones to authenticated;
