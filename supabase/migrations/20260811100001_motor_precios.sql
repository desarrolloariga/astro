-- ============================================================
-- ASTRO — Fase 5: Motor de precios (margen automático + costeo
-- local/importado). Diseño deliberado: SUGIERE, no reemplaza —
-- precio_venta se sigue llenando a mano; fn_publicar_producto no
-- cambia su validación.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Origen del producto — insumo del costeo (local vs. importado)
-- ------------------------------------------------------------
alter table public.productos
  add column origen text not null default 'local' check (origen in ('local','importado'));

-- ------------------------------------------------------------
-- 2. Políticas de margen por categoría + origen (categoria_id nulo
-- = política general de respaldo para ese origen)
-- ------------------------------------------------------------
create table public.politicas_margen (
  id bigint generated always as identity primary key,
  categoria_id bigint references public.categorias (id),
  origen text not null check (origen in ('local','importado')),
  margen_pct numeric(5,2) not null,
  activo boolean not null default true,
  vigencia_inicio timestamptz,
  vigencia_fin timestamptz,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create trigger trg_politicas_margen_fecha_actualizacion
  before update on public.politicas_margen
  for each row execute function public.fn_fecha_actualizacion();

alter table public.politicas_margen enable row level security;

insert into public.permisos (modulo, accion, descripcion) values
  ('costeo', 'editar', 'Configurar políticas de margen y porcentajes de costeo')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values ('admin','costeo','editar'))
  as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

-- Lectura: los mismos roles que ya ven costo_produccion en la tabla
-- productos (sel_productos); escritura: solo costeo.editar (admin).
create policy sel_politicas_margen on public.politicas_margen
  for select to authenticated
  using (public.fn_rol_actual() in ('admin','contabilidad','coordinador','produccion'));

create policy adm_politicas_margen on public.politicas_margen for all to authenticated
  using (public.fn_tiene_permiso('costeo','editar'))
  with check (public.fn_tiene_permiso('costeo','editar'));

-- ------------------------------------------------------------
-- 3. Porcentajes globales de costeo — editables también desde
-- /admin/parametros (modulo='costeo'), sin UI adicional requerida.
-- ------------------------------------------------------------
insert into public.parametros (clave, valor, tipo_dato, descripcion, modulo) values
  ('pct_empaque', '5', 'numero',
   'Porcentaje de empaque/envío que se suma al costo de producción', 'costeo'),
  ('pct_flete_importado', '15', 'numero',
   'Porcentaje adicional de flete para piezas de origen importado', 'costeo')
on conflict (clave) do nothing;

-- ------------------------------------------------------------
-- 4. Costeo por pieza ya creada — mismo alcance de visibilidad que
-- la tabla productos (sel_productos): quien ve costo_produccion.
-- ------------------------------------------------------------
create view public.vw_producto_costeo as
select
  p.id, p.codigo, p.nombre, p.categoria_id, c.nombre as categoria, p.origen,
  p.costo_produccion,
  costeo.costo_total,
  pm.margen_pct,
  p.precio_venta,
  round(costeo.costo_total * (1 + coalesce(pm.margen_pct, 0) / 100), 2) as precio_sugerido
from public.productos p
left join public.categorias c on c.id = p.categoria_id
left join lateral (
  select round(
    p.costo_produccion
    * (1 + coalesce(public.fn_parametro('pct_empaque')::numeric, 0) / 100)
    * (1 + case when p.origen = 'importado'
        then coalesce(public.fn_parametro('pct_flete_importado')::numeric, 0) / 100
        else 0 end),
    2
  ) as costo_total
) costeo on true
left join lateral (
  select margen_pct from public.politicas_margen
  where activo
    and origen = p.origen
    and (categoria_id = p.categoria_id or categoria_id is null)
    and (vigencia_inicio is null or vigencia_inicio <= now())
    and (vigencia_fin is null or vigencia_fin >= now())
  order by categoria_id nulls last, fecha_creacion desc
  limit 1
) pm on true
where p.costo_produccion is not null
  and (
    public.fn_rol_actual() in ('admin','contabilidad','coordinador')
    or (public.fn_rol_actual() = 'produccion' and p.creado_por = public.fn_usuario_id())
  );

grant select on public.vw_producto_costeo to authenticated;
revoke all on public.vw_producto_costeo from anon;

-- Verificación
select clave, valor from public.parametros where clave in ('pct_empaque','pct_flete_importado');
