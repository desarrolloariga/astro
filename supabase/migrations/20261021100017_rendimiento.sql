-- ============================================================
-- ASTRO — Rendimiento: menos viajes a la base por pantalla.
--
--  1. fn_contexto_sesion(): usuario, rol, TODOS sus permisos efectivos,
--     excepciones, unidades del carrito y saldo de Billetera en una sola
--     llamada. La app la pide una vez por navegación (antes eran 4 a 6
--     consultas: usuario, permisos extra, un fn_tiene_permiso por cada
--     permiso que revisaba la página, carrito).
--  2. fn_catalogo_piezas(): el catálogo completo con precio embajador,
--     fecha de publicación, unidades vendidas y entrega inmediata en una
--     sola respuesta (antes: vista + fn_catalogo_meta + fn_precios_embajador
--     + fn_entrega_inmediata en fila). Sirve al backoffice (sin token) y al
--     enlace público (con token), y a la ficha de producto (misma categoría).
--  3. Índices para las consultas que crecen con las ventas.
--  4. Políticas RLS de ventas/pedidos: las funciones de sesión se evalúan
--     una vez por consulta (no una vez por fila) y la jerarquía se resuelve
--     con un conjunto en memoria en vez de una función por fila.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Contexto de sesión
-- ------------------------------------------------------------
create or replace function public.fn_contexto_sesion()
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v_u record;
  v_permisos text[];
  v_concedidos text[];
  v_revocados text[];
  v_unidades int := 0;
  v_saldo numeric := 0;
begin
  select u.id, u.nombre, u.correo, u.tienda_id, u.rol_id, r.nombre as rol
    into v_u
  from public.usuarios u
  join public.roles r on r.id = u.rol_id
  where u.auth_uid = auth.uid() and u.activo;
  if not found then
    return null;
  end if;

  -- Permisos efectivos: excepción individual > permiso del rol (misma regla que fn_tiene_permiso).
  select coalesce(array_agg(p.modulo || '.' || p.accion order by p.modulo, p.accion), '{}')
    into v_permisos
  from public.permisos p
  where coalesce(
    (select up.concedido from public.usuarios_permisos up
      where up.usuario_id = v_u.id and up.permiso_id = p.id limit 1),
    exists (select 1 from public.roles_permisos rp where rp.rol_id = v_u.rol_id and rp.permiso_id = p.id));

  select coalesce(array_agg(p.modulo || '.' || p.accion) filter (where up.concedido), '{}'),
         coalesce(array_agg(p.modulo || '.' || p.accion) filter (where not up.concedido), '{}')
    into v_concedidos, v_revocados
  from public.usuarios_permisos up
  join public.permisos p on p.id = up.permiso_id
  where up.usuario_id = v_u.id;

  select coalesce(sum(c.cantidad), 0)::int into v_unidades from public.fn_ver_mi_carrito() c;

  if v_u.rol = 'embajador' then
    v_saldo := coalesce(public.fn_saldo_bolsa(v_u.id), 0);
  end if;

  return jsonb_build_object(
    'usuario', jsonb_build_object(
      'id', v_u.id, 'nombre', v_u.nombre, 'correo', v_u.correo, 'tienda_id', v_u.tienda_id, 'rol', v_u.rol),
    'permisos', to_jsonb(v_permisos),
    'concedidos', to_jsonb(v_concedidos),
    'revocados', to_jsonb(v_revocados),
    'carrito_unidades', v_unidades,
    'saldo_bolsa', v_saldo);
end;
$$;

grant execute on function public.fn_contexto_sesion() to authenticated;

-- ------------------------------------------------------------
-- 2. Catálogo en una sola respuesta
-- ------------------------------------------------------------
create or replace function public.fn_catalogo_piezas(
  p_token text default null,
  p_ids bigint[] default null,
  p_misma_categoria_que bigint default null,
  p_dias_vendidos int default 90
)
returns table (
  id bigint, codigo text, nombre text, descripcion text,
  categoria_id bigint, categoria text, material text, peso_gramos numeric, kilataje text, piedras text,
  precio_venta numeric, precio_lista numeric, en_descuento boolean, estado text, tienda text,
  imagen_principal text, imagenes jsonb, modo_inventario text, stock_disponible int,
  fecha_publicacion timestamptz, vendidos int, precio_embajador numeric,
  inmediata boolean, ubicacion text
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_link public.links_venta%rowtype;
  v_categoria bigint;
  v_embajador boolean := false;
begin
  if p_token is not null then
    select * into v_link from public.links_venta where token = p_token;
    if not found or v_link.estado <> 'activo'
       or (v_link.fecha_vencimiento is not null and v_link.fecha_vencimiento < now()) then
      raise exception 'Enlace inválido o vencido';
    end if;
  else
    if public.fn_usuario_id() is null then
      raise exception 'Sesión requerida';
    end if;
    v_embajador := public.fn_rol_actual() = 'embajador';
  end if;

  if p_misma_categoria_que is not null then
    select p.categoria_id into v_categoria from public.productos p where p.id = p_misma_categoria_que;
  end if;

  return query
  select
    v.id, v.codigo, v.nombre, v.descripcion,
    v.categoria_id, v.categoria, v.material, v.peso_gramos, v.kilataje, v.piedras,
    v.precio_venta, v.precio_lista, v.en_descuento, v.estado, v.tienda,
    v.imagen_principal, v.imagenes, v.modo_inventario, v.stock_disponible,
    coalesce(p.fecha_publicacion, p.fecha_creacion),
    coalesce(vd.vendidos, 0),
    case when v_embajador then public.fn_precio_embajador(v.id) end,
    (cedi.nombre is not null),
    coalesce(cedi.nombre, v.tienda)
  from public.vw_catalogo v
  join public.productos p on p.id = v.id
  -- Unidades vendidas (para "Más vendidos").
  left join lateral (
    select sum(d.cantidad)::int as vendidos
    from public.venta_detalles d
    join public.ventas x on x.id = d.venta_id
    where d.producto_id = v.id and x.estado <> 'anulada'
      and x.fecha_creacion >= now() - make_interval(days => greatest(coalesce(p_dias_vendidos, 90), 1))
  ) vd on true
  -- CEDI con existencia → permite entrega inmediata.
  left join lateral (
    select t.nombre
    from public.tiendas t
    where t.tipo = 'cedi' and t.activo
      and (
        (p.modo_inventario = 'pieza_unica' and t.id = p.tienda_id and p.estado = 'disponible_cedi')
        or (p.modo_inventario = 'por_cantidad' and exists (
              select 1 from public.inventario_cantidad ic
              where ic.producto_id = p.id and ic.tienda_id = t.id and ic.cantidad_disponible > 0))
      )
    order by t.id
    limit 1
  ) cedi on true
  where (p_ids is null or v.id = any(p_ids))
    and (p_misma_categoria_que is null or v.id = p_misma_categoria_que or v.categoria_id = v_categoria)
    and (p_token is null or (
          v.estado in ('disponible_cedi', 'disponible_tienda')
          and public.fn_link_incluye_producto(v_link.id, v.id)))
  order by v.id desc;
end;
$$;

grant execute on function public.fn_catalogo_piezas(text, bigint[], bigint, int) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Índices
-- ------------------------------------------------------------
create index if not exists idx_venta_detalles_producto on public.venta_detalles (producto_id);
create index if not exists idx_ventas_fecha on public.ventas (fecha_creacion desc);
create index if not exists idx_ventas_cliente on public.ventas (cliente_id);
create index if not exists idx_pedidos_fecha on public.pedidos (fecha_creacion desc);
create index if not exists idx_pedidos_comprador on public.pedidos (comprador_id);
create index if not exists idx_usuarios_auth_uid on public.usuarios (auth_uid);
create index if not exists idx_usuarios_permisos_usuario on public.usuarios_permisos (usuario_id);
create index if not exists idx_roles_permisos_rol on public.roles_permisos (rol_id);
create index if not exists idx_carritos_usuario_abierto on public.carritos (usuario_id) where estado = 'abierto';

-- ------------------------------------------------------------
-- 4. Políticas RLS: una evaluación por consulta, no por fila
-- ------------------------------------------------------------
-- Descendientes del usuario actual como conjunto (se calcula una vez por consulta).
create or replace function public.fn_mis_descendientes()
returns setof bigint
language sql stable security definer
set search_path = public
as $$
  select descendiente_id from public.vw_cadena_mando where ancestro_id = public.fn_usuario_id();
$$;

revoke all on function public.fn_mis_descendientes() from public, anon;
grant execute on function public.fn_mis_descendientes() to authenticated;

drop policy if exists sel_ventas on public.ventas;
create policy sel_ventas on public.ventas
  for select to authenticated
  using (
    (select public.fn_rol_actual()) in ('admin', 'coordinador', 'contabilidad')
    or vendedor_id = (select public.fn_usuario_id())
    or vendedor_id in (select public.fn_mis_descendientes())
    or ((select public.fn_rol_actual()) = 'tienda' and tienda_id = (select public.fn_mi_tienda_id()))
  );

drop policy if exists sel_venta_detalles on public.venta_detalles;
create policy sel_venta_detalles on public.venta_detalles
  for select to authenticated
  using (
    exists (
      select 1 from public.ventas v
      where v.id = venta_id
        and (
          (select public.fn_rol_actual()) in ('admin', 'coordinador', 'contabilidad')
          or v.vendedor_id = (select public.fn_usuario_id())
          or v.vendedor_id in (select public.fn_mis_descendientes())
          or ((select public.fn_rol_actual()) = 'tienda' and v.tienda_id = (select public.fn_mi_tienda_id()))
        )
    )
  );

drop policy if exists sel_pagos on public.pagos;
create policy sel_pagos on public.pagos
  for select to authenticated
  using (
    (select public.fn_rol_actual()) in ('admin', 'coordinador', 'contabilidad')
    or exists (
      select 1 from public.ventas v
      where v.id = venta_id
        and (v.vendedor_id = (select public.fn_usuario_id()) or v.vendedor_id in (select public.fn_mis_descendientes()))
    )
  );

drop policy if exists sel_comprobantes on public.comprobantes;
create policy sel_comprobantes on public.comprobantes
  for select to authenticated
  using (
    (select public.fn_rol_actual()) in ('admin', 'coordinador', 'contabilidad')
    or exists (
      select 1 from public.pagos p join public.ventas v on v.id = p.venta_id
      where p.id = pago_id
        and (v.vendedor_id = (select public.fn_usuario_id()) or v.vendedor_id in (select public.fn_mis_descendientes()))
    )
  );

drop policy if exists sel_clientes on public.clientes;
create policy sel_clientes on public.clientes
  for select to authenticated
  using (
    (select public.fn_rol_actual()) in ('admin', 'coordinador', 'contabilidad')
    or vendedor_id = (select public.fn_usuario_id())
    or vendedor_id in (select public.fn_mis_descendientes())
  );

drop policy if exists sel_pedidos on public.pedidos;
create policy sel_pedidos on public.pedidos
  for select to authenticated
  using (
    (select public.fn_rol_actual()) in ('admin', 'coordinador', 'contabilidad')
    or (select public.fn_tiene_permiso('pedidos', 'despachar'))
    or comprador_id = (select public.fn_usuario_id())
    or exists (
      select 1 from public.ventas v
      where v.id = venta_id
        and (
          v.vendedor_id = (select public.fn_usuario_id())
          or v.vendedor_id in (select public.fn_mis_descendientes())
          or ((select public.fn_rol_actual()) = 'tienda' and v.tienda_id = (select public.fn_mi_tienda_id()))
        )
    )
  );

-- ------------------------------------------------------------
-- Verificación
-- ------------------------------------------------------------
select
  (select count(*) from pg_proc where proname in ('fn_contexto_sesion', 'fn_catalogo_piezas', 'fn_mis_descendientes')) as funciones,
  (select count(*) from pg_indexes where schemaname = 'public'
     and indexname in ('idx_venta_detalles_producto', 'idx_ventas_fecha', 'idx_pedidos_fecha', 'idx_usuarios_auth_uid')) as indices,
  (select count(*) from pg_policies where schemaname = 'public'
     and policyname in ('sel_ventas', 'sel_venta_detalles', 'sel_pagos', 'sel_comprobantes', 'sel_clientes', 'sel_pedidos')) as politicas;
