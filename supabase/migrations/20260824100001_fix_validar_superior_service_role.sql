-- ============================================================
-- Fix: fn_validar_superior_jerarquia() no reconocía al service_role.
--
-- Diagnóstico (2026-08-25): crearUsuario/crearEmbajador escriben
-- usuarios.superior_id con el cliente admin (service_role key) porque
-- necesitan saltar RLS (un asesor no tiene permiso de escritura
-- directa; y de todos modos la app ya validó el permiso antes de
-- llegar aquí). Pero fn_rol_actual() depende de auth.uid(), que es
-- null bajo el service_role — así que el bypass "admin puede saltarse
-- esta parte" nunca se activaba en ese camino, y la validación de
-- jerarquía rechazaba asignaciones legítimas (ej. un admin creando un
-- embajador que le reporta directo a él) — el error quedaba
-- silenciosamente absorbido por el código viejo (update sin chequear
-- errorUpdate), o expuesto como error real tras el fix de la acción
-- del servidor.
--
-- Mismo cuerpo que 20260810100002_jerarquia_estricta_red.sql, solo se
-- amplía la condición de bypass.
-- ============================================================

create or replace function public.fn_validar_superior_jerarquia()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_cursor bigint;
  v_rol_nuevo text;
  v_rol_superior text;
  v_tiene_regla boolean;
begin
  if new.superior_id is null then
    return new;
  end if;

  -- Anti-ciclo: se aplica siempre, sin excepción de rol.
  v_cursor := new.superior_id;
  while v_cursor is not null loop
    if v_cursor = new.id then
      raise exception 'Ese cambio crearía un ciclo en la jerarquía';
    end if;
    select superior_id into v_cursor from public.usuarios where id = v_cursor;
  end loop;

  -- Compatibilidad de rol: admin puede saltarse esta parte (corrección
  -- manual de estructura), igual que el código del servidor que ya
  -- validó el permiso y escribe con la service_role key (sin auth.uid()
  -- para resolver fn_rol_actual()).
  if public.fn_rol_actual() <> 'admin' and auth.role() <> 'service_role' then
    select r.nombre into v_rol_nuevo from public.roles r where r.id = new.rol_id;
    select r.nombre into v_rol_superior
      from public.roles r join public.usuarios u on u.rol_id = r.id
      where u.id = new.superior_id;

    select exists(
      select 1 from public.jerarquia_roles_permitidos j
      join public.roles rs on rs.id = j.rol_subordinado_id
      where rs.nombre = v_rol_nuevo
    ) into v_tiene_regla;

    if v_tiene_regla and not exists (
      select 1 from public.jerarquia_roles_permitidos j
      join public.roles rs on rs.id = j.rol_subordinado_id
      join public.roles ro on ro.id = j.rol_superior_id
      where rs.nombre = v_rol_nuevo and ro.nombre = v_rol_superior
    ) then
      raise exception 'Un % no puede reportar a un %', v_rol_nuevo, v_rol_superior;
    end if;
  end if;

  return new;
end;
$$;
