-- ============================================================
-- ASTRO — Cuentas por cobrar (fase 4).
--
--   facturas_venta   factura FEL de cada venta (emitida en el certificador
--                    externo; aquí se registran serie, número, autorización,
--                    NIT y nombre). Correlativo interno automático. Una
--                    factura vigente por venta; se anula con motivo.
--   clientes.nit     NIT por defecto del cliente.
--
--   fn_cxc_consulta     ventas con su factura, formas de pago y estado de
--                       cobro: liquidada (el dinero está en bancos), en
--                       tránsito (cobro confirmado aún no depositado o por
--                       liquidar) o pendiente (con saldo por cobrar)
--   fn_cxc_antiguedad   saldos por cobrar a una fecha en tramos 0–30,
--                       31–60, 61–90 y +90 días
--
-- Usa los permisos de contabilidad (ver / registrar). Requiere 022–029.
-- ============================================================

alter table public.clientes add column if not exists nit text;

create sequence if not exists public.facturas_venta_correlativo_seq;

create table public.facturas_venta (
  id bigint generated always as identity primary key,
  correlativo bigint not null unique default nextval('public.facturas_venta_correlativo_seq'),
  venta_id bigint not null references public.ventas (id),
  serie text not null check (btrim(serie) <> ''),
  numero text not null check (btrim(numero) <> ''),
  numero_autorizacion text,
  fecha_emision date not null,
  nit text not null default 'CF',
  nombre text not null check (btrim(nombre) <> ''),
  direccion text,
  total numeric(12,2) not null,
  base numeric(12,2) not null,
  impuesto numeric(12,2) not null,
  estado text not null default 'vigente' check (estado in ('vigente', 'anulada')),
  motivo_anulacion text,
  fecha_anulacion timestamptz,
  anulado_por bigint references public.usuarios (id),
  registrado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now(),
  unique (serie, numero)
);
alter sequence public.facturas_venta_correlativo_seq owned by public.facturas_venta.correlativo;
create unique index uq_factura_venta_vigente on public.facturas_venta (venta_id) where estado = 'vigente';
create index idx_facturas_venta_fecha on public.facturas_venta (fecha_emision);

create trigger trg_auditar_facturas_venta after insert or update or delete on public.facturas_venta
  for each row execute function public.fn_auditar();

alter table public.facturas_venta enable row level security;
create policy sel_facturas_venta on public.facturas_venta for select to authenticated
  using ((select public.fn_tiene_permiso('contabilidad', 'ver')));
grant select on public.facturas_venta to authenticated;

-- Impuesto incluido en el total de la venta (misma fórmula que la partida y el estado de resultados).
create or replace function public.fn_cxc_impuesto_venta(p_venta_id bigint)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select round(coalesce(sum(d.precio * d.cantidad
           * case when v.subtotal > 0 then (v.total - v.envio_cobrado) / v.subtotal else 1 end
           * coalesce(d.iva_pct, 0) / (100 + coalesce(d.iva_pct, 0))), 0), 2)
  from public.ventas v join public.venta_detalles d on d.venta_id = v.id
  where v.id = p_venta_id;
$$;

revoke all on function public.fn_cxc_impuesto_venta(bigint) from public, anon, authenticated;

-- Nombre del cliente de una venta: cliente registrado → destinatario del pedido → comprador.
create or replace function public.fn_cxc_cliente_venta(p_venta_id bigint)
returns text
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select c.nombre from public.ventas v join public.clientes c on c.id = v.cliente_id where v.id = p_venta_id),
    (select nullif(btrim(p.nombre_destinatario), '') from public.pedidos p where p.venta_id = p_venta_id limit 1),
    (select u.nombre from public.pedidos p join public.usuarios u on u.id = p.comprador_id where p.venta_id = p_venta_id limit 1),
    'Consumidor final');
$$;

revoke all on function public.fn_cxc_cliente_venta(bigint) from public, anon, authenticated;

create or replace function public.fn_cxc_registrar_factura(
  p_venta_id bigint, p_serie text, p_numero text, p_autorizacion text, p_fecha date,
  p_nit text, p_nombre text, p_direccion text default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v public.ventas%rowtype;
  v_nit text := upper(regexp_replace(coalesce(p_nit, ''), '[\s-]', '', 'g'));
  v_imp numeric;
  v_id bigint;
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para registrar facturas';
  end if;
  select * into v from public.ventas where id = p_venta_id for update;
  if not found then
    raise exception 'La venta no existe';
  end if;
  if v.estado = 'anulada' then
    raise exception 'La venta está anulada: no se le puede registrar factura';
  end if;
  if exists (select 1 from public.facturas_venta where venta_id = p_venta_id and estado = 'vigente') then
    raise exception 'La venta ya tiene una factura vigente: anúlala antes de registrar otra';
  end if;
  if v_nit = '' then
    v_nit := 'CF';
  end if;
  if v_nit <> 'CF' and v_nit !~ '^[0-9]+[0-9K]$' then
    raise exception 'NIT no válido: usa solo números (y K al final si corresponde) o CF';
  end if;
  if p_fecha is null then
    raise exception 'Indica la fecha de emisión';
  end if;
  v_imp := public.fn_cxc_impuesto_venta(p_venta_id);

  insert into public.facturas_venta (venta_id, serie, numero, numero_autorizacion, fecha_emision, nit, nombre, direccion,
                                     total, base, impuesto, registrado_por)
  values (p_venta_id, upper(btrim(p_serie)), btrim(p_numero), nullif(btrim(coalesce(p_autorizacion, '')), ''), p_fecha,
          v_nit, btrim(p_nombre), nullif(btrim(coalesce(p_direccion, '')), ''),
          v.total, v.total - v_imp, v_imp, public.fn_usuario_id())
  returning id into v_id;

  if v.cliente_id is not null and v_nit <> 'CF' then
    update public.clientes set nit = v_nit where id = v.cliente_id and nit is distinct from v_nit;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Ya existe una factura con la serie % y número %', upper(btrim(p_serie)), btrim(p_numero);
end;
$$;

grant execute on function public.fn_cxc_registrar_factura(bigint, text, text, text, date, text, text, text) to authenticated;

create or replace function public.fn_cxc_anular_factura(p_id bigint, p_motivo text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para anular facturas';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo de la anulación';
  end if;
  update public.facturas_venta
    set estado = 'anulada', motivo_anulacion = btrim(p_motivo), fecha_anulacion = now(), anulado_por = public.fn_usuario_id()
    where id = p_id and estado = 'vigente';
  if not found then
    raise exception 'La factura no existe o ya está anulada';
  end if;
end;
$$;

grant execute on function public.fn_cxc_anular_factura(bigint, text) to authenticated;

-- ------------------------------------------------------------
-- Base de la consulta: una fila por venta con su situación de cobro.
-- ------------------------------------------------------------
create or replace function public.fn_cxc_base(p_hasta date)
returns table (
  venta_id bigint, fecha date, canal text, estado_venta text, cliente text, pedido_id bigint,
  factura_id bigint, correlativo bigint, serie text, numero text, fecha_factura date, nit text,
  total numeric, cobrado numeric, en_bancos numeric, en_transito numeric, saldo numeric,
  metodos text[], estado_cobro text)
language sql stable security definer
set search_path = public
as $$
  select v.id, public.fn_ctb_fecha(v.fecha_creacion), v.canal, v.estado, public.fn_cxc_cliente_venta(v.id),
         (select p.id from public.pedidos p where p.venta_id = v.id limit 1),
         f.id, f.correlativo, f.serie, f.numero, f.fecha_emision, coalesce(f.nit, cl.nit, 'CF'),
         v.total, pg.cobrado, pg.en_bancos, pg.cobrado_dinero - pg.en_bancos,
         case when v.estado = 'anulada' then 0 else greatest(v.total - pg.cobrado, 0) end,
         pg.metodos,
         case when v.estado = 'anulada' then 'anulada'
              when v.total - pg.cobrado > 0.004 then 'pendiente'
              when pg.cobrado_dinero - pg.en_bancos > 0.004 then 'en_transito'
              else 'liquidada' end
  from public.ventas v
  left join public.clientes cl on cl.id = v.cliente_id
  left join public.facturas_venta f on f.venta_id = v.id and f.estado = 'vigente'
  cross join lateral (
    select coalesce(sum(p.monto) filter (where p.estado = 'confirmado'), 0) as cobrado,
           coalesce(sum(p.monto) filter (where p.estado = 'confirmado' and p.metodo <> 'bolsa'), 0) as cobrado_dinero,
           coalesce(sum(p.monto) filter (where p.estado = 'confirmado' and p.metodo <> 'bolsa'
             and exists (select 1 from public.movimientos_banco m where m.pago_id = p.id and not m.anulado and m.fecha <= p_hasta)), 0) as en_bancos,
           coalesce(array_agg(distinct case when p.metodo in ('tarjeta', 'pasarela') then 'tarjeta'
                                            when p.metodo = 'bolsa' then 'canje' else p.metodo end)
                    filter (where p.estado <> 'rechazado'), '{}') as metodos
    from public.pagos p where p.venta_id = v.id
  ) pg
  where public.fn_ctb_fecha(v.fecha_creacion) <= p_hasta;
$$;

revoke all on function public.fn_cxc_base(date) from public, anon, authenticated;

create or replace function public.fn_cxc_consulta(
  p_desde date, p_hasta date, p_estado text default null, p_metodo text default null,
  p_factura text default null, p_buscar text default null, p_offset int default 0, p_limit int default 100)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_filas jsonb;
  v_total int;
  v_totales jsonb;
  v_q text := nullif(btrim(coalesce(p_buscar, '')), '');
begin
  if not public.fn_tiene_permiso('contabilidad', 'ver') then
    raise exception 'No tienes permiso para ver cuentas por cobrar';
  end if;
  with b as (
    select * from public.fn_cxc_base(p_hasta) x
    where x.fecha between p_desde and p_hasta
      and (p_estado is null or x.estado_cobro = p_estado)
      and (p_metodo is null or p_metodo = any (x.metodos))
      and (p_factura is null or (p_factura = 'con' and x.factura_id is not null)
           or (p_factura = 'sin' and x.factura_id is null and x.estado_venta <> 'anulada'))
      and (v_q is null or x.cliente ilike '%' || v_q || '%' or x.nit ilike '%' || v_q || '%'
           or (x.serie || '-' || x.numero) ilike '%' || v_q || '%' or x.numero = v_q or x.venta_id::text = v_q)
  ),
  pagina as (
    select * from b order by fecha desc, venta_id desc
    offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 100), 1), 5000)
  )
  select (select count(*) from b),
         (select jsonb_build_object(
            'total', coalesce(sum(total) filter (where estado_venta <> 'anulada'), 0),
            'cobrado', coalesce(sum(cobrado) filter (where estado_venta <> 'anulada'), 0),
            'en_transito', coalesce(sum(en_transito) filter (where estado_venta <> 'anulada'), 0),
            'saldo', coalesce(sum(saldo), 0)) from b),
         (select coalesce(jsonb_agg(to_jsonb(pagina) order by pagina.fecha desc, pagina.venta_id desc), '[]'::jsonb) from pagina)
    into v_total, v_totales, v_filas;
  return jsonb_build_object('total', v_total, 'totales', v_totales, 'filas', v_filas);
end;
$$;

grant execute on function public.fn_cxc_consulta(date, date, text, text, text, text, int, int) to authenticated;

create or replace function public.fn_cxc_antiguedad(p_corte date)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_filas jsonb;
  v_totales jsonb;
begin
  if not public.fn_tiene_permiso('contabilidad', 'ver') then
    raise exception 'No tienes permiso para ver cuentas por cobrar';
  end if;
  with b as (
    select x.*, p_corte - coalesce(x.fecha_factura, x.fecha) as dias
    from public.fn_cxc_base(p_corte) x
    where x.estado_venta <> 'anulada' and x.saldo > 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'venta_id', venta_id, 'fecha', fecha, 'cliente', cliente, 'nit', nit, 'correlativo', correlativo,
           'serie', serie, 'numero', numero, 'fecha_factura', fecha_factura, 'total', total, 'saldo', saldo, 'dias', dias,
           'tramo_0_30', case when dias <= 30 then saldo else 0 end,
           'tramo_31_60', case when dias between 31 and 60 then saldo else 0 end,
           'tramo_61_90', case when dias between 61 and 90 then saldo else 0 end,
           'tramo_90', case when dias > 90 then saldo else 0 end) order by dias desc, venta_id), '[]'::jsonb),
         jsonb_build_object(
           'total', coalesce(sum(total), 0), 'saldo', coalesce(sum(saldo), 0),
           'tramo_0_30', coalesce(sum(saldo) filter (where dias <= 30), 0),
           'tramo_31_60', coalesce(sum(saldo) filter (where dias between 31 and 60), 0),
           'tramo_61_90', coalesce(sum(saldo) filter (where dias between 61 and 90), 0),
           'tramo_90', coalesce(sum(saldo) filter (where dias > 90), 0),
           'documentos', count(*))
    into v_filas, v_totales
  from b;
  return jsonb_build_object('corte', p_corte, 'filas', v_filas, 'totales', v_totales);
end;
$$;

grant execute on function public.fn_cxc_antiguedad(date) to authenticated;

-- Detalle de una venta para la ficha de cobro.
create or replace function public.fn_cxc_venta(p_venta_id bigint)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  if not public.fn_tiene_permiso('contabilidad', 'ver') then
    raise exception 'No tienes permiso para ver cuentas por cobrar';
  end if;
  select jsonb_build_object(
    'resumen', (select to_jsonb(b) from public.fn_cxc_base(public.fn_ctb_hoy()) b where b.venta_id = p_venta_id),
    'venta', (select jsonb_build_object('id', v.id, 'subtotal', v.subtotal, 'descuento', v.descuento_desempeno, 'envio', v.envio_cobrado,
                       'total', v.total, 'impuesto', public.fn_cxc_impuesto_venta(v.id), 'vendedor', u.nombre,
                       'cliente_id', v.cliente_id, 'nit_cliente', c.nit, 'direccion_cliente', c.direccion)
              from public.ventas v left join public.usuarios u on u.id = v.vendedor_id left join public.clientes c on c.id = v.cliente_id
              where v.id = p_venta_id),
    'lineas', coalesce((select jsonb_agg(jsonb_build_object('codigo', p.codigo, 'nombre', p.nombre, 'cantidad', d.cantidad, 'precio', d.precio)
                                         order by d.id)
                        from public.venta_detalles d join public.productos p on p.id = d.producto_id where d.venta_id = p_venta_id), '[]'::jsonb),
    'pagos', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', p.id, 'metodo', p.metodo, 'monto', p.monto, 'estado', p.estado, 'referencia', p.referencia,
                         'fecha', coalesce(p.fecha_actualizacion, p.fecha_creacion),
                         'banco', (select jsonb_build_object('cuenta', cb.nombre, 'fecha', m.fecha)
                                   from public.movimientos_banco m join public.cuentas_bancarias cb on cb.id = m.cuenta_id
                                   where m.pago_id = p.id and not m.anulado limit 1)) order by p.id)
                       from public.pagos p where p.venta_id = p_venta_id), '[]'::jsonb),
    'facturas', coalesce((select jsonb_agg(to_jsonb(f) - 'registrado_por' - 'anulado_por' order by f.id desc)
                          from public.facturas_venta f where f.venta_id = p_venta_id), '[]'::jsonb))
  into r;
  return r;
end;
$$;

grant execute on function public.fn_cxc_venta(bigint) to authenticated;

-- Verificación
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'facturas_venta') as tabla_facturas,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'clientes' and column_name = 'nit') as columna_nit;
