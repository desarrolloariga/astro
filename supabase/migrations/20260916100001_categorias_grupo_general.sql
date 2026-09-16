-- ============================================================
-- ASTRO — Categorías auto-creadas desde carga masiva sin grupo
-- específico.
--
-- La carga masiva ya no pide elegir un grupo (Joyería/Ropa/Tecnología)
-- antes de subir el Excel — el motor de precios usa "nivel de
-- ganancia" (ver 20260911100001), no categoría ni grupo. La categoría
-- ahora es puramente el texto de la columna "Categoría" del Excel, y
-- puede no calzar con ninguno de los 3 grupos con ficha técnica
-- especial (joyeria/cosmetico/lenceria) ni con tecnologia.
--
-- Se agrega 'general' como grupo neutro para estas categorías nuevas
-- — no aporta campos de ficha técnica extra en el alta manual
-- (formulario-nueva-pieza no tiene un bloque "general"), lo cual es
-- el comportamiento correcto: no se puede inventar qué campos
-- especiales le corresponden a una categoría de la que solo se
-- conoce el nombre.
-- ============================================================

alter table public.categorias drop constraint categorias_grupo_check;
alter table public.categorias add constraint categorias_grupo_check
  check (grupo in ('joyeria', 'cosmetico', 'lenceria', 'tecnologia', 'general'));

alter table public.categorias alter column grupo set default 'general';
