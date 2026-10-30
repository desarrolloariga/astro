-- ============================================================
-- ASTRO — Contabilidad general (fase 1): núcleo de partida doble.
--
--   empresa_contable      datos fiscales, régimen (general 12% / pequeño
--                         contribuyente 5%), fecha de corte, interruptor
--                         de contabilización automática (fase 2)
--   cuentas_contables     nomenclatura jerárquica (1.01.01.001); Madre
--                         (acumula) vs Detalle (única que recibe partidas)
--   centros_costo         CC-ADM, CC-LOG…; obligatorio en costo/gasto
--   periodos_contables    cierre de mes (no confundir con `periodos`,
--                         que es de comisiones)
--   partidas / partida_lineas
--
-- Reglas que la base hace cumplir (no dependen de la pantalla):
--   * Una partida contabilizada SIEMPRE cuadra (Debe = Haber). Los
--     borradores pueden estar descuadrados; al contabilizar se valida y,
--     además, un trigger diferido lo vuelve a revisar al confirmar.
--   * Una partida contabilizada no se edita ni se borra: se revierte.
--   * Solo cuentas de Detalle activas reciben líneas; costo/gasto exigen
--     centro de costo y las cuentas de balance lo dejan vacío.
--   * Mes cerrado: no se crea, edita ni borra nada con fecha en ese mes o
--     antes. Excepción: PIN contable + permiso autorizar_cierre + motivo,
--     y queda registrado en autorizaciones_cierre.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. Permisos
-- ------------------------------------------------------------
insert into public.permisos (modulo, accion, descripcion) values
  ('contabilidad', 'ver', 'Ver partidas, nomenclatura y reportes contables'),
  ('contabilidad', 'registrar', 'Registrar, contabilizar y revertir partidas'),
  ('contabilidad', 'configurar', 'Configurar nomenclatura, centros de costo y datos contables de la empresa'),
  ('contabilidad', 'cerrar_periodo', 'Cerrar meses contables'),
  ('contabilidad', 'autorizar_cierre', 'Autorizar con PIN cambios en meses cerrados y reabrir meses')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('admin', 'ver'), ('admin', 'registrar'), ('admin', 'configurar'), ('admin', 'cerrar_periodo'), ('admin', 'autorizar_cierre'),
  ('contabilidad', 'ver'), ('contabilidad', 'registrar'), ('contabilidad', 'configurar'), ('contabilidad', 'cerrar_periodo'),
  ('contabilidad', 'autorizar_cierre'),
  ('coordinador', 'ver')
) as base(rol_nombre, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = 'contabilidad' and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

-- ------------------------------------------------------------
-- 2. Tablas
-- ------------------------------------------------------------
create table public.empresa_contable (
  id smallint primary key default 1 check (id = 1),
  razon_social text not null default 'Por definir',
  nombre_comercial text,
  nit text not null default 'CF',
  direccion text not null default 'Por definir',
  regimen_iva text not null default 'pequeno_contribuyente'
    check (regimen_iva in ('general', 'pequeno_contribuyente')),
  tasa_impuesto numeric(5,2) not null default 5 check (tasa_impuesto >= 0 and tasa_impuesto < 100),
  fecha_inicio_contable date,
  contabilizacion_automatica boolean not null default false,
  contador_nombre text,
  contador_registro text,
  fecha_actualizacion timestamptz
);
insert into public.empresa_contable (id) values (1) on conflict (id) do nothing;

create table public.cuentas_contables (
  id bigint generated always as identity primary key,
  codigo text not null unique check (codigo ~ '^[0-9]+(\.[0-9]+)*$'),
  nombre text not null check (btrim(nombre) <> ''),
  tipo text not null check (tipo in ('activo', 'pasivo', 'patrimonio', 'ingreso', 'costo', 'gasto')),
  naturaleza text not null check (naturaleza in ('deudora', 'acreedora')),
  es_detalle boolean not null default true,
  padre_id bigint references public.cuentas_contables (id),
  nivel smallint not null check (nivel >= 1),
  exige_centro_costo boolean generated always as (tipo in ('costo', 'gasto')) stored,
  activo boolean not null default true,
  descripcion text,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);
create index idx_cuentas_contables_codigo on public.cuentas_contables (codigo text_pattern_ops);
create index idx_cuentas_contables_padre on public.cuentas_contables (padre_id);

create table public.centros_costo (
  id bigint generated always as identity primary key,
  codigo text not null unique check (codigo ~ '^CC-[A-Z0-9-]+$'),
  nombre text not null,
  tienda_id bigint unique references public.tiendas (id),
  activo boolean not null default true,
  descripcion text,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create table public.periodos_contables (
  id bigint generated always as identity primary key,
  anio int not null check (anio between 2000 and 2100),
  mes smallint not null check (mes between 1 and 12),
  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  cerrado_por bigint references public.usuarios (id),
  fecha_cierre timestamptz,
  reabierto_por bigint references public.usuarios (id),
  fecha_reapertura timestamptz,
  notas text,
  unique (anio, mes)
);

create table public.partidas (
  id bigint generated always as identity primary key,
  anio int not null,
  numero int,
  fecha date not null,
  tipo text not null default 'manual'
    check (tipo in ('apertura', 'manual', 'ajuste', 'automatica', 'reversion', 'cierre')),
  origen text not null default 'manual',
  origen_id bigint,
  descripcion text not null check (btrim(descripcion) <> ''),
  estado text not null default 'borrador' check (estado in ('borrador', 'contabilizada', 'anulada')),
  total_debe numeric(14,2) not null default 0,
  total_haber numeric(14,2) not null default 0,
  partida_revertida_id bigint unique references public.partidas (id),
  revertida_por_id bigint references public.partidas (id),
  creado_por bigint references public.usuarios (id),
  contabilizado_por bigint references public.usuarios (id),
  fecha_contabilizacion timestamptz,
  motivo_anulacion text,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz,
  unique (anio, numero),
  check (estado <> 'contabilizada' or (numero is not null and total_debe = total_haber and total_debe > 0))
);
create unique index uq_partidas_origen on public.partidas (origen, origen_id)
  where origen_id is not null and revertida_por_id is null and estado <> 'anulada';
create index idx_partidas_fecha on public.partidas (fecha) where estado = 'contabilizada';
create index idx_partidas_estado on public.partidas (estado, fecha);

create table public.partida_lineas (
  id bigint generated always as identity primary key,
  partida_id bigint not null references public.partidas (id) on delete cascade,
  linea smallint not null,
  cuenta_id bigint not null references public.cuentas_contables (id),
  centro_costo_id bigint references public.centros_costo (id),
  debe numeric(14,2) not null default 0 check (debe >= 0),
  haber numeric(14,2) not null default 0 check (haber >= 0),
  descripcion text,
  check ((debe > 0) <> (haber > 0)),
  unique (partida_id, linea)
);
create index idx_partida_lineas_cuenta on public.partida_lineas (cuenta_id, partida_id);
create index idx_partida_lineas_cc on public.partida_lineas (centro_costo_id) where centro_costo_id is not null;

create table public.partidas_correlativos (
  anio int primary key,
  ultimo int not null default 0
);

create table public.usuarios_pin_contable (
  usuario_id bigint primary key references public.usuarios (id),
  pin_hash text not null,
  intentos_fallidos int not null default 0,
  bloqueado_hasta timestamptz,
  fecha_actualizacion timestamptz not null default now()
);

create table public.autorizaciones_cierre (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references public.usuarios (id),
  anio int not null,
  mes smallint not null,
  accion text not null check (accion in ('reabrir_periodo', 'partida_en_periodo_cerrado')),
  motivo text not null check (btrim(motivo) <> ''),
  partida_id bigint references public.partidas (id) on delete set null,
  fecha timestamptz not null default now(),
  fecha_uso timestamptz
);

-- Auditoría
create trigger trg_auditar_empresa_contable after insert or update or delete on public.empresa_contable
  for each row execute function public.fn_auditar();
create trigger trg_auditar_cuentas_contables after insert or update or delete on public.cuentas_contables
  for each row execute function public.fn_auditar();
create trigger trg_auditar_centros_costo after insert or update or delete on public.centros_costo
  for each row execute function public.fn_auditar();
create trigger trg_auditar_periodos_contables after insert or update or delete on public.periodos_contables
  for each row execute function public.fn_auditar();
create trigger trg_auditar_partidas after insert or update or delete on public.partidas
  for each row execute function public.fn_auditar();
create trigger trg_auditar_autorizaciones_cierre after insert or update or delete on public.autorizaciones_cierre
  for each row execute function public.fn_auditar();

-- ------------------------------------------------------------
-- 3. RLS: lectura con contabilidad.ver; escritura solo por funciones
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['empresa_contable', 'cuentas_contables', 'centros_costo', 'periodos_contables',
                           'partidas', 'partida_lineas', 'autorizaciones_cierre'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy sel_%1$s on public.%1$I for select to authenticated using ((select public.fn_tiene_permiso(''contabilidad'', ''ver'')))', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Sin políticas: nadie lee ni escribe directo (solo funciones).
alter table public.partidas_correlativos enable row level security;
alter table public.usuarios_pin_contable enable row level security;

-- ------------------------------------------------------------
-- 4. Reglas de la nomenclatura
-- ------------------------------------------------------------
create or replace function public.fn_trg_cuentas_contables()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_padre public.cuentas_contables%rowtype;
  v_codigo_padre text;
  v_tiene_lineas boolean;
  v_tiene_hijos boolean;
begin
  new.nivel := array_length(string_to_array(new.codigo, '.'), 1);

  if new.nivel = 1 then
    new.padre_id := null;
  else
    v_codigo_padre := regexp_replace(new.codigo, '\.[0-9]+$', '');
    select * into v_padre from public.cuentas_contables where codigo = v_codigo_padre;
    if not found then
      raise exception 'Primero crea la cuenta madre %', v_codigo_padre;
    end if;
    if v_padre.es_detalle then
      raise exception 'La cuenta % es de detalle: no puede tener subcuentas (conviértela en cuenta madre)', v_padre.codigo;
    end if;
    if v_padre.tipo <> new.tipo then
      raise exception 'La subcuenta debe ser del mismo tipo que su cuenta madre (%)', v_padre.tipo;
    end if;
    new.padre_id := v_padre.id;
  end if;

  if tg_op = 'UPDATE' then
    v_tiene_lineas := exists (select 1 from public.partida_lineas where cuenta_id = old.id);
    v_tiene_hijos := exists (select 1 from public.cuentas_contables where padre_id = old.id);
    if v_tiene_lineas and (not new.es_detalle or new.tipo <> old.tipo or new.codigo <> old.codigo) then
      raise exception 'La cuenta % ya tiene movimientos: no se puede cambiar su código, tipo ni convertir en madre', old.codigo;
    end if;
    if v_tiene_hijos and (new.es_detalle or new.codigo <> old.codigo or new.tipo <> old.tipo) then
      raise exception 'La cuenta % tiene subcuentas: debe seguir siendo madre y no puede cambiar código ni tipo', old.codigo;
    end if;
    new.fecha_actualizacion := now();
  end if;
  return new;
end;
$$;

create trigger trg_cuentas_contables_reglas before insert or update on public.cuentas_contables
  for each row execute function public.fn_trg_cuentas_contables();

-- ------------------------------------------------------------
-- 5. Mes cerrado y autorización con PIN
--
-- Flujo en dos pasos (dos llamadas): fn_autorizar_periodo_cerrado valida
-- el PIN — si falla, guarda el intento y devuelve el error SIN lanzar
-- excepción, para que el conteo de intentos no se pierda — y si es
-- correcto deja una autorización de un solo uso, válida 10 minutos.
-- Luego la operación (guardar, contabilizar, revertir, reabrir) recibe
-- p_autorizacion_id, la consume y los triggers la reconocen.
-- ------------------------------------------------------------
-- Último día del último mes cerrado (todo lo de esa fecha o antes está bloqueado).
create or replace function public.fn_fecha_bloqueo_contable()
returns date
language sql stable security definer
set search_path = public
as $$
  select (make_date(anio, mes, 1) + interval '1 month' - interval '1 day')::date
  from public.periodos_contables where estado = 'cerrado'
  order by anio desc, mes desc limit 1;
$$;

grant execute on function public.fn_fecha_bloqueo_contable() to authenticated;

-- ¿La autorización activa en esta transacción cubre el mes de p_fecha?
create or replace function public.fn_autorizacion_cierre_vigente(p_fecha date)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_id bigint := nullif(current_setting('astro.autorizacion_cierre', true), '')::bigint;
begin
  if v_id is null then
    return false;
  end if;
  return exists (
    select 1 from public.autorizaciones_cierre a
    where a.id = v_id
      and a.usuario_id = public.fn_usuario_id()
      and (a.anio, a.mes) = (extract(year from p_fecha)::int, extract(month from p_fecha)::int)
  );
end;
$$;

revoke all on function public.fn_autorizacion_cierre_vigente(date) from public, anon, authenticated;

-- Devuelve null si el PIN es correcto o el mensaje de error. No lanza
-- excepción: así el conteo de intentos fallidos sí se guarda.
create or replace function public.fn_verificar_pin_contable(p_pin text)
returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_usuario bigint := public.fn_usuario_id();
  v_reg public.usuarios_pin_contable%rowtype;
begin
  select * into v_reg from public.usuarios_pin_contable where usuario_id = v_usuario for update;
  if not found then
    return 'Primero crea tu PIN contable en Contabilidad → Períodos';
  end if;
  if v_reg.bloqueado_hasta is not null and v_reg.bloqueado_hasta > now() then
    return 'PIN bloqueado por intentos fallidos. Intenta de nuevo a las '
      || to_char(v_reg.bloqueado_hasta at time zone 'America/Guatemala', 'HH24:MI');
  end if;
  if coalesce(p_pin, '') = '' or crypt(p_pin, v_reg.pin_hash) <> v_reg.pin_hash then
    update public.usuarios_pin_contable
      set intentos_fallidos = case when intentos_fallidos + 1 >= 5 then 0 else intentos_fallidos + 1 end,
          bloqueado_hasta = case when intentos_fallidos + 1 >= 5 then now() + interval '15 minutes' end
      where usuario_id = v_usuario;
    return case when v_reg.intentos_fallidos + 1 >= 5
      then 'PIN incorrecto. Se bloqueó 15 minutos por intentos fallidos'
      else 'PIN contable incorrecto (' || (5 - v_reg.intentos_fallidos - 1) || ' intento(s) más antes del bloqueo)' end;
  end if;
  update public.usuarios_pin_contable set intentos_fallidos = 0, bloqueado_hasta = null where usuario_id = v_usuario;
  return null;
end;
$$;

revoke all on function public.fn_verificar_pin_contable(text) from public, anon, authenticated;

-- Paso 1: valida PIN + permiso + motivo. Devuelve {ok, id} o {ok:false, error}.
create or replace function public.fn_autorizar_periodo_cerrado(p_fecha date, p_pin text, p_motivo text, p_accion text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_error text;
  v_id bigint;
begin
  if not public.fn_tiene_permiso('contabilidad', 'autorizar_cierre') then
    return jsonb_build_object('ok', false, 'error', 'Ese mes está cerrado y no tienes permiso para autorizar cambios en meses cerrados');
  end if;
  if p_accion not in ('reabrir_periodo', 'partida_en_periodo_cerrado') then
    return jsonb_build_object('ok', false, 'error', 'Acción no válida');
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Escribe el motivo del cambio en el mes cerrado');
  end if;
  v_error := public.fn_verificar_pin_contable(p_pin);
  if v_error is not null then
    return jsonb_build_object('ok', false, 'error', v_error);
  end if;
  insert into public.autorizaciones_cierre (usuario_id, anio, mes, accion, motivo)
  values (public.fn_usuario_id(), extract(year from p_fecha), extract(month from p_fecha), p_accion, btrim(p_motivo))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

grant execute on function public.fn_autorizar_periodo_cerrado(date, text, text, text) to authenticated;

-- Paso 2 (interno): consume la autorización y la deja activa en la transacción.
create or replace function public.fn_usar_autorizacion_cierre(
  p_autorizacion_id bigint, p_fecha date, p_accion text, p_partida_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_aut public.autorizaciones_cierre%rowtype;
begin
  if p_autorizacion_id is null then
    raise exception 'El mes de % está cerrado: se necesita autorización con PIN contable', to_char(p_fecha, 'MM/YYYY');
  end if;
  select * into v_aut from public.autorizaciones_cierre where id = p_autorizacion_id for update;
  if not found or v_aut.usuario_id <> public.fn_usuario_id() then
    raise exception 'Autorización no válida';
  end if;
  if v_aut.fecha_uso is not null then
    raise exception 'La autorización ya se usó: vuelve a ingresar tu PIN';
  end if;
  if v_aut.fecha < now() - interval '10 minutes' then
    raise exception 'La autorización venció: vuelve a ingresar tu PIN';
  end if;
  if v_aut.accion <> p_accion
     or (v_aut.anio, v_aut.mes) <> (extract(year from p_fecha)::int, extract(month from p_fecha)::int) then
    raise exception 'La autorización no corresponde a esta operación o a este mes';
  end if;
  update public.autorizaciones_cierre set fecha_uso = now(), partida_id = coalesce(p_partida_id, partida_id)
    where id = p_autorizacion_id;
  perform set_config('astro.autorizacion_cierre', p_autorizacion_id::text, true);
end;
$$;

revoke all on function public.fn_usar_autorizacion_cierre(bigint, date, text, bigint) from public, anon, authenticated;

-- Crea o cambia el PIN. Devuelve null si quedó guardado o el mensaje de error.
create or replace function public.fn_establecer_pin_contable(p_pin_actual text, p_pin_nuevo text)
returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_usuario bigint := public.fn_usuario_id();
  v_error text;
begin
  if v_usuario is null or not public.fn_tiene_permiso('contabilidad', 'registrar') then
    return 'No tienes permiso para registrar partidas';
  end if;
  if coalesce(p_pin_nuevo, '') !~ '^[0-9]{6,8}$' then
    return 'El PIN debe tener de 6 a 8 dígitos';
  end if;
  if exists (select 1 from public.usuarios_pin_contable where usuario_id = v_usuario) then
    v_error := public.fn_verificar_pin_contable(p_pin_actual);
    if v_error is not null then
      return v_error;
    end if;
    update public.usuarios_pin_contable
      set pin_hash = crypt(p_pin_nuevo, gen_salt('bf', 10)), intentos_fallidos = 0, bloqueado_hasta = null, fecha_actualizacion = now()
      where usuario_id = v_usuario;
  else
    insert into public.usuarios_pin_contable (usuario_id, pin_hash) values (v_usuario, crypt(p_pin_nuevo, gen_salt('bf', 10)));
  end if;
  return null;
end;
$$;

grant execute on function public.fn_establecer_pin_contable(text, text) to authenticated;

create or replace function public.fn_tengo_pin_contable()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.usuarios_pin_contable where usuario_id = public.fn_usuario_id());
$$;

grant execute on function public.fn_tengo_pin_contable() to authenticated;

-- ------------------------------------------------------------
-- 6. Triggers de partidas y líneas
-- ------------------------------------------------------------
create or replace function public.fn_trg_partidas_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_bloqueo date := public.fn_fecha_bloqueo_contable();
begin
  -- Contabilizada: inmutable salvo marcarla como revertida.
  if tg_op = 'DELETE' then
    if old.estado = 'contabilizada' then
      raise exception 'Una partida contabilizada no se borra: se revierte';
    end if;
    if v_bloqueo is not null and old.fecha <= v_bloqueo and not public.fn_autorizacion_cierre_vigente(old.fecha) then
      raise exception 'El mes de la partida está cerrado';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.estado = 'contabilizada' then
    if (to_jsonb(new) - 'revertida_por_id' - 'fecha_actualizacion') <> (to_jsonb(old) - 'revertida_por_id' - 'fecha_actualizacion')
       or old.revertida_por_id is not null then
      raise exception 'Una partida contabilizada no se edita: se revierte';
    end if;
    return new;  -- marcar como revertida está permitido aunque el mes esté cerrado
  end if;

  new.anio := extract(year from new.fecha)::int;
  if v_bloqueo is not null then
    if new.fecha <= v_bloqueo and not public.fn_autorizacion_cierre_vigente(new.fecha) then
      raise exception 'El mes de % está cerrado: no se pueden registrar ni cambiar partidas con esa fecha', to_char(new.fecha, 'MM/YYYY');
    end if;
    if tg_op = 'UPDATE' and old.fecha <= v_bloqueo and not public.fn_autorizacion_cierre_vigente(old.fecha) then
      raise exception 'El mes original de la partida está cerrado';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.fecha_actualizacion := now();
  end if;
  return new;
end;
$$;

create trigger trg_partidas_reglas before insert or update or delete on public.partidas
  for each row execute function public.fn_trg_partidas_reglas();

create or replace function public.fn_trg_partida_lineas_reglas()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_partida public.partidas%rowtype;
  v_cuenta public.cuentas_contables%rowtype;
  v_bloqueo date := public.fn_fecha_bloqueo_contable();
  v_fila public.partida_lineas%rowtype;
begin
  v_fila := case when tg_op = 'DELETE' then old else new end;
  select * into v_partida from public.partidas where id = v_fila.partida_id;
  -- Borrado en cascada de una partida (borrador) ya validado arriba.
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if v_partida.estado <> 'borrador' then
    raise exception 'Las líneas de una partida contabilizada o anulada no se modifican';
  end if;
  if v_bloqueo is not null and v_partida.fecha <= v_bloqueo and not public.fn_autorizacion_cierre_vigente(v_partida.fecha) then
    raise exception 'El mes de la partida está cerrado';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  select * into v_cuenta from public.cuentas_contables where id = new.cuenta_id;
  if not v_cuenta.es_detalle then
    raise exception 'La cuenta % % es una cuenta madre: solo las cuentas de detalle reciben movimientos', v_cuenta.codigo, v_cuenta.nombre;
  end if;
  if not v_cuenta.activo then
    raise exception 'La cuenta % % está inactiva', v_cuenta.codigo, v_cuenta.nombre;
  end if;
  if v_cuenta.exige_centro_costo and new.centro_costo_id is null then
    raise exception 'La cuenta % % es de %: asigna un centro de costo', v_cuenta.codigo, v_cuenta.nombre, v_cuenta.tipo;
  end if;
  if v_cuenta.tipo in ('activo', 'pasivo', 'patrimonio') and new.centro_costo_id is not null then
    new.centro_costo_id := null;  -- las cuentas de balance no llevan centro de costo
  end if;
  if new.centro_costo_id is not null and not exists (select 1 from public.centros_costo where id = new.centro_costo_id and activo) then
    raise exception 'El centro de costo está inactivo';
  end if;
  return new;
end;
$$;

create trigger trg_partida_lineas_reglas before insert or update or delete on public.partida_lineas
  for each row execute function public.fn_trg_partida_lineas_reglas();

-- Red de seguridad al confirmar la transacción: una partida contabilizada cuadra con sus líneas.
create or replace function public.fn_trg_partidas_cuadre()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_debe numeric;
  v_haber numeric;
begin
  if new.estado <> 'contabilizada' then
    return null;
  end if;
  select coalesce(sum(debe), 0), coalesce(sum(haber), 0) into v_debe, v_haber
    from public.partida_lineas where partida_id = new.id;
  if v_debe <> v_haber or v_debe <> new.total_debe or v_haber <> new.total_haber then
    raise exception 'La partida % no cuadra (Debe Q %, Haber Q %): no se puede guardar', new.id, v_debe, v_haber;
  end if;
  return null;
end;
$$;

create constraint trigger trg_partidas_cuadre after insert or update on public.partidas
  deferrable initially deferred
  for each row execute function public.fn_trg_partidas_cuadre();

-- ------------------------------------------------------------
-- 7. Funciones de la nomenclatura, centros de costo y empresa
-- ------------------------------------------------------------
create or replace function public.fn_guardar_cuenta_contable(
  p_id bigint, p_codigo text, p_nombre text, p_tipo text, p_naturaleza text,
  p_es_detalle boolean, p_activo boolean, p_descripcion text default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_tipo text := p_tipo;
  v_padre public.cuentas_contables%rowtype;
begin
  if not public.fn_tiene_permiso('contabilidad', 'configurar') then
    raise exception 'No tienes permiso para configurar la nomenclatura';
  end if;
  -- Las subcuentas heredan el tipo de su madre.
  if position('.' in p_codigo) > 0 then
    select * into v_padre from public.cuentas_contables where codigo = regexp_replace(btrim(p_codigo), '\.[0-9]+$', '');
    if found then
      v_tipo := v_padre.tipo;
    end if;
  end if;
  if p_id is null then
    insert into public.cuentas_contables (codigo, nombre, tipo, naturaleza, es_detalle, activo, descripcion, nivel)
    values (btrim(p_codigo), btrim(p_nombre), v_tipo,
            coalesce(nullif(p_naturaleza, ''), case when v_tipo in ('activo', 'costo', 'gasto') then 'deudora' else 'acreedora' end),
            coalesce(p_es_detalle, true), coalesce(p_activo, true), nullif(btrim(coalesce(p_descripcion, '')), ''), 1)
    returning id into v_id;
  else
    update public.cuentas_contables
      set codigo = btrim(p_codigo), nombre = btrim(p_nombre), tipo = v_tipo,
          naturaleza = coalesce(nullif(p_naturaleza, ''), naturaleza),
          es_detalle = coalesce(p_es_detalle, es_detalle), activo = coalesce(p_activo, activo),
          descripcion = nullif(btrim(coalesce(p_descripcion, '')), '')
      where id = p_id
      returning id into v_id;
    if v_id is null then
      raise exception 'La cuenta no existe';
    end if;
  end if;
  return v_id;
end;
$$;

grant execute on function public.fn_guardar_cuenta_contable(bigint, text, text, text, text, boolean, boolean, text) to authenticated;

create or replace function public.fn_eliminar_cuenta_contable(p_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('contabilidad', 'configurar') then
    raise exception 'No tienes permiso para configurar la nomenclatura';
  end if;
  if exists (select 1 from public.partida_lineas where cuenta_id = p_id) then
    raise exception 'La cuenta tiene movimientos: desactívala en lugar de eliminarla';
  end if;
  if exists (select 1 from public.cuentas_contables where padre_id = p_id) then
    raise exception 'La cuenta tiene subcuentas: elimínalas primero';
  end if;
  delete from public.cuentas_contables where id = p_id;
end;
$$;

grant execute on function public.fn_eliminar_cuenta_contable(bigint) to authenticated;

create or replace function public.fn_guardar_centro_costo(
  p_id bigint, p_codigo text, p_nombre text, p_tienda_id bigint, p_activo boolean, p_descripcion text default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.fn_tiene_permiso('contabilidad', 'configurar') then
    raise exception 'No tienes permiso para configurar centros de costo';
  end if;
  if p_id is null then
    insert into public.centros_costo (codigo, nombre, tienda_id, activo, descripcion)
    values (upper(btrim(p_codigo)), btrim(p_nombre), p_tienda_id, coalesce(p_activo, true), nullif(btrim(coalesce(p_descripcion, '')), ''))
    returning id into v_id;
  else
    update public.centros_costo
      set codigo = upper(btrim(p_codigo)), nombre = btrim(p_nombre), tienda_id = p_tienda_id,
          activo = coalesce(p_activo, activo), descripcion = nullif(btrim(coalesce(p_descripcion, '')), ''),
          fecha_actualizacion = now()
      where id = p_id
      returning id into v_id;
  end if;
  return v_id;
end;
$$;

grant execute on function public.fn_guardar_centro_costo(bigint, text, text, bigint, boolean, text) to authenticated;

create or replace function public.fn_guardar_empresa_contable(
  p_razon_social text, p_nombre_comercial text, p_nit text, p_direccion text,
  p_regimen_iva text, p_tasa_impuesto numeric, p_fecha_inicio_contable date,
  p_contador_nombre text, p_contador_registro text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('contabilidad', 'configurar') then
    raise exception 'No tienes permiso para configurar los datos contables';
  end if;
  if p_regimen_iva not in ('general', 'pequeno_contribuyente') then
    raise exception 'Régimen no válido';
  end if;
  -- La fecha de corte no se mueve si ya hay partidas automáticas.
  if exists (select 1 from public.empresa_contable e where e.fecha_inicio_contable is distinct from p_fecha_inicio_contable)
     and exists (select 1 from public.partidas where tipo = 'automatica') then
    raise exception 'Ya hay partidas automáticas: la fecha de inicio contable no se puede cambiar';
  end if;
  update public.empresa_contable
    set razon_social = btrim(p_razon_social), nombre_comercial = nullif(btrim(coalesce(p_nombre_comercial, '')), ''),
        nit = upper(btrim(p_nit)), direccion = btrim(p_direccion), regimen_iva = p_regimen_iva,
        tasa_impuesto = p_tasa_impuesto, fecha_inicio_contable = p_fecha_inicio_contable,
        contador_nombre = nullif(btrim(coalesce(p_contador_nombre, '')), ''),
        contador_registro = nullif(btrim(coalesce(p_contador_registro, '')), ''),
        fecha_actualizacion = now()
    where id = 1;
end;
$$;

grant execute on function public.fn_guardar_empresa_contable(text, text, text, text, text, numeric, date, text, text) to authenticated;

-- ------------------------------------------------------------
-- 8. Partidas: guardar, contabilizar, descartar, revertir
-- ------------------------------------------------------------
-- Contabiliza (valida cuadre y asigna correlativo anual). Uso interno.
create or replace function public.fn_ctb_contabilizar_interno(p_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_partida public.partidas%rowtype;
  v_debe numeric;
  v_haber numeric;
  v_lineas int;
  v_numero int;
begin
  select * into v_partida from public.partidas where id = p_id for update;
  if not found then
    raise exception 'La partida no existe';
  end if;
  if v_partida.estado <> 'borrador' then
    raise exception 'La partida ya está %', v_partida.estado;
  end if;
  select count(*), coalesce(sum(debe), 0), coalesce(sum(haber), 0) into v_lineas, v_debe, v_haber
    from public.partida_lineas where partida_id = p_id;
  if v_lineas < 2 then
    raise exception 'La partida necesita al menos dos líneas';
  end if;
  if v_debe <> v_haber then
    raise exception 'La partida no cuadra: Debe Q % y Haber Q % (diferencia Q %). Revisa los montos antes de contabilizar.',
      to_char(v_debe, 'FM999,999,999,990.00'), to_char(v_haber, 'FM999,999,999,990.00'),
      to_char(abs(v_debe - v_haber), 'FM999,999,999,990.00');
  end if;

  insert into public.partidas_correlativos (anio, ultimo) values (v_partida.anio, 1)
  on conflict (anio) do update set ultimo = public.partidas_correlativos.ultimo + 1
  returning ultimo into v_numero;

  update public.partidas
    set estado = 'contabilizada', numero = v_numero, total_debe = v_debe, total_haber = v_haber,
        contabilizado_por = public.fn_usuario_id(), fecha_contabilizacion = now()
    where id = p_id;
end;
$$;

revoke all on function public.fn_ctb_contabilizar_interno(bigint) from public, anon, authenticated;

-- Crea o reemplaza un borrador (manual / ajuste / apertura) y opcionalmente lo contabiliza.
-- p_lineas: [{cuenta_id, centro_costo_id, debe, haber, descripcion}]
create or replace function public.fn_guardar_partida(
  p_id bigint, p_fecha date, p_tipo text, p_descripcion text, p_lineas jsonb,
  p_contabilizar boolean default false, p_autorizacion_id bigint default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint := p_id;
  v_bloqueo date := public.fn_fecha_bloqueo_contable();
  v_linea jsonb;
  v_n smallint := 0;
  v_debe numeric;
  v_haber numeric;
  v_fecha_original date;
  v_fecha_cerrada date;
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para registrar partidas';
  end if;
  if p_tipo not in ('manual', 'ajuste', 'apertura') then
    raise exception 'Tipo de partida no válido';
  end if;
  if p_fecha is null then
    raise exception 'Indica la fecha de la partida';
  end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Agrega al menos una línea';
  end if;
  if v_id is not null then
    select fecha into v_fecha_original from public.partidas where id = v_id and estado = 'borrador';
    if not found then
      raise exception 'Solo se pueden editar partidas en borrador';
    end if;
  end if;
  if v_bloqueo is not null then
    if p_fecha <= v_bloqueo and v_fecha_original <= v_bloqueo
       and date_trunc('month', p_fecha) <> date_trunc('month', v_fecha_original) then
      raise exception 'La partida está en un mes cerrado y la nueva fecha en otro: cámbiala en dos pasos';
    end if;
    v_fecha_cerrada := case when p_fecha <= v_bloqueo then p_fecha
                            when v_fecha_original <= v_bloqueo then v_fecha_original end;
    if v_fecha_cerrada is not null then
      perform public.fn_usar_autorizacion_cierre(p_autorizacion_id, v_fecha_cerrada, 'partida_en_periodo_cerrado', v_id);
    end if;
  end if;

  if v_id is null then
    insert into public.partidas (anio, fecha, tipo, origen, descripcion, creado_por)
    values (extract(year from p_fecha), p_fecha, p_tipo, p_tipo, btrim(p_descripcion), public.fn_usuario_id())
    returning id into v_id;
  else
    delete from public.partida_lineas where partida_id = v_id;
    update public.partidas set fecha = p_fecha, tipo = p_tipo, origen = p_tipo, descripcion = btrim(p_descripcion) where id = v_id;
  end if;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_debe := round(coalesce(nullif(v_linea ->> 'debe', '')::numeric, 0), 2);
    v_haber := round(coalesce(nullif(v_linea ->> 'haber', '')::numeric, 0), 2);
    if v_debe = 0 and v_haber = 0 then
      continue;
    end if;
    if v_debe > 0 and v_haber > 0 then
      raise exception 'Cada línea lleva monto en Debe o en Haber, no en ambos';
    end if;
    v_n := v_n + 1;
    insert into public.partida_lineas (partida_id, linea, cuenta_id, centro_costo_id, debe, haber, descripcion)
    values (v_id, v_n, (v_linea ->> 'cuenta_id')::bigint, nullif(v_linea ->> 'centro_costo_id', '')::bigint,
            v_debe, v_haber, nullif(btrim(coalesce(v_linea ->> 'descripcion', '')), ''));
  end loop;

  update public.partidas
    set total_debe = (select coalesce(sum(debe), 0) from public.partida_lineas where partida_id = v_id),
        total_haber = (select coalesce(sum(haber), 0) from public.partida_lineas where partida_id = v_id)
    where id = v_id;

  if v_fecha_cerrada is not null then
    update public.autorizaciones_cierre set partida_id = v_id
      where id = p_autorizacion_id and partida_id is null;
  end if;
  if p_contabilizar then
    perform public.fn_ctb_contabilizar_interno(v_id);
  end if;
  return v_id;
end;
$$;

grant execute on function public.fn_guardar_partida(bigint, date, text, text, jsonb, boolean, bigint) to authenticated;

create or replace function public.fn_contabilizar_partida(p_id bigint, p_autorizacion_id bigint default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_fecha date;
  v_bloqueo date := public.fn_fecha_bloqueo_contable();
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para contabilizar partidas';
  end if;
  select fecha into v_fecha from public.partidas where id = p_id;
  if not found then
    raise exception 'La partida no existe';
  end if;
  if v_bloqueo is not null and v_fecha <= v_bloqueo then
    perform public.fn_usar_autorizacion_cierre(p_autorizacion_id, v_fecha, 'partida_en_periodo_cerrado', p_id);
  end if;
  perform public.fn_ctb_contabilizar_interno(p_id);
end;
$$;

grant execute on function public.fn_contabilizar_partida(bigint, bigint) to authenticated;

create or replace function public.fn_descartar_borrador_partida(p_id bigint, p_autorizacion_id bigint default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_fecha date;
  v_bloqueo date := public.fn_fecha_bloqueo_contable();
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para descartar partidas';
  end if;
  select fecha into v_fecha from public.partidas where id = p_id and estado = 'borrador';
  if not found then
    raise exception 'Solo se descartan partidas en borrador';
  end if;
  if v_bloqueo is not null and v_fecha <= v_bloqueo then
    perform public.fn_usar_autorizacion_cierre(p_autorizacion_id, v_fecha, 'partida_en_periodo_cerrado', p_id);
  end if;
  delete from public.partidas where id = p_id;
end;
$$;

grant execute on function public.fn_descartar_borrador_partida(bigint, bigint) to authenticated;

-- Reversión: partida espejo (Debe ↔ Haber) y la original queda marcada.
create or replace function public.fn_ctb_revertir_interno(p_id bigint, p_fecha date, p_motivo text)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_original public.partidas%rowtype;
  v_nueva bigint;
begin
  select * into v_original from public.partidas where id = p_id for update;
  if not found or v_original.estado <> 'contabilizada' then
    raise exception 'Solo se revierten partidas contabilizadas';
  end if;
  if v_original.revertida_por_id is not null then
    raise exception 'La partida ya fue revertida';
  end if;
  if v_original.tipo = 'reversion' then
    raise exception 'Una partida de reversión no se revierte: registra una nueva partida';
  end if;

  insert into public.partidas (anio, fecha, tipo, origen, origen_id, descripcion, creado_por, partida_revertida_id)
  values (extract(year from p_fecha), p_fecha, 'reversion', 'reversion', v_original.id,
          'Reversión de la partida ' || v_original.anio || '-' || v_original.numero || ': ' || btrim(p_motivo),
          public.fn_usuario_id(), v_original.id)
  returning id into v_nueva;

  insert into public.partida_lineas (partida_id, linea, cuenta_id, centro_costo_id, debe, haber, descripcion)
  select v_nueva, linea, cuenta_id, centro_costo_id, haber, debe, descripcion
  from public.partida_lineas where partida_id = v_original.id;

  update public.partidas
    set total_debe = v_original.total_haber, total_haber = v_original.total_debe
    where id = v_nueva;
  perform public.fn_ctb_contabilizar_interno(v_nueva);
  update public.partidas set revertida_por_id = v_nueva where id = v_original.id;
  return v_nueva;
end;
$$;

revoke all on function public.fn_ctb_revertir_interno(bigint, date, text) from public, anon, authenticated;

create or replace function public.fn_revertir_partida(p_id bigint, p_fecha date, p_motivo text, p_autorizacion_id bigint default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Guatemala')::date);
  v_bloqueo date := public.fn_fecha_bloqueo_contable();
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para revertir partidas';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo de la reversión';
  end if;
  if v_bloqueo is not null and v_fecha <= v_bloqueo then
    perform public.fn_usar_autorizacion_cierre(p_autorizacion_id, v_fecha, 'partida_en_periodo_cerrado', p_id);
  end if;
  return public.fn_ctb_revertir_interno(p_id, v_fecha, p_motivo);
end;
$$;

grant execute on function public.fn_revertir_partida(bigint, date, text, bigint) to authenticated;

-- ------------------------------------------------------------
-- 9. Cierre y reapertura de mes
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

  insert into public.periodos_contables (anio, mes, estado, cerrado_por, fecha_cierre, notas)
  values (p_anio, p_mes, 'cerrado', public.fn_usuario_id(), now(), nullif(btrim(coalesce(p_notas, '')), ''))
  on conflict (anio, mes) do update
    set estado = 'cerrado', cerrado_por = excluded.cerrado_por, fecha_cierre = now(),
        notas = coalesce(excluded.notas, public.periodos_contables.notas);
end;
$$;

grant execute on function public.fn_cerrar_mes_contable(int, int, text) to authenticated;

create or replace function public.fn_reabrir_mes_contable(p_anio int, p_mes int, p_autorizacion_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_ultimo record;
  v_motivo text;
begin
  if not public.fn_tiene_permiso('contabilidad', 'cerrar_periodo') then
    raise exception 'No tienes permiso para reabrir meses contables';
  end if;
  select anio, mes into v_ultimo from public.periodos_contables
    where estado = 'cerrado' order by anio desc, mes desc limit 1;
  if not found or (v_ultimo.anio, v_ultimo.mes) <> (p_anio, p_mes) then
    raise exception 'Solo se puede reabrir el último mes cerrado';
  end if;
  perform public.fn_usar_autorizacion_cierre(p_autorizacion_id, make_date(p_anio, p_mes, 1), 'reabrir_periodo', null);
  select motivo into v_motivo from public.autorizaciones_cierre where id = p_autorizacion_id;
  update public.periodos_contables
    set estado = 'abierto', reabierto_por = public.fn_usuario_id(), fecha_reapertura = now(),
        notas = concat_ws(' · ', notas, 'Reabierto: ' || v_motivo)
    where anio = p_anio and mes = p_mes;
end;
$$;

grant execute on function public.fn_reabrir_mes_contable(int, int, bigint) to authenticated;

-- ------------------------------------------------------------
-- Verificación
-- ------------------------------------------------------------
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in
     ('empresa_contable', 'cuentas_contables', 'centros_costo', 'periodos_contables', 'partidas', 'partida_lineas',
      'partidas_correlativos', 'usuarios_pin_contable', 'autorizaciones_cierre')) as tablas,
  (select count(*) from public.permisos where modulo = 'contabilidad') as permisos;
