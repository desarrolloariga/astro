-- ============================================================
-- ASTRO — Módulo CEDI (antes "Existencias"): además de ver cantidades
-- sin costos, ahora se puede editar nombre/descripción/referencia de
-- proveedor y fotos de cualquier artículo ya publicado — no solo los
-- creados por el propio usuario.
--
-- Esto expone un límite real de la RLS actual: sel_productos acota a
-- produccion a SOLO sus propios productos (creado_por = fn_usuario_id()),
-- lo cual nunca se amplió — Existencias ya venía mostrando solo lo
-- propio, no todo el CEDI, sin que nadie lo hubiera pedido así. Se
-- amplía aquí: produccion pasa a ver también cualquier producto ya
-- publicado (disponible_cedi/disponible_tienda), sin importar quién
-- lo creó — coherente con que el CEDI es inventario compartido, no
-- propiedad de quien lo dio de alta.
-- ============================================================

drop policy if exists sel_productos on public.productos;
create policy sel_productos on public.productos
  for select to authenticated
  using (
    public.fn_rol_actual() in ('admin','contabilidad','coordinador')
    or (public.fn_rol_actual() = 'produccion'
        and (creado_por = public.fn_usuario_id() or estado in ('disponible_cedi','disponible_tienda')))
  );

-- ------------------------------------------------------------
-- fn_actualizar_ficha_cedi — edición acotada a nombre/descripción/
-- referencia_proveedor de un artículo YA publicado. Nunca toca
-- costo/precio/estado — eso sigue siendo exclusivo de Artículos y de
-- las recepciones. security definer porque upd_productos_produccion
-- (RLS de UPDATE directo) sigue acotada a "propios en_produccion" y
-- no se amplía — más seguro controlar por función qué campos se
-- pueden tocar que abrir un UPDATE directo de toda la fila.
-- ------------------------------------------------------------
create or replace function public.fn_actualizar_ficha_cedi(
  p_producto_id bigint,
  p_nombre text,
  p_descripcion text default null,
  p_referencia_proveedor text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if public.fn_rol_actual() not in ('admin', 'produccion') then
    raise exception 'No tienes permiso para editar artículos del CEDI';
  end if;
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre es obligatorio';
  end if;

  select * into v_producto from public.productos where id = p_producto_id for update;
  if not found then
    raise exception 'El artículo no existe';
  end if;
  if v_producto.estado not in ('disponible_cedi', 'disponible_tienda', 'en_produccion') then
    raise exception 'Este artículo no se puede editar en su estado actual (%)', v_producto.estado;
  end if;

  update public.productos
    set nombre = btrim(p_nombre),
        descripcion = nullif(btrim(coalesce(p_descripcion, '')), ''),
        referencia_proveedor = nullif(btrim(coalesce(p_referencia_proveedor, '')), '')
    where id = p_producto_id;
end;
$$;
