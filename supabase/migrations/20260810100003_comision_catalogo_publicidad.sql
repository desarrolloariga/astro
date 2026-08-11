-- ============================================================
-- ASTRO — Comisión por catálogo del embajador + publicidad interna.
--
-- Contexto: "catálogo" no es una entidad persistente en el esquema
-- (es la superficie de navegación sobre productos) — lo persistente
-- y atribuible a un embajador es el links_venta que comparte. Por
-- eso el % de comisión se guarda en links_venta, no en una tabla
-- "catalogos" nueva. Ver catálogos por categoría ya funciona hoy
-- (/catalogo?categoria=), cero trabajo adicional para eso.
-- ============================================================

-- 1. % de comisión por enlace (nullable → cae al default global)
alter table public.links_venta add column comision_embajador_pct numeric(5,2);

insert into public.parametros (clave, valor, tipo_dato, descripcion, modulo) values
  ('comision_embajador_catalogo_pct_default', '0', 'numero',
   'Porcentaje de comisión por catálogo compartido cuando el enlace no tiene uno propio', 'comisiones')
on conflict (clave) do nothing;

-- Solo admin fija el % (evita que un embajador/asesor se autoasigne
-- un % alto en un enlace que ellos mismos comparten).
insert into public.permisos (modulo, accion, descripcion) values
  ('links', 'fijar_comision', 'Configurar el % de comisión de un enlace de catálogo')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values ('admin','links','fijar_comision'))
  as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

create or replace function public.fn_fijar_comision_link(p_link_id bigint, p_pct numeric)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('links','fijar_comision') then
    raise exception 'No tienes permiso para fijar la comisión de un enlace';
  end if;
  if p_pct is not null and (p_pct < 0 or p_pct > 100) then
    raise exception 'El porcentaje debe estar entre 0 y 100';
  end if;

  update public.links_venta set comision_embajador_pct = p_pct where id = p_link_id;
  if not found then
    raise exception 'El enlace no existe';
  end if;
end;
$$;

-- 2. Nuevo tipo de regla — actúa como interruptor de la comisión
-- por catálogo (el % en sí se resuelve por enlace, no por la regla;
-- la regla solo determina si el mecanismo está activo y sirve de
-- referencia en el ledger). El check de la tabla exige algún
-- porcentaje/monto_fijo al crearla — no se usa para el cálculo,
-- cualquier valor placeholder es válido.
alter table public.reglas_comision drop constraint reglas_comision_tipo_check;
alter table public.reglas_comision add constraint reglas_comision_tipo_check
  check (tipo in ('por_venta','meta','crecimiento','liderazgo','capacitacion','fidelizacion','catalogo_embajador'));

-- 3. fn_calcular_comisiones — mismo cuerpo + bloque de comisión por
-- catálogo compartido (canal='link'), sumada a lo que ya calculan
-- por_venta/liderazgo (no reemplaza, se acumula).
create or replace function public.fn_calcular_comisiones(p_venta_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_venta public.ventas%rowtype;
  v_periodo_id bigint;
  v_rol_vendedor bigint;
  v_nombre_vendedor text;
  v_regla record;
  v_ancestro record;
  v_monto numeric;
  v_pct_catalogo numeric;
begin
  select * into v_venta from public.ventas where id = p_venta_id;
  if not found then
    return;
  end if;

  v_periodo_id := public.fn_obtener_periodo_actual();
  select rol_id, nombre into v_rol_vendedor, v_nombre_vendedor
    from public.usuarios where id = v_venta.vendedor_id;

  -- Comisión directa por venta
  for v_regla in
    select * from public.reglas_comision
      where activo and tipo = 'por_venta'
        and (rol_id is null or rol_id = v_rol_vendedor)
        and (vigencia_inicio is null or vigencia_inicio <= v_venta.fecha_creacion)
        and (vigencia_fin is null or vigencia_fin >= v_venta.fecha_creacion)
  loop
    v_monto := public.fn_calcular_comision_regla(
      v_regla.tipo, v_regla.porcentaje, v_regla.monto_fijo, v_regla.condiciones, p_venta_id);
    if v_monto <> 0 then
      insert into public.comisiones (usuario_id, venta_id, regla_id, regla_version, periodo_id, monto, motivo)
      values (v_venta.vendedor_id, p_venta_id, v_regla.id, v_regla.version, v_periodo_id, v_monto, v_regla.nombre);
    end if;
  end loop;

  -- Comisión de liderazgo: cada ascendente cuyo rol coincide con
  -- regla.rol_id gana un % de esta venta (red de supervisión)
  for v_regla in
    select * from public.reglas_comision
      where activo and tipo = 'liderazgo'
        and (vigencia_inicio is null or vigencia_inicio <= v_venta.fecha_creacion)
        and (vigencia_fin is null or vigencia_fin >= v_venta.fecha_creacion)
  loop
    for v_ancestro in
      select u.id from public.vw_cadena_mando cm
        join public.usuarios u on u.id = cm.ancestro_id
        where cm.descendiente_id = v_venta.vendedor_id
          and (v_regla.rol_id is null or u.rol_id = v_regla.rol_id)
    loop
      v_monto := round(coalesce(v_regla.monto_fijo, 0) + v_venta.total * coalesce(v_regla.porcentaje, 0) / 100, 2);
      if v_monto <> 0 then
        insert into public.comisiones (usuario_id, venta_id, regla_id, regla_version, periodo_id, monto, motivo)
        values (v_ancestro.id, p_venta_id, v_regla.id, v_regla.version, v_periodo_id, v_monto,
                v_regla.nombre || ' — red de ' || v_nombre_vendedor);
      end if;
    end loop;
  end loop;

  -- Comisión por catálogo compartido (solo ventas por enlace, y
  -- solo si hay al menos una regla catalogo_embajador activa)
  if v_venta.canal = 'link' and v_venta.link_id is not null then
    select coalesce(
      (select comision_embajador_pct from public.links_venta where id = v_venta.link_id),
      (select valor::numeric from public.parametros where clave = 'comision_embajador_catalogo_pct_default')
    ) into v_pct_catalogo;

    if v_pct_catalogo is not null and v_pct_catalogo <> 0 then
      for v_regla in
        select * from public.reglas_comision
          where activo and tipo = 'catalogo_embajador'
            and (vigencia_inicio is null or vigencia_inicio <= v_venta.fecha_creacion)
            and (vigencia_fin is null or vigencia_fin >= v_venta.fecha_creacion)
      loop
        v_monto := round(v_venta.total * v_pct_catalogo / 100, 2);
        if v_monto <> 0 then
          insert into public.comisiones (usuario_id, venta_id, regla_id, regla_version, periodo_id, monto, motivo)
          values (v_venta.vendedor_id, p_venta_id, v_regla.id, v_regla.version, v_periodo_id, v_monto,
                  'Comisión por catálogo compartido (' || v_pct_catalogo || '%)');
        end if;
      end loop;
    end if;
  end if;
end;
$$;

-- 4. Publicidad interna dirigida a embajadores (y otros roles, configurable)
create table public.publicidad_interna (
  id bigint generated always as identity primary key,
  titulo text not null,
  cuerpo text,
  imagen_url text,
  url_destino text,
  publico_objetivo text not null default 'embajador'
    check (publico_objetivo in ('todos','embajador','asesor','supervisor','tienda')),
  fecha_inicio timestamptz not null default now(),
  fecha_fin timestamptz,
  activo boolean not null default true,
  creado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create trigger trg_publicidad_interna_fecha_actualizacion
  before update on public.publicidad_interna
  for each row execute function public.fn_fecha_actualizacion();

alter table public.publicidad_interna enable row level security;

insert into public.permisos (modulo, accion, descripcion) values
  ('publicidad', 'editar', 'Crear y administrar publicidad interna')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values ('admin','publicidad','editar'), ('coordinador','publicidad','editar'))
  as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

create policy adm_publicidad_interna on public.publicidad_interna
  for all to authenticated
  using (public.fn_tiene_permiso('publicidad','editar'))
  with check (public.fn_tiene_permiso('publicidad','editar'));

-- Solo lo vigente y dirigido a mi rol — vista, no acceso directo a
-- la tabla (que sí expone borradores/vencidos a quien administra).
create view public.vw_publicidad_vigente as
select id, titulo, cuerpo, imagen_url, url_destino, publico_objetivo, fecha_inicio, fecha_fin
from public.publicidad_interna
where activo
  and now() >= fecha_inicio
  and now() <= coalesce(fecha_fin, 'infinity'::timestamptz)
  and (publico_objetivo = 'todos' or publico_objetivo = public.fn_rol_actual());

grant select on public.vw_publicidad_vigente to authenticated;
revoke all on public.vw_publicidad_vigente from anon;

-- Verificación
select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'reglas_comision_tipo_check';
