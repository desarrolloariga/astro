-- ============================================================
-- ASTRO — Configuración del catálogo (contenido comercial editable).
--
-- Todo lo visual del catálogo nuevo se administra desde Sistema →
-- Configuración del catálogo, sin tocar código:
--   - catalogo_anuncios   barra superior que rota
--   - catalogo_banners    carrusel principal
--   - catalogo_novedades  popup / campana de novedades
--   - catalogo_config     bloques fijos (promos laterales, beneficios,
--                         oferta relámpago, banda de link, pie, general)
--   - categorias          imagen y color de la tarjeta en el catálogo
-- Cada elemento tiene audiencia: 'todos', 'backoffice' (embajadores y
-- equipo) o 'publico' (clientes por link).
--
-- Lectura abierta (también anon: el catálogo público la usa). Escritura
-- solo con el permiso catalogo.configurar (admin y coordinador).
--
-- Además: fn_catalogo_meta(ids) con fecha de publicación (marca
-- "Nuevo"), precio de lista (oferta) y unidades vendidas (más vendidos).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Permiso
-- ------------------------------------------------------------
insert into public.permisos (modulo, accion, descripcion) values
  ('catalogo', 'configurar', 'Configurar banners, novedades y contenido visual del catálogo')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values ('admin', 'catalogo', 'configurar'), ('coordinador', 'catalogo', 'configurar')) as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

-- ------------------------------------------------------------
-- 2. Tablas de contenido
-- ------------------------------------------------------------
create table public.catalogo_anuncios (
  id bigint generated always as identity primary key,
  texto text not null,
  audiencia text not null default 'todos' check (audiencia in ('todos', 'backoffice', 'publico')),
  orden int not null default 0,
  activo boolean not null default true,
  fecha_inicio date,
  fecha_fin date,
  fecha_creacion timestamptz not null default now()
);

create table public.catalogo_banners (
  id bigint generated always as identity primary key,
  etiqueta text,
  titulo text not null,
  texto text,
  cta_texto text,
  cta_tipo text not null default 'todo' check (cta_tipo in ('todo', 'categoria', 'ofertas', 'generar_link', 'url')),
  cta_valor text,                                    -- id de categoría o URL
  imagen_url text,
  color_fondo text not null default '#0F2A5C',
  color_etiqueta text not null default '#F2D58A',
  audiencia text not null default 'todos' check (audiencia in ('todos', 'backoffice', 'publico')),
  orden int not null default 0,
  activo boolean not null default true,
  fecha_inicio date,
  fecha_fin date,
  fecha_creacion timestamptz not null default now()
);

create table public.catalogo_novedades (
  id bigint generated always as identity primary key,
  etiqueta text,
  titulo text not null,
  texto text,
  cta_texto text,
  cta_tipo text not null default 'todo' check (cta_tipo in ('todo', 'categoria', 'ofertas', 'generar_link', 'url')),
  cta_valor text,
  imagen_url text,
  color_fondo text not null default '#0F2A5C',
  audiencia text not null default 'todos' check (audiencia in ('todos', 'backoffice', 'publico')),
  orden int not null default 0,
  activo boolean not null default true,
  fecha_inicio date,
  fecha_fin date,
  fecha_creacion timestamptz not null default now()
);

create table public.catalogo_config (
  clave text primary key,
  valor jsonb not null,
  fecha_actualizacion timestamptz not null default now(),
  actualizado_por bigint references public.usuarios (id)
);

alter table public.categorias
  add column if not exists imagen_catalogo text,
  add column if not exists color_catalogo text;

-- Auditoría
create trigger trg_auditar_catalogo_anuncios after insert or update or delete on public.catalogo_anuncios
  for each row execute function public.fn_auditar();
create trigger trg_auditar_catalogo_banners after insert or update or delete on public.catalogo_banners
  for each row execute function public.fn_auditar();
create trigger trg_auditar_catalogo_novedades after insert or update or delete on public.catalogo_novedades
  for each row execute function public.fn_auditar();

-- ------------------------------------------------------------
-- 3. RLS: lectura para todos, escritura con permiso
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['catalogo_anuncios', 'catalogo_banners', 'catalogo_novedades', 'catalogo_config'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy sel_%1$s on public.%1$I for select to anon, authenticated using (true)', t);
    execute format('create policy ins_%1$s on public.%1$I for insert to authenticated with check (public.fn_tiene_permiso(''catalogo'', ''configurar''))', t);
    execute format('create policy upd_%1$s on public.%1$I for update to authenticated using (public.fn_tiene_permiso(''catalogo'', ''configurar'')) with check (public.fn_tiene_permiso(''catalogo'', ''configurar''))', t);
    execute format('create policy del_%1$s on public.%1$I for delete to authenticated using (public.fn_tiene_permiso(''catalogo'', ''configurar''))', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Imagen y color de categoría: se editan con una función (la tabla
-- categorias tiene su propia administración y RLS).
create or replace function public.fn_guardar_estilo_categoria(p_categoria_id bigint, p_imagen text, p_color text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('catalogo', 'configurar') then
    raise exception 'No tienes permiso para configurar el catálogo';
  end if;
  update public.categorias
    set imagen_catalogo = nullif(btrim(coalesce(p_imagen, '')), ''),
        color_catalogo = nullif(btrim(coalesce(p_color, '')), '')
    where id = p_categoria_id;
end;
$$;

grant execute on function public.fn_guardar_estilo_categoria(bigint, text, text) to authenticated;

-- Estilo de categorías para el catálogo (también anon).
create or replace function public.fn_categorias_catalogo()
returns table (id bigint, nombre text, orden int, imagen_catalogo text, color_catalogo text)
language sql stable security definer
set search_path = public
as $$
  select id, nombre, orden, imagen_catalogo, color_catalogo from public.categorias where activo;
$$;

grant execute on function public.fn_categorias_catalogo() to anon, authenticated;

-- ------------------------------------------------------------
-- 4. Imágenes: bucket público
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('astro-catalogo', 'astro-catalogo', true)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 5. Datos extra por producto para el catálogo
-- ------------------------------------------------------------
create or replace function public.fn_catalogo_meta(p_producto_ids bigint[], p_dias_vendidos int default 90)
returns table (producto_id bigint, fecha_publicacion timestamptz, precio_lista numeric, en_descuento boolean, vendidos int)
language sql stable security definer
set search_path = public
as $$
  select
    p.id,
    coalesce(p.fecha_publicacion, p.fecha_creacion),
    p.precio_venta,
    p.precio_descuento is not null and p.precio_descuento < p.precio_venta,
    coalesce((
      select sum(vd.cantidad)::int
      from public.venta_detalles vd
      join public.ventas v on v.id = vd.venta_id
      where vd.producto_id = p.id and v.estado <> 'anulada'
        and v.fecha_creacion >= now() - make_interval(days => greatest(coalesce(p_dias_vendidos, 90), 1))
    ), 0)
  from public.productos p
  where p.id = any(p_producto_ids);
$$;

grant execute on function public.fn_catalogo_meta(bigint[], int) to anon, authenticated;

-- ------------------------------------------------------------
-- 6. Contenido inicial (editable después)
-- ------------------------------------------------------------
insert into public.catalogo_anuncios (texto, audiencia, orden) values
  ('Precios de embajador exclusivos en todo el catálogo', 'backoffice', 1),
  ('Comparte tu catálogo con un link y gana por cada venta', 'backoffice', 2),
  ('Nuevas piezas y ofertas cada semana', 'todos', 3),
  ('Envíos a todo el país', 'publico', 4);

insert into public.catalogo_banners (etiqueta, titulo, texto, cta_texto, cta_tipo, color_fondo, color_etiqueta, orden) values
  ('Nueva temporada', 'Piezas que se quedan en la memoria', 'Lo más nuevo de la colección, listo para ti o para tus clientes.', 'Ver catálogo', 'todo', '#0F2A5C', '#F2D58A', 1),
  ('Oferta de la semana', 'Precios especiales en piezas seleccionadas', 'Aprovecha por tiempo limitado en todo el catálogo.', 'Ver ofertas', 'ofertas', '#123A8C', '#F2D58A', 2);

insert into public.catalogo_novedades (etiqueta, titulo, texto, cta_texto, cta_tipo, audiencia, orden) values
  ('Nueva función', 'Comparte el catálogo con tus clientes', 'Genera un link del catálogo completo, de una categoría o de piezas puntuales. Cada pedido queda asociado a ti.', 'Generar link', 'generar_link', 'backoffice', 1),
  ('Ofertas', 'Ofertas cada semana', 'Revisa la sección de ofertas para no perderte los precios especiales.', 'Ver ofertas', 'ofertas', 'todos', 2);

insert into public.catalogo_config (clave, valor) values
  ('general', '{"marca": "ASTRO", "subtitulo": "Catálogo", "dias_nuevo": 15, "popup_novedades": true}'),
  ('promos_laterales', '[
     {"etiqueta": "Temporada de regalos", "titulo": "Arma tu set de regalo", "cta_texto": "Ver catálogo", "cta_tipo": "todo", "cta_valor": null, "color_fondo": "#F6E9C4", "color_boton": "#0A1E44", "imagen_url": null, "icono": "gift", "audiencia": "todos"},
     {"etiqueta": "Para embajadores", "titulo": "Comparte tu catálogo y vende más", "cta_texto": "Generar mi link", "cta_tipo": "generar_link", "cta_valor": null, "color_fondo": "#DCE6FA", "color_boton": "#1E4FD8", "imagen_url": null, "icono": "link", "audiencia": "backoffice"},
     {"etiqueta": "Ofertas", "titulo": "Precios especiales esta semana", "cta_texto": "Ver ofertas", "cta_tipo": "ofertas", "cta_valor": null, "color_fondo": "#DCE6FA", "color_boton": "#1E4FD8", "imagen_url": null, "icono": "tag", "audiencia": "publico"}
   ]'),
  ('beneficios', '[
     {"icono": "tag", "titulo": "Precio de embajador", "texto": "Ahorra en lo que compras para ti", "audiencia": "backoffice"},
     {"icono": "link", "titulo": "Link para tus clientes", "texto": "Comparte el catálogo en un clic", "audiencia": "backoffice"},
     {"icono": "pulse", "titulo": "Inventario en tiempo real", "texto": "Disponibilidad de toda la red", "audiencia": "todos"},
     {"icono": "sparkle", "titulo": "Novedades cada semana", "texto": "Nuevas piezas y ofertas", "audiencia": "todos"},
     {"icono": "truck", "titulo": "Envíos a todo el país", "texto": "Recibe tu pedido en casa", "audiencia": "publico"},
     {"icono": "shield", "titulo": "Compra segura", "texto": "Pago por transferencia o depósito", "audiencia": "publico"}
   ]'),
  ('oferta_relampago', '{"activa": false, "titulo": "Ofertas relámpago", "subtitulo": "Precios especiales por tiempo limitado.", "fecha_fin": null}'),
  ('banda_link', '{"activa": true, "titulo": "Tus clientes compran desde tu link", "texto": "Genera un link del catálogo completo, de una categoría o de piezas puntuales. Cada pedido queda asociado a ti.", "cta_texto": "Generar link ahora"}'),
  ('pie', '{"descripcion": "Catálogo en línea para embajadores y sus clientes.", "columnas": [{"titulo": "Ayuda", "enlaces": ["Cómo comprar", "Envíos y entregas", "Cambios y devoluciones"]}], "telefono": "", "correo": "", "direccion": ""}')
on conflict (clave) do nothing;

-- ------------------------------------------------------------
-- Verificación
-- ------------------------------------------------------------
select (select count(*) from public.catalogo_anuncios) as anuncios,
       (select count(*) from public.catalogo_banners) as banners,
       (select count(*) from public.catalogo_novedades) as novedades,
       (select count(*) from public.catalogo_config) as bloques_config;
