-- ============================================================
-- ASTRO — Proveedores robustos (Fase C de "formularios nivel
-- Odoo/SAP"). Datos financieros/comerciales por defecto que ya no
-- hay que reescribir en cada orden de compra o importación.
-- ============================================================

alter table public.proveedores
  add column banco text,
  add column cuenta_bancaria text,
  add column terminos_pago_default text,
  add column sitio_web text;

-- Verificación
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'proveedores'
  and column_name in ('banco', 'cuenta_bancaria', 'terminos_pago_default', 'sitio_web');
