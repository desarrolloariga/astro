-- ============================================================
-- ASTRO — Una carga masiva con trazabilidad financiera (factura,
-- subtotal, impuestos) ahora también crea una orden de compra REAL en
-- ordenes_compra — ya en estado recibida_total, con una línea por
-- cada artículo cargado (cantidad y costo reales, cantidad_recibida =
-- cantidad completa) — para que aparezca en el Historial de compras
-- (/compras/historial) igual que cualquier orden recibida por el
-- flujo normal. cargas_masivas sigue existiendo como su propio
-- registro (visible en /produccion/carga-masiva/historial); esta
-- orden queda enlazada a ella vía ordenes_compra.carga_masiva_id.
--
-- Como ordenes_compra.proveedor_id es NOT NULL, esta función exige
-- proveedor — el llamador (cargarPiezasMasivo) ya valida que si hay
-- factura/subtotal/impuestos, el proveedor sea obligatorio antes de
-- siquiera intentar esto.
-- ============================================================

alter table public.ordenes_compra
  add column carga_masiva_id bigint references public.cargas_masivas (id);

comment on column public.ordenes_compra.carga_masiva_id is
  'Si esta orden se generó automáticamente desde una carga masiva con trazabilidad, referencia el lote de origen — ver cargas_masivas.';

-- ------------------------------------------------------------
-- fn_crear_orden_compra_recibida_desde_carga_masiva — crea la
-- cabecera ya en recibida_total y una línea por cada producto, todas
-- con cantidad_recibida = cantidad (recepción completa e inmediata,
-- igual que ya hace la propia carga masiva al publicar los artículos
-- al CEDI en el mismo paso). Cada producto queda enlazado a su línea
-- vía compra_detalle_id, igual que una recepción manual.
-- ------------------------------------------------------------
create or replace function public.fn_crear_orden_compra_recibida_desde_carga_masiva(
  p_carga_masiva_id bigint,
  p_proveedor_id bigint,
  p_numero_factura text,
  p_referencia_orden_compra text,
  p_impuestos numeric,
  p_lineas jsonb  -- [{producto_id, cantidad, costo_unitario}, ...]
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_orden_id bigint;
  v_linea jsonb;
  v_producto_id bigint;
  v_cantidad numeric;
  v_costo_unitario numeric;
  v_subtotal_linea numeric;
  v_detalle_id bigint;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if not public.fn_tiene_permiso('compras', 'crear') then
    raise exception 'No tienes permiso para crear órdenes de compra';
  end if;
  if p_proveedor_id is null then
    raise exception 'La orden de compra necesita un proveedor';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'La orden necesita al menos una línea';
  end if;

  insert into public.ordenes_compra
    (proveedor_id, numero_factura_proveedor, referencia_proveedor, estado, impuestos,
     creado_por, autorizado_por, fecha_autorizacion, fecha_recepcion_total, carga_masiva_id)
  values
    (p_proveedor_id, p_numero_factura, p_referencia_orden_compra, 'recibida_total', coalesce(p_impuestos, 0),
     public.fn_usuario_id(), public.fn_usuario_id(), now(), now(), p_carga_masiva_id)
  returning id into v_orden_id;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_producto_id := (v_linea->>'producto_id')::bigint;
    v_cantidad := (v_linea->>'cantidad')::numeric;
    v_costo_unitario := (v_linea->>'costo_unitario')::numeric;
    v_subtotal_linea := v_cantidad * v_costo_unitario;

    insert into public.orden_compra_detalles
      (orden_compra_id, producto_id, descripcion, cantidad, costo_unitario, subtotal, cantidad_recibida)
    values
      (v_orden_id, v_producto_id,
       (select codigo || ' — ' || nombre from public.productos where id = v_producto_id),
       v_cantidad, v_costo_unitario, v_subtotal_linea, v_cantidad)
    returning id into v_detalle_id;

    update public.productos set compra_detalle_id = v_detalle_id where id = v_producto_id;
  end loop;

  update public.ordenes_compra oc
    set subtotal = (select coalesce(sum(subtotal), 0) from public.orden_compra_detalles where orden_compra_id = v_orden_id),
        total = (select coalesce(sum(subtotal), 0) from public.orden_compra_detalles where orden_compra_id = v_orden_id) + oc.impuestos
    where oc.id = v_orden_id;

  return v_orden_id;
end;
$$;
