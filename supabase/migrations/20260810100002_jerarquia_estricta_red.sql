-- ============================================================
-- ASTRO — Jerarquía estricta + módulos Supervisor/Asesor/Embajador.
--
-- Contexto: la jerarquía (superior_id, vw_cadena_mando,
-- historial_jerarquia) ya existía completa. Esta migración agrega:
--   1. Compatibilidad de rol al asignar superior_id, forzada en la
--      propia base (trigger) — necesario porque a partir de ahora
--      hay un SEGUNDO punto de escritura a superior_id (el asesor
--      dando de alta embajadores), y duplicar la validación de
--      ciclo en cada punto de escritura sería frágil.
--   2. Tipo de embajador (A1-D4) y contacto estable del asesor.
--   3. Permiso para que el asesor cree embajadores.
--   4. Vistas "mi red" (ventas/comisiones) para supervisor/asesor.
--   5. Anulación de venta ampliada a supervisor, acotada a su
--      propia red, con reversión de comisiones/puntos ya otorgados.
-- ============================================================

-- 1. Compatibilidad de rol + anti-ciclo, forzado en DB
create table public.jerarquia_roles_permitidos (
  id bigint generated always as identity primary key,
  rol_subordinado_id bigint not null references public.roles (id),
  rol_superior_id bigint not null references public.roles (id),
  unique (rol_subordinado_id, rol_superior_id)
);

insert into public.jerarquia_roles_permitidos (rol_subordinado_id, rol_superior_id)
select rs.id, ro.id
from (values
  ('embajador','asesor'),
  ('asesor','supervisor'),
  ('supervisor','coordinador'),
  ('coordinador','admin')
) as base(rol_subordinado, rol_superior)
join public.roles rs on rs.nombre = base.rol_subordinado
join public.roles ro on ro.nombre = base.rol_superior;

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

  -- Anti-ciclo: recorrer hacia arriba desde el superior propuesto;
  -- si en algún punto se llega de vuelta a new.id, es un ciclo.
  v_cursor := new.superior_id;
  while v_cursor is not null loop
    if v_cursor = new.id then
      raise exception 'Ese cambio crearía un ciclo en la jerarquía';
    end if;
    select superior_id into v_cursor from public.usuarios where id = v_cursor;
  end loop;

  -- Compatibilidad de rol (admin puede saltarse esta parte —
  -- necesita poder corregir cualquier estructura manualmente).
  if public.fn_rol_actual() <> 'admin' then
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

create trigger trg_usuarios_validar_superior
  before insert or update of superior_id on public.usuarios
  for each row execute function public.fn_validar_superior_jerarquia();

-- 2. Tipo de embajador + contacto estable del asesor
alter table public.usuarios add column tipo_embajador text
  check (tipo_embajador in ('A1','B2','C3','D4'));
alter table public.usuarios add column asesor_contacto_id bigint references public.usuarios (id);

-- Se lee vía función dedicada (no amplía sel_usuarios general):
-- un embajador necesita ver nombre/teléfono de su asesor, pero
-- asesor_contacto_id apunta "hacia arriba" (no es su descendiente,
-- así que fn_es_mi_descendiente no lo cubre).
create or replace function public.fn_mi_contacto_asesor()
returns table (nombre text, telefono text)
language sql stable security definer
set search_path = public
as $$
  select a.nombre, a.telefono
  from public.usuarios yo
  join public.usuarios a on a.id = yo.asesor_contacto_id
  where yo.auth_uid = auth.uid();
$$;

-- 3. Permiso: el asesor puede crear embajadores
insert into public.permisos (modulo, accion, descripcion) values
  ('usuarios', 'crear_embajador', 'Alta de embajadores propios')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values ('admin','usuarios','crear_embajador'), ('asesor','usuarios','crear_embajador'))
  as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

-- 4. Vistas "mi red" — sirven a asesor/supervisor/admin con una
-- sola vista cada una, sin ramificar código. No tocan vw_red_comercial
-- (sigue sirviendo a /finanzas tal cual).
create view public.vw_mi_red as
select
  u.id as usuario_id, u.nombre, r.nombre as rol, u.tienda_id, t.nombre as tienda,
  u.superior_id, u.tipo_embajador,
  coalesce(vp.ventas_periodo, 0) as ventas_periodo,
  coalesce(vp.num_ventas_periodo, 0) as num_ventas_periodo
from public.usuarios u
join public.roles r on r.id = u.rol_id
left join public.tiendas t on t.id = u.tienda_id
left join lateral (
  select sum(v.total) as ventas_periodo, count(*) as num_ventas_periodo
  from public.ventas v
  where v.vendedor_id = u.id
    and v.estado <> 'anulada'
    and v.fecha_creacion >= date_trunc('month', now())
) vp on true
where
  public.fn_rol_actual() in ('admin','coordinador')
  or public.fn_es_mi_descendiente(u.id)
  or u.id = public.fn_usuario_id();

grant select on public.vw_mi_red to authenticated;
revoke all on public.vw_mi_red from anon;

create view public.vw_comisiones_red as
select c.*, u.nombre as usuario_nombre, r.nombre as usuario_rol
from public.comisiones c
join public.usuarios u on u.id = c.usuario_id
join public.roles r on r.id = u.rol_id
where
  public.fn_rol_actual() in ('admin','contabilidad')
  or c.usuario_id = public.fn_usuario_id()
  or public.fn_es_mi_descendiente(c.usuario_id);

grant select on public.vw_comisiones_red to authenticated;
revoke all on public.vw_comisiones_red from anon;

-- 5. fn_anular_venta — mismo cuerpo, acotado a la red del supervisor
-- (no company-wide) + reversión de comisiones/puntos ya otorgados.
insert into public.permisos (modulo, accion, descripcion) values
  ('ventas', 'anular', 'Anular ventas (requiere aprobación)')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values ('supervisor','ventas','anular'))
  as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

create or replace function public.fn_anular_venta(p_venta_id bigint, p_motivo text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_venta public.ventas%rowtype;
  v_detalle record;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if not public.fn_tiene_permiso('ventas','anular') then
    raise exception 'No tienes permiso para anular ventas';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'La anulación requiere un motivo';
  end if;

  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'La venta no existe';
  end if;
  if v_venta.estado = 'anulada' then
    raise exception 'La venta ya está anulada';
  end if;
  if public.fn_rol_actual() <> 'admin' and not public.fn_es_mi_descendiente(v_venta.vendedor_id) then
    raise exception 'Solo puedes anular ventas de tu propia red';
  end if;

  for v_detalle in
    select * from public.venta_detalles where venta_id = p_venta_id
  loop
    perform public.fn_devolver_disponibilidad(v_detalle.producto_id);
    insert into public.movimientos_inventario (producto_id, tipo, usuario_id, referencia)
    values (v_detalle.producto_id, 'devolucion', public.fn_usuario_id(),
            'anulación venta ' || p_venta_id || ': ' || p_motivo);
  end loop;

  update public.ventas set estado = 'anulada' where id = p_venta_id;

  -- Reversión: ledgers inmutables, nunca se hace UPDATE/DELETE de lo
  -- ya otorgado — se inserta la fila negativa correspondiente.
  insert into public.comisiones (usuario_id, venta_id, regla_id, regla_version, periodo_id, monto, motivo)
  select usuario_id, venta_id, regla_id, regla_version, periodo_id, -monto,
         'Reversión por anulación de venta ' || p_venta_id
  from public.comisiones
  where venta_id = p_venta_id;

  insert into public.puntos (usuario_id, venta_id, regla_id, regla_version, periodo_id, cantidad, motivo)
  select usuario_id, venta_id, regla_id, regla_version, periodo_id, -cantidad,
         'Reversión por anulación de venta ' || p_venta_id
  from public.puntos
  where venta_id = p_venta_id;
end;
$$;

-- Verificación
select modulo, accion from public.permisos where modulo in ('usuarios','ventas') order by modulo, accion;
