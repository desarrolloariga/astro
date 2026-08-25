-- ============================================================
-- ASTRO — Contrataciones (Fase 5, mínima).
--
-- El documento apenas define esto más allá de listarlo como operación
-- #7 de la matriz de autorizaciones (Sección 16) — matriz que
-- explícitamente queda fuera de esta fase. Se registra la solicitud y
-- su decisión, con un solo permiso booleano ("decidir"); se conectará
-- a la matriz de autorización real (por rango de salario) cuando esa
-- fase exista — ver el TODO en fn_decidir_contratacion.
-- ============================================================

create table public.contrataciones (
  id bigint generated always as identity primary key,
  candidato_nombre text not null,
  candidato_contacto text,
  puesto text not null,
  rol_sugerido_id bigint references public.roles (id),
  salario_propuesto numeric(12,2),
  moneda_id bigint references public.monedas (id),
  tienda_id bigint references public.tiendas (id),
  estado text not null default 'solicitada' check (estado in
    ('solicitada', 'en_evaluacion', 'aprobada', 'rechazada', 'contratada', 'cancelada')),
  solicitado_por bigint references public.usuarios (id),
  decidido_por bigint references public.usuarios (id),
  fecha_decision timestamptz,
  comentario_decision text,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create trigger trg_contrataciones_fecha_actualizacion
  before update on public.contrataciones
  for each row execute function public.fn_fecha_actualizacion();

create trigger trg_auditar_contrataciones
  after insert or update or delete on public.contrataciones
  for each row execute function public.fn_auditar();

alter table public.contrataciones enable row level security;

insert into public.permisos (modulo, accion, descripcion) values
  ('contrataciones', 'ver', 'Consultar solicitudes de contratación'),
  ('contrataciones', 'crear', 'Solicitar una contratación'),
  ('contrataciones', 'decidir', 'Aprobar, rechazar o marcar contratada una solicitud')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('admin', 'contrataciones', 'ver'), ('coordinador', 'contrataciones', 'ver'), ('supervisor', 'contrataciones', 'ver'),
  ('admin', 'contrataciones', 'crear'), ('coordinador', 'contrataciones', 'crear'), ('supervisor', 'contrataciones', 'crear'),
  ('admin', 'contrataciones', 'decidir'), ('coordinador', 'contrataciones', 'decidir')
) as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

-- Quien tiene permiso general ve todas; quien solo puede crear ve las
-- suyas (para hacer seguimiento sin necesitar el permiso de decidir).
create policy sel_contrataciones on public.contrataciones
  for select to authenticated
  using (
    public.fn_tiene_permiso('contrataciones', 'ver')
    or solicitado_por = public.fn_usuario_id()
  );

create policy ins_contrataciones on public.contrataciones
  for insert to authenticated
  with check (
    public.fn_tiene_permiso('contrataciones', 'crear')
    and solicitado_por = public.fn_usuario_id()
  );

create or replace function public.fn_decidir_contratacion(
  p_contratacion_id bigint,
  p_nuevo_estado text,
  p_comentario text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if p_nuevo_estado not in ('en_evaluacion', 'aprobada', 'rechazada', 'contratada', 'cancelada') then
    raise exception 'Estado inválido: %', p_nuevo_estado;
  end if;
  if not public.fn_tiene_permiso('contrataciones', 'decidir') then
    raise exception 'No tienes permiso para decidir sobre esta solicitud';
  end if;

  -- TODO(fase futura): cuando exista la matriz de autorización de la
  -- Sección 16, esta función exigirá el nivel correspondiente según
  -- salario_propuesto en vez de un solo permiso booleano.
  update public.contrataciones
    set estado = p_nuevo_estado,
        decidido_por = public.fn_usuario_id(),
        comentario_decision = p_comentario,
        fecha_decision = now()
    where id = p_contratacion_id;

  if not found then
    raise exception 'La solicitud no existe';
  end if;
end;
$$;

-- Verificación
select modulo, accion from public.permisos where modulo = 'contrataciones' order by accion;
