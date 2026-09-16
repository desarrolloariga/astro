-- ============================================================
-- ASTRO — codigo y codigo_barras dejan de ser únicos "para siempre" y
-- pasan a ser únicos solo entre productos ACTIVOS.
--
-- Causa raíz de "uno o más códigos de barras ya existen" en carga
-- masiva incluso cuando el código no aparecía en ningún producto
-- visible: fn_eliminar_producto_borrador (soft-delete, activo=false)
-- no libera el código ni el código de barras, porque el unique
-- constraint original era plano (sin condición), sin importar
-- activo. Un producto eliminado seguía "reservando" su código para
-- siempre, y la carga masiva solo compara contra productos con
-- activo=true — por eso el archivo se veía limpio en la
-- previsualización pero el insert fallaba igual.
--
-- Con un índice único PARCIAL (unique ... where activo), eliminar un
-- borrador ahora sí libera su código para reutilizarse.
-- ============================================================

do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.productos'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%(codigo)%'
  loop
    execute format('alter table public.productos drop constraint %I', r.conname);
  end loop;

  for r in
    select conname from pg_constraint
    where conrelid = 'public.productos'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%(codigo_barras)%'
  loop
    execute format('alter table public.productos drop constraint %I', r.conname);
  end loop;
end $$;

create unique index if not exists productos_codigo_activo_key
  on public.productos (codigo) where activo;

create unique index if not exists productos_codigo_barras_activo_key
  on public.productos (codigo_barras) where activo;
