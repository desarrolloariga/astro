-- ============================================================
-- ARIGA — Migración 0015: Metas y sistema de comisiones (Módulo L)
-- Conceptualmente separado del motor de puntos: los puntos motivan
-- y rankean, las comisiones pagan.
-- ============================================================

-- ------------------------------------------------------------
-- Metas de venta por vendedor o por tienda, por período (base
-- para el bono de cumplimiento de meta y para los semáforos del
-- módulo financiero de una fase posterior)
-- ------------------------------------------------------------
create table public.metas (
  id bigint generated always as identity primary key,
  ambito text not null check (ambito in ('vendedor','tienda')),
  usuario_id bigint references public.usuarios (id),
  tienda_id bigint references public.tiendas (id),
  periodo_id bigint not null references public.periodos (id),
  monto_meta numeric not null,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz,
  check (
    (ambito = 'vendedor' and usuario_id is not null and tienda_id is null) or
    (ambito = 'tienda' and tienda_id is not null and usuario_id is null)
  )
);

create unique index idx_metas_vendedor_periodo
  on public.metas (usuario_id, periodo_id) where ambito = 'vendedor';
create unique index idx_metas_tienda_periodo
  on public.metas (tienda_id, periodo_id) where ambito = 'tienda';

-- ------------------------------------------------------------
-- Reglas de comisión (100% parametrizables desde el panel admin)
--   por_venta:    % y/o monto fijo sobre el total de la venta
--                 (condiciones puede acotar a una categoría:
--                 {"categoria_id": N})
--   liderazgo:    supervisores/asesores ganan % sobre las ventas
--                 de su red (rol_id indica qué rol de la cadena
--                 de mando recibe la comisión)
--   meta:         bono al cumplir la meta del período
--   crecimiento:  bono por crecer vs. el período anterior
--                 (condiciones: {"umbral_crecimiento": 10} en %)
--   capacitacion / fidelizacion: reservados para fases posteriores
--                 (Academia y CRM), ya soportados por el esquema.
-- ------------------------------------------------------------
create table public.reglas_comision (
  id bigint generated always as identity primary key,
  nombre text not null,
  tipo text not null check (tipo in
    ('por_venta','meta','crecimiento','liderazgo','capacitacion','fidelizacion')),
  rol_id bigint references public.roles (id),
  porcentaje numeric,
  monto_fijo numeric,
  condiciones jsonb not null default '{}'::jsonb,
  vigencia_inicio timestamptz,
  vigencia_fin timestamptz,
  activo boolean not null default true,
  version int not null default 1,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz,
  check (porcentaje is not null or monto_fijo is not null)
);

create or replace function public.fn_versionar_regla_comision()
returns trigger
language plpgsql
as $$
begin
  if new.tipo is distinct from old.tipo
     or new.rol_id is distinct from old.rol_id
     or new.porcentaje is distinct from old.porcentaje
     or new.monto_fijo is distinct from old.monto_fijo
     or new.condiciones is distinct from old.condiciones then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create trigger trg_reglas_comision_version
  before update on public.reglas_comision
  for each row execute function public.fn_versionar_regla_comision();

-- ------------------------------------------------------------
-- Comisiones otorgadas (ledger; el monto no se edita — el estado
-- avanza calculada → aprobada → pagada vía funciones dedicadas)
-- ------------------------------------------------------------
create table public.comisiones (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references public.usuarios (id),
  venta_id bigint references public.ventas (id),
  regla_id bigint not null references public.reglas_comision (id),
  regla_version int not null,
  periodo_id bigint not null references public.periodos (id),
  monto numeric not null,
  estado text not null default 'calculada' check (estado in ('calculada','aprobada','pagada')),
  motivo text,
  fecha_creacion timestamptz not null default now()
);

create index idx_comisiones_usuario_periodo on public.comisiones (usuario_id, periodo_id);
create index idx_comisiones_venta on public.comisiones (venta_id);

-- ------------------------------------------------------------
-- Liquidaciones: consolidado de comisiones por persona y período,
-- generado al cerrar el período (fn_cerrar_periodo)
-- ------------------------------------------------------------
create table public.liquidaciones (
  id bigint generated always as identity primary key,
  periodo_id bigint not null references public.periodos (id),
  usuario_id bigint not null references public.usuarios (id),
  total numeric not null default 0,
  estado text not null default 'calculada' check (estado in ('calculada','aprobada','pagada')),
  fecha_aprobacion timestamptz,
  aprobado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz,
  unique (periodo_id, usuario_id)
);

do $$
declare t text;
begin
  foreach t in array array['metas','reglas_comision','liquidaciones']
  loop
    execute format(
      'create trigger trg_%s_fecha_actualizacion before update on public.%I
       for each row execute function public.fn_fecha_actualizacion()', t, t);
  end loop;
end $$;

create trigger trg_auditar_reglas_comision
  after insert or update or delete on public.reglas_comision
  for each row execute function public.fn_auditar();

create trigger trg_auditar_liquidaciones
  after insert or update or delete on public.liquidaciones
  for each row execute function public.fn_auditar();
