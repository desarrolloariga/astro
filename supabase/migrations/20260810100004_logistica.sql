-- ============================================================
-- ASTRO — Módulo Logística: solicitudes de reposición, alertas de
-- quiebre de stock, clasificación de lento movimiento, descuentos
-- (por falta de movimiento y descuento propio del embajador).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Solicitudes de reposición — solo el asesor puede solicitar
-- ------------------------------------------------------------
create table public.solicitudes_reposicion (
  id bigint generated always as identity primary key,
  solicitante_id bigint not null references public.usuarios (id),
  categoria_id bigint references public.categorias (id),
  material_id bigint references public.materiales (id),
  descripcion text,
  cantidad_sugerida int,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','en_proceso','atendida','rechazada')),
  atendido_por bigint references public.usuarios (id),
  comentario_resolucion text,
  fecha_resolucion timestamptz,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create trigger trg_solicitudes_reposicion_fecha_actualizacion
  before update on public.solicitudes_reposicion
  for each row execute function public.fn_fecha_actualizacion();

alter table public.solicitudes_reposicion enable row level security;

insert into public.permisos (modulo, accion, descripcion) values
  ('logistica', 'solicitar', 'Solicitar reposición de piezas agotadas'),
  ('logistica', 'gestionar', 'Ver y resolver solicitudes de reposición, alertas de inventario')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('asesor','logistica','solicitar'),
  ('admin','logistica','gestionar'), ('coordinador','logistica','gestionar'), ('produccion','logistica','gestionar')
) as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

create policy sel_solicitudes_reposicion on public.solicitudes_reposicion
  for select to authenticated
  using (
    solicitante_id = public.fn_usuario_id()
    or public.fn_tiene_permiso('logistica','gestionar')
  );

create or replace function public.fn_crear_solicitud_reposicion(
  p_categoria_id bigint,
  p_material_id bigint,
  p_descripcion text,
  p_cantidad_sugerida int default null
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_solicitud_id bigint;
  v_nombre text;
begin
  if not public.fn_tiene_permiso('logistica','solicitar') then
    raise exception 'No tienes permiso para solicitar reposición';
  end if;

  select nombre into v_nombre from public.usuarios where id = public.fn_usuario_id();

  insert into public.solicitudes_reposicion (solicitante_id, categoria_id, material_id, descripcion, cantidad_sugerida)
  values (public.fn_usuario_id(), p_categoria_id, p_material_id, p_descripcion, p_cantidad_sugerida)
  returning id into v_solicitud_id;

  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
  select u.id, 'solicitud_reposicion', 'Nueva solicitud de reposición',
         v_nombre || ' solicitó reposición de piezas.', '/logistica'
    from public.usuarios u
    where u.rol_id = (select id from public.roles where nombre = 'produccion')
      and u.activo;

  return v_solicitud_id;
end;
$$;

create or replace function public.fn_resolver_solicitud_reposicion(
  p_solicitud_id bigint,
  p_estado text,
  p_comentario text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_solicitud public.solicitudes_reposicion%rowtype;
begin
  if not public.fn_tiene_permiso('logistica','gestionar') then
    raise exception 'No tienes permiso para resolver solicitudes';
  end if;
  if p_estado not in ('en_proceso','atendida','rechazada') then
    raise exception 'Estado inválido';
  end if;

  select * into v_solicitud from public.solicitudes_reposicion where id = p_solicitud_id for update;
  if not found then
    raise exception 'La solicitud no existe';
  end if;

  update public.solicitudes_reposicion
    set estado = p_estado,
        atendido_por = public.fn_usuario_id(),
        comentario_resolucion = p_comentario,
        fecha_resolucion = case when p_estado in ('atendida','rechazada') then now() else fecha_resolucion end
    where id = p_solicitud_id;

  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
  values (v_solicitud.solicitante_id, 'solicitud_reposicion_resuelta', 'Tu solicitud de reposición se actualizó',
          'Estado: ' || p_estado || coalesce(' — ' || p_comentario, ''), '/logistica');
end;
$$;

-- ------------------------------------------------------------
-- 2. Rotación y alertas de quiebre de stock
-- ------------------------------------------------------------
insert into public.parametros (clave, valor, tipo_dato, descripcion, modulo) values
  ('umbral_quiebre_stock', '2', 'numero',
   'Si las piezas disponibles de una combinación categoría+material caen a este número o menos, se marca como alerta de quiebre', 'inventario')
on conflict (clave) do nothing;

-- Velocidad de movimiento: días entre que la pieza entró a stock
-- (alta_cedi/entrada_transferencia) y se vendió, promedio por
-- categoría+material sobre piezas ya vendidas.
create view public.vw_rotacion_producto as
select
  p.categoria_id, c.nombre as categoria, p.material_id, m.nombre as material,
  count(*) as piezas_vendidas,
  avg(extract(epoch from (venta.fecha_creacion - alta.fecha_creacion)) / 86400)::numeric(10,1) as dias_promedio_venta
from public.productos p
join public.categorias c on c.id = p.categoria_id
join public.materiales m on m.id = p.material_id
join lateral (
  select min(mi.fecha_creacion) as fecha_creacion
  from public.movimientos_inventario mi
  where mi.producto_id = p.id and mi.tipo in ('alta_cedi','entrada_transferencia')
) alta on alta.fecha_creacion is not null
join lateral (
  select min(mi.fecha_creacion) as fecha_creacion
  from public.movimientos_inventario mi
  where mi.producto_id = p.id and mi.tipo = 'venta'
) venta on venta.fecha_creacion is not null
where p.estado in ('vendida','entregada')
  and public.fn_tiene_permiso('logistica','gestionar')
group by p.categoria_id, c.nombre, p.material_id, m.nombre;

grant select on public.vw_rotacion_producto to authenticated;
revoke all on public.vw_rotacion_producto from anon;

-- Alertas: combinaciones categoría+material con pocas piezas
-- disponibles hoy en toda la red.
create view public.vw_alertas_quiebre_stock as
select
  p.categoria_id, c.nombre as categoria, p.material_id, m.nombre as material,
  count(*) as piezas_disponibles
from public.productos p
join public.categorias c on c.id = p.categoria_id
join public.materiales m on m.id = p.material_id
where p.activo
  and p.estado in ('disponible_cedi','disponible_tienda')
  and public.fn_tiene_permiso('logistica','gestionar')
group by p.categoria_id, c.nombre, p.material_id, m.nombre
having count(*) <= (select valor::int from public.parametros where clave = 'umbral_quiebre_stock');

grant select on public.vw_alertas_quiebre_stock to authenticated;
revoke all on public.vw_alertas_quiebre_stock from anon;

-- ------------------------------------------------------------
-- 3. Clasificación de lento movimiento — configurable, por pieza
-- ------------------------------------------------------------
insert into public.parametros (clave, valor, tipo_dato, descripcion, modulo) values
  ('dias_pieza_lenta', '60', 'numero',
   'Días sin movimiento a partir de los cuales una pieza se considera de lento movimiento', 'inventario')
on conflict (clave) do nothing;

-- Reemplaza el umbral de 60 días hardcodeado por el parámetro.
create or replace view public.vw_inventario_valorizado as
select
  p.tienda_id, t.nombre as tienda, t.tipo as tienda_tipo,
  count(*) as piezas,
  sum(coalesce(p.costo_produccion, 0)) as capital_inmovilizado,
  sum(coalesce(p.precio_venta, 0)) as valor_venta_potencial,
  count(*) filter (
    where coalesce(p.fecha_actualizacion, p.fecha_creacion)
      < now() - ((select valor from public.parametros where clave = 'dias_pieza_lenta') || ' days')::interval
  ) as piezas_sin_movimiento_60d
from public.productos p
left join public.tiendas t on t.id = p.tienda_id
where p.activo and p.estado in ('disponible_cedi', 'disponible_tienda')
  and public.fn_tiene_permiso('finanzas','ver')
group by p.tienda_id, t.nombre, t.tipo;

grant select on public.vw_inventario_valorizado to authenticated;
revoke all on public.vw_inventario_valorizado from anon;

-- Igual, pero por pieza individual (para poder actuar sobre una
-- pieza puntual, no solo ver el agregado).
create view public.vw_piezas_lentas as
select
  p.id, p.codigo, p.nombre, c.nombre as categoria, m.nombre as material,
  p.tienda_id, t.nombre as tienda, p.precio_venta,
  coalesce(p.fecha_actualizacion, p.fecha_creacion) as ultimo_movimiento,
  extract(day from now() - coalesce(p.fecha_actualizacion, p.fecha_creacion))::int as dias_sin_movimiento
from public.productos p
left join public.categorias c on c.id = p.categoria_id
left join public.materiales m on m.id = p.material_id
left join public.tiendas t on t.id = p.tienda_id
where p.activo
  and p.estado in ('disponible_cedi','disponible_tienda')
  and coalesce(p.fecha_actualizacion, p.fecha_creacion)
    < now() - ((select valor from public.parametros where clave = 'dias_pieza_lenta') || ' days')::interval
  and (
    public.fn_rol_actual() in ('admin','coordinador','supervisor','contabilidad')
    or (public.fn_rol_actual() = 'tienda' and p.tienda_id = public.fn_mi_tienda_id())
  );

grant select on public.vw_piezas_lentas to authenticated;
revoke all on public.vw_piezas_lentas from anon;

-- ------------------------------------------------------------
-- 4. Descuento por falta de movimiento (afecta el precio real de
-- venta) — no muta precio_venta, se preserva el precio de catálogo.
-- ------------------------------------------------------------
alter table public.productos add column precio_descuento numeric(12,2);
alter table public.productos add column descuento_motivo text;
alter table public.productos add column descuento_por bigint references public.usuarios (id);
alter table public.productos add column descuento_fecha timestamptz;

insert into public.permisos (modulo, accion, descripcion) values
  ('inventario', 'marcar_descuento', 'Marcar o quitar el descuento de una pieza por falta de movimiento')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('admin','inventario','marcar_descuento'), ('supervisor','inventario','marcar_descuento'),
  -- La vista vw_inventario_tienda ya se amplía a supervisor abajo;
  -- sin esto, la página /inventario seguiría rechazándolo en el gate.
  ('supervisor','inventario','ver')
) as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

-- El rol supervisor no está atado a una tienda física (es jerarquía
-- de personas, no de bodegas) — su alcance de descuento no se acota
-- por tienda, solo por tener el permiso. También se le da visión de
-- inventario de toda la red (pedido: "ver los productos a su
-- disposición"), igual que coordinador/contabilidad.
drop view if exists public.vw_inventario_tienda;
create view public.vw_inventario_tienda as
select
  p.id, p.codigo, p.nombre,
  c.nombre as categoria,
  m.nombre as material,
  p.peso_gramos, p.kilataje, p.piedras,
  p.estado,
  coalesce(p.precio_descuento, p.precio_venta) as precio_venta,
  p.precio_venta as precio_lista,
  (p.precio_descuento is not null) as en_descuento,
  p.costo_produccion, p.moneda_id,
  p.tienda_id,
  t.nombre as tienda, t.tipo as tienda_tipo,
  (select i.url from public.producto_imagenes i
     where i.producto_id = p.id
     order by i.es_principal desc, i.orden asc limit 1) as imagen_principal,
  p.fecha_actualizacion, p.fecha_creacion
from public.productos p
left join public.categorias c on c.id = p.categoria_id
left join public.materiales m on m.id = p.material_id
left join public.tiendas t on t.id = p.tienda_id
where p.activo
  and (
    public.fn_rol_actual() in ('admin','coordinador','contabilidad','supervisor')
    or (public.fn_rol_actual() = 'tienda' and p.tienda_id = public.fn_mi_tienda_id())
  );

grant select on public.vw_inventario_tienda to authenticated;
revoke all on public.vw_inventario_tienda from anon;

-- CREATE OR REPLACE VIEW solo admite agregar columnas al final —
-- no reordenar ni insertar en medio de las ya existentes (rompería
-- con "cannot change name of view column"). precio_lista/en_descuento
-- van al final; el resto conserva el orden original exacto.
create or replace view public.vw_catalogo as
select
  p.id,
  p.codigo,
  p.nombre,
  p.descripcion,
  p.categoria_id,
  c.nombre  as categoria,
  p.material_id,
  m.nombre  as material,
  p.peso_gramos,
  p.kilataje,
  p.piedras,
  coalesce(p.precio_descuento, p.precio_venta) as precio_venta,
  p.moneda_id,
  p.estado,
  p.tienda_id,
  t.nombre  as tienda,
  (select i.url from public.producto_imagenes i
     where i.producto_id = p.id
     order by i.es_principal desc, i.orden asc limit 1) as imagen_principal,
  (select coalesce(jsonb_agg(jsonb_build_object('url', i.url, 'orden', i.orden)
                             order by i.orden), '[]'::jsonb)
     from public.producto_imagenes i where i.producto_id = p.id) as imagenes,
  p.precio_venta as precio_lista,
  (p.precio_descuento is not null) as en_descuento
from public.productos p
left join public.categorias c on c.id = p.categoria_id
left join public.materiales m on m.id = p.material_id
left join public.tiendas t on t.id = p.tienda_id
where p.activo
  and (
    p.estado in ('disponible_cedi','disponible_tienda')
    or (p.estado = 'en_transito'
        and public.fn_parametro('politica_piezas_transito') = 'proximamente')
  );

grant select on public.vw_catalogo to authenticated;
revoke all on public.vw_catalogo from anon;

create or replace function public.fn_catalogo_por_token(p_token text)
returns table (
  id bigint, codigo text, nombre text, descripcion text,
  categoria text, material text, peso_gramos numeric, kilataje text, piedras text,
  precio_venta numeric, imagen_principal text, imagenes jsonb
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_link public.links_venta%rowtype;
begin
  select * into v_link from public.links_venta where token = p_token;
  if not found or v_link.estado <> 'activo'
     or (v_link.fecha_vencimiento is not null and v_link.fecha_vencimiento < now()) then
    raise exception 'Enlace inválido o vencido';
  end if;

  return query
    select
      p.id, p.codigo, p.nombre, p.descripcion,
      c.nombre, m.nombre, p.peso_gramos, p.kilataje, p.piedras,
      coalesce(p.precio_descuento, p.precio_venta),
      (select i.url from public.producto_imagenes i
         where i.producto_id = p.id order by i.es_principal desc, i.orden asc limit 1),
      (select coalesce(jsonb_agg(jsonb_build_object('url', i.url, 'orden', i.orden) order by i.orden), '[]'::jsonb)
         from public.producto_imagenes i where i.producto_id = p.id)
    from public.productos p
    left join public.categorias c on c.id = p.categoria_id
    left join public.materiales m on m.id = p.material_id
    where p.activo
      and p.estado in ('disponible_cedi','disponible_tienda')
      and (
        v_link.tipo = 'catalogo'
        or exists (select 1 from public.link_productos lp
                   where lp.link_id = v_link.id and lp.producto_id = p.id)
      );
end;
$$;

create or replace function public.fn_marcar_descuento_pieza(
  p_producto_id bigint,
  p_precio_descuento numeric,
  p_motivo text
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
begin
  if not public.fn_tiene_permiso('inventario','marcar_descuento') then
    raise exception 'No tienes permiso para marcar descuentos';
  end if;

  select * into v_producto from public.productos where id = p_producto_id;
  if not found then
    raise exception 'La pieza no existe';
  end if;
  if p_precio_descuento is null or p_precio_descuento <= 0 or p_precio_descuento >= coalesce(v_producto.precio_venta, 0) then
    raise exception 'El precio de descuento debe ser mayor a 0 y menor al precio de lista';
  end if;

  update public.productos
    set precio_descuento = p_precio_descuento,
        descuento_motivo = p_motivo,
        descuento_por = public.fn_usuario_id(),
        descuento_fecha = now()
    where id = p_producto_id;
end;
$$;

create or replace function public.fn_quitar_descuento_pieza(p_producto_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('inventario','marcar_descuento') then
    raise exception 'No tienes permiso para quitar descuentos';
  end if;

  update public.productos
    set precio_descuento = null, descuento_motivo = null, descuento_por = null, descuento_fecha = null
    where id = p_producto_id;
end;
$$;

-- ------------------------------------------------------------
-- 5. Descuento propio del embajador — sale de SU comisión, no del
-- precio que paga el cliente ni de lo que gana el resto de la red.
-- Solo aplica en fn_registrar_venta (venta con sesión autenticada
-- del embajador) — en fn_confirmar_carrito quien llena el checkout
-- es el cliente final anónimo, no el embajador, así que ahí no
-- tiene sentido este parámetro (esa función solo se actualiza para
-- respetar precio_descuento, igual que el resto del catálogo).
-- ------------------------------------------------------------
alter table public.ventas add column descuento_embajador numeric(12,2) not null default 0;

insert into public.permisos (modulo, accion, descripcion) values
  ('ventas', 'descuento_embajador', 'Aplicar un descuento personal que se descuenta de tu propia comisión')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values ('embajador','ventas','descuento_embajador'))
  as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

-- CREATE OR REPLACE FUNCTION no reemplaza si la lista de argumentos
-- cambia (agregar p_descuento_embajador_pct crearía una función
-- sobrecargada nueva, dejando viva la versión de 7 parámetros) — se
-- elimina esa firma explícitamente antes de crear la de 8.
drop function if exists public.fn_registrar_venta(bigint[], text, text, text, numeric, text, bigint);

create or replace function public.fn_registrar_venta(
  p_producto_ids bigint[],
  p_cliente_nombre text,
  p_cliente_telefono text,
  p_metodo_pago text,
  p_monto numeric,
  p_referencia text default null,
  p_separado_id bigint default null,
  p_descuento_embajador_pct numeric default null
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
  v_separado public.separados%rowtype;
  v_cliente_id bigint;
  v_venta_id bigint;
  v_pedido_id bigint;
  v_subtotal numeric := 0;
  v_descuento_pct numeric;
  v_descuento_monto numeric;
  v_descuento_embajador_monto numeric := 0;
  v_canal text;
  v_tienda_id bigint;
  v_id bigint;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if not public.fn_tiene_permiso('ventas','crear') then
    raise exception 'No tienes permiso para registrar ventas';
  end if;
  if p_producto_ids is null or array_length(p_producto_ids, 1) is null then
    raise exception 'La venta necesita al menos una pieza';
  end if;
  if p_metodo_pago not in ('tarjeta','transferencia','deposito','pasarela') then
    raise exception 'Método de pago inválido';
  end if;

  if p_separado_id is not null then
    select * into v_separado from public.separados where id = p_separado_id for update;
    if not found or v_separado.estado <> 'activo' then
      raise exception 'El separado indicado no está activo';
    end if;
    if v_separado.vendedor_id <> public.fn_usuario_id() and public.fn_rol_actual() <> 'admin' then
      raise exception 'Solo el vendedor que separó la pieza puede concretar la venta';
    end if;
    if array_length(p_producto_ids, 1) <> 1 or p_producto_ids[1] <> v_separado.producto_id then
      raise exception 'La venta desde un separado debe incluir únicamente esa pieza';
    end if;
  end if;

  v_canal := case public.fn_rol_actual()
    when 'tienda' then 'tienda'
    when 'asesor' then 'asesor'
    when 'embajador' then 'embajador'
    else 'asesor'
  end;

  foreach v_id in array p_producto_ids loop
    select * into v_producto from public.productos where id = v_id for update;

    if not found then
      raise exception 'La pieza % no existe', v_id;
    end if;
    if p_separado_id is not null then
      if v_producto.estado <> 'separada' then
        raise exception 'La pieza % ya no está separada', v_producto.codigo;
      end if;
    elsif v_producto.estado not in ('disponible_cedi','disponible_tienda') then
      raise exception 'La pieza % no está disponible para vender (estado: %)',
        v_producto.codigo, v_producto.estado;
    end if;

    v_subtotal := v_subtotal + coalesce(v_producto.precio_descuento, v_producto.precio_venta, 0);
    v_tienda_id := coalesce(v_tienda_id, v_producto.tienda_id);
  end loop;

  v_cliente_id := public.fn_obtener_o_crear_cliente(p_cliente_nombre, p_cliente_telefono);

  v_descuento_pct := public.fn_descuento_desempeno(public.fn_usuario_id());
  v_descuento_monto := round(v_subtotal * v_descuento_pct / 100, 2);

  if p_descuento_embajador_pct is not null and p_descuento_embajador_pct <> 0 then
    if not public.fn_tiene_permiso('ventas','descuento_embajador') then
      raise exception 'No tienes permiso para aplicar un descuento personal';
    end if;
    if p_descuento_embajador_pct < 0 or p_descuento_embajador_pct > 100 then
      raise exception 'El descuento personal debe estar entre 0 y 100';
    end if;
    v_descuento_embajador_monto := round(v_subtotal * p_descuento_embajador_pct / 100, 2);
  end if;

  insert into public.ventas
    (vendedor_id, tienda_id, cliente_id, canal, subtotal, descuento_desempeno, descuento_embajador, total, moneda_id, separado_id)
  values
    (public.fn_usuario_id(), v_tienda_id, v_cliente_id, v_canal, v_subtotal, v_descuento_monto, v_descuento_embajador_monto,
     v_subtotal - v_descuento_monto,
     (select id from public.monedas where codigo = 'GTQ'), p_separado_id)
  returning id into v_venta_id;

  foreach v_id in array p_producto_ids loop
    select * into v_producto from public.productos where id = v_id;

    insert into public.venta_detalles (venta_id, producto_id, precio)
    values (v_venta_id, v_id, coalesce(v_producto.precio_descuento, v_producto.precio_venta, 0));

    update public.productos set estado = 'vendida' where id = v_id;

    insert into public.movimientos_inventario (producto_id, tipo, usuario_id, referencia)
    values (v_id, 'venta', public.fn_usuario_id(), 'venta:' || v_venta_id);
  end loop;

  if p_separado_id is not null then
    update public.separados set estado = 'convertido' where id = p_separado_id;
  end if;

  insert into public.pagos (venta_id, metodo, monto, referencia)
  values (v_venta_id, p_metodo_pago, p_monto, p_referencia);

  insert into public.pedidos (venta_id)
  values (v_venta_id)
  returning id into v_pedido_id;

  perform public.fn_calcular_puntos(v_venta_id);
  perform public.fn_calcular_comisiones(v_venta_id);

  return v_venta_id;
end;
$$;

-- Solo el precio efectivo (respeta precio_descuento) — sin
-- descuento_embajador aquí, ver comentario arriba.
create or replace function public.fn_confirmar_carrito(
  p_carrito_token text,
  p_nombre text,
  p_telefono text,
  p_correo text,
  p_direccion text,
  p_metodo_pago text,
  p_referencia text default null
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_carrito public.carritos%rowtype;
  v_link public.links_venta%rowtype;
  v_detalle record;
  v_producto public.productos%rowtype;
  v_cliente_id bigint;
  v_venta_id bigint;
  v_subtotal numeric := 0;
  v_descuento_pct numeric;
  v_descuento_monto numeric;
  v_items int := 0;
begin
  if p_metodo_pago not in ('transferencia','deposito') then
    raise exception 'Para compras por enlace el pago es por transferencia o depósito';
  end if;
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre es obligatorio';
  end if;

  select * into v_carrito from public.carritos where token = p_carrito_token and estado = 'abierto' for update;
  if not found then
    raise exception 'Carrito no encontrado o ya confirmado';
  end if;

  select * into v_link from public.links_venta where id = v_carrito.link_id;

  for v_detalle in
    select * from public.carrito_detalles where carrito_id = v_carrito.id order by id
  loop
    select * into v_producto from public.productos where id = v_detalle.producto_id for update;

    if v_producto.estado <> 'retenida' or v_detalle.fecha_expiracion < now() then
      raise exception 'La pieza % ya no está disponible; se venció el tiempo de retención', v_producto.codigo;
    end if;

    v_subtotal := v_subtotal + coalesce(v_producto.precio_descuento, v_producto.precio_venta, 0);
    v_items := v_items + 1;
  end loop;

  if v_items = 0 then
    raise exception 'El carrito está vacío';
  end if;

  v_cliente_id := public.fn_obtener_o_crear_cliente_vendedor(v_link.vendedor_id, p_nombre, p_telefono, p_correo);

  v_descuento_pct := public.fn_descuento_desempeno(v_link.vendedor_id);
  v_descuento_monto := round(v_subtotal * v_descuento_pct / 100, 2);

  insert into public.ventas (vendedor_id, cliente_id, canal, link_id, subtotal, descuento_desempeno, total, moneda_id)
  values (v_link.vendedor_id, v_cliente_id, 'link', v_link.id, v_subtotal, v_descuento_monto,
          v_subtotal - v_descuento_monto, (select id from public.monedas where codigo = 'GTQ'))
  returning id into v_venta_id;

  for v_detalle in
    select * from public.carrito_detalles where carrito_id = v_carrito.id order by id
  loop
    select * into v_producto from public.productos where id = v_detalle.producto_id;

    insert into public.venta_detalles (venta_id, producto_id, precio)
    values (v_venta_id, v_detalle.producto_id, coalesce(v_producto.precio_descuento, v_producto.precio_venta, 0));

    update public.productos set estado = 'vendida' where id = v_detalle.producto_id;

    insert into public.movimientos_inventario (producto_id, tipo, referencia)
    values (v_detalle.producto_id, 'venta', 'venta:' || v_venta_id);
  end loop;

  insert into public.pagos (venta_id, metodo, monto, referencia)
  values (v_venta_id, p_metodo_pago, v_subtotal, p_referencia);

  insert into public.pedidos (venta_id, direccion_entrega)
  values (v_venta_id, p_direccion);

  update public.carritos
    set estado = 'confirmado', nombre_cliente = p_nombre, telefono = p_telefono,
        correo = p_correo, direccion = p_direccion
    where id = v_carrito.id;

  perform public.fn_calcular_puntos(v_venta_id);
  perform public.fn_calcular_comisiones(v_venta_id);

  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
  values (v_link.vendedor_id, 'venta_confirmada', 'Venta por enlace confirmada',
          'Se registró una venta por tu enlace. Sube o espera el comprobante para aprobarla.',
          '/ventas');

  return v_venta_id;
end;
$$;

-- fn_calcular_comisiones — mismo cuerpo de la Fase 3 + el descuento
-- del embajador se resta de SU PROPIA comisión por_venta (nunca
-- negativa), consumiendo el monto entre las reglas que le apliquen.
create or replace function public.fn_calcular_comisiones(p_venta_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_venta public.ventas%rowtype;
  v_periodo_id bigint;
  v_rol_vendedor bigint;
  v_rol_embajador_id bigint;
  v_nombre_vendedor text;
  v_regla record;
  v_ancestro record;
  v_monto numeric;
  v_pct_catalogo numeric;
  v_descuento_restante numeric;
  v_aplicado numeric;
begin
  select * into v_venta from public.ventas where id = p_venta_id;
  if not found then
    return;
  end if;

  v_periodo_id := public.fn_obtener_periodo_actual();
  select rol_id, nombre into v_rol_vendedor, v_nombre_vendedor
    from public.usuarios where id = v_venta.vendedor_id;
  select id into v_rol_embajador_id from public.roles where nombre = 'embajador';
  v_descuento_restante := coalesce(v_venta.descuento_embajador, 0);

  -- Comisión directa por venta
  for v_regla in
    select * from public.reglas_comision
      where activo and tipo = 'por_venta'
        and (rol_id is null or rol_id = v_rol_vendedor)
        and (vigencia_inicio is null or vigencia_inicio <= v_venta.fecha_creacion)
        and (vigencia_fin is null or vigencia_fin >= v_venta.fecha_creacion)
  loop
    v_monto := public.fn_calcular_comision_regla(
      v_regla.tipo, v_regla.porcentaje, v_regla.monto_fijo, v_regla.condiciones, p_venta_id);

    if v_rol_vendedor = v_rol_embajador_id and v_descuento_restante > 0 and v_monto > 0 then
      v_aplicado := least(v_monto, v_descuento_restante);
      v_monto := v_monto - v_aplicado;
      v_descuento_restante := v_descuento_restante - v_aplicado;
    end if;

    if v_monto <> 0 then
      insert into public.comisiones (usuario_id, venta_id, regla_id, regla_version, periodo_id, monto, motivo)
      values (v_venta.vendedor_id, p_venta_id, v_regla.id, v_regla.version, v_periodo_id, v_monto, v_regla.nombre);
    end if;
  end loop;

  -- Comisión de liderazgo: cada ascendente cuyo rol coincide con
  -- regla.rol_id gana un % de esta venta (red de supervisión) —
  -- el subtotal usado aquí NUNCA se reduce por descuento_embajador,
  -- ese costo lo absorbe únicamente el embajador.
  for v_regla in
    select * from public.reglas_comision
      where activo and tipo = 'liderazgo'
        and (vigencia_inicio is null or vigencia_inicio <= v_venta.fecha_creacion)
        and (vigencia_fin is null or vigencia_fin >= v_venta.fecha_creacion)
  loop
    for v_ancestro in
      select u.id from public.vw_cadena_mando cm
        join public.usuarios u on u.id = cm.ancestro_id
        where cm.descendiente_id = v_venta.vendedor_id
          and (v_regla.rol_id is null or u.rol_id = v_regla.rol_id)
    loop
      v_monto := round(coalesce(v_regla.monto_fijo, 0) + v_venta.total * coalesce(v_regla.porcentaje, 0) / 100, 2);
      if v_monto <> 0 then
        insert into public.comisiones (usuario_id, venta_id, regla_id, regla_version, periodo_id, monto, motivo)
        values (v_ancestro.id, p_venta_id, v_regla.id, v_regla.version, v_periodo_id, v_monto,
                v_regla.nombre || ' — red de ' || v_nombre_vendedor);
      end if;
    end loop;
  end loop;

  -- Comisión por catálogo compartido (solo ventas por enlace, y
  -- solo si hay al menos una regla catalogo_embajador activa)
  if v_venta.canal = 'link' and v_venta.link_id is not null then
    select coalesce(
      (select comision_embajador_pct from public.links_venta where id = v_venta.link_id),
      (select valor::numeric from public.parametros where clave = 'comision_embajador_catalogo_pct_default')
    ) into v_pct_catalogo;

    if v_pct_catalogo is not null and v_pct_catalogo <> 0 then
      for v_regla in
        select * from public.reglas_comision
          where activo and tipo = 'catalogo_embajador'
            and (vigencia_inicio is null or vigencia_inicio <= v_venta.fecha_creacion)
            and (vigencia_fin is null or vigencia_fin >= v_venta.fecha_creacion)
      loop
        v_monto := round(v_venta.total * v_pct_catalogo / 100, 2);
        if v_monto <> 0 then
          insert into public.comisiones (usuario_id, venta_id, regla_id, regla_version, periodo_id, monto, motivo)
          values (v_venta.vendedor_id, p_venta_id, v_regla.id, v_regla.version, v_periodo_id, v_monto,
                  'Comisión por catálogo compartido (' || v_pct_catalogo || '%)');
        end if;
      end loop;
    end if;
  end if;
end;
$$;

-- Verificación
select clave, valor from public.parametros where clave in ('umbral_quiebre_stock','dias_pieza_lenta');
