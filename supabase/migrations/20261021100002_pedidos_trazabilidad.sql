-- ============================================================
-- ASTRO — Fase 2: trazabilidad de pedidos.
--
-- Hasta ahora un pedido solo tenía 4 columnas fecha_* y un
-- confirmado_por que se sobrescribía en cada paso — no había forma de
-- reconstruir quién hizo qué ni de mostrar una línea de tiempo. Se
-- agrega:
--   - estados pago_rechazado y en_preparacion (este último lo usa la
--     torre de control de logística, Fase 3)
--   - columnas de quién/cuándo por cada paso
--   - pedido_eventos: historial inmutable de cada cambio de estado
--   - fn_revisar_comprobante: la venta pasa a "pagada" solo cuando
--     TODOS sus pagos están confirmados (antes bastaba el primero), el
--     rechazo deja el pedido en pago_rechazado, y la aprobación
--     notifica a quien despacha (permiso pedidos.despachar) en vez de
--     a todo producción
--   - fn_reenviar_comprobante: el vendedor sube otro comprobante tras
--     un rechazo y el pedido vuelve a revisión
-- ============================================================

-- ------------------------------------------------------------
-- 1. Estados
-- ------------------------------------------------------------
alter table public.pedidos drop constraint if exists pedidos_estado_check;
alter table public.pedidos add constraint pedidos_estado_check
  check (estado in ('en_espera','pago_rechazado','listo_para_despacho','en_preparacion','despachado','entregado'));

-- ------------------------------------------------------------
-- 2. Quién/cuándo por paso
-- ------------------------------------------------------------
alter table public.pedidos
  add column fecha_aprobacion_pago timestamptz,
  add column aprobado_por bigint references public.usuarios (id),
  add column fecha_preparacion timestamptz,
  add column despachado_por bigint references public.usuarios (id),
  add column recibido_por bigint references public.usuarios (id);

create trigger trg_auditar_pedidos
  after insert or update or delete on public.pedidos
  for each row execute function public.fn_auditar();

-- ------------------------------------------------------------
-- 3. Historial de eventos
-- ------------------------------------------------------------
create table public.pedido_eventos (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references public.pedidos (id),
  estado text not null,
  usuario_id bigint references public.usuarios (id),
  comentario text,
  fecha timestamptz not null default now()
);

create index idx_pedido_eventos_pedido on public.pedido_eventos (pedido_id, fecha);

alter table public.pedido_eventos enable row level security;

create policy sel_pedido_eventos on public.pedido_eventos
  for select to authenticated
  using (exists (select 1 from public.pedidos pe where pe.id = pedido_id));
-- (visible exactamente para quien ya ve el pedido — la RLS de pedidos
-- se evalúa dentro del exists)

grant select on public.pedido_eventos to authenticated;

create or replace function public.fn_registrar_evento_pedido(
  p_pedido_id bigint,
  p_estado text,
  p_comentario text default null
)
returns void
language sql security definer
set search_path = public
as $$
  insert into public.pedido_eventos (pedido_id, estado, usuario_id, comentario)
  values (p_pedido_id, p_estado, public.fn_usuario_id(), p_comentario);
$$;

revoke all on function public.fn_registrar_evento_pedido(bigint, text, text) from public, anon, authenticated;

-- Todo pedido nuevo arranca con su evento "creado / pago en revisión".
create or replace function public.fn_evento_pedido_creado()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.fn_registrar_evento_pedido(new.id, new.estado, 'Pedido creado');
  return new;
end;
$$;

create trigger trg_evento_pedido_creado
  after insert on public.pedidos
  for each row execute function public.fn_evento_pedido_creado();

-- Backfill de los pedidos existentes desde sus columnas fecha_*.
insert into public.pedido_eventos (pedido_id, estado, usuario_id, comentario, fecha)
select id, 'en_espera', null::bigint, 'Pedido creado', fecha_creacion from public.pedidos
union all
select id, 'listo_para_despacho', null::bigint, 'Pago aprobado', fecha_listo_despacho from public.pedidos
  where fecha_listo_despacho is not null
union all
select id, 'despachado', null::bigint, 'Enviado', fecha_despacho from public.pedidos
  where fecha_despacho is not null
union all
select id, 'entregado', confirmado_por, 'Recibido', fecha_entrega from public.pedidos
  where fecha_entrega is not null;

update public.pedidos set fecha_aprobacion_pago = fecha_listo_despacho
  where fecha_listo_despacho is not null and fecha_aprobacion_pago is null;

-- ------------------------------------------------------------
-- 4. Documentos del pedido
-- ------------------------------------------------------------
-- El check original no tiene nombre explícito: se elimina cualquier
-- check sobre la columna tipo, sin importar cómo lo nombró Postgres.
do $$
declare
  r record;
begin
  for r in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.pedido_documentos'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%tipo%'
  loop
    execute format('alter table public.pedido_documentos drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.pedido_documentos add constraint pedido_documentos_tipo_check
  check (tipo in ('guia','evidencia_entrega','otro','orden_despacho','firma_despacho'));
alter table public.pedido_documentos add column subido_por bigint references public.usuarios (id);

-- ------------------------------------------------------------
-- 5. fn_revisar_comprobante — misma firma
-- ------------------------------------------------------------
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
  v_pedido_id bigint;
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
  if v_comprobante.subido_por is not null and v_comprobante.subido_por = public.fn_usuario_id() then
    raise exception 'No puedes aprobar un comprobante que tú mismo subiste — pide que lo revise otra persona';
  end if;

  select venta_id into v_venta_id from public.pagos where id = v_comprobante.pago_id;
  select id into v_pedido_id from public.pedidos where venta_id = v_venta_id;

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
    if not exists (
      select 1 from public.pagos where venta_id = v_venta_id and estado <> 'confirmado'
    ) then
      update public.ventas set estado = 'pagada' where id = v_venta_id;

      update public.pedidos
        set estado = 'listo_para_despacho',
            fecha_listo_despacho = now(),
            fecha_aprobacion_pago = now(),
            aprobado_por = public.fn_usuario_id()
        where id = v_pedido_id and estado in ('en_espera','pago_rechazado');

      if found then
        perform public.fn_registrar_evento_pedido(v_pedido_id, 'listo_para_despacho', 'Pago aprobado por contabilidad');

        insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
        select distinct u.id, 'pedido_listo_despacho', 'Pedido listo para despacho',
               'El pedido #' || v_pedido_id || ' ya tiene el pago aprobado — listo para preparar y enviar.',
               '/logistica'
          from public.usuarios u
          join public.roles_permisos rp on rp.rol_id = u.rol_id
          join public.permisos pm on pm.id = rp.permiso_id
         where pm.modulo = 'pedidos' and pm.accion = 'despachar' and u.activo;
      end if;
    end if;
  else
    update public.pedidos set estado = 'pago_rechazado'
      where id = v_pedido_id and estado = 'en_espera';
    if found then
      perform public.fn_registrar_evento_pedido(v_pedido_id, 'pago_rechazado', p_comentario);
    end if;
  end if;

  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
  select v.vendedor_id,
         case when p_aprobado then 'comprobante_aprobado' else 'comprobante_rechazado' end,
         case when p_aprobado then 'Pago aprobado' else 'Pago rechazado' end,
         'El comprobante del pedido de la venta #' || v.id ||
           case when p_aprobado then ' fue aprobado.' else ' fue rechazado: ' || coalesce(p_comentario, '') end,
         '/pedidos/' || coalesce(v_pedido_id::text, '')
    from public.ventas v
    where v.id = v_venta_id;
end;
$$;

-- ------------------------------------------------------------
-- 6. Reenviar comprobante tras un rechazo
-- ------------------------------------------------------------
create or replace function public.fn_reenviar_comprobante(
  p_pedido_id bigint,
  p_url_archivo text,
  p_numero_referencia text default null,
  p_banco_origen text default null,
  p_fecha_pago date default null,
  p_monto_declarado numeric default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_venta public.ventas%rowtype;
  v_pago_id bigint;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if p_url_archivo is null or btrim(p_url_archivo) = '' then
    raise exception 'Adjunta el comprobante de pago';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe';
  end if;
  select * into v_venta from public.ventas where id = v_pedido.venta_id;

  if v_venta.vendedor_id <> public.fn_usuario_id()
     and v_pedido.comprador_id is distinct from public.fn_usuario_id()
     and public.fn_rol_actual() <> 'admin' then
    raise exception 'Solo quien generó el pedido puede reenviar el comprobante';
  end if;
  if v_pedido.estado <> 'pago_rechazado' then
    raise exception 'Solo se reenvía el comprobante de un pedido con pago rechazado';
  end if;

  select id into v_pago_id from public.pagos
    where venta_id = v_venta.id and estado = 'rechazado'
    order by id desc limit 1;
  if v_pago_id is null then
    raise exception 'No hay un pago rechazado para este pedido';
  end if;

  update public.pagos set estado = 'pendiente' where id = v_pago_id;

  insert into public.comprobantes
    (pago_id, url_archivo, numero_referencia, banco_origen, fecha_pago, monto_declarado, subido_por)
  values
    (v_pago_id, p_url_archivo, nullif(btrim(coalesce(p_numero_referencia, '')), ''),
     nullif(btrim(coalesce(p_banco_origen, '')), ''), p_fecha_pago, p_monto_declarado, public.fn_usuario_id());

  update public.pedidos set estado = 'en_espera' where id = p_pedido_id;
  perform public.fn_registrar_evento_pedido(p_pedido_id, 'en_espera', 'Comprobante reenviado');

  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
  select u.id, 'comprobante_por_revisar', 'Comprobante reenviado',
         'El pedido #' || p_pedido_id || ' tiene un comprobante nuevo por revisar.', '/contabilidad/comprobantes'
    from public.usuarios u
    join public.roles r on r.id = u.rol_id
   where r.nombre = 'contabilidad' and u.activo;
end;
$$;

grant execute on function public.fn_reenviar_comprobante(bigint, text, text, text, date, numeric) to authenticated;
