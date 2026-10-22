-- ============================================================
-- ASTRO — Puntos de red.
--
-- A cada persona se le acumulan, además de sus propios puntos, los de
-- quienes están debajo en su jerarquía (vw_cadena_mando, siempre con la
-- estructura actual). Aplica al saldo canjeable por premios y a lo que
-- muestra Mi red. El ranking (vw_ranking) sigue siendo individual.
--
-- Los puntos no se canjean por productos ni por dinero: solo por premios
-- (canjes_premios).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Puntos propios + de la red (opcionalmente de un período)
-- ------------------------------------------------------------
create or replace function public.fn_puntos_acumulados(p_usuario_id bigint, p_periodo_id bigint default null)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select coalesce(sum(p.cantidad), 0)
  from public.puntos p
  where (
      p.usuario_id = p_usuario_id
      or p.usuario_id in (select descendiente_id from public.vw_cadena_mando where ancestro_id = p_usuario_id)
    )
    and (p_periodo_id is null or p.periodo_id = p_periodo_id);
$$;

revoke all on function public.fn_puntos_acumulados(bigint, bigint) from public, anon;
grant execute on function public.fn_puntos_acumulados(bigint, bigint) to authenticated;

-- ------------------------------------------------------------
-- 2. Saldo canjeable por premios = acumulados (propios + red) − canjes
--    Misma firma: conserva permisos y a quienes la llaman (fn_canjear_premio).
-- ------------------------------------------------------------
create or replace function public.fn_saldo_puntos_canje(p_usuario_id bigint)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select public.fn_puntos_acumulados(p_usuario_id)
       - coalesce((select sum(puntos) from public.canjes_premios
                   where usuario_id = p_usuario_id and estado <> 'rechazado'), 0);
$$;

-- ------------------------------------------------------------
-- 3. Mis puntos: cambia la lista de columnas → DROP + CREATE + grant
-- ------------------------------------------------------------
drop function if exists public.fn_mis_puntos_canje();

create function public.fn_mis_puntos_canje()
returns table (
  ganados numeric,
  propios numeric,
  de_red numeric,
  periodo numeric,
  periodo_propios numeric,
  canjeados numeric,
  disponibles numeric,
  equipo int
)
language sql stable security definer
set search_path = public
as $$
  with yo as (select public.fn_usuario_id() as id),
       per as (select public.fn_obtener_periodo_actual() as id),
       propios as (
         select coalesce(sum(cantidad), 0) as total,
                coalesce(sum(cantidad) filter (where periodo_id = (select id from per)), 0) as periodo
         from public.puntos where usuario_id = (select id from yo)
       )
  select
    public.fn_puntos_acumulados(yo.id),
    propios.total,
    public.fn_puntos_acumulados(yo.id) - propios.total,
    public.fn_puntos_acumulados(yo.id, per.id),
    propios.periodo,
    coalesce((select sum(puntos) from public.canjes_premios
              where usuario_id = yo.id and estado <> 'rechazado'), 0),
    public.fn_saldo_puntos_canje(yo.id),
    (select count(*)::int from public.vw_cadena_mando where ancestro_id = yo.id)
  from yo, per, propios
  where yo.id is not null;
$$;

grant execute on function public.fn_mis_puntos_canje() to authenticated;

-- ------------------------------------------------------------
-- 4. Puntos de la red por embajador (Mi red): también con su propia red
--    Misma firma: conserva permisos.
-- ------------------------------------------------------------
create or replace function public.fn_red_puntos_bolsa()
returns table (
  usuario_id bigint,
  nombre text,
  puntos_periodo numeric,
  puntos_total numeric,
  bolsa_disponible numeric,
  bolsa_en_espera numeric
)
language sql stable security definer
set search_path = public
as $$
  select
    u.id,
    u.nombre,
    public.fn_puntos_acumulados(u.id, public.fn_obtener_periodo_actual()),
    public.fn_puntos_acumulados(u.id),
    public.fn_saldo_bolsa(u.id),
    public.fn_bolsa_en_espera(u.id)
  from public.usuarios u
  join public.roles r on r.id = u.rol_id
  where r.nombre = 'embajador'
    and u.activo
    and public.fn_usuario_id() is not null
    and (
      public.fn_rol_actual() in ('admin', 'coordinador')
      or u.id = public.fn_usuario_id()
      or public.fn_es_mi_descendiente(u.id)
    );
$$;

-- ------------------------------------------------------------
-- Verificación
-- ------------------------------------------------------------
select proname, pg_get_function_result(oid) as resultado
from pg_proc
where proname in ('fn_puntos_acumulados', 'fn_saldo_puntos_canje', 'fn_mis_puntos_canje', 'fn_red_puntos_bolsa')
order by proname;
