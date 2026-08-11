-- ============================================================
-- ARIGA — Repara el trigger de alta automática de usuarios.
--
-- Diagnóstico: se creó admin@ariga.com vía la Admin API con
-- app_metadata.app='ariga' correctamente, pero no apareció una
-- fila en public.usuarios — el trigger trg_auth_alta_usuario
-- (o la función que lo respalda) no se disparó. Probablemente se
-- perdió al reescribir las migraciones de ariga.* a public.*.
--
-- Este script es idempotente: recrea la función y el trigger sin
-- importar si ya existían o no. Ejecútalo en el SQL editor.
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

drop trigger if exists trg_auth_alta_usuario on auth.users;

create trigger trg_auth_alta_usuario
  after insert on auth.users
  for each row execute function public.fn_alta_usuario_auth();

-- Verificación: debe listar el trigger recién creado.
select tgname, tgrelid::regclass, tgenabled
  from pg_trigger
  where tgname = 'trg_auth_alta_usuario';
