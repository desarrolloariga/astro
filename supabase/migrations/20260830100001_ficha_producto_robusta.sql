-- ============================================================
-- ASTRO — Ficha de producto robusta (Fase A de "formularios nivel
-- Odoo/SAP"). Campos adicionales confirmados con el negocio: código
-- de barras/SKU externo, proveedor y punto de reorden, marca/
-- colección/etiquetas.
-- ============================================================

alter table public.productos
  add column codigo_barras text unique,
  add column proveedor_id bigint references public.proveedores (id),
  add column punto_reorden numeric(10,3),
  add column marca text,
  add column coleccion text,
  add column etiquetas text[] not null default '{}';

create index idx_productos_proveedor on public.productos (proveedor_id);
create index idx_productos_etiquetas on public.productos using gin (etiquetas);

-- Verificación
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'productos'
  and column_name in ('codigo_barras', 'proveedor_id', 'punto_reorden', 'marca', 'coleccion', 'etiquetas');
