-- ============================================================
-- ASTRO — Fix: 20260924100003 agregó p_subtotal/p_impuestos a
-- fn_crear_carga_masiva con CREATE OR REPLACE, pero cambiar la lista
-- de parámetros sin DROP FUNCTION primero deja la firma vieja de 4
-- parámetros como una sobrecarga aparte en vez de reemplazarla —
-- Postgres queda con dos funciones fn_crear_carga_masiva
-- indistinguibles al llamarlas con nombres de parámetro (el error
-- "Could not choose the best candidate function" se confirmó en vivo
-- contra la base). Se elimina la sobrecarga vieja explícitamente.
-- ============================================================

drop function if exists public.fn_crear_carga_masiva(text, text, bigint, text);
