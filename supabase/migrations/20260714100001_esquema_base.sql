  -- ============================================================
  -- ARIGA — Migración 0001: esquema base y utilidades
  -- Convenciones del proyecto:
  --   * Esquema: public (proyecto Supabase dedicado a ARIGA)
  --   * Tablas y campos en español, snake_case
  --   * PK: id bigint generated always as identity (sin UUID)
  --   * Soft delete: activo boolean
  --   * Timestamps: fecha_creacion / fecha_actualizacion
  -- ============================================================

  -- El esquema `public` ya existe en todo proyecto Supabase; no se crea.

  -- pg_cron para liberaciones automáticas (separados vencidos, carritos expirados).
  -- En Supabase cloud está disponible; en local se habilita igual.
  create extension if not exists pg_cron;

  -- ------------------------------------------------------------
  -- Trigger genérico: mantiene fecha_actualizacion al día
  -- ------------------------------------------------------------
  create or replace function public.fn_fecha_actualizacion()
  returns trigger
  language plpgsql
  as $$
  begin
    new.fecha_actualizacion := now();
    return new;
  end;
  $$;

  comment on function public.fn_fecha_actualizacion() is
    'Trigger BEFORE UPDATE: estampa fecha_actualizacion en cada modificación.';

  -- ------------------------------------------------------------
  -- Permisos base del esquema para los roles de la API de Supabase
  -- (las políticas RLS de cada tabla son las que realmente restringen)
  -- ------------------------------------------------------------
  grant usage on schema public to anon, authenticated, service_role;

  alter default privileges in schema public
    grant select, insert, update, delete on tables to authenticated, service_role;

  alter default privileges in schema public
    grant usage, select on sequences to authenticated, service_role;

  alter default privileges in schema public
    grant execute on functions to authenticated, service_role;

  -- El rol anónimo (cliente final por link) NO recibe privilegios por defecto:
  -- solo se le concede EXECUTE explícito sobre las funciones RPC públicas
  -- (fn_catalogo_por_token, fn_agregar_al_carrito, etc.) cuando se creen.
