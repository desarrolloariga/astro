-- ============================================================
-- ASTRO — Premiaciones: premios canjeables por puntos.
--
-- Distinto de public.premios (premios por posición en el ranking, en
-- Fidelización). Aquí administración arma un catálogo de premios
-- (nombre, descripción, puntos necesarios, fotos, stock) y cualquier
-- usuario de la red los canjea desde "Mi red" con sus puntos.
--
-- Saldo de puntos para canjear = puntos ganados (tabla puntos, todos
-- los períodos) − puntos de canjes no rechazados. Canjear NO cambia
-- el ranking: el ranking sigue sumando puntos ganados.
--
-- Flujo del canje: solicitado (puntos descontados y stock apartado)
-- → entregado, o → rechazado (devuelve puntos y stock).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tablas
-- ------------------------------------------------------------
create table public.premios_canje (
  id bigint generated always as identity primary key,
  nombre text not null,
  descripcion text,
  puntos int not null check (puntos > 0),
  stock int check (stock is null or stock >= 0),   -- null = sin límite
  imagenes text[] not null default '{}',           -- URLs públicas (bucket astro-premios)
  activo boolean not null default true,
  creado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create table public.canjes_premios (
  id bigint generated always as identity primary key,
  premio_id bigint not null references public.premios_canje (id),
  usuario_id bigint not null references public.usuarios (id),
  puntos int not null check (puntos > 0),
  estado text not null default 'solicitado' check (estado in ('solicitado', 'entregado', 'rechazado')),
  comentario text,
  atendido_por bigint references public.usuarios (id),
  fecha_atencion timestamptz,
  fecha_creacion timestamptz not null default now()
);

create index idx_canjes_premios_usuario on public.canjes_premios (usuario_id, fecha_creacion desc);
create index idx_canjes_premios_estado on public.canjes_premios (estado, fecha_creacion);

create trigger trg_premios_canje_fecha_actualizacion before update on public.premios_canje
  for each row execute function public.fn_fecha_actualizacion();

create trigger trg_auditar_premios_canje
  after insert or update or delete on public.premios_canje
  for each row execute function public.fn_auditar();

create trigger trg_auditar_canjes_premios
  after insert or update or delete on public.canjes_premios
  for each row execute function public.fn_auditar();

-- ------------------------------------------------------------
-- 2. Quién administra premiaciones
-- ------------------------------------------------------------
create or replace function public.fn_puede_admin_premios()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.fn_usuario_id() is not null
     and (public.fn_rol_actual() in ('admin', 'coordinador') or public.fn_tiene_permiso('incentivos', 'editar'));
$$;

grant execute on function public.fn_puede_admin_premios() to authenticated;

-- ------------------------------------------------------------
-- 3. RLS (escritura solo por funciones)
-- ------------------------------------------------------------
alter table public.premios_canje enable row level security;
alter table public.canjes_premios enable row level security;

create policy sel_premios_canje on public.premios_canje
  for select to authenticated
  using (activo or public.fn_puede_admin_premios());

create policy sel_canjes_premios on public.canjes_premios
  for select to authenticated
  using (
    usuario_id = public.fn_usuario_id()
    or public.fn_puede_admin_premios()
    or public.fn_es_mi_descendiente(usuario_id)
  );

grant select on public.premios_canje to authenticated;
grant select on public.canjes_premios to authenticated;

-- ------------------------------------------------------------
-- 4. Fotos: bucket público
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('astro-premios', 'astro-premios', true)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 5. Saldo de puntos para canjear
-- ------------------------------------------------------------
create or replace function public.fn_saldo_puntos_canje(p_usuario_id bigint)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select coalesce((select sum(cantidad) from public.puntos where usuario_id = p_usuario_id), 0)
       - coalesce((select sum(puntos) from public.canjes_premios
                   where usuario_id = p_usuario_id and estado <> 'rechazado'), 0);
$$;

revoke all on function public.fn_saldo_puntos_canje(bigint) from public, anon, authenticated;

create or replace function public.fn_mis_puntos_canje()
returns table (ganados numeric, canjeados numeric, disponibles numeric)
language sql stable security definer
set search_path = public
as $$
  select
    coalesce((select sum(cantidad) from public.puntos where usuario_id = public.fn_usuario_id()), 0),
    coalesce((select sum(puntos) from public.canjes_premios
              where usuario_id = public.fn_usuario_id() and estado <> 'rechazado'), 0),
    public.fn_saldo_puntos_canje(public.fn_usuario_id())
  where public.fn_usuario_id() is not null;
$$;

grant execute on function public.fn_mis_puntos_canje() to authenticated;

-- ------------------------------------------------------------
-- 6. Crear / editar premio
-- ------------------------------------------------------------
create or replace function public.fn_guardar_premio_canje(
  p_id bigint,
  p_nombre text,
  p_descripcion text,
  p_puntos int,
  p_stock int,
  p_imagenes text[],
  p_activo boolean
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.fn_puede_admin_premios() then
    raise exception 'No tienes permiso para administrar premiaciones';
  end if;
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El premio necesita un nombre';
  end if;
  if p_puntos is null or p_puntos <= 0 then
    raise exception 'Indica cuántos puntos cuesta el premio';
  end if;
  if p_stock is not null and p_stock < 0 then
    raise exception 'El stock no puede ser negativo';
  end if;

  if p_id is null then
    insert into public.premios_canje (nombre, descripcion, puntos, stock, imagenes, activo, creado_por)
    values (btrim(p_nombre), nullif(btrim(coalesce(p_descripcion, '')), ''), p_puntos, p_stock,
            coalesce(p_imagenes, '{}'), coalesce(p_activo, true), public.fn_usuario_id())
    returning id into v_id;
  else
    update public.premios_canje
      set nombre = btrim(p_nombre),
          descripcion = nullif(btrim(coalesce(p_descripcion, '')), ''),
          puntos = p_puntos,
          stock = p_stock,
          imagenes = coalesce(p_imagenes, '{}'),
          activo = coalesce(p_activo, true)
      where id = p_id
      returning id into v_id;
    if v_id is null then
      raise exception 'El premio no existe';
    end if;
  end if;
  return v_id;
end;
$$;

grant execute on function public.fn_guardar_premio_canje(bigint, text, text, int, int, text[], boolean) to authenticated;

-- ------------------------------------------------------------
-- 7. Canjear (cualquier usuario con puntos suficientes)
-- ------------------------------------------------------------
create or replace function public.fn_canjear_premio(p_premio_id bigint)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_usuario_id bigint := public.fn_usuario_id();
  v_premio public.premios_canje%rowtype;
  v_saldo numeric;
  v_canje_id bigint;
  v_nombre text;
begin
  if v_usuario_id is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;

  -- Bloqueos: el usuario (para no gastar dos veces el mismo saldo) y el premio (stock).
  perform 1 from public.usuarios where id = v_usuario_id for update;
  select * into v_premio from public.premios_canje where id = p_premio_id for update;
  if not found or not v_premio.activo then
    raise exception 'Este premio ya no está disponible';
  end if;
  if v_premio.stock is not null and v_premio.stock <= 0 then
    raise exception 'Este premio está agotado';
  end if;

  v_saldo := public.fn_saldo_puntos_canje(v_usuario_id);
  if v_saldo < v_premio.puntos then
    raise exception 'Te faltan % puntos para canjear este premio', (v_premio.puntos - v_saldo)::int;
  end if;

  insert into public.canjes_premios (premio_id, usuario_id, puntos)
  values (p_premio_id, v_usuario_id, v_premio.puntos)
  returning id into v_canje_id;

  if v_premio.stock is not null then
    update public.premios_canje set stock = stock - 1 where id = p_premio_id;
  end if;

  select nombre into v_nombre from public.usuarios where id = v_usuario_id;

  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
  select distinct u.id, 'canje_solicitado', 'Canje de premio por entregar',
         v_nombre || ' canjeó "' || v_premio.nombre || '" por ' || v_premio.puntos || ' puntos.', '/premiaciones'
    from public.usuarios u
    join public.roles r on r.id = u.rol_id
   where u.activo and r.nombre in ('admin', 'coordinador');

  return v_canje_id;
end;
$$;

grant execute on function public.fn_canjear_premio(bigint) to authenticated;

-- ------------------------------------------------------------
-- 8. Atender un canje: entregado o rechazado (devuelve puntos y stock)
-- ------------------------------------------------------------
create or replace function public.fn_atender_canje(p_canje_id bigint, p_entregado boolean, p_comentario text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_canje public.canjes_premios%rowtype;
  v_premio public.premios_canje%rowtype;
begin
  if not public.fn_puede_admin_premios() then
    raise exception 'No tienes permiso para atender canjes';
  end if;

  select * into v_canje from public.canjes_premios where id = p_canje_id for update;
  if not found then
    raise exception 'El canje no existe';
  end if;
  if v_canje.estado <> 'solicitado' then
    raise exception 'Este canje ya fue atendido';
  end if;
  if not coalesce(p_entregado, false) and nullif(btrim(coalesce(p_comentario, '')), '') is null then
    raise exception 'Indica el motivo del rechazo';
  end if;

  select * into v_premio from public.premios_canje where id = v_canje.premio_id for update;

  update public.canjes_premios
    set estado = case when p_entregado then 'entregado' else 'rechazado' end,
        comentario = nullif(btrim(coalesce(p_comentario, '')), ''),
        atendido_por = public.fn_usuario_id(),
        fecha_atencion = now()
    where id = p_canje_id;

  if not p_entregado and v_premio.stock is not null then
    update public.premios_canje set stock = stock + 1 where id = v_premio.id;
  end if;

  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
  values (v_canje.usuario_id,
          case when p_entregado then 'canje_entregado' else 'canje_rechazado' end,
          case when p_entregado then 'Premio entregado' else 'Canje rechazado' end,
          case when p_entregado
            then 'Tu premio "' || v_premio.nombre || '" fue entregado.'
            else 'Tu canje de "' || v_premio.nombre || '" fue rechazado: ' || btrim(p_comentario)
                 || '. Te devolvimos ' || v_canje.puntos || ' puntos.' end,
          '/red');
end;
$$;

grant execute on function public.fn_atender_canje(bigint, boolean, text) to authenticated;

-- ------------------------------------------------------------
-- Verificación
-- ------------------------------------------------------------
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('fn_guardar_premio_canje', 'fn_canjear_premio', 'fn_atender_canje', 'fn_mis_puntos_canje',
                    'fn_saldo_puntos_canje', 'fn_puede_admin_premios')
order by 1;
