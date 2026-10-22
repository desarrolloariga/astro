-- ============================================================
-- Prueba de privacidad del ranking (correr en el SQL Editor de Supabase).
--
-- Simula la sesión de un EMBAJADOR y verifica que fn_ranking no devuelve
-- nombre, tienda, rol ni ids de otras personas, y que no puede leer
-- vw_ranking ni los puntos de otros directamente. Todo corre dentro de una
-- transacción que se revierte: no deja cambios.
--
-- Resultado esperado: una fila con "ok = true" en cada prueba. Si alguna
-- falla, la consulta termina con un error que dice cuál.
-- ============================================================
begin;

do $$
declare
  v_auth uuid;
  v_yo bigint;
  v_r jsonb;
  v_fila jsonb;
  v_ajenas int := 0;
begin
  select u.auth_uid, u.id into v_auth, v_yo
  from public.usuarios u join public.roles r on r.id = u.rol_id
  where r.nombre = 'embajador' and u.activo and u.auth_uid is not null
  order by u.id limit 1;
  if v_auth is null then
    raise exception 'No hay embajadores activos para la prueba';
  end if;

  -- Sesión simulada del embajador.
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  for v_r in select public.fn_ranking(null, a) from unnest(array['red', 'tienda', 'rol']) a loop
    if (v_r ->> 'es_admin')::boolean then
      raise exception 'FALLA: el embajador fue tratado como administración';
    end if;
    for v_fila in select * from jsonb_array_elements(v_r -> 'rows') loop
      if not (v_fila ->> 'isMe')::boolean then
        v_ajenas := v_ajenas + 1;
        if v_fila ? 'name' or v_fila ? 'store' or v_fila ? 'role' or v_fila ? 'id' or v_fila ? 'usuario_id' or v_fila ? 'userId' then
          raise exception 'FALLA: una fila ajena trae datos personales: %', v_fila;
        end if;
      elsif not (v_fila ? 'name') then
        raise exception 'FALLA: la fila propia no trae el nombre';
      end if;
    end loop;
    if (v_r::text) ~* ('"(usuario_id|userId)"') then
      raise exception 'FALLA: la respuesta contiene ids de usuario';
    end if;
  end loop;

  -- Acceso directo bloqueado.
  begin
    perform 1 from public.vw_ranking limit 1;
    raise exception 'FALLA: el embajador puede leer vw_ranking';
  exception when insufficient_privilege then
    null;
  end;
  if exists (select 1 from public.puntos where usuario_id <> v_yo
             and usuario_id not in (select descendiente_id from public.vw_cadena_mando where ancestro_id = v_yo)) then
    raise exception 'FALLA: el embajador puede leer puntos de otras personas';
  end if;

  raise notice 'OK: % filas ajenas revisadas sin datos personales; vw_ranking y puntos ajenos bloqueados', v_ajenas;
end $$;

select true as ok;
rollback;
