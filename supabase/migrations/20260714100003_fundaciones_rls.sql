-- ============================================================
-- ARIGA — Migración 0003: RLS de fundaciones
-- Regla general: RLS habilitado en TODAS las tablas del esquema.
-- El rol anon no tiene privilegios sobre tablas; el cliente final
-- solo entrará por funciones RPC security definer (fases 4+).
-- ============================================================

alter table public.monedas enable row level security;
alter table public.paises enable row level security;
alter table public.roles enable row level security;
alter table public.permisos enable row level security;
alter table public.roles_permisos enable row level security;
alter table public.tiendas enable row level security;
alter table public.usuarios enable row level security;
alter table public.usuarios_permisos enable row level security;
alter table public.usuarios_tiendas enable row level security;
alter table public.historial_jerarquia enable row level security;
alter table public.parametros enable row level security;
alter table public.auditoria enable row level security;
alter table public.notificaciones enable row level security;

-- ------------------------------------------------------------
-- Catálogos de solo lectura para autenticados; escritura solo admin
-- ------------------------------------------------------------
create policy sel_monedas on public.monedas
  for select to authenticated using (true);
create policy adm_monedas on public.monedas
  for all to authenticated
  using (public.fn_rol_actual() = 'admin')
  with check (public.fn_rol_actual() = 'admin');

create policy sel_paises on public.paises
  for select to authenticated using (true);
create policy adm_paises on public.paises
  for all to authenticated
  using (public.fn_rol_actual() = 'admin')
  with check (public.fn_rol_actual() = 'admin');

create policy sel_roles on public.roles
  for select to authenticated using (true);
create policy adm_roles on public.roles
  for all to authenticated
  using (public.fn_rol_actual() = 'admin')
  with check (public.fn_rol_actual() = 'admin');

create policy sel_permisos on public.permisos
  for select to authenticated using (true);
create policy adm_permisos on public.permisos
  for all to authenticated
  using (public.fn_rol_actual() = 'admin')
  with check (public.fn_rol_actual() = 'admin');

create policy sel_roles_permisos on public.roles_permisos
  for select to authenticated using (true);
create policy adm_roles_permisos on public.roles_permisos
  for all to authenticated
  using (public.fn_rol_actual() = 'admin')
  with check (public.fn_rol_actual() = 'admin');

create policy sel_tiendas on public.tiendas
  for select to authenticated using (true);
create policy adm_tiendas on public.tiendas
  for all to authenticated
  using (public.fn_rol_actual() = 'admin')
  with check (public.fn_rol_actual() = 'admin');

-- Parámetros: la app los necesita para operar; cambiarlos es de admin
create policy sel_parametros on public.parametros
  for select to authenticated using (true);
create policy adm_parametros on public.parametros
  for all to authenticated
  using (public.fn_rol_actual() = 'admin')
  with check (public.fn_rol_actual() = 'admin');

-- ------------------------------------------------------------
-- Usuarios: cada quien se ve a sí mismo; la cadena de mando ve
-- hacia abajo; admin y coordinador ven toda la red.
-- ------------------------------------------------------------
create policy sel_usuarios on public.usuarios
  for select to authenticated
  using (
    auth_uid = auth.uid()
    or public.fn_rol_actual() in ('admin','coordinador')
    or public.fn_es_mi_descendiente(id)
  );

create policy adm_usuarios on public.usuarios
  for all to authenticated
  using (public.fn_rol_actual() = 'admin')
  with check (public.fn_rol_actual() = 'admin');

-- ------------------------------------------------------------
-- Permisos individuales y asignación a tiendas
-- ------------------------------------------------------------
create policy sel_usuarios_permisos on public.usuarios_permisos
  for select to authenticated
  using (
    usuario_id = public.fn_usuario_id()
    or public.fn_rol_actual() = 'admin'
  );
create policy adm_usuarios_permisos on public.usuarios_permisos
  for all to authenticated
  using (public.fn_rol_actual() = 'admin')
  with check (public.fn_rol_actual() = 'admin');

create policy sel_usuarios_tiendas on public.usuarios_tiendas
  for select to authenticated
  using (
    usuario_id = public.fn_usuario_id()
    or public.fn_rol_actual() in ('admin','coordinador')
  );
create policy adm_usuarios_tiendas on public.usuarios_tiendas
  for all to authenticated
  using (public.fn_rol_actual() = 'admin')
  with check (public.fn_rol_actual() = 'admin');

-- ------------------------------------------------------------
-- Historial de jerarquía: el propio usuario, su cadena de mando,
-- admin y coordinador. Solo escriben los triggers (security definer).
-- ------------------------------------------------------------
create policy sel_historial_jerarquia on public.historial_jerarquia
  for select to authenticated
  using (
    usuario_id = public.fn_usuario_id()
    or public.fn_rol_actual() in ('admin','coordinador')
    or public.fn_es_mi_descendiente(usuario_id)
  );

-- ------------------------------------------------------------
-- Auditoría: solo lectura para admin; nadie escribe directo
-- (inserta el trigger fn_auditar, que es security definer).
-- ------------------------------------------------------------
create policy sel_auditoria on public.auditoria
  for select to authenticated
  using (public.fn_rol_actual() = 'admin');

-- ------------------------------------------------------------
-- Notificaciones: cada usuario ve y marca como leídas las suyas.
-- Las crea el sistema (funciones security definer) o admin.
-- ------------------------------------------------------------
create policy sel_notificaciones on public.notificaciones
  for select to authenticated
  using (usuario_id = public.fn_usuario_id());

create policy upd_notificaciones on public.notificaciones
  for update to authenticated
  using (usuario_id = public.fn_usuario_id())
  with check (usuario_id = public.fn_usuario_id());

create policy adm_notificaciones on public.notificaciones
  for all to authenticated
  using (public.fn_rol_actual() = 'admin')
  with check (public.fn_rol_actual() = 'admin');
