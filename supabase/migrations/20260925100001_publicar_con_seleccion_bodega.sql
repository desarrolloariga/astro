-- ============================================================
-- ASTRO — Se retoma el flujo anterior de publicación: crear un
-- artículo ya NO lo publica automáticamente (vuelve a quedar como
-- borrador para poder revisar costos antes), y al publicar (manual,
-- botón aparte) se puede elegir a qué bodega se envía — preseleccionado
-- con el CEDI principal, pero editable a cualquier otra bodega activa
-- (tipo='cedi').
--
-- fn_publicar_producto — misma firma. Si p_tienda_destino_id viene
-- informado, se usa esa bodega (validando que sea un CEDI activo); si
-- no, cae al CEDI principal como antes. Se mantienen las mejoras
-- recientes que el usuario NO pidió revertir: no exige foto, no exige
-- cantidad inicial para por_cantidad (0 unidades es válido).
-- ============================================================

create or replace function public.fn_publicar_producto(
  p_producto_id bigint,
  p_tienda_destino_id bigint default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
  v_cedi_id bigint;
  v_cantidad_inicial int;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if public.fn_rol_actual() not in ('admin', 'produccion') then
    raise exception 'No tienes permiso para publicar piezas';
  end if;

  select * into v_producto from public.productos
    where id = p_producto_id for update;

  if not found then
    raise exception 'La pieza no existe';
  end if;
  if v_producto.estado <> 'en_produccion' then
    raise exception 'Solo se publican piezas en estado en_produccion (actual: %)', v_producto.estado;
  end if;

  if v_producto.nombre is null or v_producto.costo_produccion is null then
    raise exception 'Ficha incompleta: nombre y costo son obligatorios';
  end if;

  -- Cantidad inicial sigue siendo opcional — sin ella, se publica con
  -- 0 unidades disponibles.
  v_cantidad_inicial := coalesce(v_producto.cantidad_inicial, 0);

  if p_tienda_destino_id is not null then
    select id into v_cedi_id from public.tiendas
      where id = p_tienda_destino_id and tipo = 'cedi' and activo;
    if v_cedi_id is null then
      raise exception 'La bodega destino indicada no es un CEDI activo';
    end if;
  else
    select id into v_cedi_id from public.tiendas where es_cedi_principal and activo;
  end if;
  if v_cedi_id is null then
    raise exception 'No hay CEDI principal activo configurado';
  end if;

  perform public.fn_recalcular_precio_producto(p_producto_id, 'publicacion');

  update public.productos
    set estado = 'disponible_cedi',
        tienda_id = v_cedi_id,
        fecha_publicacion = now()
    where id = p_producto_id;

  if v_producto.modo_inventario = 'por_cantidad' then
    insert into public.inventario_cantidad (producto_id, tienda_id, cantidad_disponible)
    values (p_producto_id, v_cedi_id, v_cantidad_inicial);

    insert into public.movimientos_inventario
      (producto_id, tipo, tienda_destino_id, usuario_id, referencia, cantidad)
    values
      (p_producto_id, 'alta_cedi', v_cedi_id, public.fn_usuario_id(), 'publicacion', v_cantidad_inicial);
  else
    insert into public.movimientos_inventario
      (producto_id, tipo, tienda_destino_id, usuario_id, referencia)
    values
      (p_producto_id, 'alta_cedi', v_cedi_id, public.fn_usuario_id(), 'publicacion');
  end if;
end;
$$;
