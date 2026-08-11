-- ============================================================
-- ASTRO — Quita usuarios_tiendas: tabla del esquema original (fase 1)
-- pensada para asignación multi-tienda, pero ninguna pantalla ni
-- función la usó jamás (confirmado por auditoría general 2026-08-10 y
-- decisión del usuario de no construir esa UI). Deuda técnica
-- silenciosa, no dato en uso — se elimina en vez de dejarla huérfana.
-- Sin FKs entrantes de otras tablas; DROP TABLE se lleva RLS/policies.
-- ============================================================

drop table if exists public.usuarios_tiendas;
