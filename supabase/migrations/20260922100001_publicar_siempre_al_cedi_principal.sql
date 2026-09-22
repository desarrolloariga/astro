-- ============================================================
-- ASTRO — "Publicar" en Artículos siempre envía al CEDI, nunca a una
-- bodega. Hasta ahora tiendas.tipo='cedi' se usaba tanto para el CEDI
-- real como para las bodegas del módulo Bodegas (BOVEDA 1/2), así que
-- fn_publicar_producto no tenía forma de distinguir "el CEDI" sin
-- preguntar cuál elegir apenas había más de una activa.
--
-- Se agrega tiendas.es_cedi_principal — marca explícita de cuál fila
-- es el CEDI real (nunca una bodega). fn_publicar_producto ahora
-- ignora p_tienda_destino_id por completo y publica siempre ahí,
-- pase lo que pase con el número de bodegas activas. La firma se deja
-- igual (p_tienda_destino_id sigue existiendo, solo que ya no se usa)
-- para no tener que tocar cada llamador — es más simple y menos
-- riesgoso que quitar el parámetro ahora mismo.
-- ============================================================

alter table public.tiendas
  add column es_cedi_principal boolean not null default false;

-- Solo puede haber un CEDI principal a la vez.
create unique index tiendas_un_cedi_principal
  on public.tiendas (es_cedi_principal)
  where es_cedi_principal;

comment on column public.tiendas.es_cedi_principal is
  'Marca la única fila que es "el CEDI" real — fn_publicar_producto publica siempre aquí. Las bodegas (BOVEDA 1/2, etc.) son tipo=''cedi'' también pero NUNCA llevan esta marca; solo participan en traslados.';

-- Se marca "CEDI Central" como el CEDI principal — es la fila que ya
-- existía desde el inicio del proyecto, antes de que existiera el
-- concepto de bodegas adicionales.
update public.tiendas set es_cedi_principal = true where nombre = 'CEDI Central' and tipo = 'cedi';

-- ------------------------------------------------------------
-- fn_publicar_producto — misma firma. Ya no elige entre bodegas ni
-- exige indicar una: siempre publica en la fila marcada
-- es_cedi_principal, sin importar cuántas bodegas (tipo='cedi') estén
-- activas.
-- ------------------------------------------------------------
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
  v_imagenes int;
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

  if v_producto.modo_inventario = 'por_cantidad'
     and (v_producto.cantidad_inicial is null or v_producto.cantidad_inicial <= 0) then
    raise exception 'Indica la cantidad inicial antes de publicar esta referencia';
  end if;

  select count(*) into v_imagenes
    from public.producto_imagenes where producto_id = p_producto_id;
  if v_imagenes = 0 then
    raise exception 'La pieza necesita al menos una foto para publicarse';
  end if;

  -- Publicar siempre va al CEDI — nunca a una bodega, sin importar lo
  -- que traiga p_tienda_destino_id (se ignora a propósito).
  select id into v_cedi_id from public.tiendas where es_cedi_principal and activo;
  if v_cedi_id is null then
    raise exception 'No hay CEDI principal activo configurado';
  end if;

  -- Snapshot final de precio antes de publicar (RN-05).
  perform public.fn_recalcular_precio_producto(p_producto_id, 'publicacion');

  update public.productos
    set estado = 'disponible_cedi',
        tienda_id = v_cedi_id,
        fecha_publicacion = now()
    where id = p_producto_id;

  if v_producto.modo_inventario = 'por_cantidad' then
    insert into public.inventario_cantidad (producto_id, tienda_id, cantidad_disponible)
    values (p_producto_id, v_cedi_id, v_producto.cantidad_inicial);

    insert into public.movimientos_inventario
      (producto_id, tipo, tienda_destino_id, usuario_id, referencia, cantidad)
    values
      (p_producto_id, 'alta_cedi', v_cedi_id, public.fn_usuario_id(), 'publicacion', v_producto.cantidad_inicial);
  else
    insert into public.movimientos_inventario
      (producto_id, tipo, tienda_destino_id, usuario_id, referencia)
    values
      (p_producto_id, 'alta_cedi', v_cedi_id, public.fn_usuario_id(), 'publicacion');
  end if;
end;
$$;
