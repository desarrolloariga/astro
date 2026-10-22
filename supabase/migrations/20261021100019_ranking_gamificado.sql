-- ============================================================
-- ASTRO — Ranking gamificado.
--
-- fn_ranking(): toda la pantalla de Ranking en una sola respuesta, y la
-- PRIVACIDAD se decide aquí, con la sesión (nunca con un parámetro del
-- cliente):
--   - admin y coordinador reciben nombre, tienda y rol de todos;
--   - cualquier otro rol recibe las filas ajenas SIN nombre, tienda, rol
--     ni ids: solo posición, puntos y movimiento. Su propia fila sí trae
--     su nombre.
--
-- Alcance para quien no es admin (siempre entre personas de su mismo rol):
--   'red'    = mismo superior (mismo asesor)
--   'tienda' = misma tienda
--   'rol'    = todo su rol
-- Admin/coordinador: filtros opcionales de rol y tienda.
--
-- Posición: puntos individuales del período (no incluyen los de la red).
-- Desempate: con los mismos puntos va primero quien llegó antes a ese
-- puntaje (fecha de su último punto del período); luego el id.
-- Movimiento semanal: posición hace 7 días − posición actual, calculada
-- con el mismo historial de puntos (no requiere tarea programada).
--
-- Además: niveles, insignias y premios administrables (Fidelización),
-- racha de días con ventas, progreso de logros y cierre del acceso
-- directo a vw_ranking y a los puntos de otras personas.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Campos administrables
-- ------------------------------------------------------------
alter table public.niveles
  add column if not exists color text,
  add column if not exists icono text;

alter table public.insignias
  add column if not exists icono text,
  add column if not exists color text,
  add column if not exists recompensa text,
  add column if not exists orden int not null default 0;

alter table public.premios
  add column if not exists titulo text,
  add column if not exists tipo text not null default 'posicion',
  add column if not exists minimo_puntos numeric,
  add column if not exists icono text,
  add column if not exists activo boolean not null default true;
alter table public.premios alter column posicion_desde drop not null;
alter table public.premios alter column posicion_hasta drop not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'premios_tipo_check') then
    alter table public.premios add constraint premios_tipo_check
      check (tipo in ('posicion', 'puntos')
             and (tipo <> 'posicion' or (posicion_desde is not null and posicion_hasta is not null))
             and (tipo <> 'puntos' or minimo_puntos is not null));
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Valores iniciales (editables en Sistema → Fidelización)
-- ------------------------------------------------------------
insert into public.niveles (nombre, umbral_puntos, orden, color, icono, beneficios)
select * from (values
  ('Bronce', 0::numeric, 1, '#B9773E', 'medal', '{"texto": "Por definir"}'::jsonb),
  ('Plata', 1000::numeric, 2, '#8D9AAE', 'star', '{"texto": "Por definir"}'::jsonb),
  ('Oro', 2000::numeric, 3, '#D4A21B', 'star', '{"texto": "Por definir"}'::jsonb),
  ('Diamante', 3000::numeric, 4, '#3B82F6', 'crown', '{"texto": "Por definir"}'::jsonb)
) v(nombre, umbral, orden, color, icono, beneficios)
where not exists (select 1 from public.niveles);

insert into public.insignias (nombre, descripcion, criterio, icono, color, recompensa, orden)
select * from (values
  ('Primera venta', 'Registra tu primera venta del ciclo.', '{"tipo": "primera_venta"}'::jsonb, 'bag', '#2453D6', 'Por definir', 1),
  ('10 ventas', 'Completa 10 ventas dentro del mismo ciclo.', '{"tipo": "ventas_mes", "umbral": 10}'::jsonb, 'trophy', '#E0AC1E', 'Por definir', 2),
  ('Racha de 7 días', 'Vende al menos una pieza durante 7 días seguidos.', '{"tipo": "racha", "umbral": 7}'::jsonb, 'flame', '#F59E0B', 'Por definir', 3),
  ('Top 10', 'Termina el ciclo entre los 10 primeros.', '{"tipo": "top", "umbral": 10}'::jsonb, 'medal', '#8E6CCF', 'Por definir', 4),
  ('Podio', 'Termina el ciclo entre los 3 primeros.', '{"tipo": "top", "umbral": 3}'::jsonb, 'crown', '#E0AC1E', 'Por definir', 5),
  ('Nivel Oro', 'Acumula 2,000 puntos en un ciclo.', '{"tipo": "puntos", "umbral": 2000}'::jsonb, 'star', '#D4A21B', 'Por definir', 6),
  ('Conector', 'Consigue 5 clientes nuevos en el ciclo.', '{"tipo": "clientes_nuevos", "umbral": 5}'::jsonb, 'userPlus', '#2F9E8F', 'Por definir', 7),
  ('Estudiante', 'Completa 3 cursos de la Academia.', '{"tipo": "cursos", "umbral": 3}'::jsonb, 'cap', '#4A8FB8', 'Por definir', 8)
) v(nombre, descripcion, criterio, icono, color, recompensa, orden)
where not exists (select 1 from public.insignias);

insert into public.premios (periodo_id, titulo, tipo, posicion_desde, posicion_hasta, minimo_puntos, descripcion, icono)
select * from (values
  (null::bigint, '1.er lugar', 'posicion', 1, 1, null::numeric, 'Premio 1.er lugar (por definir)', 'crown'),
  (null::bigint, 'Podio (2.º y 3.º)', 'posicion', 2, 3, null::numeric, 'Premio podio (por definir)', 'medal'),
  (null::bigint, 'Top 10', 'posicion', 4, 10, null::numeric, 'Bono Top 10 (por definir)', 'trophy'),
  (null::bigint, 'Nivel Oro o superior', 'puntos', null::int, null::int, 2000::numeric, 'Beneficio nivel Oro (por definir)', 'star')
) v(periodo_id, titulo, tipo, desde, hasta, minimo, descripcion, icono)
where not exists (select 1 from public.premios);

-- ------------------------------------------------------------
-- 3. Racha: días seguidos (hasta hoy o ayer) con al menos una venta
-- ------------------------------------------------------------
create or replace function public.fn_racha_ventas(p_usuario_id bigint)
returns int
language sql stable security definer
set search_path = public
as $$
  with dias as (
    select distinct (fecha_creacion at time zone 'America/Guatemala')::date as d
    from public.ventas
    where vendedor_id = p_usuario_id and estado <> 'anulada'
      and fecha_creacion >= now() - interval '120 days'
  ),
  hoy as (select (now() at time zone 'America/Guatemala')::date as d),
  grupos as (
    select d, d - (row_number() over (order by d))::int as grupo from dias
  ),
  rachas as (
    select max(d) as fin, count(*)::int as largo from grupos group by grupo
  )
  select coalesce((select largo from rachas, hoy where rachas.fin >= hoy.d - 1 order by fin desc limit 1), 0);
$$;

revoke all on function public.fn_racha_ventas(bigint) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. Ranking completo de la pantalla
-- ------------------------------------------------------------
create or replace function public.fn_ranking(
  p_periodo_id bigint default null,
  p_alcance text default 'red',
  p_rol text default null,
  p_tienda_id bigint default null
)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_yo record;
  v_admin boolean;
  v_periodo public.periodos%rowtype;
  v_alcance text := case when p_alcance in ('red', 'tienda', 'rol') then p_alcance else 'red' end;
  v_corte timestamptz;
  v_filas jsonb;
  v_me jsonb;
  v_total int;
  v_mi_pos int;
  v_mis_pts numeric := 0;
  v_racha int := 0;
  v_logros jsonb;
begin
  select u.id, u.nombre, u.tienda_id, u.superior_id, u.rol_id, r.nombre as rol
    into v_yo
  from public.usuarios u join public.roles r on r.id = u.rol_id
  where u.auth_uid = auth.uid() and u.activo;
  if not found then
    raise exception 'Sesión requerida';
  end if;
  v_admin := v_yo.rol in ('admin', 'coordinador');

  if p_periodo_id is null then
    select * into v_periodo from public.periodos
      where tipo = 'mensual' and fecha_inicio <= now() order by fecha_inicio desc limit 1;
  else
    select * into v_periodo from public.periodos where id = p_periodo_id;
  end if;
  if not found then
    return jsonb_build_object('sin_periodo', true, 'es_admin', v_admin, 'periodos', '[]'::jsonb);
  end if;

  -- Corte del movimiento: 7 días antes de hoy (o del cierre del período).
  v_corte := least(now(), v_periodo.fecha_fin) - interval '7 days';

  with participantes as (
    select u.id, u.nombre, t.nombre as tienda, r.nombre as rol
    from public.usuarios u
    join public.roles r on r.id = u.rol_id
    left join public.tiendas t on t.id = u.tienda_id
    where u.activo
      and r.nombre in ('embajador', 'asesor', 'supervisor', 'tienda')
      and (
        case
          when v_admin then
            (p_rol is null or r.nombre = p_rol)
            and (p_tienda_id is null or u.tienda_id = p_tienda_id)
          else
            u.rol_id = v_yo.rol_id
            and case v_alcance
                  when 'red' then u.superior_id is not distinct from v_yo.superior_id
                  when 'tienda' then u.tienda_id is not distinct from v_yo.tienda_id
                  else true
                end
        end
      )
  ),
  pts as (
    select pa.*,
           coalesce(sum(p.cantidad), 0) as puntos,
           max(p.fecha_creacion) as alcanzado,
           coalesce(sum(p.cantidad) filter (where p.fecha_creacion <= v_corte), 0) as puntos_antes,
           max(p.fecha_creacion) filter (where p.fecha_creacion <= v_corte) as alcanzado_antes
    from participantes pa
    left join public.puntos p on p.usuario_id = pa.id and p.periodo_id = v_periodo.id
    group by pa.id, pa.nombre, pa.tienda, pa.rol
  ),
  pos as (
    select pts.*,
           row_number() over (order by puntos desc, alcanzado asc nulls last, id) as posicion,
           row_number() over (order by puntos_antes desc, alcanzado_antes asc nulls last, id) as posicion_antes
    from pts
  )
  select
    count(*)::int,
    jsonb_agg(
      jsonb_build_object(
        'pos', posicion,
        'pts', puntos,
        'move', case when v_corte < v_periodo.fecha_inicio then 0 else posicion_antes - posicion end,
        'isMe', id = v_yo.id
      )
      -- Solo administración (o la fila propia) lleva datos personales.
      || case when v_admin or id = v_yo.id
              then jsonb_build_object('name', nombre, 'store', tienda, 'role', rol)
              else '{}'::jsonb end
      order by posicion
    ),
    max(posicion) filter (where id = v_yo.id),
    max(puntos) filter (where id = v_yo.id)
  into v_total, v_filas, v_mi_pos, v_mis_pts
  from pos;

  v_filas := coalesce(v_filas, '[]'::jsonb);
  v_mis_pts := coalesce(v_mis_pts,
    (select coalesce(sum(cantidad), 0) from public.puntos where usuario_id = v_yo.id and periodo_id = v_periodo.id));
  if v_mi_pos is not null then
    v_me := v_filas -> (v_mi_pos - 1);
  end if;
  v_racha := public.fn_racha_ventas(v_yo.id);

  -- Progreso de logros del usuario en sesión.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'name', i.nombre, 'desc', coalesce(i.descripcion, ''),
           'icon', coalesce(i.icono, 'trophy'), 'color', coalesce(i.color, '#2453D6'),
           'reward', coalesce(i.recompensa, ''), 'have', least(prog.actual, prog.meta), 'need', prog.meta,
           'unlocked', prog.actual >= prog.meta
             or exists (select 1 from public.usuario_insignias ui where ui.usuario_id = v_yo.id and ui.insignia_id = i.id))
         order by i.orden, i.id), '[]'::jsonb)
    into v_logros
  from public.insignias i
  cross join lateral (
    select
      greatest(coalesce((i.criterio ->> 'umbral')::numeric, 1), 1) as meta_base,
      i.criterio ->> 'tipo' as tipo
  ) c
  cross join lateral (
    select
      case c.tipo when 'top' then 1 else c.meta_base end as meta,
      case c.tipo
        when 'primera_venta' then (select count(*) from public.ventas v where v.vendedor_id = v_yo.id and v.estado <> 'anulada'
                                    and v.fecha_creacion >= v_periodo.fecha_inicio and v.fecha_creacion < v_periodo.fecha_fin)
        when 'ventas_mes' then (select count(*) from public.ventas v where v.vendedor_id = v_yo.id and v.estado <> 'anulada'
                                 and v.fecha_creacion >= v_periodo.fecha_inicio and v.fecha_creacion < v_periodo.fecha_fin)
        when 'racha' then v_racha
        when 'top' then case when v_mi_pos is not null and v_mi_pos <= c.meta_base and v_mis_pts > 0 then 1 else 0 end
        when 'puntos' then v_mis_pts
        when 'clientes_nuevos' then (select count(*) from public.clientes cl where cl.vendedor_id = v_yo.id
                                      and cl.fecha_creacion >= v_periodo.fecha_inicio and cl.fecha_creacion < v_periodo.fecha_fin)
        when 'cursos' then (select count(*) from public.progreso_cursos pc where pc.usuario_id = v_yo.id and pc.estado = 'completado')
        else 0
      end::numeric as actual
  ) prog
  where i.activo;

  return jsonb_build_object(
    'es_admin', v_admin,
    'alcance', v_alcance,
    'total', v_total,
    'me', v_me,
    'mis_puntos', v_mis_pts,
    'racha', v_racha,
    'rows', v_filas,
    'periodo', jsonb_build_object(
      'id', v_periodo.id, 'nombre', v_periodo.nombre,
      'inicio', v_periodo.fecha_inicio, 'fin', v_periodo.fecha_fin,
      'en_curso', v_periodo.estado = 'abierto' and now() < v_periodo.fecha_fin),
    'periodos', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', id, 'nombre', nombre, 'inicio', fecha_inicio, 'fin', fecha_fin,
                   'en_curso', estado = 'abierto' and now() < fecha_fin) order by fecha_inicio desc), '[]'::jsonb)
                 from (select * from public.periodos where tipo = 'mensual' and fecha_inicio <= now()
                       order by fecha_inicio desc limit 12) x),
    'niveles', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', id, 'name', nombre, 'min', umbral_puntos, 'color', coalesce(color, '#8D9AAE'),
                  'icon', coalesce(icono, 'star'), 'benefit', coalesce(beneficios ->> 'texto', '')) order by umbral_puntos), '[]'::jsonb)
                from public.niveles where activo),
    'premios', (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', id, 'title', coalesce(titulo, descripcion), 'prize', descripcion, 'tipo', tipo,
                  'maxPos', posicion_hasta, 'minPts', minimo_puntos, 'icon', coalesce(icono, 'trophy'))
                  order by tipo, posicion_desde nulls last, minimo_puntos), '[]'::jsonb)
                from public.premios
                where activo and (periodo_id is null or periodo_id = v_periodo.id)),
    'reglas', (select coalesce(jsonb_agg(jsonb_build_object(
                 'title', nombre, 'tipo', tipo, 'valor', valor * multiplicador, 'condiciones', condiciones) order by id), '[]'::jsonb)
               from public.reglas_puntaje
               where activo and (vigencia_fin is null or vigencia_fin >= now())),
    'tiendas', case when v_admin then (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre) order by nombre), '[]'::jsonb)
                                       from public.tiendas where activo) else '[]'::jsonb end,
    'logros', v_logros
  );
end;
$$;

revoke all on function public.fn_ranking(bigint, text, text, bigint) from public, anon;
grant execute on function public.fn_ranking(bigint, text, text, bigint) to authenticated;

-- ------------------------------------------------------------
-- 5. Posición propia (Mi red / Equipo) sin exponer a los demás
-- ------------------------------------------------------------
create or replace function public.fn_mi_posicion_ranking()
returns table (puntos_totales numeric, posicion int)
language sql stable security definer
set search_path = public
as $$
  select (r -> 'me' ->> 'pts')::numeric, (r -> 'me' ->> 'pos')::int
  from (select public.fn_ranking(null, 'rol') as r) x
  where r -> 'me' is not null and r -> 'me' <> 'null'::jsonb;
$$;

grant execute on function public.fn_mi_posicion_ranking() to authenticated;

-- ------------------------------------------------------------
-- 6. Cierre del acceso directo a nombres y puntos ajenos
-- ------------------------------------------------------------
revoke select on public.vw_ranking from authenticated;

drop policy if exists sel_puntos on public.puntos;
create policy sel_puntos on public.puntos
  for select to authenticated
  using (
    usuario_id = (select public.fn_usuario_id())
    or (select public.fn_rol_actual()) in ('admin', 'coordinador', 'contabilidad')
    or usuario_id in (select public.fn_mis_descendientes())
  );

-- ------------------------------------------------------------
-- Verificación
-- ------------------------------------------------------------
select
  (select count(*) from public.niveles) as niveles,
  (select count(*) from public.insignias) as insignias,
  (select count(*) from public.premios) as premios,
  (select count(*) from pg_proc where proname in ('fn_ranking', 'fn_racha_ventas', 'fn_mi_posicion_ranking')) as funciones;
