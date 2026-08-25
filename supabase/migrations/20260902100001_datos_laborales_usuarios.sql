-- ============================================================
-- ASTRO — Datos laborales de personal (Fase D de "formularios nivel
-- Odoo/SAP"). Tabla separada de `usuarios` a propósito: incluye
-- salario_base, dato sensible que NO debe heredar la visibilidad
-- amplia de sel_usuarios (admin/coordinador/propio registro/
-- descendientes) — aquí el círculo se acota a admin/contabilidad +
-- la propia persona viendo sus propios datos.
-- ============================================================

create table public.usuarios_datos_laborales (
  usuario_id bigint primary key references public.usuarios (id),
  dpi text,
  nit text,
  fecha_nacimiento date,
  direccion text,
  contacto_emergencia_nombre text,
  contacto_emergencia_telefono text,
  fecha_ingreso date,
  tipo_contrato text check (tipo_contrato in ('planilla', 'honorarios', 'temporal', 'comision_pura') or tipo_contrato is null),
  salario_base numeric(12,2),
  banco text,
  cuenta_bancaria text,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create trigger trg_usuarios_datos_laborales_fecha_actualizacion
  before update on public.usuarios_datos_laborales
  for each row execute function public.fn_fecha_actualizacion();

create trigger trg_auditar_usuarios_datos_laborales
  after insert or update or delete on public.usuarios_datos_laborales
  for each row execute function public.fn_auditar();

alter table public.usuarios_datos_laborales enable row level security;

insert into public.permisos (modulo, accion, descripcion) values
  ('usuarios', 'ver_laboral', 'Ver datos laborales y salario de cualquier persona'),
  ('usuarios', 'editar_laboral', 'Editar datos laborales y salario')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('admin', 'usuarios', 'ver_laboral'), ('contabilidad', 'usuarios', 'ver_laboral'),
  ('admin', 'usuarios', 'editar_laboral'), ('contabilidad', 'usuarios', 'editar_laboral')
) as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

create policy sel_usuarios_datos_laborales on public.usuarios_datos_laborales
  for select to authenticated
  using (
    public.fn_tiene_permiso('usuarios', 'ver_laboral')
    or usuario_id = public.fn_usuario_id()
  );

create policy adm_usuarios_datos_laborales on public.usuarios_datos_laborales for all to authenticated
  using (public.fn_tiene_permiso('usuarios', 'editar_laboral'))
  with check (public.fn_tiene_permiso('usuarios', 'editar_laboral'));

-- Verificación
select modulo, accion from public.permisos where modulo = 'usuarios' and accion like '%laboral%';
