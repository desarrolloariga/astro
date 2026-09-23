  -- ============================================================
  -- ASTRO — Artículos: al crear un producto ya no hay paso de
  -- "borrador" ni botón "Publicar" — pasa siempre y automáticamente a
  -- disponible_cedi (en el CEDI principal, ver 20260922100001). Las
  -- fotos ya no son requisito para publicar: se suben después, desde el
  -- módulo de Traslados (que ya lista productos por bodega).
  --
  -- Cambios:
  --   1) fn_publicar_producto — se quita la exigencia de al menos una
  --      foto. Misma firma, mismo resto de validaciones (nombre, costo,
  --      cantidad inicial si es por_cantidad).
  --   2) ins_producto_imagenes / del_producto_imagenes — producción
  --      podía subir/borrar fotos de SU producto solo mientras seguía
  --      en_produccion (borrador). Como ahora un producto nunca queda
  --      en ese estado, se amplía para que produccion pueda gestionar
  --      fotos de sus propios productos en cualquier estado publicado
  --      (disponible_cedi/disponible_tienda) también — no solo
  --      en_produccion, que se deja por si algún día vuelve a usarse
  --      (p. ej. carga masiva, que sigue dejando borradores).
  -- ============================================================

  drop function if exists public.fn_publicar_producto(bigint, bigint);

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

    -- Ya no se exige foto para publicar — se puede agregar después
    -- desde Traslados, sin bloquear la disponibilidad del artículo.

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

  -- ------------------------------------------------------------
  -- Fotos: producción puede subir/borrar fotos de sus propios
  -- productos ya publicados, no solo mientras eran borrador.
  -- ------------------------------------------------------------
  drop policy if exists ins_producto_imagenes on public.producto_imagenes;
  create policy ins_producto_imagenes on public.producto_imagenes
    for insert to authenticated
    with check (
      public.fn_rol_actual() = 'admin'
      or (public.fn_rol_actual() = 'produccion'
          and exists (select 1 from public.productos p
                      where p.id = producto_id
                        and p.creado_por = public.fn_usuario_id()
                        and p.estado in ('en_produccion','disponible_cedi','disponible_tienda')))
    );

  drop policy if exists del_producto_imagenes on public.producto_imagenes;
  create policy del_producto_imagenes on public.producto_imagenes
    for delete to authenticated
    using (
      public.fn_rol_actual() = 'admin'
      or (public.fn_rol_actual() = 'produccion'
          and exists (select 1 from public.productos p
                      where p.id = producto_id
                        and p.creado_por = public.fn_usuario_id()
                        and p.estado in ('en_produccion','disponible_cedi','disponible_tienda')))
    );
