  -- ============================================================
  -- ASTRO — Entrega desde la ficha de producto.
  --
  --  1. Configuración de entrega (catalogo_config 'entrega'): hora de corte,
  --     dirección y horario del CEDI, franjas, días a ofrecer y días no
  --     laborables. Se edita en Sistema → Configuración del catálogo.
  --  2. Pedido: forma de entrega (domicilio / recoger en CEDI), tipo
  --     (inmediata / programada), fecha y franja. Recoger en CEDI no cobra envío.
  --  3. fn_existencias_red(producto): existencias por punto de la red.
  --  4. fn_entrega_inmediata(ids): piezas con existencia en un CEDI.
  --
  -- El costo del domicilio sigue siendo la política de envío vigente
  -- (tarifa única + envío gratis desde un monto).
  -- ============================================================

  -- ------------------------------------------------------------
  -- 1. Configuración de entrega
  -- ------------------------------------------------------------
  insert into public.catalogo_config (clave, valor) values
    ('entrega', '{
      "hora_corte": "14:00",
      "cedi_direccion": "",
      "cedi_horario": "lunes a viernes de 8:00 a 17:00",
      "dias_programada": 5,
      "dias_laborables": [1, 2, 3, 4, 5, 6],
      "dias_no_laborables": [],
      "franjas": [
        {"id": "am", "etiqueta": "Mañana", "inicio": "8:00", "fin": "12:00"},
        {"id": "pm", "etiqueta": "Tarde", "inicio": "12:00", "fin": "17:00"}
      ],
      "garantia": "",
      "cambios": ""
    }')
  on conflict (clave) do nothing;

  -- ------------------------------------------------------------
  -- 2. Datos de entrega en el pedido
  -- ------------------------------------------------------------
  alter table public.pedidos
    add column if not exists metodo_entrega text not null default 'domicilio'
      check (metodo_entrega in ('domicilio', 'recoger')),
    add column if not exists tipo_entrega text
      check (tipo_entrega in ('inmediata', 'programada')),
    add column if not exists fecha_entrega date,
    add column if not exists franja_entrega text;

  do $$
  declare
    v_firma constant text := 'public.fn_confirmar_carrito_interno(bigint,bigint,text,bigint,bigint,jsonb,jsonb,jsonb,boolean,boolean)';
    v_def text;
    v_par text[];
    v_cambios text[][] := array[
      -- Recoger en CEDI: no exige dirección.
      ['  if v_direccion is null or v_ciudad is null then',
      E'  if coalesce(p_envio->>''metodo_entrega'', ''domicilio'') = ''recoger'' then\n    v_direccion := coalesce(v_direccion, ''Recoge en CEDI'');\n    v_ciudad := coalesce(v_ciudad, ''CEDI'');\n  end if;\n  if v_direccion is null or v_ciudad is null then'],
      -- Recoger en CEDI: sin costo de envío.
      ['  v_total := v_total + coalesce(v_envio, 0);',
      E'  if coalesce(p_envio->>''metodo_entrega'', ''domicilio'') = ''recoger'' then\n    v_envio := 0;\n    v_costo_envio := 0;\n  end if;\n  v_total := v_total + coalesce(v_envio, 0);'],
      -- Se guardan forma, tipo, fecha y franja de entrega.
      ['latitud, longitud, comprador_id)',
      'latitud, longitud, comprador_id, metodo_entrega, tipo_entrega, fecha_entrega, franja_entrega)'],
      -- Línea única en la función ("     p_comprador_id)" cierra el insert del pedido).
    ['     p_comprador_id)',
      E'     p_comprador_id,\n     case when p_envio->>''metodo_entrega'' = ''recoger'' then ''recoger'' else ''domicilio'' end,\n     case when p_envio->>''tipo_entrega'' in (''inmediata'', ''programada'') then p_envio->>''tipo_entrega'' end,\n     case when coalesce(p_envio->>''fecha_entrega'', '''') ~ ''^\\d{4}-\\d{2}-\\d{2}$'' then (p_envio->>''fecha_entrega'')::date end,\n     nullif(btrim(coalesce(p_envio->>''franja_entrega'', '''')), ''''))']
    ];
    i int;
  begin
    v_def := pg_get_functiondef(v_firma::regprocedure);
    for i in 1 .. array_length(v_cambios, 1) loop
      if position(v_cambios[i][1] in v_def) = 0 then
        raise exception 'No se encontró en fn_confirmar_carrito_interno: % — no se aplicó ningún cambio', v_cambios[i][1];
      end if;
      v_def := replace(v_def, v_cambios[i][1], v_cambios[i][2]);
    end loop;
    execute v_def;
  end $$;

  -- ------------------------------------------------------------
  -- 3. Existencias por punto de la red
  -- ------------------------------------------------------------
  create or replace function public.fn_existencias_red(p_producto_id bigint)
  returns table (tienda_id bigint, tienda text, tipo text, cantidad int)
  language sql stable security definer
  set search_path = public
  as $$
    -- Por cantidad: lo disponible en cada bodega/tienda.
    select t.id, t.nombre, t.tipo, ic.cantidad_disponible
    from public.productos p
    join public.inventario_cantidad ic on ic.producto_id = p.id
    join public.tiendas t on t.id = ic.tienda_id and t.activo
    where p.id = p_producto_id and p.modo_inventario = 'por_cantidad'
    union all
    -- Pieza única: está en un solo lugar.
    select t.id, t.nombre, t.tipo,
          case when p.estado in ('disponible_cedi', 'disponible_tienda') then 1 else 0 end
    from public.productos p
    join public.tiendas t on t.id = p.tienda_id
    where p.id = p_producto_id and p.modo_inventario = 'pieza_unica'
    order by 4 desc, 2;
  $$;

  grant execute on function public.fn_existencias_red(bigint) to authenticated;

  -- ------------------------------------------------------------
  -- 4. Piezas con existencia en un CEDI (permiten entrega inmediata)
  -- ------------------------------------------------------------
  create or replace function public.fn_entrega_inmediata(p_producto_ids bigint[])
  returns table (producto_id bigint, ubicacion text)
  language sql stable security definer
  set search_path = public
  as $$
    select distinct on (p.id) p.id, t.nombre
    from public.productos p
    left join public.inventario_cantidad ic on ic.producto_id = p.id and p.modo_inventario = 'por_cantidad'
    join public.tiendas t on t.id = case when p.modo_inventario = 'por_cantidad' then ic.tienda_id else p.tienda_id end
    where p.id = any(p_producto_ids)
      and t.tipo = 'cedi' and t.activo
      and (
        (p.modo_inventario = 'pieza_unica' and p.estado = 'disponible_cedi')
        or (p.modo_inventario = 'por_cantidad' and coalesce(ic.cantidad_disponible, 0) > 0)
      )
    order by p.id, coalesce(ic.cantidad_disponible, 1) desc;
  $$;

  grant execute on function public.fn_entrega_inmediata(bigint[]) to anon, authenticated;

  -- ------------------------------------------------------------
  -- Verificación
  -- ------------------------------------------------------------
  select
    (select count(*) from public.catalogo_config where clave = 'entrega') as config_entrega,
    (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'pedidos'
        and column_name in ('metodo_entrega', 'tipo_entrega', 'fecha_entrega', 'franja_entrega')) as columnas_pedido;
