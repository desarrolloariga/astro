-- ============================================================
-- ASTRO — Catálogos personalizados por enlace.
--
-- Desde /catalogo → "Generar link" el embajador/asesor/tienda/admin
-- arma un catálogo:
--   - catalogo    → completo (todo lo disponible)
--   - filtrado    → parcial por criterios (categorías, materiales,
--                   kilatajes, rango de precio). Se evalúa en vivo:
--                   piezas nuevas que cumplan el criterio aparecen solas.
--   - subconjunto → selección manual de productos
--   - pieza       → una sola pieza (desde la ficha)
-- El enlace queda amarrado a quien lo crea (links_venta.vendedor_id),
-- así toda venta que entre por él se le atribuye.
--
-- Además: nombre del catálogo, vigencia elegible, desactivar un
-- enlace, y fn_resumen_links() con ventas/monto/comisiones por enlace
-- para el módulo de Enlaces.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columnas y tipo
-- ------------------------------------------------------------
alter table public.links_venta
  add column if not exists nombre text,
  add column if not exists filtros jsonb;

do $$
declare
  r record;
begin
  for r in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.links_venta'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%tipo%'
  loop
    execute format('alter table public.links_venta drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.links_venta add constraint links_venta_tipo_check
  check (tipo in ('catalogo','filtrado','subconjunto','pieza'));

-- ------------------------------------------------------------
-- 2. ¿Una pieza forma parte del enlace? (una sola regla para el
-- catálogo público y para agregar al carrito)
-- ------------------------------------------------------------
create or replace function public.fn_link_incluye_producto(p_link_id bigint, p_producto_id bigint)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_link public.links_venta%rowtype;
  v_prod public.productos%rowtype;
  v_f jsonb;
  v_precio numeric;
begin
  select * into v_link from public.links_venta where id = p_link_id;
  if not found then
    return false;
  end if;

  if v_link.tipo = 'catalogo' then
    return true;
  end if;

  if v_link.tipo in ('subconjunto','pieza') then
    return exists (select 1 from public.link_productos
                   where link_id = p_link_id and producto_id = p_producto_id);
  end if;

  -- filtrado
  select * into v_prod from public.productos where id = p_producto_id;
  if not found then
    return false;
  end if;
  v_f := coalesce(v_link.filtros, '{}'::jsonb);
  v_precio := coalesce(v_prod.precio_descuento, v_prod.precio_venta);

  if jsonb_array_length(coalesce(v_f->'categorias', '[]'::jsonb)) > 0
     and not coalesce((v_f->'categorias') @> to_jsonb(v_prod.categoria_id), false) then
    return false;
  end if;
  if jsonb_array_length(coalesce(v_f->'materiales', '[]'::jsonb)) > 0
     and not coalesce((v_f->'materiales') @> to_jsonb(v_prod.material_id), false) then
    return false;
  end if;
  if jsonb_array_length(coalesce(v_f->'kilatajes', '[]'::jsonb)) > 0
     and not (v_f->'kilatajes') @> to_jsonb(coalesce(v_prod.kilataje, '')) then
    return false;
  end if;
  if v_f ? 'precio_min' and jsonb_typeof(v_f->'precio_min') = 'number'
     and coalesce(v_precio, 0) < (v_f->>'precio_min')::numeric then
    return false;
  end if;
  if v_f ? 'precio_max' and jsonb_typeof(v_f->'precio_max') = 'number'
     and coalesce(v_precio, 0) > (v_f->>'precio_max')::numeric then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.fn_link_incluye_producto(bigint, bigint) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. fn_crear_link_venta — firma nueva (DROP para no dejar la vieja
-- como sobrecarga)
-- ------------------------------------------------------------
drop function if exists public.fn_crear_link_venta(text, bigint[]);

create or replace function public.fn_crear_link_venta(
  p_tipo text,
  p_producto_ids bigint[] default null,
  p_nombre text default null,
  p_filtros jsonb default null,
  p_dias_vigencia int default null
)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_link_id bigint;
  v_token text;
  v_dias numeric;
  v_id bigint;
  v_filtros jsonb;
  v_nombre text;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if public.fn_rol_actual() not in ('tienda','asesor','embajador','admin') then
    raise exception 'Tu rol no puede generar enlaces de venta';
  end if;
  if p_tipo not in ('catalogo','filtrado','subconjunto','pieza') then
    raise exception 'Tipo de enlace inválido';
  end if;
  if p_tipo in ('subconjunto','pieza')
     and (p_producto_ids is null or array_length(p_producto_ids, 1) is null) then
    raise exception 'Selecciona al menos una pieza para este tipo de enlace';
  end if;
  if p_tipo = 'pieza' and array_length(p_producto_ids, 1) <> 1 then
    raise exception 'Un enlace de pieza única solo admite una pieza';
  end if;

  if p_tipo = 'filtrado' then
    -- Solo se guardan las claves conocidas, con el tipo correcto.
    v_filtros := jsonb_strip_nulls(jsonb_build_object(
      'categorias', case when jsonb_typeof(p_filtros->'categorias') = 'array'
                           and jsonb_array_length(p_filtros->'categorias') > 0
                         then p_filtros->'categorias' end,
      'materiales', case when jsonb_typeof(p_filtros->'materiales') = 'array'
                           and jsonb_array_length(p_filtros->'materiales') > 0
                         then p_filtros->'materiales' end,
      'kilatajes',  case when jsonb_typeof(p_filtros->'kilatajes') = 'array'
                           and jsonb_array_length(p_filtros->'kilatajes') > 0
                         then p_filtros->'kilatajes' end,
      'precio_min', case when jsonb_typeof(p_filtros->'precio_min') = 'number' then p_filtros->'precio_min' end,
      'precio_max', case when jsonb_typeof(p_filtros->'precio_max') = 'number' then p_filtros->'precio_max' end
    ));
    if v_filtros = '{}'::jsonb then
      raise exception 'Elige al menos un criterio (categoría, material, kilataje o precio) para el catálogo parcial';
    end if;
  end if;

  v_nombre := nullif(btrim(coalesce(p_nombre, '')), '');
  if v_nombre is null then
    v_nombre := case p_tipo
      when 'catalogo' then 'Catálogo completo'
      when 'filtrado' then 'Catálogo parcial'
      when 'subconjunto' then 'Selección de piezas'
      else (select 'Pieza ' || p.codigo from public.productos p where p.id = p_producto_ids[1])
    end;
  end if;

  if p_dias_vigencia is not null and (p_dias_vigencia < 1 or p_dias_vigencia > 365) then
    raise exception 'La vigencia debe estar entre 1 y 365 días';
  end if;
  v_dias := coalesce(p_dias_vigencia::numeric, public.fn_parametro('dias_vigencia_link')::numeric, 7);

  insert into public.links_venta (vendedor_id, tipo, nombre, filtros, fecha_vencimiento)
  values (public.fn_usuario_id(), p_tipo, left(v_nombre, 120), v_filtros, now() + (v_dias || ' days')::interval)
  returning id, token into v_link_id, v_token;

  if p_tipo in ('subconjunto','pieza') then
    foreach v_id in array p_producto_ids loop
      insert into public.link_productos (link_id, producto_id) values (v_link_id, v_id)
      on conflict (link_id, producto_id) do nothing;
    end loop;
  end if;

  return v_token;
end;
$$;

revoke all on function public.fn_crear_link_venta(text, bigint[], text, jsonb, int) from public, anon;
grant execute on function public.fn_crear_link_venta(text, bigint[], text, jsonb, int) to authenticated;

-- ------------------------------------------------------------
-- 4. Desactivar un enlace (dueño o admin)
-- ------------------------------------------------------------
create or replace function public.fn_desactivar_link_venta(p_link_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_link public.links_venta%rowtype;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  select * into v_link from public.links_venta where id = p_link_id for update;
  if not found then
    raise exception 'El enlace no existe';
  end if;
  if v_link.vendedor_id <> public.fn_usuario_id() and public.fn_rol_actual() <> 'admin' then
    raise exception 'Solo quien creó el enlace puede desactivarlo';
  end if;
  update public.links_venta
    set estado = 'desactivado', fecha_actualizacion = now()
    where id = p_link_id;
end;
$$;

grant execute on function public.fn_desactivar_link_venta(bigint) to authenticated;

-- ------------------------------------------------------------
-- 5. fn_link_info — agrega el nombre del catálogo (cambia el
-- return type → DROP + re-grant a anon)
-- ------------------------------------------------------------
drop function if exists public.fn_link_info(text);

create or replace function public.fn_link_info(p_token text)
returns table (vendedor_nombre text, tipo text, vigente boolean, nombre text)
language plpgsql security definer
set search_path = public
as $$
declare
  v_link public.links_venta%rowtype;
begin
  select * into v_link from public.links_venta where token = p_token;

  if not found or v_link.estado <> 'activo'
     or (v_link.fecha_vencimiento is not null and v_link.fecha_vencimiento < now()) then
    return query select null::text, null::text, false, null::text;
    return;
  end if;

  update public.links_venta set contador_visitas = contador_visitas + 1 where id = v_link.id;

  return query
    select u.nombre, v_link.tipo, true, v_link.nombre
    from public.usuarios u where u.id = v_link.vendedor_id;
end;
$$;

grant execute on function public.fn_link_info(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 6. fn_catalogo_por_token — misma firma y return type; ahora
-- respeta los filtros del enlace
-- ------------------------------------------------------------
create or replace function public.fn_catalogo_por_token(p_token text)
returns table (
  id bigint, codigo text, nombre text, descripcion text,
  categoria text, material text, peso_gramos numeric, kilataje text, piedras text,
  precio_venta numeric, imagen_principal text, imagenes jsonb,
  modo_inventario text, stock_disponible int
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_link public.links_venta%rowtype;
begin
  select * into v_link from public.links_venta where token = p_token;
  if not found or v_link.estado <> 'activo'
     or (v_link.fecha_vencimiento is not null and v_link.fecha_vencimiento < now()) then
    raise exception 'Enlace inválido o vencido';
  end if;

  return query
    select
      p.id, p.codigo, p.nombre, p.descripcion,
      c.nombre, m.nombre, p.peso_gramos, p.kilataje, p.piedras,
      coalesce(p.precio_descuento, p.precio_venta),
      (select i.url from public.producto_imagenes i
         where i.producto_id = p.id order by i.es_principal desc, i.orden asc limit 1),
      (select coalesce(jsonb_agg(jsonb_build_object('url', i.url, 'orden', i.orden) order by i.orden), '[]'::jsonb)
         from public.producto_imagenes i where i.producto_id = p.id),
      p.modo_inventario,
      case when p.modo_inventario = 'por_cantidad'
        then coalesce((select ic.cantidad_disponible from public.inventario_cantidad ic
                       where ic.producto_id = p.id and ic.tienda_id = p.tienda_id), 0)
        else null end
    from public.productos p
    left join public.categorias c on c.id = p.categoria_id
    left join public.materiales m on m.id = p.material_id
    where p.activo
      and p.estado in ('disponible_cedi','disponible_tienda')
      and (
        p.modo_inventario = 'pieza_unica'
        or coalesce((select ic.cantidad_disponible from public.inventario_cantidad ic
                     where ic.producto_id = p.id and ic.tienda_id = p.tienda_id), 0) > 0
      )
      and public.fn_link_incluye_producto(v_link.id, p.id);
end;
$$;

grant execute on function public.fn_catalogo_por_token(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 7. fn_agregar_al_carrito — misma firma; usa la regla común
-- ------------------------------------------------------------
create or replace function public.fn_agregar_al_carrito(
  p_token text,
  p_carrito_token text,
  p_producto_id bigint,
  p_cantidad int default 1
)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_link public.links_venta%rowtype;
  v_carrito public.carritos%rowtype;
begin
  select * into v_link from public.links_venta where token = p_token;
  if not found or v_link.estado <> 'activo'
     or (v_link.fecha_vencimiento is not null and v_link.fecha_vencimiento < now()) then
    raise exception 'Enlace inválido o vencido';
  end if;

  if not public.fn_link_incluye_producto(v_link.id, p_producto_id) then
    raise exception 'Esta pieza no forma parte del enlace';
  end if;

  if p_carrito_token is not null then
    select * into v_carrito from public.carritos
      where token = p_carrito_token and link_id = v_link.id and estado = 'abierto'
      for update;
  end if;

  if v_carrito.id is null then
    insert into public.carritos (link_id) values (v_link.id) returning * into v_carrito;
  end if;

  perform public.fn_carrito_reservar_linea(v_carrito.id, p_producto_id, p_cantidad);

  return v_carrito.token;
end;
$$;

grant execute on function public.fn_agregar_al_carrito(text, text, bigint, int) to anon, authenticated;

-- ------------------------------------------------------------
-- 8. Resumen por enlace para el módulo de Enlaces. Misma
-- visibilidad que la RLS de links_venta (propios, red a cargo,
-- admin/coordinador). La comisión "generada" es la que ya está en
-- comisiones para el dueño del enlace; la "estimada" es el % de
-- catálogo sobre las ventas no anuladas (sirve mientras el período
-- no se ha calculado).
-- ------------------------------------------------------------
create or replace function public.fn_resumen_links()
returns table (
  link_id bigint,
  ventas int,
  ventas_pagadas int,
  monto_total numeric,
  monto_pagado numeric,
  comision_pct numeric,
  comision_generada numeric,
  comision_estimada numeric
)
language sql stable security definer
set search_path = public
as $$
  with visibles as (
    select l.* from public.links_venta l
    where public.fn_usuario_id() is not null
      and (
        public.fn_rol_actual() in ('admin','coordinador')
        or l.vendedor_id = public.fn_usuario_id()
        or public.fn_es_mi_descendiente(l.vendedor_id)
      )
  ),
  pct as (
    select (select valor::numeric from public.parametros
            where clave = 'comision_embajador_catalogo_pct_default') as defecto
  ),
  ventas_link as (
    select v.link_id, v.id, v.estado, v.total
    from public.ventas v
    join visibles l on l.id = v.link_id
    where v.estado <> 'anulada'
  )
  select
    l.id,
    count(vl.id)::int,
    count(vl.id) filter (where vl.estado = 'pagada')::int,
    coalesce(sum(vl.total), 0),
    coalesce(sum(vl.total) filter (where vl.estado = 'pagada'), 0),
    coalesce(l.comision_embajador_pct, (select defecto from pct), 0),
    coalesce((select sum(cm.monto) from public.comisiones cm
              join ventas_link v2 on v2.id = cm.venta_id
              where v2.link_id = l.id and cm.usuario_id = l.vendedor_id), 0),
    round(coalesce(sum(vl.total), 0)
          * coalesce(l.comision_embajador_pct, (select defecto from pct), 0) / 100, 2)
  from visibles l
  left join ventas_link vl on vl.link_id = l.id
  group by l.id, l.comision_embajador_pct, l.vendedor_id;
$$;

grant execute on function public.fn_resumen_links() to authenticated;

-- ------------------------------------------------------------
-- Verificación
-- ------------------------------------------------------------
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('fn_crear_link_venta','fn_link_info','fn_catalogo_por_token',
                    'fn_agregar_al_carrito','fn_link_incluye_producto','fn_resumen_links','fn_desactivar_link_venta')
order by 1;
