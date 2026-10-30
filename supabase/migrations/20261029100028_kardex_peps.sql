-- ============================================================
-- ASTRO — Inventario (fase 3a): Kardex valorizado con método PEPS
-- (primeras entradas, primeras salidas — Art. 41 Ley de Actualización
-- Tributaria) y correcciones de inventario.
--
--   capas_inventario     cada entrada abre una capa (cantidad + costo);
--                        cada salida consume las capas más antiguas.
--   kardex_movimientos   libro valorizado por producto: entrada/salida,
--                        costo unitario, total y saldo corrido.
--
-- Entradas automáticas:
--   * alta de producto (publicación) y recepciones de compra posteriores
--     (movimientos_inventario 'alta_cedi'), al costo de la pieza
--   * sumas de existencias ('ajuste')
--   * devolución por anulación de venta, al mismo costo con que salió
-- Salidas automáticas:
--   * cada línea de venta: consume capas PEPS y CONGELA ese costo en
--     venta_detalles.costo_unitario (lo usan el estado de resultados y
--     la partida de costo de ventas)
-- Los traslados entre bodegas no cambian el valor (el Kardex es por
-- producto para toda la empresa; la bodega queda como referencia).
--
-- Correcciones:
--   * fn_anular_venta devuelve las unidades de productos por cantidad y
--     registra la cantidad real devuelta
--   * fn_confirmar_recepcion_traslado ya no falla con piezas únicas
--     (insertaba cantidad NULL)
--   * vw_inventario_valorizado y el histórico diario cuentan todas las
--     bodegas (antes solo la bodega base del producto)
-- Requiere 022–027.
-- ============================================================

create table public.capas_inventario (
  id bigint generated always as identity primary key,
  producto_id bigint not null references public.productos (id),
  fecha timestamptz not null default now(),
  cantidad_inicial numeric(14,3) not null check (cantidad_inicial > 0),
  cantidad_restante numeric(14,3) not null check (cantidad_restante >= 0),
  costo_unitario numeric(14,4) not null check (costo_unitario >= 0),
  kardex_id bigint
);
create index idx_capas_inventario_vigentes on public.capas_inventario (producto_id, fecha, id) where cantidad_restante > 0;

create table public.kardex_movimientos (
  id bigint generated always as identity primary key,
  producto_id bigint not null references public.productos (id),
  fecha timestamptz not null default now(),
  tipo text not null check (tipo in (
    'saldo_inicial', 'entrada_alta', 'entrada_compra', 'entrada_ajuste', 'devolucion_venta', 'sobrante_toma',
    'salida_venta', 'faltante_toma')),
  documento_tipo text not null,
  documento_id bigint,
  documento_ref text,
  tienda_id bigint references public.tiendas (id),
  cantidad numeric(14,3) not null check (cantidad <> 0),
  costo_unitario numeric(14,4) not null,
  costo_total numeric(14,2) not null,
  saldo_cantidad numeric(14,3) not null,
  saldo_valor numeric(14,2) not null,
  sin_capa numeric(14,3) not null default 0,
  capas jsonb,
  venta_detalle_id bigint,
  usuario_id bigint references public.usuarios (id)
);
create index idx_kardex_producto on public.kardex_movimientos (producto_id, id);
create index idx_kardex_fecha on public.kardex_movimientos (fecha);
create unique index uq_kardex_venta_detalle on public.kardex_movimientos (venta_detalle_id, tipo) where venta_detalle_id is not null;

alter table public.capas_inventario enable row level security;
alter table public.kardex_movimientos enable row level security;
create policy sel_capas_inventario on public.capas_inventario for select to authenticated
  using ((select public.fn_tiene_permiso('contabilidad', 'ver')) or (select public.fn_tiene_permiso('finanzas', 'ver')));
create policy sel_kardex_movimientos on public.kardex_movimientos for select to authenticated
  using ((select public.fn_tiene_permiso('contabilidad', 'ver')) or (select public.fn_tiene_permiso('finanzas', 'ver')));
grant select on public.capas_inventario, public.kardex_movimientos to authenticated;

-- ------------------------------------------------------------
-- 1. Motor PEPS
-- ------------------------------------------------------------
-- Entrada: abre una capa y registra el movimiento.
create or replace function public.fn_kdx_entrada(
  p_producto_id bigint, p_cantidad numeric, p_costo_unitario numeric, p_tipo text,
  p_documento_tipo text, p_documento_id bigint, p_documento_ref text, p_tienda_id bigint,
  p_venta_detalle_id bigint default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_costo numeric := round(greatest(coalesce(p_costo_unitario, 0), 0), 4);
  v_total numeric;
  v_saldo_cant numeric;
  v_saldo_valor numeric;
  v_kardex bigint;
begin
  if coalesce(p_cantidad, 0) <= 0 then
    return null;
  end if;
  perform pg_advisory_xact_lock(4521, p_producto_id::int);
  v_total := round(p_cantidad * v_costo, 2);
  select saldo_cantidad, saldo_valor into v_saldo_cant, v_saldo_valor
    from public.kardex_movimientos where producto_id = p_producto_id order by id desc limit 1;

  insert into public.kardex_movimientos (producto_id, tipo, documento_tipo, documento_id, documento_ref, tienda_id,
    cantidad, costo_unitario, costo_total, saldo_cantidad, saldo_valor, venta_detalle_id, usuario_id)
  values (p_producto_id, p_tipo, p_documento_tipo, p_documento_id, p_documento_ref, p_tienda_id,
    p_cantidad, v_costo, v_total, coalesce(v_saldo_cant, 0) + p_cantidad, coalesce(v_saldo_valor, 0) + v_total,
    p_venta_detalle_id, public.fn_usuario_id())
  returning id into v_kardex;

  insert into public.capas_inventario (producto_id, cantidad_inicial, cantidad_restante, costo_unitario, kardex_id)
  values (p_producto_id, p_cantidad, p_cantidad, v_costo, v_kardex);
  return v_kardex;
end;
$$;

-- Salida: consume capas en orden PEPS. Devuelve el costo total de lo que salió.
-- Si no alcanzan las capas (existencia previa al Kardex o inconsistencia),
-- lo que falta sale al costo actual del producto y queda marcado en sin_capa.
create or replace function public.fn_kdx_salida(
  p_producto_id bigint, p_cantidad numeric, p_tipo text,
  p_documento_tipo text, p_documento_id bigint, p_documento_ref text, p_tienda_id bigint,
  p_venta_detalle_id bigint default null)
returns numeric
language plpgsql security definer
set search_path = public
as $$
declare
  v_pendiente numeric := p_cantidad;
  v_total numeric := 0;
  v_tomar numeric;
  v_capas jsonb := '[]'::jsonb;
  v_sin_capa numeric := 0;
  v_costo_actual numeric;
  v_saldo_cant numeric;
  v_saldo_valor numeric;
  r record;
begin
  if coalesce(p_cantidad, 0) <= 0 then
    return 0;
  end if;
  perform pg_advisory_xact_lock(4521, p_producto_id::int);
  for r in
    select id, cantidad_restante, costo_unitario from public.capas_inventario
    where producto_id = p_producto_id and cantidad_restante > 0
    order by fecha, id
    for update
  loop
    v_tomar := least(r.cantidad_restante, v_pendiente);
    update public.capas_inventario set cantidad_restante = cantidad_restante - v_tomar where id = r.id;
    v_total := v_total + v_tomar * r.costo_unitario;
    v_capas := v_capas || jsonb_build_object('capa', r.id, 'cantidad', v_tomar, 'costo', r.costo_unitario);
    v_pendiente := v_pendiente - v_tomar;
    exit when v_pendiente = 0;
  end loop;
  if v_pendiente > 0 then
    select coalesce(costo_produccion, 0) into v_costo_actual from public.productos where id = p_producto_id;
    v_total := v_total + v_pendiente * v_costo_actual;
    v_sin_capa := v_pendiente;
  end if;
  v_total := round(v_total, 2);

  select saldo_cantidad, saldo_valor into v_saldo_cant, v_saldo_valor
    from public.kardex_movimientos where producto_id = p_producto_id order by id desc limit 1;
  insert into public.kardex_movimientos (producto_id, tipo, documento_tipo, documento_id, documento_ref, tienda_id,
    cantidad, costo_unitario, costo_total, saldo_cantidad, saldo_valor, sin_capa, capas, venta_detalle_id, usuario_id)
  values (p_producto_id, p_tipo, p_documento_tipo, p_documento_id, p_documento_ref, p_tienda_id,
    -p_cantidad, round(v_total / p_cantidad, 4), -v_total,
    coalesce(v_saldo_cant, 0) - p_cantidad, coalesce(v_saldo_valor, 0) - v_total,
    v_sin_capa, v_capas, p_venta_detalle_id, public.fn_usuario_id());
  return v_total;
end;
$$;

-- Costo PEPS de la siguiente unidad (para valorizar sobrantes y vistas previas).
create or replace function public.fn_kdx_costo_actual(p_producto_id bigint)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select costo_unitario from public.capas_inventario
      where producto_id = p_producto_id and cantidad_restante > 0 order by fecha, id limit 1),
    (select costo_unitario from public.capas_inventario where producto_id = p_producto_id order by fecha desc, id desc limit 1),
    (select coalesce(costo_produccion, 0) from public.productos where id = p_producto_id));
$$;

revoke all on function public.fn_kdx_entrada(bigint, numeric, numeric, text, text, bigint, text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.fn_kdx_salida(bigint, numeric, text, text, bigint, text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.fn_kdx_costo_actual(bigint) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. Disparadores
-- ------------------------------------------------------------
-- Venta: sale por PEPS y congela el costo en la línea. Corre después de
-- trg_congelar_costo_venta_detalle (orden alfabético) y lo reemplaza.
create or replace function public.fn_trg_kdx_venta_detalle()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_total numeric;
begin
  v_total := public.fn_kdx_salida(new.producto_id, new.cantidad, 'salida_venta', 'venta', new.venta_id,
                                  'Venta #' || new.venta_id, null, new.id);
  new.costo_unitario := round(v_total / new.cantidad, 2);
  return new;
end;
$$;

create trigger trg_kdx_venta_detalle before insert on public.venta_detalles
  for each row execute function public.fn_trg_kdx_venta_detalle();

-- Anulación: las unidades vuelven al mismo costo con que salieron.
create or replace function public.fn_trg_kdx_venta_anulada()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  d record;
  v_costo numeric;
begin
  if new.estado <> 'anulada' or old.estado = 'anulada' then
    return null;
  end if;
  for d in select * from public.venta_detalles where venta_id = new.id loop
    continue when exists (select 1 from public.kardex_movimientos where venta_detalle_id = d.id and tipo = 'devolucion_venta');
    select abs(costo_unitario) into v_costo from public.kardex_movimientos where venta_detalle_id = d.id and tipo = 'salida_venta';
    perform public.fn_kdx_entrada(d.producto_id, d.cantidad, coalesce(v_costo, d.costo_unitario, 0), 'devolucion_venta', 'venta', new.id,
                                  'Anulación de la venta #' || new.id, null, d.id);
  end loop;
  return null;
end;
$$;

create trigger trg_kdx_venta_anulada after update of estado on public.ventas
  for each row execute function public.fn_trg_kdx_venta_anulada();

-- Entradas desde la bitácora de inventario (alta/recepción y sumas de existencias).
create or replace function public.fn_trg_kdx_movimiento_inventario()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  p public.productos%rowtype;
  v_oc bigint;
begin
  if new.tipo not in ('alta_cedi', 'ajuste') or coalesce(new.referencia, '') like 'toma_fisica:%' then
    return null;
  end if;
  select * into p from public.productos where id = new.producto_id;
  if new.tipo = 'ajuste' then
    perform public.fn_kdx_entrada(p.id, new.cantidad, p.costo_produccion, 'entrada_ajuste', 'ajuste', new.id,
                                  coalesce(new.referencia, 'Ajuste de existencias'), new.tienda_destino_id);
  elsif new.referencia like 'recepcion_compra:%' or (new.referencia = 'publicacion' and p.compra_detalle_id is not null) then
    select orden_compra_id into v_oc from public.orden_compra_detalles
      where id = case when new.referencia like 'recepcion_compra:%' then nullif(split_part(new.referencia, ':', 2), '')::bigint
                      else p.compra_detalle_id end;
    perform public.fn_kdx_entrada(p.id, new.cantidad, p.costo_produccion, 'entrada_compra', 'orden_compra', v_oc,
                                  'Orden de compra #' || coalesce(v_oc::text, '?'), new.tienda_destino_id);
  else
    perform public.fn_kdx_entrada(p.id, new.cantidad, p.costo_produccion, 'entrada_alta',
                                  case when p.carga_masiva_id is not null then 'carga_masiva' else 'publicacion' end,
                                  coalesce(p.carga_masiva_id, p.id),
                                  case when p.carga_masiva_id is not null then 'Carga masiva #' || p.carga_masiva_id else 'Alta de producto' end,
                                  new.tienda_destino_id);
  end if;
  return null;
end;
$$;

create trigger trg_kdx_movimiento_inventario after insert on public.movimientos_inventario
  for each row execute function public.fn_trg_kdx_movimiento_inventario();

revoke all on function public.fn_trg_kdx_venta_detalle() from public, anon, authenticated;
revoke all on function public.fn_trg_kdx_venta_anulada() from public, anon, authenticated;
revoke all on function public.fn_trg_kdx_movimiento_inventario() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Saldo inicial: existencia actual al costo actual
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.id, p.costo_produccion, p.tienda_id, 1::numeric as cantidad
    from public.productos p
    where coalesce(p.modo_inventario, 'pieza_unica') = 'pieza_unica' and p.activo
      and p.estado in ('disponible_cedi', 'disponible_tienda', 'en_transito', 'separada', 'retenida')
    union all
    select p.id, p.costo_produccion, p.tienda_id, sum(i.cantidad_disponible + i.cantidad_reservada)
    from public.productos p join public.inventario_cantidad i on i.producto_id = p.id
    where p.modo_inventario = 'por_cantidad'
    group by p.id, p.costo_produccion, p.tienda_id
    having sum(i.cantidad_disponible + i.cantidad_reservada) > 0
  loop
    perform public.fn_kdx_entrada(r.id, r.cantidad, r.costo_produccion, 'saldo_inicial', 'saldo_inicial', null,
                                  'Saldo inicial del Kardex', r.tienda_id);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 4. Consultas
-- ------------------------------------------------------------
create or replace function public.fn_kardex(p_producto_id bigint, p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_producto jsonb;
  v_inicial record;
  v_final record;
  v_movs jsonb;
  v_capas jsonb;
  v_peso numeric;
begin
  if not (public.fn_tiene_permiso('contabilidad', 'ver') or public.fn_tiene_permiso('finanzas', 'ver')) then
    raise exception 'No tienes permiso para ver el Kardex';
  end if;
  select jsonb_build_object('id', p.id, 'codigo', p.codigo, 'nombre', p.nombre, 'codigo_barras', p.codigo_barras,
           'categoria', c.nombre, 'material', m.nombre, 'peso_gramos', p.peso_gramos, 'modo_inventario', p.modo_inventario,
           'unidad', 'Unidad', 'estado', p.estado, 'costo_produccion', p.costo_produccion),
         coalesce(p.peso_gramos, 0)
    into v_producto, v_peso
    from public.productos p
    left join public.categorias c on c.id = p.categoria_id
    left join public.materiales m on m.id = p.material_id
    where p.id = p_producto_id;
  if v_producto is null then
    raise exception 'El producto no existe';
  end if;

  select saldo_cantidad, saldo_valor into v_inicial from public.kardex_movimientos
    where producto_id = p_producto_id and public.fn_ctb_fecha(fecha) < p_desde order by id desc limit 1;
  select saldo_cantidad, saldo_valor into v_final from public.kardex_movimientos
    where producto_id = p_producto_id and public.fn_ctb_fecha(fecha) <= p_hasta order by id desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', k.id, 'fecha', k.fecha, 'tipo', k.tipo, 'documento_tipo', k.documento_tipo, 'documento_id', k.documento_id,
           'documento_ref', k.documento_ref, 'bodega', t.nombre,
           'entrada', case when k.cantidad > 0 then k.cantidad end,
           'salida', case when k.cantidad < 0 then -k.cantidad end,
           'costo_unitario', k.costo_unitario, 'costo_total', abs(k.costo_total),
           'saldo_cantidad', k.saldo_cantidad, 'saldo_valor', k.saldo_valor,
           'costo_promedio', case when k.saldo_cantidad <> 0 then round(k.saldo_valor / k.saldo_cantidad, 4) end,
           'peso', round(abs(k.cantidad) * v_peso, 3), 'sin_capa', k.sin_capa, 'usuario', u.nombre) order by k.id), '[]'::jsonb)
    into v_movs
    from public.kardex_movimientos k
    left join public.tiendas t on t.id = k.tienda_id
    left join public.usuarios u on u.id = k.usuario_id
    where k.producto_id = p_producto_id and public.fn_ctb_fecha(k.fecha) between p_desde and p_hasta;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'fecha', fecha, 'cantidad_inicial', cantidad_inicial,
           'cantidad_restante', cantidad_restante, 'costo_unitario', costo_unitario) order by fecha, id), '[]'::jsonb)
    into v_capas
    from public.capas_inventario where producto_id = p_producto_id and cantidad_restante > 0;

  return jsonb_build_object(
    'producto', v_producto,
    'saldo_inicial', jsonb_build_object('cantidad', coalesce(v_inicial.saldo_cantidad, 0), 'valor', coalesce(v_inicial.saldo_valor, 0)),
    'saldo_final', jsonb_build_object('cantidad', coalesce(v_final.saldo_cantidad, 0), 'valor', coalesce(v_final.saldo_valor, 0)),
    'movimientos', v_movs,
    'capas', v_capas);
end;
$$;

grant execute on function public.fn_kardex(bigint, date, date) to authenticated;

-- Inventario valorizado PEPS a una fecha (base del Libro de Inventarios).
create or replace function public.fn_kardex_resumen(
  p_hasta date, p_buscar text default null, p_offset int default 0, p_limit int default 100)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_filas jsonb;
  v_total int;
  v_totales jsonb;
begin
  if not (public.fn_tiene_permiso('contabilidad', 'ver') or public.fn_tiene_permiso('finanzas', 'ver')) then
    raise exception 'No tienes permiso para ver el Kardex';
  end if;
  with ultimo as (
    select distinct on (k.producto_id) k.producto_id, k.saldo_cantidad, k.saldo_valor
    from public.kardex_movimientos k
    where public.fn_ctb_fecha(k.fecha) <= p_hasta
    order by k.producto_id, k.id desc
  ),
  base as (
    select p.id, p.codigo, p.nombre, p.modo_inventario, c.nombre as categoria, u.saldo_cantidad, u.saldo_valor
    from ultimo u
    join public.productos p on p.id = u.producto_id
    left join public.categorias c on c.id = p.categoria_id
    where u.saldo_cantidad <> 0
      and (coalesce(btrim(p_buscar), '') = '' or p.codigo ilike '%' || btrim(p_buscar) || '%'
           or p.nombre ilike '%' || btrim(p_buscar) || '%' or p.codigo_barras = btrim(p_buscar))
  )
  select count(*), jsonb_build_object('cantidad', coalesce(sum(saldo_cantidad), 0), 'valor', coalesce(sum(saldo_valor), 0))
    into v_total, v_totales from base;
  with ultimo as (
    select distinct on (k.producto_id) k.producto_id, k.saldo_cantidad, k.saldo_valor
    from public.kardex_movimientos k
    where public.fn_ctb_fecha(k.fecha) <= p_hasta
    order by k.producto_id, k.id desc
  )
  select coalesce(jsonb_agg(x order by x ->> 'codigo'), '[]'::jsonb) into v_filas
  from (
    select jsonb_build_object('id', p.id, 'codigo', p.codigo, 'nombre', p.nombre, 'modo_inventario', p.modo_inventario,
             'categoria', c.nombre, 'cantidad', u.saldo_cantidad, 'valor', u.saldo_valor,
             'costo_promedio', round(u.saldo_valor / nullif(u.saldo_cantidad, 0), 4)) as x
    from ultimo u
    join public.productos p on p.id = u.producto_id
    left join public.categorias c on c.id = p.categoria_id
    where u.saldo_cantidad <> 0
      and (coalesce(btrim(p_buscar), '') = '' or p.codigo ilike '%' || btrim(p_buscar) || '%'
           or p.nombre ilike '%' || btrim(p_buscar) || '%' or p.codigo_barras = btrim(p_buscar))
    order by p.codigo
    offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 100), 1), 1000)
  ) f;
  return jsonb_build_object('total', v_total, 'totales', v_totales, 'filas', v_filas);
end;
$$;

grant execute on function public.fn_kardex_resumen(date, text, int, int) to authenticated;

-- ------------------------------------------------------------
-- 5. Corrección: anular una venta devuelve las unidades por cantidad
-- ------------------------------------------------------------
create or replace function public.fn_anular_venta(p_venta_id bigint, p_motivo text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_venta public.ventas%rowtype;
  v_detalle record;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if not public.fn_tiene_permiso('ventas','anular') then
    raise exception 'No tienes permiso para anular ventas';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'La anulación requiere un motivo';
  end if;

  select * into v_venta from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'La venta no existe';
  end if;
  if v_venta.estado = 'anulada' then
    raise exception 'La venta ya está anulada';
  end if;
  if public.fn_rol_actual() <> 'admin' and not public.fn_es_mi_descendiente(v_venta.vendedor_id) then
    raise exception 'Solo puedes anular ventas de tu propia red';
  end if;

  for v_detalle in
    select * from public.venta_detalles where venta_id = p_venta_id
  loop
    -- Por cantidad: las unidades vuelven a la bodega base del producto.
    if (select modo_inventario from public.productos where id = v_detalle.producto_id) = 'por_cantidad' then
      insert into public.inventario_cantidad (producto_id, tienda_id, cantidad_disponible)
      select v_detalle.producto_id, p.tienda_id, v_detalle.cantidad from public.productos p
      where p.id = v_detalle.producto_id and p.tienda_id is not null
      on conflict (producto_id, tienda_id)
        do update set cantidad_disponible = public.inventario_cantidad.cantidad_disponible + excluded.cantidad_disponible;
    else
      perform public.fn_devolver_disponibilidad(v_detalle.producto_id);
    end if;
    insert into public.movimientos_inventario (producto_id, tipo, usuario_id, referencia, cantidad, tienda_destino_id)
    values (v_detalle.producto_id, 'devolucion', public.fn_usuario_id(),
            'anulación venta ' || p_venta_id || ': ' || p_motivo, coalesce(v_detalle.cantidad, 1),
            (select tienda_id from public.productos where id = v_detalle.producto_id));
  end loop;

  update public.ventas set estado = 'anulada' where id = p_venta_id;

  -- Reversión: ledgers inmutables, nunca se hace UPDATE/DELETE de lo
  -- ya otorgado — se inserta la fila negativa correspondiente.
  insert into public.comisiones (usuario_id, venta_id, regla_id, regla_version, periodo_id, monto, motivo)
  select usuario_id, venta_id, regla_id, regla_version, periodo_id, -monto,
         'Reversión por anulación de venta ' || p_venta_id
  from public.comisiones
  where venta_id = p_venta_id;

  insert into public.puntos (usuario_id, venta_id, regla_id, regla_version, periodo_id, cantidad, motivo)
  select usuario_id, venta_id, regla_id, regla_version, periodo_id, -cantidad,
         'Reversión por anulación de venta ' || p_venta_id
  from public.puntos
  where venta_id = p_venta_id;
end;
$$;

-- ------------------------------------------------------------
-- 6. Corrección: confirmar traslado de pieza única (cantidad NULL)
-- ------------------------------------------------------------
create or replace function public.fn_confirmar_recepcion_traslado(
  p_detalle_id bigint,
  p_ok boolean,
  p_comentario text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_detalle public.transferencia_detalles%rowtype;
  v_traslado public.transferencias%rowtype;
  v_producto public.productos%rowtype;
  v_pendientes int;
  v_incidencias int;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if not public.fn_tiene_permiso('inventario', 'transferir') then
    raise exception 'No tienes permiso para recibir traslados';
  end if;

  select * into v_detalle from public.transferencia_detalles where id = p_detalle_id for update;
  if not found then
    raise exception 'La línea de traslado no existe';
  end if;
  if v_detalle.estado_recepcion <> 'pendiente' then
    raise exception 'Esta línea ya fue resuelta';
  end if;

  select * into v_traslado from public.transferencias where id = v_detalle.transferencia_id for update;
  select * into v_producto from public.productos where id = v_detalle.producto_id for update;

  if p_ok then
    if v_detalle.cantidad is null then
      update public.productos
        set estado = 'disponible_cedi', tienda_id = v_traslado.tienda_destino_id
        where id = v_detalle.producto_id;
    else
      insert into public.inventario_cantidad (producto_id, tienda_id, cantidad_disponible)
      values (v_detalle.producto_id, v_traslado.tienda_destino_id, v_detalle.cantidad)
      on conflict (producto_id, tienda_id)
        do update set cantidad_disponible = public.inventario_cantidad.cantidad_disponible + excluded.cantidad_disponible;
      -- productos.tienda_id ya NO se fuerza al destino: el stock de
      -- una referencia por_cantidad puede vivir en varias bodegas a
      -- la vez, y ventas/carrito ahora suman entre todas.
    end if;

    insert into public.movimientos_inventario
      (producto_id, tipo, tienda_origen_id, tienda_destino_id, usuario_id, referencia, cantidad)
    values
      (v_detalle.producto_id, 'entrada_transferencia', v_traslado.tienda_origen_id, v_traslado.tienda_destino_id,
       public.fn_usuario_id(), 'traslado:' || v_traslado.id, coalesce(v_detalle.cantidad, 1));

    update public.transferencia_detalles
      set estado_recepcion = 'confirmado', confirmado_por = public.fn_usuario_id(), fecha_confirmacion = now()
      where id = p_detalle_id;
  else
    -- Incidencia: se devuelve la disponibilidad al origen — pieza
    -- única vuelve a estar disponible ahí, cantidad se reintegra.
    if v_detalle.cantidad is null then
      update public.productos set estado = 'disponible_cedi' where id = v_detalle.producto_id;
    else
      update public.inventario_cantidad
        set cantidad_disponible = cantidad_disponible + v_detalle.cantidad
        where producto_id = v_detalle.producto_id and tienda_id = v_traslado.tienda_origen_id;
    end if;

    update public.transferencia_detalles
      set estado_recepcion = 'incidencia', comentario_incidencia = p_comentario,
          confirmado_por = public.fn_usuario_id(), fecha_confirmacion = now()
      where id = p_detalle_id;
  end if;

  select count(*) filter (where estado_recepcion = 'pendiente'),
         count(*) filter (where estado_recepcion = 'incidencia')
    into v_pendientes, v_incidencias
    from public.transferencia_detalles
    where transferencia_id = v_traslado.id;

  if v_pendientes = 0 then
    update public.transferencias
      set estado = case when v_incidencias > 0 then 'con_incidencia' else 'recibida' end,
          fecha_recepcion = now()
      where id = v_traslado.id;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 7. Corrección: valuación por bodega con todas las bodegas
-- (las unidades por cantidad se cuentan en la bodega donde están, incluidas las reservadas en carritos)
-- ------------------------------------------------------------
create or replace view public.vw_inventario_valorizado as
with existencias as (
  select p.tienda_id, 1 as cantidad, p.costo_produccion, p.precio_venta, p.modo_inventario,
         p.fecha_actualizacion, p.fecha_creacion
  from public.productos p
  where p.activo and coalesce(p.modo_inventario, 'pieza_unica') = 'pieza_unica'
    and p.estado in ('disponible_cedi', 'disponible_tienda')
  union all
  select i.tienda_id, i.cantidad_disponible + i.cantidad_reservada, p.costo_produccion, p.precio_venta, p.modo_inventario,
         p.fecha_actualizacion, p.fecha_creacion
  from public.inventario_cantidad i
  join public.productos p on p.id = i.producto_id
  where p.activo and p.modo_inventario = 'por_cantidad'
    and p.estado in ('disponible_cedi', 'disponible_tienda')
    and i.cantidad_disponible + i.cantidad_reservada > 0
)
select
  e.tienda_id, t.nombre as tienda, t.tipo as tienda_tipo,
  sum(e.cantidad) as piezas,
  sum(coalesce(e.costo_produccion, 0) * e.cantidad) as capital_inmovilizado,
  sum(coalesce(e.precio_venta, 0) * e.cantidad) as valor_venta_potencial,
  count(*) filter (
    where e.modo_inventario = 'pieza_unica'
      and coalesce(e.fecha_actualizacion, e.fecha_creacion)
        < now() - ((select valor from public.parametros where clave = 'dias_pieza_lenta') || ' days')::interval
  ) as piezas_sin_movimiento_60d
from existencias e
left join public.tiendas t on t.id = e.tienda_id
where public.fn_tiene_permiso('finanzas','ver')
group by e.tienda_id, t.nombre, t.tipo;

grant select on public.vw_inventario_valorizado to authenticated;
revoke all on public.vw_inventario_valorizado from anon;

create or replace function public.fn_registrar_historico_inventario_diario()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_fecha date := (now() at time zone 'America/Guatemala')::date;
  v_dias_pieza_lenta text;
begin
  select valor into v_dias_pieza_lenta from public.parametros where clave = 'dias_pieza_lenta';

  insert into public.inventario_historico_diario
    (fecha, tienda_id, piezas, capital_inmovilizado, valor_venta_potencial,
     piezas_sin_movimiento, piezas_en_descuento)
  select
    v_fecha,
    e.tienda_id,
    sum(e.cantidad),
    sum(coalesce(e.costo_produccion, 0) * e.cantidad),
    sum(coalesce(e.precio_venta, 0) * e.cantidad),
    count(*) filter (
      where e.modo_inventario = 'pieza_unica'
        and coalesce(e.fecha_actualizacion, e.fecha_creacion)
          < now() - (coalesce(v_dias_pieza_lenta, '60') || ' days')::interval
    ),
    sum(case when e.precio_descuento is not null then e.cantidad else 0 end)
  from (
    select p.tienda_id, 1 as cantidad, p.costo_produccion, p.precio_venta, p.precio_descuento, p.modo_inventario,
           p.fecha_actualizacion, p.fecha_creacion
    from public.productos p
    where p.activo and coalesce(p.modo_inventario, 'pieza_unica') = 'pieza_unica'
      and p.estado in ('disponible_cedi', 'disponible_tienda') and p.tienda_id is not null
    union all
    select i.tienda_id, i.cantidad_disponible + i.cantidad_reservada, p.costo_produccion, p.precio_venta, p.precio_descuento,
           p.modo_inventario, p.fecha_actualizacion, p.fecha_creacion
    from public.inventario_cantidad i
    join public.productos p on p.id = i.producto_id
    where p.activo and p.modo_inventario = 'por_cantidad'
      and p.estado in ('disponible_cedi', 'disponible_tienda')
      and i.cantidad_disponible + i.cantidad_reservada > 0
  ) e
  group by e.tienda_id
  on conflict (fecha, tienda_id) do update
    set piezas = excluded.piezas,
        capital_inmovilizado = excluded.capital_inmovilizado,
        valor_venta_potencial = excluded.valor_venta_potencial,
        piezas_sin_movimiento = excluded.piezas_sin_movimiento,
        piezas_en_descuento = excluded.piezas_en_descuento;
end;
$$;

-- ------------------------------------------------------------
-- 8. Cuadres: se agrega inventario (Kardex PEPS vs. contabilidad)
-- ------------------------------------------------------------
create or replace function public.fn_ctb_cuadres(p_hasta date default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_hasta date := coalesce(p_hasta, public.fn_ctb_hoy());
  v_bancos jsonb;
  v_bolsa_libro numeric;
  v_bolsa_ctb numeric;
  v_pasivo bigint;
  v_inv_kardex numeric;
  v_inv_ctb numeric;
begin
  if not public.fn_tiene_permiso('contabilidad', 'ver') then
    raise exception 'No tienes permiso para ver la contabilidad';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'cuenta_bancaria', b.nombre, 'codigo', c.codigo,
           'saldo_bancos', public.fn_saldo_cuenta(b.id, v_hasta),
           'saldo_contable', coalesce((
              select sum(l.debe - l.haber) from public.partida_lineas l
              join public.partidas p on p.id = l.partida_id and p.estado = 'contabilizada'
              where l.cuenta_id = b.cuenta_contable_id and p.fecha <= v_hasta), 0)) order by b.nombre), '[]'::jsonb)
    into v_bancos
    from public.cuentas_bancarias b left join public.cuentas_contables c on c.id = b.cuenta_contable_id
    where b.activa;

  select coalesce(sum(monto), 0) into v_bolsa_libro from public.movimientos_bolsa where public.fn_ctb_fecha(fecha) <= v_hasta;
  select cuenta_id into v_pasivo from public.config_contable_eventos where clave = 'bolsa.pasivo';
  select coalesce(sum(l.haber - l.debe), 0) into v_bolsa_ctb
    from public.partida_lineas l join public.partidas p on p.id = l.partida_id and p.estado = 'contabilizada'
    where l.cuenta_id = v_pasivo and p.fecha <= v_hasta;

  -- Inventario: valor PEPS del Kardex vs. saldo de la cuenta de inventario.
  select coalesce(sum(saldo_valor), 0) into v_inv_kardex from (
    select distinct on (producto_id) saldo_valor from public.kardex_movimientos
    where public.fn_ctb_fecha(fecha) <= v_hasta order by producto_id, id desc) k;
  select coalesce(sum(l.debe - l.haber), 0) into v_inv_ctb
    from public.partida_lineas l join public.partidas p on p.id = l.partida_id and p.estado = 'contabilizada'
    where l.cuenta_id = (select cuenta_id from public.config_contable_eventos where clave = 'venta.inventario') and p.fecha <= v_hasta;

  return jsonb_build_object(
    'hasta', v_hasta,
    'inventario', jsonb_build_object('saldo_kardex', v_inv_kardex, 'saldo_contable', v_inv_ctb),
    'activa', (select contabilizacion_automatica from public.empresa_contable where id = 1),
    'fecha_inicio', (select fecha_inicio_contable from public.empresa_contable where id = 1),
    'bancos', v_bancos,
    'billetera', jsonb_build_object('saldo_libro', v_bolsa_libro, 'saldo_contable', v_bolsa_ctb),
    'pendientes', (select count(*) from public.contabilizacion_pendientes where estado = 'pendiente'),
    'borradores', (select count(*) from public.partidas where estado = 'borrador'));
end;
$$;

-- Verificación
select
  (select count(*) from public.kardex_movimientos where tipo = 'saldo_inicial') as productos_con_saldo_inicial,
  (select coalesce(sum(saldo_valor), 0) from public.kardex_movimientos where tipo = 'saldo_inicial') as valor_saldo_inicial,
  (select count(*) from pg_trigger where tgname like 'trg_kdx_%') as triggers_kardex;
