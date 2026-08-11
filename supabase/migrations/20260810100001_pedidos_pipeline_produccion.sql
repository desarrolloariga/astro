-- ============================================================
-- ASTRO — Pipeline pedidos → producción → despacho.
--
-- Contexto: fn_registrar_venta/fn_confirmar_carrito ya insertan
-- un pedido por cada venta (eso ya funcionaba). Lo que faltaba:
--   1. Un estado intermedio que represente "contabilidad ya dio
--      el visto bueno" — hoy se podía despachar sin pago aprobado.
--   2. Que producción pueda actuar sobre esa cola (hoy no puede
--      ni entrar a /pedidos).
--   3. Que aprobar un comprobante avise a producción.
--   4. Activar el valor 'entregada' de productos.estado, muerto
--      desde que se creó el check constraint.
-- ============================================================

-- 1. Nuevo estado intermedio
alter table public.pedidos drop constraint pedidos_estado_check;
alter table public.pedidos add constraint pedidos_estado_check
  check (estado in ('en_espera','listo_para_despacho','despachado','entregado'));

alter table public.pedidos add column if not exists fecha_listo_despacho timestamptz;

-- Backfill: pedidos en_espera cuya venta ya está pagada quedan listos
update public.pedidos p
  set estado = 'listo_para_despacho', fecha_listo_despacho = now()
  where p.estado = 'en_espera'
    and exists (select 1 from public.ventas v where v.id = p.venta_id and v.estado = 'pagada');

-- 2. Nuevo tipo de movimiento de inventario (entrega final al cliente)
alter table public.movimientos_inventario drop constraint movimientos_inventario_tipo_check;
alter table public.movimientos_inventario add constraint movimientos_inventario_tipo_check
  check (tipo in ('alta_cedi','salida_transferencia','entrada_transferencia',
                  'separado','liberacion','venta','devolucion','ajuste','baja','retenida','entrega'));

-- 3. Nuevos permisos
insert into public.permisos (modulo, accion, descripcion) values
  ('pedidos', 'despachar', 'Marcar un pedido como despachado'),
  ('pedidos', 'confirmar_entrega', 'Confirmar la entrega final de un pedido')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('admin','pedidos','despachar'), ('coordinador','pedidos','despachar'),
    ('tienda','pedidos','despachar'), ('produccion','pedidos','despachar'),
  ('admin','pedidos','confirmar_entrega'), ('coordinador','pedidos','confirmar_entrega'),
    ('tienda','pedidos','confirmar_entrega')
) as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

-- 4. fn_revisar_comprobante — mismo cuerpo, + avance del pedido a
-- listo_para_despacho cuando TODOS los pagos de la venta quedan
-- confirmados, + aviso a todo el rol producción.
create or replace function public.fn_revisar_comprobante(
  p_comprobante_id bigint,
  p_aprobado boolean,
  p_comentario text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_comprobante public.comprobantes%rowtype;
  v_venta_id bigint;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if not public.fn_tiene_permiso('comprobantes','aprobar') then
    raise exception 'No tienes permiso para revisar comprobantes';
  end if;

  select * into v_comprobante from public.comprobantes where id = p_comprobante_id for update;
  if not found then
    raise exception 'El comprobante no existe';
  end if;
  if v_comprobante.estado <> 'pendiente' then
    raise exception 'Este comprobante ya fue revisado';
  end if;

  select venta_id into v_venta_id from public.pagos where id = v_comprobante.pago_id;

  update public.comprobantes
    set estado = case when p_aprobado then 'aprobado' else 'rechazado' end,
        revisado_por = public.fn_usuario_id(),
        comentario = p_comentario,
        fecha_revision = now()
    where id = p_comprobante_id;

  update public.pagos
    set estado = case when p_aprobado then 'confirmado' else 'rechazado' end
    where id = v_comprobante.pago_id;

  if p_aprobado then
    update public.ventas set estado = 'pagada' where id = v_venta_id;

    if not exists (
      select 1 from public.pagos where venta_id = v_venta_id and estado <> 'confirmado'
    ) then
      update public.pedidos
        set estado = 'listo_para_despacho', fecha_listo_despacho = now()
        where venta_id = v_venta_id and estado = 'en_espera';

      insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
      select u.id, 'pedido_listo_despacho', 'Pedido listo para despacho',
             'La venta #' || v_venta_id || ' ya tiene el pago aprobado y está lista para despachar.',
             '/pedidos'
        from public.usuarios u
        where u.rol_id = (select id from public.roles where nombre = 'produccion')
          and u.activo;
    end if;
  end if;

  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
  select v.vendedor_id,
         case when p_aprobado then 'comprobante_aprobado' else 'comprobante_rechazado' end,
         case when p_aprobado then 'Comprobante aprobado' else 'Comprobante rechazado' end,
         'Tu comprobante de la venta #' || v.id ||
           case when p_aprobado then ' fue aprobado.' else ' fue rechazado: ' || coalesce(p_comentario, '') end,
         '/ventas'
    from public.pagos p join public.ventas v on v.id = p.venta_id
    where p.id = v_comprobante.pago_id;
end;
$$;

-- 5. fn_avanzar_pedido — recreada: despachado exige permiso
-- pedidos.despachar (ya no "soy el vendedor") y solo transiciona
-- desde listo_para_despacho (no desde en_espera); entregado exige
-- pedidos.confirmar_entrega o ser el propio vendedor (igual que
-- antes); al confirmar entrega, activa productos.estado='entregada'
-- y registra el movimiento de inventario 'entrega'.
create or replace function public.fn_avanzar_pedido(p_pedido_id bigint, p_nuevo_estado text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_venta public.ventas%rowtype;
  v_detalle record;
begin
  if p_nuevo_estado not in ('despachado','entregado') then
    raise exception 'Estado de pedido inválido';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe';
  end if;

  select * into v_venta from public.ventas where id = v_pedido.venta_id;

  if p_nuevo_estado = 'despachado' then
    if not public.fn_tiene_permiso('pedidos','despachar') then
      raise exception 'No tienes permiso para despachar pedidos';
    end if;
    if v_pedido.estado <> 'listo_para_despacho' then
      raise exception 'Solo se despacha un pedido listo para despacho (actual: %)', v_pedido.estado;
    end if;
  end if;

  if p_nuevo_estado = 'entregado' then
    if not public.fn_tiene_permiso('pedidos','confirmar_entrega')
       and v_venta.vendedor_id <> public.fn_usuario_id() then
      raise exception 'No tienes permiso sobre este pedido';
    end if;
    if v_pedido.estado <> 'despachado' then
      raise exception 'Solo se confirma entrega de un pedido despachado (actual: %)', v_pedido.estado;
    end if;
  end if;

  update public.pedidos
    set estado = p_nuevo_estado,
        fecha_despacho = case when p_nuevo_estado = 'despachado' then now() else fecha_despacho end,
        fecha_entrega = case when p_nuevo_estado = 'entregado' then now() else fecha_entrega end,
        confirmado_por = public.fn_usuario_id()
    where id = p_pedido_id;

  if p_nuevo_estado = 'entregado' then
    for v_detalle in
      select producto_id from public.venta_detalles where venta_id = v_pedido.venta_id
    loop
      update public.productos set estado = 'entregada' where id = v_detalle.producto_id and estado = 'vendida';

      insert into public.movimientos_inventario (producto_id, tipo, usuario_id, referencia)
      values (v_detalle.producto_id, 'entrega', public.fn_usuario_id(), 'pedido:' || p_pedido_id);
    end loop;
  end if;
end;
$$;

-- 6. sel_pedidos — producción hoy no está en ningún criterio de
-- visibilidad (no es admin/coordinador/contabilidad, no es el
-- vendedor, no es tienda). Se amplía para que quien tenga
-- pedidos.despachar pueda ver la cola completa.
drop policy if exists sel_pedidos on public.pedidos;
create policy sel_pedidos on public.pedidos
  for select to authenticated
  using (
    public.fn_rol_actual() in ('admin','coordinador','contabilidad')
    or public.fn_tiene_permiso('pedidos','despachar')
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

-- 7. pedido_documentos — activar (tabla y policies ya existían,
-- sin ningún UI hasta ahora). Bucket privado nuevo (ya con la
-- marca ASTRO, no hay bucket previo que migrar).
insert into storage.buckets (id, name, public)
values ('astro-pedidos', 'astro-pedidos', false)
on conflict (id) do nothing;

-- ins_pedido_documentos solo permitía al vendedor o a la tienda
-- involucrada — quien despacha/confirma entrega (producción,
-- admin, coordinador) también necesita poder subir guía/evidencia.
drop policy if exists ins_pedido_documentos on public.pedido_documentos;
create policy ins_pedido_documentos on public.pedido_documentos
  for insert to authenticated
  with check (
    public.fn_tiene_permiso('pedidos','despachar')
    or public.fn_tiene_permiso('pedidos','confirmar_entrega')
    or exists (
      select 1 from public.pedidos pe join public.ventas v on v.id = pe.venta_id
      where pe.id = pedido_id
        and (
          v.vendedor_id = public.fn_usuario_id()
          or (public.fn_rol_actual() = 'tienda' and v.tienda_id = public.fn_mi_tienda_id())
        )
    )
  );

grant select, insert on public.pedido_documentos to authenticated;

-- Verificación
select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'pedidos_estado_check';
