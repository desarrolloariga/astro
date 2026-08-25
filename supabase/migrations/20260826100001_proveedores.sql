-- ============================================================
-- ASTRO — Proveedores (Fase 2 de la adaptación a la especificación
-- funcional de negocio). CRUD simple, requisito de Compras e
-- Importaciones (Fases 3 y 4).
-- ============================================================

create table public.proveedores (
  id bigint generated always as identity primary key,
  nombre text not null,
  tipo text not null default 'local' check (tipo in ('local', 'importado')),
  pais_id bigint references public.paises (id),
  contacto_nombre text,
  contacto_telefono text,
  contacto_correo text,
  nit text,
  direccion text,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create trigger trg_proveedores_fecha_actualizacion
  before update on public.proveedores
  for each row execute function public.fn_fecha_actualizacion();

create trigger trg_auditar_proveedores
  after insert or update or delete on public.proveedores
  for each row execute function public.fn_auditar();

alter table public.proveedores enable row level security;

insert into public.permisos (modulo, accion, descripcion) values
  ('proveedores', 'ver', 'Consultar proveedores'),
  ('proveedores', 'editar', 'Crear y editar proveedores')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('admin', 'proveedores', 'ver'),
  ('coordinador', 'proveedores', 'ver'),
  ('contabilidad', 'proveedores', 'ver'),
  ('produccion', 'proveedores', 'ver'),
  ('admin', 'proveedores', 'editar'),
  ('contabilidad', 'proveedores', 'editar')
) as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

create policy sel_proveedores on public.proveedores
  for select to authenticated
  using (public.fn_tiene_permiso('proveedores', 'ver'));

create policy adm_proveedores on public.proveedores for all to authenticated
  using (public.fn_tiene_permiso('proveedores', 'editar'))
  with check (public.fn_tiene_permiso('proveedores', 'editar'));

-- Verificación
select modulo, accion from public.permisos where modulo = 'proveedores' order by accion;
