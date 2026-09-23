-- ============================================================
-- ASTRO — Recepción de orden de compra: al reconfirmar cantidad y
-- costo unitario de una línea, el artículo se publica directo al
-- CEDI (ya no se queda "sin publicar" esperando un paso manual
-- aparte). Toda línea de una orden de compra pasa a requerir un
-- producto real ligado — sin eso no hay qué publicar al recibir.
-- ============================================================

-- ------------------------------------------------------------
-- 1. orden_compra_detalles.producto_id pasa a ser obligatorio.
-- Confirmado (verificación previa) que no hay filas existentes con
-- producto_id nulo, así que el NOT NULL es seguro de aplicar ya.
-- ------------------------------------------------------------
alter table public.orden_compra_detalles
  alter column producto_id set not null;

-- ------------------------------------------------------------
-- 2. fn_agregar_linea_compra — misma firma, ahora exige producto_id.
-- ------------------------------------------------------------
create or replace function public.fn_agregar_linea_compra(
  p_orden_compra_id bigint,
  p_producto_id bigint,
  p_descripcion text,
  p_cantidad numeric,
  p_costo_unitario numeric,
  p_descuento_pct numeric default 0
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_orden public.ordenes_compra%rowtype;
  v_detalle_id bigint;
  v_subtotal numeric;
begin
  if not public.fn_tiene_permiso('compras', 'crear') then
    raise exception 'No tienes permiso para modificar órdenes de compra';
  end if;
  if p_producto_id is null then
    raise exception 'Toda línea de una orden de compra debe ligarse a un artículo';
  end if;

  select * into v_orden from public.ordenes_compra where id = p_orden_compra_id for update;
  if not found then
    raise exception 'La orden de compra no existe';
  end if;
  if v_orden.estado <> 'borrador' then
    raise exception 'Solo se agregan líneas a una orden en borrador (actual: %)', v_orden.estado;
  end if;
  if p_descripcion is null or btrim(p_descripcion) = '' then
    raise exception 'La línea necesita una descripción';
  end if;
  if coalesce(p_descuento_pct, 0) < 0 or coalesce(p_descuento_pct, 0) > 100 then
    raise exception 'El descuento debe estar entre 0 y 100%%';
  end if;

  v_subtotal := p_cantidad * p_costo_unitario * (1 - coalesce(p_descuento_pct, 0) / 100);

  insert into public.orden_compra_detalles (
    orden_compra_id, producto_id, descripcion, cantidad, costo_unitario, descuento_pct, subtotal
  )
  values (
    p_orden_compra_id, p_producto_id, p_descripcion, p_cantidad, p_costo_unitario, coalesce(p_descuento_pct, 0), v_subtotal
  )
  returning id into v_detalle_id;

  update public.ordenes_compra oc
    set subtotal = (select coalesce(sum(subtotal), 0) from public.orden_compra_detalles where orden_compra_id = p_orden_compra_id),
        total = (select coalesce(sum(subtotal), 0) from public.orden_compra_detalles where orden_compra_id = p_orden_compra_id)
    where oc.id = p_orden_compra_id;

  return v_detalle_id;
end;
$$;

-- ------------------------------------------------------------
-- 3. fn_recibir_linea_compra — misma firma. Al reconfirmar cantidad y
-- costo real de la línea:
--   - Siempre actualiza productos.costo_produccion con el costo real
--     confirmado (igual que antes).
--   - Si el producto sigue en_produccion (primera recepción de esta
--     línea): fija cantidad_inicial a lo recibido hasta ahora (si es
--     por_cantidad) y publica al CEDI principal vía
--     fn_publicar_producto — esto siembra inventario_cantidad con esa
--     cantidad.
--   - Si el producto ya está publicado (una recepción posterior de la
--     misma línea, en varias entregas parciales): para por_cantidad
--     se SUMA lo recibido ahora directo a inventario_cantidad del
--     CEDI principal; pieza_unica no admite una segunda recepción
--     (cantidad de la línea es 1, ya se agotó con la primera).
-- ------------------------------------------------------------
create or replace function public.fn_recibir_linea_compra(
  p_detalle_id bigint,
  p_cantidad_recibida numeric,
  p_costo_unitario_real numeric default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_detalle public.orden_compra_detalles%rowtype;
  v_orden public.ordenes_compra%rowtype;
  v_producto public.productos%rowtype;
  v_costo_real numeric;
  v_pendientes int;
  v_cedi_id bigint;
begin
  if not public.fn_tiene_permiso('compras', 'recibir') then
    raise exception 'No tienes permiso para recibir mercadería';
  end if;
  if p_cantidad_recibida is null or p_cantidad_recibida <= 0 then
    raise exception 'La cantidad recibida debe ser mayor a 0';
  end if;

  select * into v_detalle from public.orden_compra_detalles where id = p_detalle_id for update;
  if not found then
    raise exception 'La línea de compra no existe';
  end if;

  select * into v_orden from public.ordenes_compra where id = v_detalle.orden_compra_id for update;
  if v_orden.estado not in ('autorizada', 'recibida_parcial') then
    raise exception 'Solo se recibe mercadería de una orden autorizada (actual: %)', v_orden.estado;
  end if;
  if v_detalle.cantidad_recibida + p_cantidad_recibida > v_detalle.cantidad then
    raise exception 'Esa cantidad excede lo pendiente de recibir en esta línea';
  end if;

  update public.orden_compra_detalles
    set cantidad_recibida = cantidad_recibida + p_cantidad_recibida
    where id = p_detalle_id;

  select * into v_producto from public.productos where id = v_detalle.producto_id for update;

  v_costo_real := coalesce(p_costo_unitario_real, v_detalle.costo_unitario);
  update public.productos
    set costo_produccion = v_costo_real,
        compra_detalle_id = p_detalle_id
    where id = v_detalle.producto_id;

  if v_producto.estado = 'en_produccion' then
    if v_producto.modo_inventario = 'por_cantidad' then
      update public.productos
        set cantidad_inicial = v_detalle.cantidad_recibida + p_cantidad_recibida
        where id = v_detalle.producto_id;
    end if;
    perform public.fn_publicar_producto(v_detalle.producto_id);
  elsif v_producto.modo_inventario = 'por_cantidad' then
    -- Recepción parcial posterior: el producto ya está publicado —
    -- se suma directo al CEDI principal en vez de volver a publicar.
    select id into v_cedi_id from public.tiendas where es_cedi_principal and activo;
    if v_cedi_id is null then
      raise exception 'No hay CEDI principal activo configurado';
    end if;
    insert into public.inventario_cantidad (producto_id, tienda_id, cantidad_disponible)
    values (v_detalle.producto_id, v_cedi_id, p_cantidad_recibida)
    on conflict (producto_id, tienda_id)
      do update set cantidad_disponible = public.inventario_cantidad.cantidad_disponible + excluded.cantidad_disponible;
    insert into public.movimientos_inventario
      (producto_id, tipo, tienda_destino_id, usuario_id, referencia, cantidad)
    values
      (v_detalle.producto_id, 'alta_cedi', v_cedi_id, public.fn_usuario_id(), 'recepcion_compra:' || p_detalle_id, p_cantidad_recibida);
    perform public.fn_recalcular_precio_producto(v_detalle.producto_id, 'recepcion_compra');
  else
    -- pieza_unica ya publicada: solo se actualizó el costo arriba, no
    -- hay cantidad que sumar (una unidad física, ya está en el CEDI).
    perform public.fn_recalcular_precio_producto(v_detalle.producto_id, 'recepcion_compra');
  end if;

  select count(*) into v_pendientes
    from public.orden_compra_detalles
    where orden_compra_id = v_orden.id and cantidad_recibida < cantidad;

  if v_pendientes = 0 then
    update public.ordenes_compra
      set estado = 'recibida_total', fecha_recepcion_total = now()
      where id = v_orden.id;
  else
    update public.ordenes_compra set estado = 'recibida_parcial' where id = v_orden.id;
  end if;
end;
$$;
