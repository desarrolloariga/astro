-- ============================================================
-- ARIGA — Migración 0012: Motor de puntos, ranking, descuentos
-- por desempeño y fidelización (Módulos J, K)
-- ============================================================

-- ------------------------------------------------------------
-- Períodos (ciclo de ranking/puntos; mensual por defecto, con
-- soporte para campañas especiales)
-- ------------------------------------------------------------
create table public.periodos (
  id bigint generated always as identity primary key,
  nombre text not null,
  tipo text not null default 'mensual' check (tipo in ('mensual','campana')),
  fecha_inicio timestamptz not null,
  fecha_fin timestamptz not null,
  estado text not null default 'abierto' check (estado in ('abierto','cerrado')),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz,
  unique (tipo, fecha_inicio),
  check (fecha_fin > fecha_inicio)
);

-- ------------------------------------------------------------
-- Reglas de puntaje (100% parametrizables desde el panel admin)
-- ------------------------------------------------------------
create table public.reglas_puntaje (
  id bigint generated always as identity primary key,
  nombre text not null,
  tipo text not null check (tipo in
    ('por_venta_fija','por_monto','por_categoria','por_margen',
     'primera_venta_mes','cliente_nuevo','curso_completado')),
  condiciones jsonb not null default '{}'::jsonb,
  valor numeric not null,
  multiplicador numeric not null default 1,
  vigencia_inicio timestamptz,
  vigencia_fin timestamptz,
  activo boolean not null default true,
  version int not null default 1,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

-- Versiona automáticamente la regla cuando cambia su lógica, para que
-- los puntos ya otorgados (que guardan regla_version) queden trazables
-- a la definición vigente en su momento.
create or replace function public.fn_versionar_regla_puntaje()
returns trigger
language plpgsql
as $$
begin
  if new.tipo is distinct from old.tipo
     or new.valor is distinct from old.valor
     or new.multiplicador is distinct from old.multiplicador
     or new.condiciones is distinct from old.condiciones then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create trigger trg_reglas_puntaje_version
  before update on public.reglas_puntaje
  for each row execute function public.fn_versionar_regla_puntaje();

-- ------------------------------------------------------------
-- Puntos otorgados — ledger inmutable (nunca se actualiza ni
-- se borra; solo se insertan filas nuevas)
-- ------------------------------------------------------------
create table public.puntos (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references public.usuarios (id),
  venta_id bigint references public.ventas (id),
  regla_id bigint not null references public.reglas_puntaje (id),
  regla_version int not null,
  periodo_id bigint not null references public.periodos (id),
  cantidad numeric not null,
  motivo text,
  fecha_creacion timestamptz not null default now()
);

create index idx_puntos_usuario_periodo on public.puntos (usuario_id, periodo_id);
create index idx_puntos_venta on public.puntos (venta_id);

-- ------------------------------------------------------------
-- Topes de venta y escalas de descuento por desempeño
-- ------------------------------------------------------------
create table public.topes_venta (
  id bigint generated always as identity primary key,
  ambito text not null check (ambito in ('global','rol','individual')),
  rol_id bigint references public.roles (id),
  usuario_id bigint references public.usuarios (id),
  monto_tope numeric not null,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz,
  check (
    (ambito = 'global' and rol_id is null and usuario_id is null) or
    (ambito = 'rol' and rol_id is not null and usuario_id is null) or
    (ambito = 'individual' and usuario_id is not null)
  )
);

create table public.escalas_descuento (
  id bigint generated always as identity primary key,
  tope_id bigint not null references public.topes_venta (id),
  desde_monto numeric not null default 0,
  porcentaje_descuento numeric not null check (porcentaje_descuento between 0 and 100),
  fecha_creacion timestamptz not null default now(),
  unique (tope_id, desde_monto)
);

-- ------------------------------------------------------------
-- Premios por posición de ranking (definidos y publicados desde
-- el panel admin)
-- ------------------------------------------------------------
create table public.premios (
  id bigint generated always as identity primary key,
  periodo_id bigint references public.periodos (id),
  posicion_desde int not null,
  posicion_hasta int not null,
  descripcion text not null,
  imagen text,
  fecha_creacion timestamptz not null default now(),
  check (posicion_hasta >= posicion_desde)
);

-- ------------------------------------------------------------
-- Fidelización: niveles, insignias y reconocimientos
-- ------------------------------------------------------------
create table public.niveles (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  umbral_puntos numeric not null,
  beneficios jsonb not null default '{}'::jsonb,
  orden int not null default 0,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create table public.usuario_niveles (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references public.usuarios (id),
  nivel_id bigint not null references public.niveles (id),
  periodo_id bigint not null references public.periodos (id),
  fecha_obtencion timestamptz not null default now(),
  unique (usuario_id, periodo_id)
);

create table public.insignias (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  descripcion text,
  criterio jsonb not null default '{}'::jsonb,
  icono_url text,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create table public.usuario_insignias (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references public.usuarios (id),
  insignia_id bigint not null references public.insignias (id),
  fecha timestamptz not null default now(),
  unique (usuario_id, insignia_id)
);

create table public.reconocimientos (
  id bigint generated always as identity primary key,
  periodo_id bigint references public.periodos (id),
  usuario_id bigint not null references public.usuarios (id),
  titulo text not null,
  descripcion text,
  publicado boolean not null default false,
  fecha_creacion timestamptz not null default now()
);

-- Triggers de fecha_actualizacion
do $$
declare t text;
begin
  foreach t in array array['periodos','reglas_puntaje','topes_venta','niveles','insignias']
  loop
    execute format(
      'create trigger trg_%s_fecha_actualizacion before update on public.%I
       for each row execute function public.fn_fecha_actualizacion()', t, t);
  end loop;
end $$;

create trigger trg_auditar_reglas_puntaje
  after insert or update or delete on public.reglas_puntaje
  for each row execute function public.fn_auditar();

create trigger trg_auditar_topes_venta
  after insert or update or delete on public.topes_venta
  for each row execute function public.fn_auditar();
