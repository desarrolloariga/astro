-- ============================================================
-- ARIGA — Migración 0020: Módulo financiero (vistas KPI),
-- campañas y conteo físico de inventario (Fase 8).
-- ============================================================

-- ------------------------------------------------------------
-- Campañas (eventos especiales con reglas de puntos/descuentos
-- temporales — las reglas mismas se configuran en reglas_puntaje
-- / reglas_comision con vigencia_inicio/fin; esta tabla es el
-- registro visible de la campaña como tal)
-- ------------------------------------------------------------
create table public.campanas (
  id bigint generated always as identity primary key,
  nombre text not null,
  fecha_inicio timestamptz not null,
  fecha_fin timestamptz not null,
  configuracion jsonb not null default '{}'::jsonb,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz,
  check (fecha_fin > fecha_inicio)
);

create trigger trg_campanas_fecha_actualizacion before update on public.campanas
  for each row execute function public.fn_fecha_actualizacion();

-- ------------------------------------------------------------
-- Conteo físico de inventario por tienda (toma de inventario:
-- se listan las piezas que el sistema espera en esa tienda y el
-- personal las va marcando conforme las encuentra físicamente)
-- ------------------------------------------------------------
create table public.conteos_fisicos (
  id bigint generated always as identity primary key,
  tienda_id bigint not null references public.tiendas (id),
  iniciado_por bigint references public.usuarios (id),
  estado text not null default 'abierto' check (estado in ('abierto','cerrado')),
  fecha_inicio timestamptz not null default now(),
  fecha_cierre timestamptz
);

create table public.conteo_fisico_detalles (
  id bigint generated always as identity primary key,
  conteo_id bigint not null references public.conteos_fisicos (id),
  producto_id bigint not null references public.productos (id),
  contado boolean not null default false,
  fecha_conteo timestamptz,
  unique (conteo_id, producto_id)
);

create index idx_conteo_fisico_detalles_conteo on public.conteo_fisico_detalles (conteo_id);

-- ============================================================
-- Vistas financieras. Cada vista se auto-restringe con un filtro
-- sobre public.fn_rol_actual() en vez de depender de RLS de base
-- (igual que vw_catalogo/vw_ranking): quien no tenga el rol
-- adecuado simplemente recibe cero filas.
-- ============================================================

-- Ventas por día/tienda/canal/vendedor — visión comercial general
create view public.vw_ventas_kpi as
select
  v.id, v.fecha_creacion, v.canal, v.subtotal, v.descuento_desempeno, v.total, v.estado,
  v.tienda_id, t.nombre as tienda,
  v.vendedor_id, u.nombre as vendedor
from public.ventas v
join public.usuarios u on u.id = v.vendedor_id
left join public.tiendas t on t.id = v.tienda_id
where public.fn_rol_actual() in ('admin','coordinador','contabilidad');

grant select on public.vw_ventas_kpi to authenticated;
revoke all on public.vw_ventas_kpi from anon;

-- Margen por producto vendido — costos, nunca para la red comercial
create view public.vw_margen_producto as
select
  vd.id as detalle_id, v.id as venta_id, v.fecha_creacion, v.tienda_id, v.estado,
  p.id as producto_id, p.codigo, p.nombre, p.categoria_id, c.nombre as categoria,
  vd.precio as precio_venta, p.costo_produccion,
  (vd.precio - coalesce(p.costo_produccion, 0)) as margen,
  case when vd.precio > 0
    then round((vd.precio - coalesce(p.costo_produccion, 0)) / vd.precio * 100, 2)
    else null
  end as margen_pct
from public.venta_detalles vd
join public.ventas v on v.id = vd.venta_id
join public.productos p on p.id = vd.producto_id
left join public.categorias c on c.id = p.categoria_id
where v.estado <> 'anulada'
  and public.fn_rol_actual() in ('admin','coordinador','contabilidad');

grant select on public.vw_margen_producto to authenticated;
revoke all on public.vw_margen_producto from anon;

-- Inventario valorizado — capital inmovilizado y piezas sin
-- movimiento, por tienda (el CEDI es una tienda tipo 'cedi')
create view public.vw_inventario_valorizado as
select
  p.tienda_id, t.nombre as tienda, t.tipo as tienda_tipo,
  count(*) as piezas,
  sum(coalesce(p.costo_produccion, 0)) as capital_inmovilizado,
  sum(coalesce(p.precio_venta, 0)) as valor_venta_potencial,
  count(*) filter (
    where coalesce(p.fecha_actualizacion, p.fecha_creacion) < now() - interval '60 days'
  ) as piezas_sin_movimiento_60d
from public.productos p
left join public.tiendas t on t.id = p.tienda_id
where p.activo and p.estado in ('disponible_cedi', 'disponible_tienda')
  and public.fn_rol_actual() in ('admin','coordinador','contabilidad')
group by p.tienda_id, t.nombre, t.tipo;

grant select on public.vw_inventario_valorizado to authenticated;
revoke all on public.vw_inventario_valorizado from anon;

-- Red comercial — actividad del período en curso (calendario
-- mensual, igual criterio que fn_obtener_periodo_actual)
create view public.vw_red_comercial as
select
  u.id as usuario_id, u.nombre, r.nombre as rol, u.tienda_id, t.nombre as tienda,
  coalesce(vt.total_ventas, 0) as ventas_periodo,
  coalesce(vt.num_ventas, 0) as num_ventas_periodo,
  (coalesce(vt.num_ventas, 0) > 0) as activo_periodo
from public.usuarios u
join public.roles r on r.id = u.rol_id
left join public.tiendas t on t.id = u.tienda_id
left join lateral (
  select sum(v.total) as total_ventas, count(*) as num_ventas
    from public.ventas v
    where v.vendedor_id = u.id and v.estado <> 'anulada'
      and v.fecha_creacion >= date_trunc('month', now())
      and v.fecha_creacion < date_trunc('month', now()) + interval '1 month'
) vt on true
where u.activo and r.nombre in ('supervisor','asesor','embajador','tienda')
  and public.fn_rol_actual() in ('admin','coordinador');

grant select on public.vw_red_comercial to authenticated;
revoke all on public.vw_red_comercial from anon;
