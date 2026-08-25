-- ============================================================
-- ASTRO — Comprobantes de pago robustos (Fase E de "formularios nivel
-- Odoo/SAP"). Hoy un comprobante es solo un archivo subido — sin
-- referencia bancaria, sin quién lo subió. Esto último no es solo un
-- campo más: cierra un hueco real de segregación de funciones (sin
-- subido_por, nada impedía que quien registra un pago apruebe su
-- propio comprobante).
-- ============================================================

alter table public.comprobantes
  add column numero_referencia text,
  add column banco_origen text,
  add column fecha_pago date,
  add column monto_declarado numeric(12,2),
  add column subido_por bigint references public.usuarios (id);

-- fn_revisar_comprobante — misma firma (20260810100001), gana el
-- chequeo de auto-aprobación.
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
  if v_comprobante.subido_por is not null and v_comprobante.subido_por = public.fn_usuario_id() then
    raise exception 'No puedes aprobar un comprobante que tú mismo subiste — pide que lo revise otra persona';
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

-- Verificación
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'comprobantes'
  and column_name in ('numero_referencia', 'banco_origen', 'fecha_pago', 'monto_declarado', 'subido_por');
