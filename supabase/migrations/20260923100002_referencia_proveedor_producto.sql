-- ============================================================
-- ASTRO — Referencia Proveedor: cada artículo puede guardar el
-- código/SKU que usa SU proveedor para esa misma pieza, para poder
-- incluirlo al generar una orden de compra y así el proveedor
-- reconoce de inmediato qué artículo le estamos pidiendo.
--
-- productos.proveedor_id ya existía (desde 20260830) pero nunca se
-- usaba en los flujos de compras — se aprovecha aquí también.
-- ============================================================

alter table public.productos
  add column referencia_proveedor text;

comment on column public.productos.referencia_proveedor is
  'Código/SKU que el PROVEEDOR usa para este artículo (no el código interno de ASTRO) — se incluye al generar una orden de compra.';
