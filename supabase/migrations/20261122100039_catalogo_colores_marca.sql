-- ============================================================
-- ASTRO — Rebranding: colores del contenido del catálogo.
--
-- Cambia a la paleta del Manual de Marca (Naranja Astro #F6A637, negro y
-- blanco) solo los colores que venían por defecto con el diseño anterior
-- (azul marino, azules y dorados). Los colores elegidos a mano que no son
-- de esa paleta (por ejemplo, un banner rojo) se respetan.
-- ============================================================

-- Banners y novedades: fondo azul marino → negro; etiqueta dorada → naranja.
update public.catalogo_banners
  set color_fondo = '#000000'
  where lower(color_fondo) in ('#0f2a5c', '#0a1e44', '#123a8c', '#0d1b36', '#1e4fd8');

update public.catalogo_banners
  set color_etiqueta = '#F6A637'
  where lower(color_etiqueta) in ('#f2d58a', '#b2881f', '#e3b341', '#f6e9c4');

update public.catalogo_novedades
  set color_fondo = '#000000'
  where lower(color_fondo) in ('#0f2a5c', '#0a1e44', '#123a8c', '#0d1b36', '#1e4fd8');

-- Promociones laterales (JSON): fondos claros azules o dorados → tinte naranja; botones azules → negro.
update public.catalogo_config c
  set valor = (
    select jsonb_agg(
      p
      || case when lower(p ->> 'color_fondo') in ('#dce6fa', '#e4ecfb', '#e8eef8', '#d7e3f8', '#f6e9c4', '#efe6cf', '#e5ecfb')
              then jsonb_build_object('color_fondo', '#FFF4E3') else '{}'::jsonb end
      || case when lower(p ->> 'color_boton') in ('#0a1e44', '#0f2a5c', '#1e4fd8', '#123a8c', '#0d1b36')
              then jsonb_build_object('color_boton', '#000000') else '{}'::jsonb end
      order by o)
    from jsonb_array_elements(c.valor) with ordinality as e(p, o))
  where c.clave = 'promos_laterales' and jsonb_typeof(c.valor) = 'array' and jsonb_array_length(c.valor) > 0;

-- Verificación
select
  (select count(*) from public.catalogo_banners where lower(color_fondo) in ('#0f2a5c', '#123a8c')) as banners_azules,
  (select count(*) from public.catalogo_novedades where lower(color_fondo) = '#0f2a5c') as novedades_azules;
