-- ============================================================
-- ARIGA — Migración 0022: motor real de permisos granulares.
--
-- Contexto: las tablas permisos/roles_permisos/usuarios_permisos
-- existen desde la fase 1 pero ninguna política ni función las
-- consultaba — toda la autorización vivía en checks de rol fijo
-- repartidos en cada policy/función. Esta migración las activa:
--
--   fn_tiene_permiso(modulo, accion) =
--     excepción individual explícita (usuarios_permisos, si existe)
--     si no hay excepción → el permiso por defecto de su rol (roles_permisos)
--
-- roles_permisos se siembra para reproducir EXACTAMENTE el
-- comportamiento que ya tenía cada rol (ningún acceso cambia hoy);
-- lo nuevo es que ahora se puede otorgar o revocar una excepción
-- individual por usuario sin tocar código.
--
-- Deliberadamente NO se toca: la administración de la propia
-- matriz de permisos (roles_permisos/usuarios_permisos/permisos)
-- sigue gateada por rol fijo 'admin' (no por fn_tiene_permiso) —
-- evita que alguien pueda quedarse sin forma de corregir un error
-- de configuración en el propio sistema de permisos.
-- ============================================================

create or replace function public.fn_tiene_permiso(p_modulo text, p_accion text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select up.concedido
       from public.usuarios_permisos up
       join public.permisos p on p.id = up.permiso_id
       where up.usuario_id = public.fn_usuario_id()
         and p.modulo = p_modulo and p.accion = p_accion),
    exists (
      select 1
      from public.roles_permisos rp
      join public.permisos p on p.id = rp.permiso_id
      join public.usuarios u on u.rol_id = rp.rol_id
      where u.id = public.fn_usuario_id()
        and p.modulo = p_modulo and p.accion = p_accion
    ),
    false
  );
$$;

comment on function public.fn_tiene_permiso(text, text) is
  'Excepción individual (usuarios_permisos) > permiso por defecto del rol (roles_permisos) > false.';

-- ------------------------------------------------------------
-- Semilla: reproduce el comportamiento actual de cada rol
-- ------------------------------------------------------------
insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('admin','usuarios','ver'), ('admin','usuarios','crear'), ('admin','usuarios','editar'),
  ('admin','tiendas','ver'), ('admin','tiendas','editar'),
  ('admin','parametros','editar'),
  ('admin','inventario','ver'),    ('tienda','inventario','ver'),
  ('admin','inventario','ajustar'),('tienda','inventario','ajustar'),
  ('admin','catalogo','ver'), ('coordinador','catalogo','ver'), ('supervisor','catalogo','ver'),
    ('asesor','catalogo','ver'), ('embajador','catalogo','ver'), ('tienda','catalogo','ver'),
  ('admin','separados','crear'), ('tienda','separados','crear'),
    ('asesor','separados','crear'), ('embajador','separados','crear'),
  ('admin','ventas','crear'), ('tienda','ventas','crear'),
    ('asesor','ventas','crear'), ('embajador','ventas','crear'),
  ('admin','ventas','anular'),
  ('admin','comprobantes','aprobar'), ('contabilidad','comprobantes','aprobar'),
  ('admin','finanzas','ver'), ('coordinador','finanzas','ver'), ('contabilidad','finanzas','ver'),
  ('admin','academia','editar'),
  ('admin','incentivos','editar')
) as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;
