-- ============================================================
-- ASTRO — Enlaces públicos de registro para EMBAJADORES.
--
--   enlaces_registro   cada enlace (token aleatorio) registra embajadores bajo un
--                      superior (asesor o administración), con su tipo, vigencia
--                      y cupo opcionales, y los mensajes de la pantalla de
--                      bienvenida: título, mensaje y frases de expectativa
--                      («Próximamente…»), con fecha de lanzamiento opcional
--                      para la cuenta regresiva.
--   usuarios.enlace_registro_id  con qué enlace se registró cada embajador.
--
-- La cuenta se crea desde el servidor (llave de servicio) al enviar el
-- formulario público; aquí solo se guardan los enlaces y se cuentan los usos.
-- Permisos: usuarios.crear (administración, todos los enlaces) y
-- usuarios.crear_embajador (asesores, solo los suyos y con ellos de superior).
-- ============================================================

create table public.enlaces_registro (
  id bigint generated always as identity primary key,
  token text not null unique check (token ~ '^[a-f0-9]{32}$'),
  nombre text not null check (btrim(nombre) <> ''),
  superior_id bigint not null references public.usuarios (id),
  tipo_embajador text not null default 'A1' check (tipo_embajador in ('A1', 'B2', 'C3', 'D4')),
  activo boolean not null default true,
  vence timestamptz,
  cupo int check (cupo > 0),
  usos int not null default 0 check (usos >= 0),
  titulo_bienvenida text not null default '¡Felicidades por inscribirte!',
  mensaje_bienvenida text,
  mensajes_expectativa jsonb not null default '[]'::jsonb check (jsonb_typeof(mensajes_expectativa) = 'array'),
  fecha_lanzamiento date,
  permitir_ingreso boolean not null default true,
  creado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);
create index idx_enlaces_registro_superior on public.enlaces_registro (superior_id);

alter table public.usuarios add column if not exists enlace_registro_id bigint references public.enlaces_registro (id);
create index if not exists idx_usuarios_enlace_registro on public.usuarios (enlace_registro_id) where enlace_registro_id is not null;

create trigger trg_auditar_enlaces_registro after insert or update or delete on public.enlaces_registro
  for each row execute function public.fn_auditar();

alter table public.enlaces_registro enable row level security;
-- Administración ve y edita todos; un asesor, los enlaces que creó o que lo tienen de superior.
create policy sel_enlaces_registro on public.enlaces_registro for select to authenticated
  using ((select public.fn_tiene_permiso('usuarios', 'crear'))
         or ((select public.fn_tiene_permiso('usuarios', 'crear_embajador'))
             and (creado_por = (select public.fn_usuario_id()) or superior_id = (select public.fn_usuario_id()))));
create policy ins_enlaces_registro on public.enlaces_registro for insert to authenticated
  with check ((select public.fn_tiene_permiso('usuarios', 'crear'))
              or ((select public.fn_tiene_permiso('usuarios', 'crear_embajador'))
                  and superior_id = (select public.fn_usuario_id()) and creado_por = (select public.fn_usuario_id())));
create policy upd_enlaces_registro on public.enlaces_registro for update to authenticated
  using ((select public.fn_tiene_permiso('usuarios', 'crear'))
         or ((select public.fn_tiene_permiso('usuarios', 'crear_embajador')) and creado_por = (select public.fn_usuario_id())))
  with check ((select public.fn_tiene_permiso('usuarios', 'crear'))
              or ((select public.fn_tiene_permiso('usuarios', 'crear_embajador'))
                  and superior_id = (select public.fn_usuario_id()) and creado_por = (select public.fn_usuario_id())));
grant select, insert, update on public.enlaces_registro to authenticated;

-- Reserva un uso del enlace (atómico: respeta vigencia y cupo). Solo para el servidor.
create or replace function public.fn_enlace_registro_usar(p_token text)
returns public.enlaces_registro
language plpgsql security definer
set search_path = public
as $$
declare
  e public.enlaces_registro%rowtype;
begin
  update public.enlaces_registro
    set usos = usos + 1
    where token = p_token and activo and (vence is null or vence > now()) and (cupo is null or usos < cupo)
    returning * into e;
  if not found then
    raise exception 'Este enlace de registro ya no está disponible';
  end if;
  return e;
end;
$$;

-- Devuelve el uso si la cuenta no se pudo crear.
create or replace function public.fn_enlace_registro_devolver(p_id bigint)
returns void
language sql security definer
set search_path = public
as $$
  update public.enlaces_registro set usos = greatest(usos - 1, 0) where id = p_id;
$$;

revoke all on function public.fn_enlace_registro_usar(text) from public, anon, authenticated;
revoke all on function public.fn_enlace_registro_devolver(bigint) from public, anon, authenticated;
grant execute on function public.fn_enlace_registro_usar(text) to service_role;
grant execute on function public.fn_enlace_registro_devolver(bigint) to service_role;

-- Verificación
select (select count(*) from information_schema.columns where table_name = 'usuarios' and column_name = 'enlace_registro_id') as columna_usuarios,
       (select count(*) from pg_policies where tablename = 'enlaces_registro') as politicas;
