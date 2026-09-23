-- ============================================================
-- ASTRO — Artículos "por cantidad" ya se pueden crear y publicar sin
-- indicar cantidad inicial: quedan con 0 unidades disponibles en el
-- CEDI, listos para cargarles inventario después desde CEDI/
-- Existencias (fn_sumar_inventario_producto ya soporta sumar sobre un
-- producto publicado con 0 unidades — no hacía falta tocarla).
--
-- fn_publicar_producto — misma firma, se quita la exigencia de
-- cantidad_inicial > 0; cantidad_inicial null se trata como 0 al
-- sembrar inventario_cantidad y el movimiento de alta.
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

  -- Ya no se exige cantidad inicial para publicar una referencia por
  -- cantidad — se puede publicar con 0 unidades y cargar inventario
  -- después desde CEDI/Existencias.
  v_cantidad_inicial := coalesce(v_producto.cantidad_inicial, 0);

  select id into v_cedi_id from public.tiendas where es_cedi_principal and activo;
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
