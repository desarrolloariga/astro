-- ============================================================
-- ASTRO — Fase 3: torre de control de logística.
--
-- Los pedidos con pago aprobado (listo_para_despacho) los recibe un
-- rol nuevo, logistica (además de admin/coordinador). Logística inicia
-- la preparación, verifica cada artículo en un checklist, firma
-- virtualmente y marca el envío. El proceso termina cuando quien
-- generó el pedido confirma que lo recibió.
--
-- pedidos.despachar pasa a admin, coordinador y logistica: producción
-- y tienda dejan de despachar (la torre de control centraliza envíos).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Rol logistica
-- ------------------------------------------------------------
alter table public.roles drop constraint if exists roles_nombre_check;
alter table public.roles add constraint roles_nombre_check
  check (nombre in ('admin','coordinador','supervisor','asesor','embajador','tienda','produccion','contabilidad','logistica'));

insert into public.roles (nombre, descripcion)
values ('logistica', 'Torre de control de envíos: prepara, verifica y despacha pedidos con pago aprobado')
on conflict (nombre) do nothing;

-- Permisos del rol: despachar pedidos y consultar inventario.
insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values ('logistica','pedidos','despachar'), ('logistica','inventario','ver')) as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

delete from public.roles_permisos
 where permiso_id = (select id from public.permisos where modulo = 'pedidos' and accion = 'despachar')
   and rol_id in (select id from public.roles where nombre in ('produccion','tienda'));

-- ------------------------------------------------------------
-- 2. Visibilidad: quien compró desde el backoffice también ve su pedido
-- ------------------------------------------------------------
drop policy if exists sel_pedidos on public.pedidos;
create policy sel_pedidos on public.pedidos
  for select to authenticated
  using (
    public.fn_rol_actual() in ('admin','coordinador','contabilidad')
    or public.fn_tiene_permiso('pedidos','despachar')
    or comprador_id = public.fn_usuario_id()
    or exists (
      select 1 from public.ventas v
      where v.id = venta_id
        and (
          v.vendedor_id = public.fn_usuario_id()
          or public.fn_es_mi_descendiente(v.vendedor_id)
          or (public.fn_rol_actual() = 'tienda' and v.tienda_id = public.fn_mi_tienda_id())
        )
    )
  );

-- ------------------------------------------------------------
-- 3. Checklist por artículo
-- ------------------------------------------------------------
create table public.pedido_checklist (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references public.pedidos (id),
  venta_detalle_id bigint not null references public.venta_detalles (id),
  verificado boolean not null default false,
  observacion text,
  verificado_por bigint references public.usuarios (id),
  fecha_verificacion timestamptz,
  unique (pedido_id, venta_detalle_id)
);

alter table public.pedido_checklist enable row level security;

create policy sel_pedido_checklist on public.pedido_checklist
  for select to authenticated
  using (exists (select 1 from public.pedidos pe where pe.id = pedido_id));

grant select on public.pedido_checklist to authenticated;

alter table public.pedidos
  add column firma_nombre text,
  add column guia_envio text;

-- ------------------------------------------------------------
-- 4. RPC de la torre de control (permiso pedidos.despachar)
-- ------------------------------------------------------------
create or replace function public.fn_iniciar_preparacion(p_pedido_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos%rowtype;
begin
  if not public.fn_tiene_permiso('pedidos','despachar') then
    raise exception 'No tienes permiso para preparar pedidos';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe';
  end if;
  if v_pedido.estado <> 'listo_para_despacho' then
    raise exception 'Solo se prepara un pedido con el pago aprobado (actual: %)', v_pedido.estado;
  end if;

  insert into public.pedido_checklist (pedido_id, venta_detalle_id)
  select p_pedido_id, vd.id from public.venta_detalles vd where vd.venta_id = v_pedido.venta_id
  on conflict (pedido_id, venta_detalle_id) do nothing;

  update public.pedidos set estado = 'en_preparacion', fecha_preparacion = now() where id = p_pedido_id;
  perform public.fn_registrar_evento_pedido(p_pedido_id, 'en_preparacion', 'Logística inició la preparación');
end;
$$;

create or replace function public.fn_marcar_item_checklist(
  p_pedido_id bigint,
  p_venta_detalle_id bigint,
  p_verificado boolean,
  p_observacion text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if not public.fn_tiene_permiso('pedidos','despachar') then
    raise exception 'No tienes permiso para preparar pedidos';
  end if;

  select estado into v_estado from public.pedidos where id = p_pedido_id;
  if v_estado is distinct from 'en_preparacion' then
    raise exception 'El checklist solo se edita mientras el pedido está en preparación';
  end if;

  update public.pedido_checklist
    set verificado = coalesce(p_verificado, false),
        observacion = nullif(btrim(coalesce(p_observacion, '')), ''),
        verificado_por = public.fn_usuario_id(),
        fecha_verificacion = now()
    where pedido_id = p_pedido_id and venta_detalle_id = p_venta_detalle_id;
  if not found then
    raise exception 'Ese artículo no forma parte del pedido';
  end if;
end;
$$;

create or replace function public.fn_despachar_pedido(
  p_pedido_id bigint,
  p_firma_ruta text,
  p_firma_nombre text,
  p_guia text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_pendientes int;
  v_vendedor bigint;
begin
  if not public.fn_tiene_permiso('pedidos','despachar') then
    raise exception 'No tienes permiso para despachar pedidos';
  end if;
  if p_firma_ruta is null or btrim(p_firma_ruta) = '' or p_firma_nombre is null or btrim(p_firma_nombre) = '' then
    raise exception 'La firma y el nombre de quien despacha son obligatorios';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe';
  end if;
  if v_pedido.estado <> 'en_preparacion' then
    raise exception 'Solo se envía un pedido en preparación (actual: %)', v_pedido.estado;
  end if;

  select count(*) into v_pendientes from public.pedido_checklist
    where pedido_id = p_pedido_id and not verificado;
  if v_pendientes > 0 then
    raise exception 'Faltan % artículo(s) por verificar en el checklist', v_pendientes;
  end if;

  insert into public.pedido_documentos (pedido_id, tipo, url, subido_por)
  values (p_pedido_id, 'firma_despacho', p_firma_ruta, public.fn_usuario_id());

  update public.pedidos
    set estado = 'despachado',
        fecha_despacho = now(),
        despachado_por = public.fn_usuario_id(),
        confirmado_por = public.fn_usuario_id(),
        firma_nombre = btrim(p_firma_nombre),
        guia_envio = nullif(btrim(coalesce(p_guia, '')), '')
    where id = p_pedido_id;

  perform public.fn_registrar_evento_pedido(p_pedido_id, 'despachado',
    'Enviado · firmado por ' || btrim(p_firma_nombre) ||
    coalesce(' · guía ' || nullif(btrim(coalesce(p_guia, '')), ''), ''));

  select vendedor_id into v_vendedor from public.ventas where id = v_pedido.venta_id;
  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
  select distinct x, 'pedido_despachado', 'Pedido enviado',
         'El pedido #' || p_pedido_id || ' salió a entrega. Confirma cuando lo reciban.',
         '/pedidos/' || p_pedido_id
    from unnest(array[v_vendedor, v_pedido.comprador_id]) as x
   where x is not null;
end;
$$;

create or replace function public.fn_confirmar_recepcion(p_pedido_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_venta public.ventas%rowtype;
  v_detalle record;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe';
  end if;
  select * into v_venta from public.ventas where id = v_pedido.venta_id;

  if v_venta.vendedor_id <> public.fn_usuario_id()
     and v_pedido.comprador_id is distinct from public.fn_usuario_id()
     and not public.fn_tiene_permiso('pedidos','confirmar_entrega') then
    raise exception 'Solo quien generó el pedido confirma su recepción';
  end if;
  if v_pedido.estado <> 'despachado' then
    raise exception 'Solo se confirma la recepción de un pedido enviado (actual: %)', v_pedido.estado;
  end if;

  update public.pedidos
    set estado = 'entregado', fecha_entrega = now(), recibido_por = public.fn_usuario_id(),
        confirmado_por = public.fn_usuario_id()
    where id = p_pedido_id;

  for v_detalle in
    select producto_id, cantidad from public.venta_detalles where venta_id = v_pedido.venta_id
  loop
    update public.productos set estado = 'entregada' where id = v_detalle.producto_id and estado = 'vendida';

    insert into public.movimientos_inventario (producto_id, tipo, usuario_id, referencia, cantidad)
    values (v_detalle.producto_id, 'entrega', public.fn_usuario_id(), 'pedido:' || p_pedido_id, v_detalle.cantidad);
  end loop;

  perform public.fn_registrar_evento_pedido(p_pedido_id, 'entregado', 'Recepción confirmada');
end;
$$;

grant execute on function public.fn_iniciar_preparacion(bigint) to authenticated;
grant execute on function public.fn_marcar_item_checklist(bigint, bigint, boolean, text) to authenticated;
grant execute on function public.fn_despachar_pedido(bigint, text, text, text) to authenticated;
grant execute on function public.fn_confirmar_recepcion(bigint) to authenticated;

-- fn_avanzar_pedido queda en desuso (la UI ya no la llama): despachar
-- ahora exige checklist + firma.
revoke execute on function public.fn_avanzar_pedido(bigint, text) from authenticated;
