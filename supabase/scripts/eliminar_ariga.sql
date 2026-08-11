-- ============================================================
-- ELIMINACIÓN TOTAL DE ARIGA EN ESTE PROYECTO SUPABASE
-- ============================================================
-- Este proyecto es DEDICADO a ARIGA: todos sus objetos viven en
-- el schema `public`. Este script deja el proyecto como recién
-- creado (public vacío), pero CONSERVA las cuentas de auth.users
-- (se decidió no borrar las cuentas de Auth).
--
-- Alcance:
--   1. Jobs de pg_cron propios de ARIGA (ariga_*)
--   2. Trigger de alta automática sobre auth.users (tabla del sistema;
--      solo se elimina el trigger, ninguna fila de auth.users se toca)
--   3. Buckets de Storage ariga-productos / ariga-comprobantes + objetos
--   4. Schema `public` completo (todas las tablas, vistas, funciones,
--      políticas RLS, secuencias) — se recrea vacío con sus grants base
--
-- NO se toca: filas de auth.users (cuentas de Auth conservadas).
--
-- Es IRREVERSIBLE. Ejecuta primero el bloque de verificación (0)
-- y confirma que los conteos son los que esperas antes de correr
-- el resto. Pega esto en el SQL Editor de Supabase.
-- ============================================================


-- ============================================================
-- 0) VERIFICACIÓN PREVIA (solo lectura, corre esto primero)
-- ============================================================

-- Jobs de cron que se van a desprogramar
select jobid, jobname, schedule, command
from cron.job
where jobname like 'ariga_%';

-- Historial de corridas de esos jobs que también se va a borrar
select count(*) as corridas_historial
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname like 'ariga_%');

-- Objetos que se van a borrar en storage
select bucket_id, count(*) as objetos
from storage.objects
where bucket_id in ('ariga-productos', 'ariga-comprobantes')
group by bucket_id;

-- Tablas que existen hoy en el schema public
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;


-- ============================================================
-- A partir de aquí es DESTRUCTIVO. No hay vuelta atrás.
-- ============================================================

-- ============================================================
-- 1) Desprogramar los jobs de pg_cron de ARIGA (y su historial)
-- ============================================================
-- El historial de corridas (cron.job_run_details) no se borra solo
-- al desprogramar el job, así que se limpia primero por jobid.
delete from cron.job_run_details
where jobid in (select jobid from cron.job where jobname like 'ariga_%');

select cron.unschedule(jobid)
from cron.job
where jobname like 'ariga_%';

-- ============================================================
-- 2) Quitar el trigger de alta automática sobre auth.users
--    (tabla del sistema; solo se elimina el trigger, ninguna
--    fila de auth.users se toca)
-- ============================================================
drop trigger if exists trg_auth_alta_usuario on auth.users;

-- ============================================================
-- 3) Borrar objetos y buckets de Storage propios de ARIGA
-- ============================================================
delete from storage.objects
where bucket_id in ('ariga-productos', 'ariga-comprobantes');

delete from storage.buckets
where id in ('ariga-productos', 'ariga-comprobantes');

-- ============================================================
-- 4) Recrear el schema public vacío (borra tablas, vistas,
--    funciones, políticas RLS, secuencias, vistas materializadas)
--    y restaurar sus grants base de Supabase.
-- ============================================================
drop schema if exists public cascade;
create schema public;

grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to postgres;
alter default privileges in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to postgres, anon, authenticated, service_role;


-- ============================================================
-- 5) VERIFICACIÓN POSTERIOR
-- ============================================================
select table_name from information_schema.tables where table_schema = 'public';
-- debe devolver 0 filas

select jobname from cron.job where jobname like 'ariga_%';
-- debe devolver 0 filas

select count(*) from cron.job_run_details where command ilike '%ariga%';
-- debe devolver 0

select id from storage.buckets where id in ('ariga-productos', 'ariga-comprobantes');
-- debe devolver 0 filas
