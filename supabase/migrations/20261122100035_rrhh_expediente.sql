-- ============================================================
-- ASTRO — Recursos humanos (fase 1): expediente del colaborador.
--
--   rrhh_departamentos / rrhh_areas / rrhh_puestos   estructura (puesto con descriptor)
--   colaboradores               expediente: datos personales e información de
--                               ingreso (código COL-0001, enlazable a un usuario
--                               del sistema; los embajadores no son colaboradores)
--   colaborador_salarios        información salarial — ACCESO RESTRINGIDO
--   colaborador_salario_historial  aumentos y modificaciones salariales
--   colaborador_deducciones     deducciones autorizadas (préstamos, anticipos, embargos)
--   rrhh_tipos_documento        lista de cotejo por etapa (inicio, durante, finalización)
--   colaborador_documentos      archivos del expediente (bucket privado astro-rrhh)
--
-- Permisos: rrhh.ver (expediente), rrhh.editar (crear/editar expediente y
-- documentos), rrhh.salarios (ver y editar salarios).
-- ============================================================

insert into public.permisos (modulo, accion, descripcion) values
  ('rrhh', 'ver', 'Ver expedientes de colaboradores'),
  ('rrhh', 'editar', 'Crear y editar expedientes, documentos y catálogos de RRHH'),
  ('rrhh', 'salarios', 'Ver y modificar la información salarial (acceso restringido)')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('admin', 'ver'), ('admin', 'editar'), ('admin', 'salarios'),
  ('contabilidad', 'ver'), ('contabilidad', 'editar'), ('contabilidad', 'salarios'),
  ('coordinador', 'ver')
) as base(rol_nombre, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = 'rrhh' and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

insert into storage.buckets (id, name, public) values ('astro-rrhh', 'astro-rrhh', false)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 1. Estructura organizacional
-- ------------------------------------------------------------
create table public.rrhh_departamentos (
  id bigint generated always as identity primary key,
  nombre text not null unique check (btrim(nombre) <> ''),
  activo boolean not null default true
);

create table public.rrhh_areas (
  id bigint generated always as identity primary key,
  departamento_id bigint not null references public.rrhh_departamentos (id),
  nombre text not null check (btrim(nombre) <> ''),
  activo boolean not null default true,
  unique (departamento_id, nombre)
);

create table public.rrhh_puestos (
  id bigint generated always as identity primary key,
  nombre text not null unique check (btrim(nombre) <> ''),
  area_id bigint references public.rrhh_areas (id),
  descriptor text,
  descriptor_url text,
  salario_minimo numeric(12,2),
  salario_maximo numeric(12,2),
  activo boolean not null default true
);

insert into public.rrhh_departamentos (nombre) values
  ('Administración'), ('Ventas'), ('Producción'), ('Logística'), ('Mercadeo'), ('Contabilidad y finanzas')
on conflict (nombre) do nothing;

-- ------------------------------------------------------------
-- 2. Expediente
-- ------------------------------------------------------------

create table public.colaboradores (
  id bigint generated always as identity primary key,
  codigo text not null unique,
  usuario_id bigint unique references public.usuarios (id),
  foto_url text,
  -- Datos personales
  nombres text not null check (btrim(nombres) <> ''),
  apellidos text not null check (btrim(apellidos) <> ''),
  dpi text unique check (dpi is null or dpi ~ '^[0-9]{13}$'),
  dpi_lugar_emision text,
  nit text,
  fecha_nacimiento date,
  genero text check (genero in ('masculino', 'femenino', 'otro')),
  estado_civil text check (estado_civil in ('soltero', 'casado', 'unido', 'divorciado', 'viudo')),
  hijos int check (hijos >= 0),
  nacionalidad text default 'Guatemalteca',
  direccion text,
  departamento_geo text,
  municipio text,
  telefono text,
  licencia_tipo text check (licencia_tipo in ('A', 'B', 'C', 'M', 'E')),
  licencia_numero text,
  licencia_vence date,
  correo_personal text,
  titulo_estudios text,
  emergencia_nombre text,
  emergencia_telefono text,
  emergencia_parentesco text,
  afiliacion_igss text,
  -- Información de ingreso
  fecha_ingreso date,
  departamento_id bigint references public.rrhh_departamentos (id),
  area_id bigint references public.rrhh_areas (id),
  puesto_id bigint references public.rrhh_puestos (id),
  jefe_id bigint references public.colaboradores (id),
  tienda_id bigint references public.tiendas (id),
  area_trabajo text,
  tipo_contrato text check (tipo_contrato in ('indefinido', 'plazo_fijo', 'por_obra', 'servicios')),
  jornada text check (jornada in ('diurna', 'mixta', 'nocturna')),
  horario text,
  modalidad text check (modalidad in ('presencial', 'remoto', 'hibrido')),
  estado text not null default 'activo' check (estado in ('activo', 'periodo_prueba', 'suspendido', 'baja')),
  fin_periodo_prueba date,
  tipo_planilla text not null default 'contrato' check (tipo_planilla in ('contrato', 'servicios')),
  centro_costo_id bigint references public.centros_costo (id),
  fecha_baja date,
  notas text,
  creado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz,
  check (jefe_id is null or jefe_id <> id)
);
create index idx_colaboradores_estado on public.colaboradores (estado);
create index idx_colaboradores_nombre on public.colaboradores (lower(apellidos), lower(nombres));

-- Código automático y fecha de actualización.
create or replace function public.fn_trg_colaborador()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Correlativo sin huecos: un alta rechazada no consume número.
  if tg_op = 'INSERT' and coalesce(new.codigo, '') = '' then
    perform pg_advisory_xact_lock(hashtext('colaboradores_codigo'));
    select 'COL-' || lpad((coalesce(max(substr(codigo, 5)::int), 0) + 1)::text, 4, '0') into new.codigo
      from public.colaboradores where codigo ~ '^COL-[0-9]+$';
  end if;
  if tg_op = 'UPDATE' then
    new.codigo := old.codigo;  -- el código no cambia
    new.fecha_actualizacion := now();
  end if;
  new.nombres := btrim(new.nombres);
  new.apellidos := btrim(new.apellidos);
  new.nit := nullif(upper(regexp_replace(coalesce(new.nit, ''), '[\s-]', '', 'g')), '');
  return new;
end;
$$;

create trigger trg_colaborador before insert or update on public.colaboradores
  for each row execute function public.fn_trg_colaborador();

-- ------------------------------------------------------------
-- 3. Información salarial (restringida)
-- ------------------------------------------------------------
create table public.colaborador_salarios (
  colaborador_id bigint primary key references public.colaboradores (id) on delete cascade,
  salario_base numeric(12,2) not null default 0 check (salario_base >= 0),
  tipo_salario text not null default 'mensual' check (tipo_salario in ('mensual', 'por_hora', 'por_dia', 'por_servicio')),
  bonificacion_incentiva numeric(12,2) not null default 250 check (bonificacion_incentiva >= 0),
  otras_bonificaciones numeric(12,2) not null default 0 check (otras_bonificaciones >= 0),
  otras_bonificaciones_detalle text,
  comisiones boolean not null default false,
  horas_extra boolean not null default true,
  forma_pago text not null default 'transferencia' check (forma_pago in ('transferencia', 'cheque', 'efectivo')),
  banco text,
  tipo_cuenta text check (tipo_cuenta in ('monetaria', 'ahorro')),
  numero_cuenta text,
  aplica_igss boolean not null default true,
  aplica_isr boolean not null default true,
  fecha_actualizacion timestamptz not null default now()
);

create table public.colaborador_salario_historial (
  id bigint generated always as identity primary key,
  colaborador_id bigint not null references public.colaboradores (id) on delete cascade,
  fecha_efectiva date not null,
  tipo text not null check (tipo in ('alta', 'aumento', 'disminucion', 'modificacion')),
  salario_anterior numeric(12,2),
  salario_nuevo numeric(12,2) not null,
  bonificacion_anterior numeric(12,2),
  bonificacion_nueva numeric(12,2),
  motivo text,
  autorizado_por text,
  registrado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now()
);
create index idx_salario_historial on public.colaborador_salario_historial (colaborador_id, fecha_efectiva desc);

create table public.colaborador_deducciones (
  id bigint generated always as identity primary key,
  colaborador_id bigint not null references public.colaboradores (id) on delete cascade,
  tipo text not null check (tipo in ('prestamo', 'anticipo', 'embargo', 'cuota', 'otro')),
  descripcion text not null check (btrim(descripcion) <> ''),
  monto_total numeric(12,2) check (monto_total > 0),
  cuota numeric(12,2) not null check (cuota > 0),
  saldo numeric(12,2) check (saldo >= 0),
  fecha_inicio date not null default current_date,
  activa boolean not null default true,
  registrado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4. Documentos
-- ------------------------------------------------------------
create table public.rrhh_tipos_documento (
  id bigint generated always as identity primary key,
  etapa text not null check (etapa in ('inicio', 'durante', 'finalizacion')),
  nombre text not null,
  obligatorio boolean not null default true,
  orden int not null default 0,
  activo boolean not null default true,
  unique (etapa, nombre)
);

insert into public.rrhh_tipos_documento (etapa, nombre, obligatorio, orden) values
  ('inicio', 'DPI', true, 1),
  ('inicio', 'NIT', true, 2),
  ('inicio', 'Carné o constancia de IGSS', true, 3),
  ('inicio', 'Carné de IRTRA', false, 4),
  ('inicio', 'Antecedentes penales', true, 5),
  ('inicio', 'Antecedentes policiacos', true, 6),
  ('durante', 'Formulario de solicitud de empleo', true, 1),
  ('durante', 'Descriptor de puesto', true, 2),
  ('durante', 'Contrato laboral', true, 3),
  ('durante', 'Constancia de entrega de contrato laboral', true, 4),
  ('durante', 'Contrato de confidencialidad', true, 5),
  ('durante', 'Contrato por servicios', false, 6),
  ('durante', 'Contrato de responsiva', false, 7),
  ('durante', 'Memo de inventario', false, 8),
  ('durante', 'Constancia de entrega del Reglamento Interior de Trabajo (RIT)', true, 9),
  ('finalizacion', 'Carta de renuncia, despido o mutuo acuerdo', true, 1),
  ('finalizacion', 'Finiquito de la relación laboral', true, 2),
  ('finalizacion', 'Copia de cheques', false, 3),
  ('finalizacion', 'Pagos adicionales', false, 4)
on conflict (etapa, nombre) do nothing;

create table public.colaborador_documentos (
  id bigint generated always as identity primary key,
  colaborador_id bigint not null references public.colaboradores (id) on delete cascade,
  tipo_documento_id bigint references public.rrhh_tipos_documento (id),
  etapa text not null check (etapa in ('inicio', 'durante', 'finalizacion')),
  nombre text not null,
  archivo_url text not null,
  fecha_documento date,
  fecha_vencimiento date,
  notas text,
  subido_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now()
);
create index idx_colaborador_documentos on public.colaborador_documentos (colaborador_id, etapa);

-- Auditoría
create trigger trg_auditar_colaboradores after insert or update or delete on public.colaboradores
  for each row execute function public.fn_auditar();
create trigger trg_auditar_colaborador_salario_historial after insert or update or delete on public.colaborador_salario_historial
  for each row execute function public.fn_auditar();
create trigger trg_auditar_colaborador_deducciones after insert or update or delete on public.colaborador_deducciones
  for each row execute function public.fn_auditar();
create trigger trg_auditar_colaborador_documentos after insert or update or delete on public.colaborador_documentos
  for each row execute function public.fn_auditar();

-- ------------------------------------------------------------
-- 5. RLS
-- ------------------------------------------------------------
do $$
declare t text;
begin
  -- Catálogos y expediente: leer con rrhh.ver; escribir con rrhh.editar.
  foreach t in array array['rrhh_departamentos', 'rrhh_areas', 'rrhh_puestos', 'rrhh_tipos_documento', 'colaboradores', 'colaborador_documentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy sel_%1$s on public.%1$I for select to authenticated using ((select public.fn_tiene_permiso(''rrhh'', ''ver'')))', t);
    execute format('create policy ins_%1$s on public.%1$I for insert to authenticated with check ((select public.fn_tiene_permiso(''rrhh'', ''editar'')))', t);
    execute format('create policy upd_%1$s on public.%1$I for update to authenticated using ((select public.fn_tiene_permiso(''rrhh'', ''editar''))) with check ((select public.fn_tiene_permiso(''rrhh'', ''editar'')))', t);
    execute format('create policy del_%1$s on public.%1$I for delete to authenticated using ((select public.fn_tiene_permiso(''rrhh'', ''editar'')))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
  -- Salarios: solo rrhh.salarios (lectura); escritura por funciones.
  foreach t in array array['colaborador_salarios', 'colaborador_salario_historial', 'colaborador_deducciones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy sel_%1$s on public.%1$I for select to authenticated using ((select public.fn_tiene_permiso(''rrhh'', ''salarios'')))', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- El colaborador que también es usuario ve su propio expediente.
create policy sel_colaboradores_propio on public.colaboradores for select to authenticated
  using (usuario_id = (select public.fn_usuario_id()));

-- ------------------------------------------------------------
-- 6. Funciones de salario
-- ------------------------------------------------------------
-- Guarda la información salarial y registra el historial cuando cambia salario o bonificación.
-- p_datos: {salario_base, tipo_salario, bonificacion_incentiva, otras_bonificaciones, otras_bonificaciones_detalle,
--           comisiones, horas_extra, forma_pago, banco, tipo_cuenta, numero_cuenta, aplica_igss, aplica_isr}
create or replace function public.fn_rrhh_guardar_salario(p_colaborador_id bigint, p_datos jsonb, p_fecha_efectiva date default null,
  p_motivo text default null, p_autorizado_por text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_ant public.colaborador_salarios%rowtype;
  v_salario numeric := round(coalesce(nullif(p_datos ->> 'salario_base', '')::numeric, 0), 2);
  v_bono numeric := round(coalesce(nullif(p_datos ->> 'bonificacion_incentiva', '')::numeric, 250), 2);
  v_hay boolean;
begin
  if not public.fn_tiene_permiso('rrhh', 'salarios') then
    raise exception 'No tienes permiso para modificar salarios';
  end if;
  if not exists (select 1 from public.colaboradores where id = p_colaborador_id) then
    raise exception 'El colaborador no existe';
  end if;
  select * into v_ant from public.colaborador_salarios where colaborador_id = p_colaborador_id for update;
  v_hay := found;
  if v_hay and (v_ant.salario_base <> v_salario or v_ant.bonificacion_incentiva <> v_bono) and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Indica el motivo del cambio salarial';
  end if;

  insert into public.colaborador_salarios (colaborador_id, salario_base, tipo_salario, bonificacion_incentiva, otras_bonificaciones,
    otras_bonificaciones_detalle, comisiones, horas_extra, forma_pago, banco, tipo_cuenta, numero_cuenta, aplica_igss, aplica_isr, fecha_actualizacion)
  values (p_colaborador_id, v_salario, coalesce(nullif(p_datos ->> 'tipo_salario', ''), 'mensual'), v_bono,
    round(coalesce(nullif(p_datos ->> 'otras_bonificaciones', '')::numeric, 0), 2), nullif(btrim(coalesce(p_datos ->> 'otras_bonificaciones_detalle', '')), ''),
    coalesce((p_datos ->> 'comisiones')::boolean, false), coalesce((p_datos ->> 'horas_extra')::boolean, true),
    coalesce(nullif(p_datos ->> 'forma_pago', ''), 'transferencia'), nullif(btrim(coalesce(p_datos ->> 'banco', '')), ''),
    nullif(p_datos ->> 'tipo_cuenta', ''), nullif(btrim(coalesce(p_datos ->> 'numero_cuenta', '')), ''),
    coalesce((p_datos ->> 'aplica_igss')::boolean, true), coalesce((p_datos ->> 'aplica_isr')::boolean, true), now())
  on conflict (colaborador_id) do update set
    salario_base = excluded.salario_base, tipo_salario = excluded.tipo_salario, bonificacion_incentiva = excluded.bonificacion_incentiva,
    otras_bonificaciones = excluded.otras_bonificaciones, otras_bonificaciones_detalle = excluded.otras_bonificaciones_detalle,
    comisiones = excluded.comisiones, horas_extra = excluded.horas_extra, forma_pago = excluded.forma_pago, banco = excluded.banco,
    tipo_cuenta = excluded.tipo_cuenta, numero_cuenta = excluded.numero_cuenta, aplica_igss = excluded.aplica_igss,
    aplica_isr = excluded.aplica_isr, fecha_actualizacion = now();

  if not v_hay or v_ant.salario_base <> v_salario or v_ant.bonificacion_incentiva <> v_bono then
    insert into public.colaborador_salario_historial (colaborador_id, fecha_efectiva, tipo, salario_anterior, salario_nuevo,
      bonificacion_anterior, bonificacion_nueva, motivo, autorizado_por, registrado_por)
    values (p_colaborador_id,
      coalesce(p_fecha_efectiva, (select fecha_ingreso from public.colaboradores where id = p_colaborador_id), public.fn_ctb_hoy()),
      case when not v_hay then 'alta' when v_salario > v_ant.salario_base then 'aumento'
           when v_salario < v_ant.salario_base then 'disminucion' else 'modificacion' end,
      v_ant.salario_base, v_salario, v_ant.bonificacion_incentiva, v_bono,
      coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), case when not v_hay then 'Salario inicial' end),
      nullif(btrim(coalesce(p_autorizado_por, '')), ''), public.fn_usuario_id());
  end if;
end;
$$;

grant execute on function public.fn_rrhh_guardar_salario(bigint, jsonb, date, text, text) to authenticated;

create or replace function public.fn_rrhh_guardar_deduccion(p_id bigint, p_colaborador_id bigint, p_tipo text, p_descripcion text,
  p_monto_total numeric, p_cuota numeric, p_fecha_inicio date, p_activa boolean default true)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.fn_tiene_permiso('rrhh', 'salarios') then
    raise exception 'No tienes permiso para registrar deducciones';
  end if;
  if coalesce(p_cuota, 0) <= 0 then
    raise exception 'La cuota debe ser mayor a 0';
  end if;
  if p_id is null then
    insert into public.colaborador_deducciones (colaborador_id, tipo, descripcion, monto_total, cuota, saldo, fecha_inicio, activa, registrado_por)
    values (p_colaborador_id, p_tipo, btrim(p_descripcion), nullif(p_monto_total, 0), p_cuota, nullif(p_monto_total, 0),
            coalesce(p_fecha_inicio, public.fn_ctb_hoy()), coalesce(p_activa, true), public.fn_usuario_id())
    returning id into v_id;
  else
    update public.colaborador_deducciones
      set tipo = p_tipo, descripcion = btrim(p_descripcion), cuota = p_cuota, activa = coalesce(p_activa, activa),
          fecha_inicio = coalesce(p_fecha_inicio, fecha_inicio)
      where id = p_id and colaborador_id = p_colaborador_id
      returning id into v_id;
  end if;
  return v_id;
end;
$$;

grant execute on function public.fn_rrhh_guardar_deduccion(bigint, bigint, text, text, numeric, numeric, date, boolean) to authenticated;

-- Verificación
select
  (select count(*) from public.permisos where modulo = 'rrhh') as permisos,
  (select count(*) from public.rrhh_tipos_documento) as tipos_documento,
  (select count(*) from storage.buckets where id = 'astro-rrhh') as bucket;
