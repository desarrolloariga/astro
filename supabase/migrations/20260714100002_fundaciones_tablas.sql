-- ============================================================
-- ARIGA — Migración 0002: Fundaciones (Módulos A, B, O)
-- Monedas/países, roles y permisos, tiendas, usuarios y jerarquía,
-- parámetros operativos, auditoría y notificaciones.
-- ============================================================

-- ------------------------------------------------------------
-- Catálogos transversales
-- ------------------------------------------------------------
create table public.monedas (
  id bigint generated always as identity primary key,
  codigo text not null unique,          -- ISO 4217: MXN, USD…
  nombre text not null,
  simbolo text not null,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create table public.paises (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  codigo text not null unique,          -- ISO 3166-1 alpha-2: MX…
  moneda_id bigint not null references public.monedas (id),
  configuracion_fiscal jsonb not null default '{}'::jsonb,
  configuracion_pagos jsonb not null default '{}'::jsonb,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

-- ------------------------------------------------------------
-- Roles y permisos
-- ------------------------------------------------------------
create table public.roles (
  id bigint generated always as identity primary key,
  nombre text not null unique
    check (nombre in ('admin','coordinador','supervisor','asesor','embajador','tienda','produccion','contabilidad')),
  descripcion text,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create table public.permisos (
  id bigint generated always as identity primary key,
  modulo text not null,                 -- p. ej. 'ventas', 'inventario', 'academia'
  accion text not null,                 -- p. ej. 'ver', 'crear', 'editar', 'aprobar'
  descripcion text,
  unique (modulo, accion)
);

create table public.roles_permisos (
  id bigint generated always as identity primary key,
  rol_id bigint not null references public.roles (id),
  permiso_id bigint not null references public.permisos (id),
  unique (rol_id, permiso_id)
);

-- ------------------------------------------------------------
-- Tiendas y bodegas (el CEDI es una fila con tipo 'cedi')
-- ------------------------------------------------------------
create table public.tiendas (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  tipo text not null check (tipo in ('cedi','tienda','bodega')),
  direccion text,
  telefono text,
  pais_id bigint references public.paises (id),
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

-- ------------------------------------------------------------
-- Usuarios y jerarquía comercial
-- superior_id encadena: embajador → asesor → supervisor → coordinador
-- ------------------------------------------------------------
create table public.usuarios (
  id bigint generated always as identity primary key,
  auth_uid uuid unique references auth.users (id) on delete set null,
  nombre text not null,
  correo text not null unique,
  telefono text,
  rol_id bigint not null references public.roles (id),
  superior_id bigint references public.usuarios (id),
  tienda_id bigint references public.tiendas (id),
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz,
  check (superior_id is distinct from id)
);

create index idx_usuarios_superior on public.usuarios (superior_id);
create index idx_usuarios_rol on public.usuarios (rol_id);
create index idx_usuarios_tienda on public.usuarios (tienda_id);

-- Excepciones individuales a la matriz rol × permiso
create table public.usuarios_permisos (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references public.usuarios (id),
  permiso_id bigint not null references public.permisos (id),
  concedido boolean not null default true,  -- true: otorga extra; false: revoca del rol
  unique (usuario_id, permiso_id)
);

-- Usuarios asociados a tiendas (para rol 'tienda' y logística)
create table public.usuarios_tiendas (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references public.usuarios (id),
  tienda_id bigint not null references public.tiendas (id),
  unique (usuario_id, tienda_id)
);

-- Historial de cambios de jerarquía (mover personas conservando trazabilidad)
create table public.historial_jerarquia (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references public.usuarios (id),
  superior_id bigint references public.usuarios (id),
  fecha_inicio timestamptz not null default now(),
  fecha_fin timestamptz
);

create index idx_historial_jerarquia_usuario on public.historial_jerarquia (usuario_id);

-- ------------------------------------------------------------
-- Parámetros operativos (todo configurable desde el panel admin)
-- ------------------------------------------------------------
create table public.parametros (
  id bigint generated always as identity primary key,
  clave text not null unique,
  valor text not null,
  tipo_dato text not null default 'texto' check (tipo_dato in ('texto','numero','booleano','json')),
  descripcion text,
  modulo text,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

-- ------------------------------------------------------------
-- Auditoría (bitácora inmutable de acciones críticas)
-- ------------------------------------------------------------
create table public.auditoria (
  id bigint generated always as identity primary key,
  usuario_id bigint references public.usuarios (id),
  tabla text not null,
  registro_id bigint,
  accion text not null check (accion in ('crear','actualizar','eliminar')),
  valor_anterior jsonb,
  valor_nuevo jsonb,
  fecha_creacion timestamptz not null default now()
);

create index idx_auditoria_tabla_registro on public.auditoria (tabla, registro_id);

-- ------------------------------------------------------------
-- Notificaciones in-app
-- ------------------------------------------------------------
create table public.notificaciones (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references public.usuarios (id),
  tipo text not null,                   -- 'separado_por_vencer', 'venta_confirmada', …
  titulo text not null,
  mensaje text not null,
  url_destino text,
  leida boolean not null default false,
  fecha_creacion timestamptz not null default now()
);

create index idx_notificaciones_usuario on public.notificaciones (usuario_id, leida);

-- ------------------------------------------------------------
-- Triggers de fecha_actualizacion
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['monedas','paises','roles','tiendas','usuarios','parametros']
  loop
    execute format(
      'create trigger trg_%s_fecha_actualizacion before update on public.%I
       for each row execute function public.fn_fecha_actualizacion()', t, t);
  end loop;
end $$;

-- ============================================================
-- Funciones helper de identidad (base de todas las políticas RLS)
-- ============================================================

create or replace function public.fn_usuario_id()
returns bigint
language sql stable security definer
set search_path = public
as $$
  select id from public.usuarios where auth_uid = auth.uid() and activo;
$$;

create or replace function public.fn_rol_actual()
returns text
language sql stable security definer
set search_path = public
as $$
  select r.nombre
  from public.usuarios u
  join public.roles r on r.id = u.rol_id
  where u.auth_uid = auth.uid() and u.activo;
$$;

create or replace function public.fn_mi_tienda_id()
returns bigint
language sql stable security definer
set search_path = public
as $$
  select tienda_id from public.usuarios where auth_uid = auth.uid() and activo;
$$;

-- ============================================================
-- Cadena de mando (vista materializada recursiva)
-- Pares (ancestro_id, descendiente_id, nivel) de toda la pirámide.
-- ============================================================
create materialized view public.vw_cadena_mando as
with recursive cadena as (
  select u.superior_id as ancestro_id, u.id as descendiente_id, 1 as nivel
  from public.usuarios u
  where u.superior_id is not null
  union all
  select c.ancestro_id, u.id, c.nivel + 1
  from cadena c
  join public.usuarios u on u.superior_id = c.descendiente_id
)
select ancestro_id, descendiente_id, nivel from cadena;

create unique index idx_cadena_mando_unica
  on public.vw_cadena_mando (ancestro_id, descendiente_id);

create or replace function public.fn_refrescar_cadena_mando()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  refresh materialized view public.vw_cadena_mando;
  return null;
end;
$$;

create trigger trg_usuarios_refrescar_cadena
  after insert or delete or update of superior_id on public.usuarios
  for each statement execute function public.fn_refrescar_cadena_mando();

create or replace function public.fn_es_mi_descendiente(p_usuario_id bigint)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.vw_cadena_mando
    where ancestro_id = public.fn_usuario_id()
      and descendiente_id = p_usuario_id
  );
$$;

-- ============================================================
-- Historial automático de jerarquía
-- ============================================================
create or replace function public.fn_registrar_cambio_jerarquia()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.historial_jerarquia (usuario_id, superior_id)
    values (new.id, new.superior_id);
  elsif tg_op = 'UPDATE' and new.superior_id is distinct from old.superior_id then
    update public.historial_jerarquia
      set fecha_fin = now()
      where usuario_id = new.id and fecha_fin is null;
    insert into public.historial_jerarquia (usuario_id, superior_id)
    values (new.id, new.superior_id);
  end if;
  return new;
end;
$$;

create trigger trg_usuarios_historial_jerarquia
  after insert or update of superior_id on public.usuarios
  for each row execute function public.fn_registrar_cambio_jerarquia();

-- ============================================================
-- Auditoría genérica (adjuntar a tablas sensibles)
-- ============================================================
create or replace function public.fn_auditar()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.auditoria (usuario_id, tabla, registro_id, accion, valor_anterior, valor_nuevo)
  values (
    public.fn_usuario_id(),
    tg_table_name,
    coalesce(new.id, old.id),
    case tg_op when 'INSERT' then 'crear' when 'UPDATE' then 'actualizar' else 'eliminar' end,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

-- Tablas sensibles de esta fase bajo auditoría
create trigger trg_auditar_usuarios
  after insert or update or delete on public.usuarios
  for each row execute function public.fn_auditar();

create trigger trg_auditar_parametros
  after insert or update or delete on public.parametros
  for each row execute function public.fn_auditar();

create trigger trg_auditar_roles_permisos
  after insert or update or delete on public.roles_permisos
  for each row execute function public.fn_auditar();

create trigger trg_auditar_tiendas
  after insert or update or delete on public.tiendas
  for each row execute function public.fn_auditar();

-- ============================================================
-- Alta automática en public.usuarios al crear un usuario de Auth.
-- IMPORTANTE: el proyecto Supabase es COMPARTIDO con otro sistema
-- (esquema public). Solo se dan de alta en ARIGA los usuarios cuyo
-- app_metadata trae app = 'ariga' (lo fija el panel admin al invitar).
-- Los usuarios del otro sistema no generan filas aquí.
-- ============================================================
create or replace function public.fn_alta_usuario_auth()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.raw_app_meta_data ->> 'app' is distinct from 'ariga' then
    return new;
  end if;

  insert into public.usuarios (auth_uid, nombre, correo, rol_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    new.email,
    (select id from public.roles
      where nombre = coalesce(new.raw_app_meta_data ->> 'rol', 'embajador'))
  )
  on conflict (correo) do update set auth_uid = excluded.auth_uid;
  return new;
end;
$$;

create trigger trg_auth_alta_usuario
  after insert on auth.users
  for each row execute function public.fn_alta_usuario_auth();

-- ============================================================
-- Lector de parámetros (uso interno de funciones de negocio)
-- ============================================================
create or replace function public.fn_parametro(p_clave text)
returns text
language sql stable security definer
set search_path = public
as $$
  select valor from public.parametros where clave = p_clave;
$$;
