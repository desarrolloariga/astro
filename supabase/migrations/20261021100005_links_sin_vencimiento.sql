-- ============================================================
-- ASTRO — Enlaces de catálogo sin vencimiento.
--
-- fn_crear_link_venta acepta p_dias_vigencia = 0 → el enlace queda
-- con fecha_vencimiento null y nunca vence (fn_link_info,
-- fn_catalogo_por_token y el carrito ya tratan null como vigente).
-- Misma firma: CREATE OR REPLACE no genera sobrecarga.
-- ============================================================

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

  -- p_dias_vigencia = 0 → el enlace nunca vence (fecha_vencimiento null)
  if p_dias_vigencia is not null and (p_dias_vigencia < 0 or p_dias_vigencia > 365) then
    raise exception 'La vigencia debe estar entre 1 y 365 días, o 0 para que no venza';
  end if;
  v_dias := case when p_dias_vigencia = 0 then null
                 else coalesce(p_dias_vigencia::numeric, public.fn_parametro('dias_vigencia_link')::numeric, 7) end;

  insert into public.links_venta (vendedor_id, tipo, nombre, filtros, fecha_vencimiento)
  values (public.fn_usuario_id(), p_tipo, left(v_nombre, 120), v_filtros, case when v_dias is null then null else now() + (v_dias || ' days')::interval end)
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

-- Verificación: debe salir una sola fila
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_crear_link_venta';
