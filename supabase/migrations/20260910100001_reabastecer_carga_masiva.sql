-- ------------------------------------------------------------
-- Reabastecimiento de inventario desde carga masiva.
--
-- Hasta ahora, si el Excel de carga masiva traía un código que ya
-- existía en productos, el insert fallaba entero por la restricción
-- unique(codigo) (error 23505) — no se cargaba NADA del archivo, sin
-- distinguir esa fila de las demás.
--
-- Ahora, para artículos por_cantidad, un código repetido ya no es un
-- error: la fila deja de intentar crear un producto nuevo y en su
-- lugar suma su "Cantidad" al inventario del producto existente
-- (antes de publicar: productos.cantidad_inicial; ya publicado:
-- inventario_cantidad.cantidad_disponible). Nunca toca nombre, costo,
-- categoría ni ningún otro campo de la ficha existente.
--
-- Para pieza_unica un código repetido sigue siendo un error bloqueante
-- (una "pieza única" duplicada casi siempre es un error de captura) —
-- eso ya se valida en el cliente, esta función solo lo refuerza.
-- ------------------------------------------------------------

create or replace function public.fn_sumar_inventario_producto(
  p_producto_id bigint,
  p_cantidad int,
  p_motivo text default 'carga_masiva'
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
  if public.fn_rol_actual() not in ('admin','produccion') then
    raise exception 'No tienes permiso para reabastecer inventario';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad a reabastecer debe ser mayor a 0';
  end if;

  select * into v_producto from public.productos where id = p_producto_id for update;
  if not found then
    raise exception 'La pieza no existe';
  end if;
  if v_producto.modo_inventario <> 'por_cantidad' then
    raise exception 'Solo se puede reabastecer inventario de artículos por cantidad';
  end if;

  if v_producto.estado = 'en_produccion' then
    -- Todavía no se publica: el stock previsto vive en la propia
    -- fila de productos hasta que fn_publicar_producto lo siembre en
    -- inventario_cantidad.
    update public.productos
      set cantidad_inicial = coalesce(cantidad_inicial, 0) + p_cantidad
      where id = p_producto_id;
  elsif v_producto.estado in ('disponible_cedi','disponible_tienda') then
    update public.inventario_cantidad
      set cantidad_disponible = cantidad_disponible + p_cantidad
      where producto_id = p_producto_id and tienda_id = v_producto.tienda_id;
    if not found then
      raise exception 'No se encontró el inventario vivo de esta referencia';
    end if;

    insert into public.movimientos_inventario
      (producto_id, tipo, tienda_destino_id, usuario_id, referencia, cantidad)
    values
      (p_producto_id, 'ajuste', v_producto.tienda_id, public.fn_usuario_id(), p_motivo, p_cantidad);
  else
    raise exception 'No se puede reabastecer una pieza en estado %', v_producto.estado;
  end if;
end;
$$;
