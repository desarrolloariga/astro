-- ============================================================
-- ASTRO — Usuario mayorista y políticas de precios mayoristas.
--
-- Rol 'mayorista': solo compra para sí mismo (Catálogo, Carrito, Pedidos)
-- con el precio de su política:
--   precio mayorista = precio público × (1 − % de descuento)
--   (% de la categoría si la política lo define; si no, el % general)
-- La política también define qué categorías ve y un monto mínimo de
-- compra. Sus compras no generan comisiones, puntos ni Billetera, y se
-- pagan como hoy (transferencia/depósito con comprobante).
--
-- Se administra en Sistema → Políticas mayoristas (permiso
-- mayoristas.configurar: admin y coordinador).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Rol y permisos
-- ------------------------------------------------------------
alter table public.roles drop constraint if exists roles_nombre_check;
alter table public.roles add constraint roles_nombre_check
  check (nombre in ('admin','coordinador','supervisor','asesor','embajador','tienda','produccion','contabilidad','logistica','mayorista'));

insert into public.roles (nombre, descripcion)
values ('mayorista', 'Cliente mayorista: compra para sí mismo con su política de precios')
on conflict (nombre) do nothing;

insert into public.permisos (modulo, accion, descripcion) values
  ('mayoristas', 'configurar', 'Crear y configurar políticas de precios mayoristas')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('mayorista', 'catalogo', 'ver'),
  ('admin', 'mayoristas', 'configurar'),
  ('coordinador', 'mayoristas', 'configurar')
) as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

-- Canal de venta propio.
alter table public.ventas drop constraint if exists ventas_canal_check;
alter table public.ventas add constraint ventas_canal_check
  check (canal in ('tienda', 'asesor', 'embajador', 'link', 'mayorista'));

-- ------------------------------------------------------------
-- 2. Políticas
-- ------------------------------------------------------------
create table public.politicas_mayoristas (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  descripcion text,
  descuento_pct numeric(5,2) not null default 0 check (descuento_pct >= 0 and descuento_pct < 100),
  minimo_compra numeric(12,2) not null default 0 check (minimo_compra >= 0),
  todas_categorias boolean not null default true,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

-- Por categoría: si se ve (cuando la política no muestra todas) y un % propio opcional.
create table public.politica_mayorista_categorias (
  id bigint generated always as identity primary key,
  politica_id bigint not null references public.politicas_mayoristas (id) on delete cascade,
  categoria_id bigint not null references public.categorias (id),
  visible boolean not null default true,
  descuento_pct numeric(5,2) check (descuento_pct is null or (descuento_pct >= 0 and descuento_pct < 100)),
  unique (politica_id, categoria_id)
);

alter table public.usuarios
  add column if not exists politica_mayorista_id bigint references public.politicas_mayoristas (id);

alter table public.ventas
  add column if not exists precio_mayorista boolean not null default false,
  add column if not exists politica_mayorista_id bigint references public.politicas_mayoristas (id);

create trigger trg_auditar_politicas_mayoristas after insert or update or delete on public.politicas_mayoristas
  for each row execute function public.fn_auditar();

alter table public.politicas_mayoristas enable row level security;
alter table public.politica_mayorista_categorias enable row level security;

-- Lectura: quien configura y cada mayorista su propia política.
create policy sel_politicas_mayoristas on public.politicas_mayoristas for select to authenticated
  using (
    (select public.fn_tiene_permiso('mayoristas', 'configurar'))
    or id = (select politica_mayorista_id from public.usuarios where id = (select public.fn_usuario_id()))
  );
create policy adm_politicas_mayoristas on public.politicas_mayoristas for all to authenticated
  using ((select public.fn_tiene_permiso('mayoristas', 'configurar')))
  with check ((select public.fn_tiene_permiso('mayoristas', 'configurar')));

create policy sel_politica_mayorista_categorias on public.politica_mayorista_categorias for select to authenticated
  using (
    (select public.fn_tiene_permiso('mayoristas', 'configurar'))
    or politica_id = (select politica_mayorista_id from public.usuarios where id = (select public.fn_usuario_id()))
  );
create policy adm_politica_mayorista_categorias on public.politica_mayorista_categorias for all to authenticated
  using ((select public.fn_tiene_permiso('mayoristas', 'configurar')))
  with check ((select public.fn_tiene_permiso('mayoristas', 'configurar')));

grant select, insert, update, delete on public.politicas_mayoristas, public.politica_mayorista_categorias to authenticated;

-- Asignar política a un mayorista (solo quien configura).
create or replace function public.fn_asignar_politica_mayorista(p_usuario_id bigint, p_politica_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('mayoristas', 'configurar') then
    raise exception 'No tienes permiso para configurar mayoristas';
  end if;
  if not exists (select 1 from public.usuarios u join public.roles r on r.id = u.rol_id
                 where u.id = p_usuario_id and r.nombre = 'mayorista') then
    raise exception 'El usuario no tiene rol mayorista';
  end if;
  update public.usuarios set politica_mayorista_id = p_politica_id where id = p_usuario_id;
end;
$$;

grant execute on function public.fn_asignar_politica_mayorista(bigint, bigint) to authenticated;

-- ------------------------------------------------------------
-- 3. Precio y visibilidad mayorista
-- ------------------------------------------------------------
-- null = el usuario no tiene política activa o la categoría no la ve.
create or replace function public.fn_precio_mayorista(p_producto_id bigint, p_usuario_id bigint)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select round(coalesce(p.precio_descuento, p.precio_venta) * (1 - coalesce(pc.descuento_pct, pol.descuento_pct) / 100), 2)
  from public.productos p
  join public.usuarios u on u.id = p_usuario_id
  join public.politicas_mayoristas pol on pol.id = u.politica_mayorista_id and pol.activo
  left join public.politica_mayorista_categorias pc on pc.politica_id = pol.id and pc.categoria_id = p.categoria_id
  where p.id = p_producto_id
    and coalesce(p.precio_descuento, p.precio_venta) is not null
    and (pol.todas_categorias or coalesce(pc.visible, false));
$$;

revoke all on function public.fn_precio_mayorista(bigint, bigint) from public, anon, authenticated;

-- Precio "para mí" del usuario en sesión: embajador o mayorista; null para los demás.
create or replace function public.fn_precio_propio(p_producto_id bigint)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select case public.fn_rol_actual()
    when 'embajador' then public.fn_precio_embajador(p_producto_id)
    when 'mayorista' then public.fn_precio_mayorista(p_producto_id, public.fn_usuario_id())
  end;
$$;

revoke all on function public.fn_precio_propio(bigint) from public, anon, authenticated;

-- Precio por línea en la confirmación: "precio propio" = embajador o mayorista. Misma firma.
create or replace function public.fn_precio_linea(p_producto_id bigint, p_precio_embajador boolean)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select case
    when coalesce(p_precio_embajador, false) then coalesce(public.fn_precio_propio(p.id), 0)
    else coalesce(p.precio_descuento, p.precio_venta, 0)
  end
  from public.productos p where p.id = p_producto_id;
$$;

-- Precios para pintar carrito y checkout: también al mayorista. Misma firma.
create or replace function public.fn_precios_embajador(p_producto_ids bigint[])
returns table (producto_id bigint, precio_publico numeric, precio_embajador numeric)
language sql stable security definer
set search_path = public
as $$
  select p.id, coalesce(p.precio_descuento, p.precio_venta), public.fn_precio_propio(p.id)
  from public.productos p
  where p.id = any(p_producto_ids)
    and public.fn_rol_actual() in ('embajador', 'mayorista');
$$;

-- Política del mayorista en sesión (para el catálogo, carrito y checkout).
create or replace function public.fn_mi_politica_mayorista()
returns table (id bigint, nombre text, descuento_pct numeric, minimo_compra numeric)
language sql stable security definer
set search_path = public
as $$
  select pol.id, pol.nombre, pol.descuento_pct, pol.minimo_compra
  from public.usuarios u
  join public.politicas_mayoristas pol on pol.id = u.politica_mayorista_id and pol.activo
  where u.id = public.fn_usuario_id();
$$;

grant execute on function public.fn_mi_politica_mayorista() to authenticated;

-- ------------------------------------------------------------
-- 4. Catálogo: precio propio y categorías visibles. Misma firma.
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
  v_rol text;
  v_usuario bigint;
  v_politica public.politicas_mayoristas%rowtype;
begin
  if p_token is not null then
    select * into v_link from public.links_venta where token = p_token;
    if not found or v_link.estado <> 'activo'
       or (v_link.fecha_vencimiento is not null and v_link.fecha_vencimiento < now()) then
      raise exception 'Enlace inválido o vencido';
    end if;
  else
    v_usuario := public.fn_usuario_id();
    if v_usuario is null then
      raise exception 'Sesión requerida';
    end if;
    v_rol := public.fn_rol_actual();
    if v_rol = 'mayorista' then
      select pol.* into v_politica
        from public.usuarios u join public.politicas_mayoristas pol on pol.id = u.politica_mayorista_id and pol.activo
        where u.id = v_usuario;
      -- Sin política activa el mayorista no ve piezas.
      if not found then
        return;
      end if;
    end if;
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
    case v_rol
      when 'embajador' then public.fn_precio_embajador(v.id)
      when 'mayorista' then public.fn_precio_mayorista(v.id, v_usuario)
    end,
    (cedi.nombre is not null),
    coalesce(cedi.nombre, v.tienda)
  from public.vw_catalogo v
  join public.productos p on p.id = v.id
  left join lateral (
    select sum(d.cantidad)::int as vendidos
    from public.venta_detalles d
    join public.ventas x on x.id = d.venta_id
    where d.producto_id = v.id and x.estado <> 'anulada'
      and x.fecha_creacion >= now() - make_interval(days => greatest(coalesce(p_dias_vendidos, 90), 1))
  ) vd on true
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
    and (v_rol is distinct from 'mayorista' or v_politica.todas_categorias or exists (
          select 1 from public.politica_mayorista_categorias pc
          where pc.politica_id = v_politica.id and pc.categoria_id = v.categoria_id and pc.visible))
  order by v.id desc;
end;
$$;

-- ------------------------------------------------------------
-- 5. Confirmar mi carrito: el mayorista siempre compra para sí, con su
--    precio, solo categorías permitidas y respetando el mínimo. Misma firma.
-- ------------------------------------------------------------
create or replace function public.fn_confirmar_mi_carrito(
  p_para_cliente boolean,
  p_cliente jsonb,
  p_envio jsonb,
  p_pago jsonb,
  p_usar_bolsa boolean default false
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint := public.fn_mi_carrito_abierto(false);
  v_usuario public.usuarios%rowtype;
  v_cliente jsonb := p_cliente;
  v_canal text;
  v_rol text := public.fn_rol_actual();
  v_mayorista boolean := coalesce(v_rol = 'mayorista', false);
  v_para_cliente boolean := coalesce(p_para_cliente, false) and v_rol is distinct from 'mayorista';
  v_politica public.politicas_mayoristas%rowtype;
  v_subtotal numeric;
  v_venta_id bigint;
begin
  if v_id is null then
    raise exception 'No tienes un carrito abierto';
  end if;

  select * into v_usuario from public.usuarios where id = public.fn_usuario_id();

  if v_mayorista then
    select * into v_politica from public.politicas_mayoristas where id = v_usuario.politica_mayorista_id and activo;
    if not found then
      raise exception 'Tu cuenta mayorista aún no tiene una política de precios asignada';
    end if;
    if exists (select 1 from public.carrito_detalles d
               where d.carrito_id = v_id and public.fn_precio_mayorista(d.producto_id, v_usuario.id) is null) then
      raise exception 'Tu carrito tiene piezas que no están disponibles para tu cuenta mayorista';
    end if;
    select coalesce(sum(public.fn_precio_mayorista(d.producto_id, v_usuario.id) * d.cantidad), 0)
      into v_subtotal from public.carrito_detalles d where d.carrito_id = v_id;
    if v_subtotal < v_politica.minimo_compra then
      raise exception 'La compra mínima mayorista es de Q % (llevas Q %)',
        to_char(v_politica.minimo_compra, 'FM999,999,990.00'), to_char(v_subtotal, 'FM999,999,990.00');
    end if;
  end if;

  -- Compra para sí mismo: el cliente es el propio usuario.
  if not v_para_cliente then
    v_cliente := jsonb_build_object('nombre', v_usuario.nombre, 'telefono', v_usuario.telefono, 'correo', v_usuario.correo);
  end if;

  v_canal := case v_rol
    when 'tienda' then 'tienda'
    when 'asesor' then 'asesor'
    when 'embajador' then 'embajador'
    when 'mayorista' then 'mayorista'
    else 'asesor'
  end;

  -- Precio propio (embajador o mayorista) solo en compras para sí. Eso
  -- también marca la venta sin comisión directa, sin puntos y sin Billetera.
  v_venta_id := public.fn_confirmar_carrito_interno(
    v_id, v_usuario.id, v_canal, null, v_usuario.id, v_cliente,
    coalesce(p_envio, '{}'::jsonb) || jsonb_build_object('para_cliente', v_para_cliente),
    p_pago,
    coalesce(v_rol in ('embajador', 'mayorista'), false) and not v_para_cliente,
    -- La Billetera solo la usa el embajador en compras para sí.
    coalesce(p_usar_bolsa, false) and coalesce(v_rol = 'embajador', false) and not v_para_cliente);

  if v_mayorista then
    update public.ventas set precio_mayorista = true, politica_mayorista_id = v_politica.id where id = v_venta_id;
  end if;
  return v_venta_id;
end;
$$;

-- ------------------------------------------------------------
-- 6. Ventas mayoristas: tampoco comisión a la red. Misma firma.
-- ------------------------------------------------------------
do $$
declare
  v_firma constant text := 'public.fn_calcular_comisiones(bigint)';
  v_def text;
  v_ancla constant text := '  v_periodo_id := public.fn_obtener_periodo_actual();';
begin
  v_def := pg_get_functiondef(v_firma::regprocedure);
  if position(v_ancla in v_def) = 0 then
    raise exception 'No se encontró en fn_calcular_comisiones: % — no se aplicó el cambio', v_ancla;
  end if;
  v_def := replace(v_def, v_ancla,
    E'  -- Venta mayorista: venta directa de la empresa, sin comisiones.\n  if v_venta.canal = ''mayorista'' then\n    return;\n  end if;\n' || v_ancla);
  execute v_def;
end $$;

-- El descuento por desempeño no se suma al precio mayorista. Misma firma.
do $$
declare
  v_firma constant text := 'public.fn_descuento_desempeno(bigint)';
  v_def text;
  v_ancla constant text := '  select rol_id into v_rol_id from public.usuarios where id = p_vendedor_id;';
begin
  v_def := pg_get_functiondef(v_firma::regprocedure);
  if position(v_ancla in v_def) = 0 then
    raise exception 'No se encontró en fn_descuento_desempeno: % — no se aplicó el cambio', v_ancla;
  end if;
  v_def := replace(v_def, v_ancla,
    v_ancla || E'\n  if exists (select 1 from public.roles where id = v_rol_id and nombre = ''mayorista'') then\n    return 0;\n  end if;');
  execute v_def;
end $$;

-- ------------------------------------------------------------
-- 7. Configuración del catálogo: audiencia "mayoristas"
-- ------------------------------------------------------------
do $$
declare
  t text;
  c text;
begin
  foreach t in array array['catalogo_anuncios', 'catalogo_banners', 'catalogo_novedades'] loop
    for c in
      select conname from pg_constraint
      where conrelid = ('public.' || t)::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%audiencia%'
    loop
      execute format('alter table public.%I drop constraint %I', t, c);
    end loop;
    execute format('alter table public.%I add constraint %I check (audiencia in (''todos'', ''backoffice'', ''publico'', ''mayorista''))',
                   t, t || '_audiencia_check');
  end loop;
end $$;

-- ------------------------------------------------------------
-- Verificación
-- ------------------------------------------------------------
select
  (select count(*) from public.roles where nombre = 'mayorista') as rol_mayorista,
  (select count(*) from information_schema.tables where table_schema = 'public'
     and table_name in ('politicas_mayoristas', 'politica_mayorista_categorias')) as tablas,
  (select count(*) from pg_proc where proname in ('fn_precio_mayorista', 'fn_precio_propio', 'fn_mi_politica_mayorista', 'fn_asignar_politica_mayorista')) as funciones;
