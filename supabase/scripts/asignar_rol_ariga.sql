-- ============================================================
-- ARIGA — Asignar acceso a un usuario de Auth ya existente
-- (solo actúa sobre auth.users y da de alta en public.usuarios
-- al usuario indicado)
--
-- Uso: cambiar v_correo y v_rol abajo y ejecutar en el SQL editor.
-- Idempotente: se puede volver a correr sin duplicar nada.
-- ============================================================

do $$
declare
  v_correo text := 'admin@ariga.com';
  v_rol    text := 'admin';   -- admin | coordinador | supervisor | asesor
                              -- | embajador | tienda | produccion | contabilidad
  v_auth_uid uuid;
  v_rol_id   bigint;
begin
  select id into v_auth_uid from auth.users where email = v_correo;
  if v_auth_uid is null then
    raise exception 'No existe un usuario de Auth con correo %', v_correo;
  end if;

  select id into v_rol_id from public.roles where nombre = v_rol;
  if v_rol_id is null then
    raise exception 'Rol % no existe en public.roles', v_rol;
  end if;

  -- 1) Marca al usuario como perteneciente a ARIGA (el trigger de alta
  --    automática solo actúa para nuevos registros; aquí lo dejamos
  --    coherente para futuras referencias / re-logins).
  update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('app', 'ariga', 'rol', v_rol)
    where id = v_auth_uid;

  -- 2) Alta/actualización directa en public.usuarios (mismo efecto que
  --    tendría el trigger si el usuario se hubiera creado después).
  insert into public.usuarios (auth_uid, nombre, correo, rol_id)
  values (v_auth_uid, split_part(v_correo, '@', 1), v_correo, v_rol_id)
  on conflict (correo) do update
    set auth_uid = excluded.auth_uid,
        rol_id   = excluded.rol_id,
        activo   = true;

  raise notice 'Usuario % vinculado a ARIGA con rol %', v_correo, v_rol;
end $$;
