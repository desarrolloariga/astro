-- ============================================================
-- ASTRO — Cuentas por pagar (fase 5). Reemplaza el registro de Gastos.
--
--   facturas_proveedor        factura FEL (o recibo) del proveedor: serie,
--                             número, autorización, NIT, total, IVA crédito,
--                             vencimiento, soporte. Correlativo interno.
--   factura_proveedor_lineas  reparto de la base (total − IVA crédito) por
--                             cuenta contable y centro de costo.
--   pagos_proveedor           pagos parciales o totales desde una cuenta
--                             bancaria; cada pago crea su movimiento de banco.
--
-- Contabilidad:
--   Factura manual   D cuentas de las líneas [CC] + IVA crédito   H Proveedores
--   Pago             D Proveedores   H Banco  (por el movimiento bancario)
--   Factura de OC    sin partida: el inventario y la deuda ya se registraron
--                    al recibir la orden (solo queda en CxP y libro de compras)
-- Una OC marcada como facturada crea su factura de proveedor automáticamente.
-- El estado de resultados suma las líneas de gasto de CxP a los gastos
-- (vw_gastos_er), así que Gastos queda solo como histórico.
-- Usa los permisos de contabilidad (ver / registrar). Requiere 022–030.
-- ============================================================

create sequence if not exists public.facturas_proveedor_correlativo_seq;

create table public.facturas_proveedor (
  id bigint generated always as identity primary key,
  correlativo bigint not null unique default nextval('public.facturas_proveedor_correlativo_seq'),
  origen text not null default 'manual' check (origen in ('manual', 'orden_compra')),
  orden_compra_id bigint unique references public.ordenes_compra (id),
  proveedor_id bigint references public.proveedores (id),
  tipo_documento text not null default 'factura'
    check (tipo_documento in ('factura', 'factura_pequeno_contribuyente', 'recibo', 'otro')),
  serie text,
  numero text not null check (btrim(numero) <> ''),
  numero_autorizacion text,
  fecha_emision date not null,
  fecha_vencimiento date,
  nit text not null default 'CF',
  nombre text not null check (btrim(nombre) <> ''),
  descripcion text,
  total numeric(14,2) not null check (total > 0),
  iva_credito numeric(14,2) not null default 0 check (iva_credito >= 0),
  estado text not null default 'vigente' check (estado in ('vigente', 'anulada')),
  motivo_anulacion text,
  fecha_anulacion timestamptz,
  anulado_por bigint references public.usuarios (id),
  soporte_url text,
  registrado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now(),
  check (iva_credito < total),
  check (fecha_vencimiento is null or fecha_vencimiento >= fecha_emision)
);
alter sequence public.facturas_proveedor_correlativo_seq owned by public.facturas_proveedor.correlativo;
create unique index uq_factura_proveedor_documento on public.facturas_proveedor (nit, coalesce(serie, ''), numero) where estado = 'vigente';
create index idx_facturas_proveedor_fecha on public.facturas_proveedor (fecha_emision);

create table public.factura_proveedor_lineas (
  id bigint generated always as identity primary key,
  factura_id bigint not null references public.facturas_proveedor (id) on delete cascade,
  linea smallint not null,
  cuenta_id bigint not null references public.cuentas_contables (id),
  centro_costo_id bigint references public.centros_costo (id),
  descripcion text,
  monto numeric(14,2) not null check (monto > 0),
  unique (factura_id, linea)
);

create table public.pagos_proveedor (
  id bigint generated always as identity primary key,
  factura_id bigint not null references public.facturas_proveedor (id),
  fecha date not null,
  monto numeric(14,2) not null check (monto > 0),
  cuenta_bancaria_id bigint not null references public.cuentas_bancarias (id),
  referencia text,
  movimiento_banco_id bigint references public.movimientos_banco (id),
  anulado boolean not null default false,
  motivo_anulacion text,
  registrado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now()
);
create index idx_pagos_proveedor_factura on public.pagos_proveedor (factura_id) where not anulado;

alter table public.movimientos_banco add column if not exists pago_proveedor_id bigint references public.pagos_proveedor (id);
create unique index if not exists uq_movimientos_banco_pago_proveedor on public.movimientos_banco (pago_proveedor_id)
  where pago_proveedor_id is not null and not anulado;

create trigger trg_auditar_facturas_proveedor after insert or update or delete on public.facturas_proveedor
  for each row execute function public.fn_auditar();
create trigger trg_auditar_pagos_proveedor after insert or update or delete on public.pagos_proveedor
  for each row execute function public.fn_auditar();

do $$
declare t text;
begin
  foreach t in array array['facturas_proveedor', 'factura_proveedor_lineas', 'pagos_proveedor'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy sel_%1$s on public.%1$I for select to authenticated using ((select public.fn_tiene_permiso(''contabilidad'', ''ver'')))', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- 1. Utilidades
-- ------------------------------------------------------------
create or replace function public.fn_cxp_normalizar_nit(p_nit text)
returns text
language plpgsql immutable
as $$
declare
  v text := upper(regexp_replace(coalesce(p_nit, ''), '[\s-]', '', 'g'));
begin
  if v = '' then
    return 'CF';
  end if;
  if v <> 'CF' and v !~ '^[0-9]+[0-9K]$' then
    raise exception 'NIT no válido: usa solo números (y K al final si corresponde) o CF';
  end if;
  return v;
end;
$$;

-- Pagado de una factura: pagos de CxP + (facturas de OC) pagos directos de la OC en bancos.
create or replace function public.fn_cxp_pagado(p_factura_id bigint, p_hasta date default null)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select coalesce((select sum(pp.monto) from public.pagos_proveedor pp
                   where pp.factura_id = f.id and not pp.anulado and (p_hasta is null or pp.fecha <= p_hasta)), 0)
       + coalesce((select sum(m.monto) from public.movimientos_banco m
                   where f.orden_compra_id is not null and m.orden_compra_id = f.orden_compra_id and not m.anulado
                     and m.pago_proveedor_id is null and (p_hasta is null or m.fecha <= p_hasta)), 0)
  from public.facturas_proveedor f where f.id = p_factura_id;
$$;

revoke all on function public.fn_cxp_pagado(bigint, date) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. Registrar, completar y anular facturas
-- ------------------------------------------------------------
-- p_lineas: [{cuenta_id, centro_costo_id, descripcion, monto}] — suman total − IVA crédito.
create or replace function public.fn_cxp_registrar_factura(
  p_proveedor_id bigint, p_tipo text, p_serie text, p_numero text, p_autorizacion text,
  p_fecha date, p_vencimiento date, p_nit text, p_nombre text, p_descripcion text,
  p_total numeric, p_iva numeric, p_lineas jsonb, p_soporte text default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_prov public.proveedores%rowtype;
  v_nit text;
  v_nombre text;
  v_iva numeric := round(coalesce(p_iva, 0), 2);
  v_total numeric := round(coalesce(p_total, 0), 2);
  v_regimen text;
  v_l jsonb;
  v_cuenta public.cuentas_contables%rowtype;
  v_suma numeric := 0;
  v_n smallint := 0;
  v_id bigint;
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para registrar facturas de proveedor';
  end if;
  if p_tipo not in ('factura', 'factura_pequeno_contribuyente', 'recibo', 'otro') then
    raise exception 'Tipo de documento no válido';
  end if;
  if coalesce(btrim(p_numero), '') = '' or p_fecha is null then
    raise exception 'Indica número y fecha del documento';
  end if;
  if v_total <= 0 then
    raise exception 'El total debe ser mayor a 0';
  end if;
  if p_proveedor_id is not null then
    select * into v_prov from public.proveedores where id = p_proveedor_id;
  end if;
  v_nit := public.fn_cxp_normalizar_nit(coalesce(nullif(btrim(coalesce(p_nit, '')), ''), v_prov.nit));
  v_nombre := coalesce(nullif(btrim(coalesce(p_nombre, '')), ''), v_prov.nombre);
  if v_nombre is null then
    raise exception 'Indica el proveedor o el nombre del emisor';
  end if;
  -- Solo la factura normal da IVA crédito, y solo en régimen general.
  select regimen_iva into v_regimen from public.empresa_contable where id = 1;
  if p_tipo <> 'factura' or v_regimen <> 'general' then
    v_iva := 0;
  end if;
  if v_iva >= v_total then
    raise exception 'El IVA crédito no puede ser igual o mayor al total';
  end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Distribuye el monto en al menos una cuenta';
  end if;

  insert into public.facturas_proveedor (proveedor_id, tipo_documento, serie, numero, numero_autorizacion, fecha_emision,
    fecha_vencimiento, nit, nombre, descripcion, total, iva_credito, soporte_url, registrado_por)
  values (p_proveedor_id, p_tipo, nullif(upper(btrim(coalesce(p_serie, ''))), ''), btrim(p_numero),
    nullif(btrim(coalesce(p_autorizacion, '')), ''), p_fecha, p_vencimiento, v_nit, v_nombre,
    nullif(btrim(coalesce(p_descripcion, '')), ''), v_total, v_iva, p_soporte, public.fn_usuario_id())
  returning id into v_id;

  for v_l in select * from jsonb_array_elements(p_lineas) loop
    continue when round(coalesce(nullif(v_l ->> 'monto', '')::numeric, 0), 2) = 0;
    select * into v_cuenta from public.cuentas_contables where id = (v_l ->> 'cuenta_id')::bigint;
    if not found or not v_cuenta.es_detalle or not v_cuenta.activo then
      raise exception 'Cada línea necesita una cuenta de detalle activa';
    end if;
    if v_cuenta.exige_centro_costo and nullif(v_l ->> 'centro_costo_id', '') is null then
      raise exception 'La cuenta % % es de %: asigna un centro de costo', v_cuenta.codigo, v_cuenta.nombre, v_cuenta.tipo;
    end if;
    v_n := v_n + 1;
    insert into public.factura_proveedor_lineas (factura_id, linea, cuenta_id, centro_costo_id, descripcion, monto)
    values (v_id, v_n, v_cuenta.id,
            case when v_cuenta.tipo in ('activo', 'pasivo', 'patrimonio') then null else nullif(v_l ->> 'centro_costo_id', '')::bigint end,
            nullif(btrim(coalesce(v_l ->> 'descripcion', '')), ''), round((v_l ->> 'monto')::numeric, 2));
    v_suma := v_suma + round((v_l ->> 'monto')::numeric, 2);
  end loop;
  if v_suma <> v_total - v_iva then
    raise exception 'Las líneas suman Q % y deben sumar Q % (total − IVA crédito)',
      to_char(v_suma, 'FM999,999,990.00'), to_char(v_total - v_iva, 'FM999,999,990.00');
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Ya está registrado el documento % del NIT %', concat_ws('-', nullif(upper(btrim(coalesce(p_serie, ''))), ''), btrim(p_numero)), v_nit;
end;
$$;

grant execute on function public.fn_cxp_registrar_factura(bigint, text, text, text, text, date, date, text, text, text, numeric, numeric, jsonb, text)
  to authenticated;

-- Factura de una orden de compra recibida (no genera partida).
create or replace function public.fn_cxp_crear_desde_oc_interno(p_oc_id bigint, p_serie text, p_numero text, p_autorizacion text,
  p_fecha date, p_vencimiento date)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  o public.ordenes_compra%rowtype;
  v_prov public.proveedores%rowtype;
  v_regimen text;
  v_id bigint;
begin
  select * into o from public.ordenes_compra where id = p_oc_id;
  if not found or o.estado not in ('recibida_total', 'facturada', 'pagada') then
    raise exception 'La orden de compra debe estar recibida para registrar su factura';
  end if;
  select id into v_id from public.facturas_proveedor where orden_compra_id = p_oc_id;
  if found then
    return v_id;
  end if;
  select * into v_prov from public.proveedores where id = o.proveedor_id;
  select regimen_iva into v_regimen from public.empresa_contable where id = 1;
  insert into public.facturas_proveedor (origen, orden_compra_id, proveedor_id, tipo_documento, serie, numero, numero_autorizacion,
    fecha_emision, fecha_vencimiento, nit, nombre, descripcion, total, iva_credito, registrado_por)
  values ('orden_compra', o.id, o.proveedor_id, 'factura', nullif(upper(btrim(coalesce(p_serie, ''))), ''),
    coalesce(nullif(btrim(coalesce(p_numero, '')), ''), 'OC-' || o.id), nullif(btrim(coalesce(p_autorizacion, '')), ''),
    coalesce(p_fecha, public.fn_ctb_fecha(coalesce(o.fecha_facturacion, o.fecha_recepcion_total, now()))),
    p_vencimiento, public.fn_cxp_normalizar_nit(v_prov.nit), coalesce(v_prov.nombre, 'Proveedor'),
    'Orden de compra #' || o.id, o.total,
    case when v_regimen = 'general' then least(coalesce(o.impuestos, 0), o.total - 0.01) else 0 end,
    public.fn_usuario_id())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.fn_cxp_crear_desde_oc_interno(bigint, text, text, text, date, date) from public, anon, authenticated;

create or replace function public.fn_cxp_crear_desde_oc(p_oc_id bigint, p_serie text, p_numero text, p_autorizacion text,
  p_fecha date, p_vencimiento date)
returns bigint
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para registrar facturas de proveedor';
  end if;
  return public.fn_cxp_crear_desde_oc_interno(p_oc_id, p_serie, p_numero, p_autorizacion, p_fecha, p_vencimiento);
end;
$$;

grant execute on function public.fn_cxp_crear_desde_oc(bigint, text, text, text, date, date) to authenticated;

-- Al marcar una OC como facturada se crea su factura de proveedor.
create or replace function public.fn_trg_cxp_oc_facturada()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_serie text;
  v_numero text := btrim(coalesce(new.numero_factura_proveedor, ''));
begin
  if new.estado = 'facturada' and old.estado is distinct from 'facturada'
     and not exists (select 1 from public.facturas_proveedor where orden_compra_id = new.id) then
    -- "SERIE-NÚMERO" se separa; si no, todo va al número.
    if v_numero ~ '^[A-Za-z0-9]+-[0-9]+$' then
      v_serie := split_part(v_numero, '-', 1);
      v_numero := split_part(v_numero, '-', 2);
    end if;
    perform public.fn_cxp_crear_desde_oc_interno(new.id, v_serie, nullif(v_numero, ''), null, null, null);
  end if;
  return null;
end;
$$;

create trigger trg_cxp_oc_facturada after update of estado on public.ordenes_compra
  for each row execute function public.fn_trg_cxp_oc_facturada();

create or replace function public.fn_cxp_completar_factura(p_id bigint, p_serie text, p_numero text, p_autorizacion text,
  p_fecha date, p_vencimiento date)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para editar facturas de proveedor';
  end if;
  update public.facturas_proveedor
    set serie = nullif(upper(btrim(coalesce(p_serie, ''))), ''),
        numero = coalesce(nullif(btrim(coalesce(p_numero, '')), ''), numero),
        numero_autorizacion = nullif(btrim(coalesce(p_autorizacion, '')), ''),
        fecha_emision = coalesce(p_fecha, fecha_emision),
        fecha_vencimiento = p_vencimiento
    where id = p_id and estado = 'vigente';
  if not found then
    raise exception 'La factura no existe o está anulada';
  end if;
exception when unique_violation then
  raise exception 'Ya existe otro documento con esa serie y número para ese NIT';
end;
$$;

grant execute on function public.fn_cxp_completar_factura(bigint, text, text, text, date, date) to authenticated;

create or replace function public.fn_cxp_anular_factura(p_id bigint, p_motivo text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para anular facturas de proveedor';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo de la anulación';
  end if;
  if exists (select 1 from public.pagos_proveedor where factura_id = p_id and not anulado) then
    raise exception 'La factura tiene pagos: anúlalos primero';
  end if;
  update public.facturas_proveedor
    set estado = 'anulada', motivo_anulacion = btrim(p_motivo), fecha_anulacion = now(), anulado_por = public.fn_usuario_id()
    where id = p_id and estado = 'vigente';
  if not found then
    raise exception 'La factura no existe o ya está anulada';
  end if;
end;
$$;

grant execute on function public.fn_cxp_anular_factura(bigint, text) to authenticated;

-- ------------------------------------------------------------
-- 3. Pagos
-- ------------------------------------------------------------
create or replace function public.fn_cxp_registrar_pago(p_factura_id bigint, p_cuenta_bancaria_id bigint, p_fecha date,
  p_monto numeric, p_referencia text default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  f public.facturas_proveedor%rowtype;
  v_saldo numeric;
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_pago bigint;
  v_mov bigint;
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para registrar pagos a proveedores';
  end if;
  select * into f from public.facturas_proveedor where id = p_factura_id for update;
  if not found or f.estado <> 'vigente' then
    raise exception 'La factura no existe o está anulada';
  end if;
  if not exists (select 1 from public.cuentas_bancarias where id = p_cuenta_bancaria_id and activa) then
    raise exception 'Elige una cuenta bancaria activa';
  end if;
  if p_fecha is null then
    raise exception 'Indica la fecha del pago';
  end if;
  v_saldo := f.total - public.fn_cxp_pagado(f.id);
  if v_monto <= 0 or v_monto > v_saldo then
    raise exception 'El pago debe ser mayor a 0 y no mayor al saldo (Q %)', to_char(v_saldo, 'FM999,999,990.00');
  end if;

  insert into public.pagos_proveedor (factura_id, fecha, monto, cuenta_bancaria_id, referencia, registrado_por)
  values (f.id, p_fecha, v_monto, p_cuenta_bancaria_id, nullif(btrim(coalesce(p_referencia, '')), ''), public.fn_usuario_id())
  returning id into v_pago;
  insert into public.movimientos_banco (cuenta_id, fecha, tipo, origen, monto, descripcion, referencia, pago_proveedor_id, registrado_por)
  values (p_cuenta_bancaria_id, p_fecha, 'egreso', 'pago_proveedor', v_monto,
          'Pago a ' || f.nombre || ' · doc. ' || concat_ws('-', f.serie, f.numero), nullif(btrim(coalesce(p_referencia, '')), ''),
          v_pago, public.fn_usuario_id())
  returning id into v_mov;
  update public.pagos_proveedor set movimiento_banco_id = v_mov where id = v_pago;

  -- Orden de compra totalmente pagada.
  if f.orden_compra_id is not null and v_monto = v_saldo then
    update public.ordenes_compra set estado = 'pagada', fecha_pago = now() where id = f.orden_compra_id and estado = 'facturada';
  end if;
  return v_pago;
end;
$$;

grant execute on function public.fn_cxp_registrar_pago(bigint, bigint, date, numeric, text) to authenticated;

create or replace function public.fn_cxp_anular_pago(p_pago_id bigint, p_motivo text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  p public.pagos_proveedor%rowtype;
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para anular pagos a proveedores';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo de la anulación';
  end if;
  select * into p from public.pagos_proveedor where id = p_pago_id for update;
  if not found or p.anulado then
    raise exception 'El pago no existe o ya está anulado';
  end if;
  if exists (select 1 from public.movimientos_banco where id = p.movimiento_banco_id and conciliado) then
    raise exception 'El movimiento bancario del pago ya está conciliado: no se puede anular';
  end if;
  update public.pagos_proveedor set anulado = true, motivo_anulacion = btrim(p_motivo) where id = p_pago_id;
  update public.movimientos_banco set anulado = true, motivo_anulacion = 'Pago a proveedor anulado: ' || btrim(p_motivo)
    where id = p.movimiento_banco_id and not anulado;
end;
$$;

grant execute on function public.fn_cxp_anular_pago(bigint, text) to authenticated;

-- ------------------------------------------------------------
-- 4. Consultas
-- ------------------------------------------------------------
create or replace function public.fn_cxp_base(p_hasta date)
returns table (
  id bigint, correlativo bigint, origen text, orden_compra_id bigint, proveedor_id bigint, tipo_documento text,
  serie text, numero text, numero_autorizacion text, fecha_emision date, fecha_vencimiento date, nit text, nombre text,
  descripcion text, total numeric, iva_credito numeric, estado text, pagado numeric, saldo numeric, estado_pago text,
  dias_vencida int)
language sql stable security definer
set search_path = public
as $$
  select f.id, f.correlativo, f.origen, f.orden_compra_id, f.proveedor_id, f.tipo_documento, f.serie, f.numero,
         f.numero_autorizacion, f.fecha_emision, f.fecha_vencimiento, f.nit, f.nombre, f.descripcion, f.total, f.iva_credito,
         f.estado, x.pagado,
         case when f.estado = 'anulada' then 0 else greatest(f.total - x.pagado, 0) end,
         case when f.estado = 'anulada' then 'anulada'
              when f.total - x.pagado <= 0.004 then 'pagada'
              when x.pagado > 0 then 'parcial'
              else 'pendiente' end,
         case when f.estado = 'vigente' and f.total - x.pagado > 0.004
              then greatest(p_hasta - coalesce(f.fecha_vencimiento, f.fecha_emision), 0) end
  from public.facturas_proveedor f
  cross join lateral (select public.fn_cxp_pagado(f.id, p_hasta) as pagado) x
  where f.fecha_emision <= p_hasta;
$$;

revoke all on function public.fn_cxp_base(date) from public, anon, authenticated;

create or replace function public.fn_cxp_consulta(
  p_desde date, p_hasta date, p_estado text default null, p_proveedor_id bigint default null,
  p_buscar text default null, p_offset int default 0, p_limit int default 100)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_q text := nullif(btrim(coalesce(p_buscar, '')), '');
  v_total int;
  v_totales jsonb;
  v_filas jsonb;
begin
  if not public.fn_tiene_permiso('contabilidad', 'ver') then
    raise exception 'No tienes permiso para ver cuentas por pagar';
  end if;
  with b as (
    select * from public.fn_cxp_base(p_hasta) x
    where x.fecha_emision between p_desde and p_hasta
      and (p_estado is null or x.estado_pago = p_estado or (p_estado = 'vencida' and x.dias_vencida > 0))
      and (p_proveedor_id is null or x.proveedor_id = p_proveedor_id)
      and (v_q is null or x.nombre ilike '%' || v_q || '%' or x.nit ilike '%' || v_q || '%' or x.numero = v_q
           or concat_ws('-', x.serie, x.numero) ilike '%' || v_q || '%' or x.correlativo::text = v_q)
  ),
  pagina as (
    select * from b order by fecha_emision desc, id desc
    offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 100), 1), 5000)
  )
  select (select count(*) from b),
         (select jsonb_build_object(
            'total', coalesce(sum(total) filter (where estado <> 'anulada'), 0),
            'iva_credito', coalesce(sum(iva_credito) filter (where estado <> 'anulada'), 0),
            'pagado', coalesce(sum(pagado) filter (where estado <> 'anulada'), 0),
            'saldo', coalesce(sum(saldo), 0),
            'vencido', coalesce(sum(saldo) filter (where dias_vencida > 0), 0)) from b),
         (select coalesce(jsonb_agg(to_jsonb(pagina) order by pagina.fecha_emision desc, pagina.id desc), '[]'::jsonb) from pagina)
    into v_total, v_totales, v_filas;
  return jsonb_build_object('total', v_total, 'totales', v_totales, 'filas', v_filas);
end;
$$;

grant execute on function public.fn_cxp_consulta(date, date, text, bigint, text, int, int) to authenticated;

-- Cartera por pagar a una fecha, por días de atraso desde el vencimiento.
create or replace function public.fn_cxp_antiguedad(p_corte date)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_filas jsonb;
  v_totales jsonb;
begin
  if not public.fn_tiene_permiso('contabilidad', 'ver') then
    raise exception 'No tienes permiso para ver cuentas por pagar';
  end if;
  with b as (
    select x.*, p_corte - coalesce(x.fecha_vencimiento, x.fecha_emision) as atraso
    from public.fn_cxp_base(p_corte) x where x.estado = 'vigente' and x.saldo > 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'correlativo', correlativo, 'serie', serie, 'numero', numero, 'nit', nit, 'nombre', nombre,
           'fecha_emision', fecha_emision, 'fecha_vencimiento', fecha_vencimiento, 'total', total, 'saldo', saldo,
           'dias_atraso', greatest(atraso, 0),
           'por_vencer', case when atraso <= 0 then saldo else 0 end,
           'tramo_1_30', case when atraso between 1 and 30 then saldo else 0 end,
           'tramo_31_60', case when atraso between 31 and 60 then saldo else 0 end,
           'tramo_61_90', case when atraso between 61 and 90 then saldo else 0 end,
           'tramo_90', case when atraso > 90 then saldo else 0 end) order by atraso desc, id), '[]'::jsonb),
         jsonb_build_object(
           'total', coalesce(sum(total), 0), 'saldo', coalesce(sum(saldo), 0), 'documentos', count(*),
           'por_vencer', coalesce(sum(saldo) filter (where atraso <= 0), 0),
           'tramo_1_30', coalesce(sum(saldo) filter (where atraso between 1 and 30), 0),
           'tramo_31_60', coalesce(sum(saldo) filter (where atraso between 31 and 60), 0),
           'tramo_61_90', coalesce(sum(saldo) filter (where atraso between 61 and 90), 0),
           'tramo_90', coalesce(sum(saldo) filter (where atraso > 90), 0))
    into v_filas, v_totales from b;
  return jsonb_build_object('corte', p_corte, 'filas', v_filas, 'totales', v_totales);
end;
$$;

grant execute on function public.fn_cxp_antiguedad(date) to authenticated;

create or replace function public.fn_cxp_factura(p_id bigint)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('contabilidad', 'ver') then
    raise exception 'No tienes permiso para ver cuentas por pagar';
  end if;
  return jsonb_build_object(
    'factura', (select to_jsonb(b) from public.fn_cxp_base(public.fn_ctb_hoy()) b where b.id = p_id),
    'soporte', (select soporte_url from public.facturas_proveedor where id = p_id),
    'motivo_anulacion', (select motivo_anulacion from public.facturas_proveedor where id = p_id),
    'lineas', coalesce((select jsonb_agg(jsonb_build_object('codigo', c.codigo, 'cuenta', c.nombre, 'centro_costo', cc.codigo,
                                   'descripcion', l.descripcion, 'monto', l.monto) order by l.linea)
                        from public.factura_proveedor_lineas l join public.cuentas_contables c on c.id = l.cuenta_id
                        left join public.centros_costo cc on cc.id = l.centro_costo_id where l.factura_id = p_id), '[]'::jsonb),
    'pagos', coalesce((select jsonb_agg(jsonb_build_object('id', pp.id, 'fecha', pp.fecha, 'monto', pp.monto, 'cuenta', cb.nombre,
                                  'referencia', pp.referencia, 'anulado', pp.anulado, 'motivo_anulacion', pp.motivo_anulacion,
                                  'conciliado', m.conciliado) order by pp.fecha, pp.id)
                       from public.pagos_proveedor pp join public.cuentas_bancarias cb on cb.id = pp.cuenta_bancaria_id
                       left join public.movimientos_banco m on m.id = pp.movimiento_banco_id where pp.factura_id = p_id), '[]'::jsonb),
    'pagos_oc', coalesce((select jsonb_agg(jsonb_build_object('fecha', m.fecha, 'monto', m.monto, 'cuenta', cb.nombre, 'referencia', m.referencia)
                                           order by m.fecha)
                          from public.facturas_proveedor f join public.movimientos_banco m on m.orden_compra_id = f.orden_compra_id
                          join public.cuentas_bancarias cb on cb.id = m.cuenta_id
                          where f.id = p_id and not m.anulado and m.pago_proveedor_id is null), '[]'::jsonb),
    'partida_id', (select id from public.partidas where origen = 'factura_proveedor' and origen_id = p_id and revertida_por_id is null
                   and estado = 'contabilizada' limit 1));
end;
$$;

grant execute on function public.fn_cxp_factura(bigint) to authenticated;

-- Órdenes recibidas que aún no tienen factura de proveedor.
create or replace function public.fn_cxp_ordenes_sin_factura()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select case when public.fn_tiene_permiso('contabilidad', 'ver') then
    coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'proveedor', p.nombre, 'estado', o.estado, 'total', o.total,
                                                 'fecha', public.fn_ctb_fecha(coalesce(o.fecha_recepcion_total, o.fecha_creacion)))
                               order by o.id desc)
              from public.ordenes_compra o left join public.proveedores p on p.id = o.proveedor_id
              where o.estado in ('recibida_total', 'facturada', 'pagada')
                and not exists (select 1 from public.facturas_proveedor f where f.orden_compra_id = o.id)), '[]'::jsonb)
  else '[]'::jsonb end;
$$;

grant execute on function public.fn_cxp_ordenes_sin_factura() to authenticated;

-- Proveedores y cuentas bancarias para los formularios de CxP.
create or replace function public.fn_cxp_catalogos()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select case when public.fn_tiene_permiso('contabilidad', 'ver') then jsonb_build_object(
    'proveedores', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'nit', nit) order by nombre)
                             from public.proveedores where activo), '[]'::jsonb),
    'cuentas_bancarias', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre) order by nombre)
                                   from public.cuentas_bancarias where activa), '[]'::jsonb))
  else '{}'::jsonb end;
$$;

grant execute on function public.fn_cxp_catalogos() to authenticated;

-- ------------------------------------------------------------
-- 5. Contabilidad de la factura
-- ------------------------------------------------------------
create or replace function public.fn_ctb_b_factura_proveedor(p_id bigint, p_fecha date)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  f public.facturas_proveedor%rowtype;
  v_lineas jsonb := '[]'::jsonb;
  l record;
begin
  select * into f from public.facturas_proveedor where id = p_id;
  if not found or f.estado <> 'vigente' or f.origen <> 'manual' then
    return;
  end if;
  for l in select * from public.factura_proveedor_lineas where factura_id = p_id order by linea loop
    v_lineas := v_lineas || public.fn_ctb_linea(l.cuenta_id, l.centro_costo_id, l.monto, 0, l.descripcion);
  end loop;
  v_lineas := v_lineas
    || public.fn_ctb_linea(public.fn_ctb_cuenta('compra.iva_credito'), null, f.iva_credito, 0, 'IVA crédito')
    || public.fn_ctb_linea(public.fn_ctb_cuenta('compra.proveedores'), null, 0, f.total, f.nombre);
  perform public.fn_ctb_registrar_auto('factura_proveedor', p_id, p_fecha,
    'Factura de proveedor ' || concat_ws('-', f.serie, f.numero) || ' · ' || f.nombre, v_lineas);
end;
$$;

revoke all on function public.fn_ctb_b_factura_proveedor(bigint, date) from public, anon, authenticated;
revoke all on function public.fn_trg_cxp_oc_facturada() from public, anon, authenticated;

create or replace function public.fn_trg_ctb_factura_proveedor()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.estado = 'vigente' and new.origen = 'manual' then
    perform public.fn_ctb_despachar('factura_proveedor', new.id, 'contabilizar');
  elsif tg_op = 'UPDATE' and new.estado = 'anulada' and old.estado = 'vigente' and new.origen = 'manual' then
    perform public.fn_ctb_despachar('factura_proveedor', new.id, 'revertir');
  end if;
  return null;
end;
$$;

revoke all on function public.fn_trg_ctb_factura_proveedor() from public, anon, authenticated;

create constraint trigger trg_ctb_facturas_proveedor after insert or update of estado on public.facturas_proveedor
  deferrable initially deferred for each row execute function public.fn_trg_ctb_factura_proveedor();

-- ------------------------------------------------------------
-- 6. Estado de resultados: gastos = Gastos (histórico) + líneas de gasto de CxP
-- ------------------------------------------------------------
create or replace view public.vw_gastos_er as
select g.fecha, g.clasificacion, g.categoria, g.monto, g.anulado
from public.gastos g
union all
select f.fecha_emision,
       case when c.tipo = 'ingreso' then 'otro_ingreso' when c.codigo like '6.02.%' then 'financiero' else 'operativo' end,
       coalesce((select substr(e.clave, 7) from public.config_contable_eventos e
                 where e.cuenta_id = l.cuenta_id and e.grupo = 'Gastos por categoría' order by e.orden limit 1), 'otros'),
       l.monto, f.estado = 'anulada'
from public.facturas_proveedor f
join public.factura_proveedor_lineas l on l.factura_id = f.id
join public.cuentas_contables c on c.id = l.cuenta_id
where f.origen = 'manual' and c.tipo in ('gasto', 'ingreso');

revoke all on public.vw_gastos_er from public, anon, authenticated;

do $$
declare
  v_def text := pg_get_functiondef('public.fn_estado_resultados(date,date)'::regprocedure);
  v_ancla text := 'from public.gastos';
  v_veces int;
begin
  v_veces := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
  if v_veces <> 2 then
    raise exception 'fn_estado_resultados: se esperaban 2 lecturas de public.gastos y hay % — no se aplicó ningún cambio', v_veces;
  end if;
  execute replace(v_def, v_ancla, 'from public.vw_gastos_er');
end $$;

-- El motor reconoce el origen «factura_proveedor».
create or replace function public.fn_ctb_fecha_evento(p_origen text, p_id bigint)
returns date
language plpgsql stable security definer
set search_path = public
as $$
begin
  return case p_origen
    when 'venta' then (
      select public.fn_ctb_fecha(coalesce(
        (select max(c.fecha_revision) from public.comprobantes c join public.pagos p on p.id = c.pago_id
          where p.venta_id = v.id and c.estado = 'aprobado'),
        (select max(coalesce(p.fecha_actualizacion, p.fecha_creacion)) from public.pagos p
          where p.venta_id = v.id and p.estado = 'confirmado'),
        v.fecha_creacion))
      from public.ventas v where v.id = p_id)
    when 'pago' then (
      select public.fn_ctb_fecha(coalesce(
        (select max(c.fecha_revision) from public.comprobantes c where c.pago_id = p.id and c.estado = 'aprobado'),
        p.fecha_actualizacion, p.fecha_creacion))
      from public.pagos p where p.id = p_id)
    when 'bolsa' then (select public.fn_ctb_fecha(fecha) from public.movimientos_bolsa where id = p_id)
    when 'gasto' then (select fecha from public.gastos where id = p_id)
    when 'banco' then (select fecha from public.movimientos_banco where id = p_id)
    when 'compra' then (
      select public.fn_ctb_fecha(coalesce(fecha_recepcion_total, fecha_actualizacion, fecha_creacion))
      from public.ordenes_compra where id = p_id)
    when 'metal' then (
      select public.fn_ctb_fecha(coalesce(fecha_confirmacion, fecha_actualizacion, fecha_creacion))
      from public.recepciones_metal where id = p_id)
    when 'liquidacion' then (
      select public.fn_ctb_fecha(coalesce(fecha_aprobacion, fecha_actualizacion, fecha_creacion))
      from public.liquidaciones where id = p_id)
    when 'canje' then (
      select public.fn_ctb_fecha(coalesce(fecha_atencion, fecha_creacion)) from public.canjes_premios where id = p_id)
    when 'saldo_banco' then (select fecha_saldo_inicial from public.cuentas_bancarias where id = p_id)
    when 'toma' then (select public.fn_ctb_fecha(coalesce(fecha_aprobacion, now())) from public.tomas_fisicas where id = p_id)
    when 'factura_proveedor' then (select fecha_emision from public.facturas_proveedor where id = p_id)
  end;
end;
$$;

create or replace function public.fn_ctb_construir(p_origen text, p_id bigint, p_fecha date)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  case p_origen
    when 'venta' then perform public.fn_ctb_b_venta(p_id, p_fecha);
    when 'pago' then perform public.fn_ctb_b_pago(p_id, p_fecha);
    when 'bolsa' then perform public.fn_ctb_b_bolsa(p_id, p_fecha);
    when 'gasto' then perform public.fn_ctb_b_gasto(p_id, p_fecha);
    when 'banco' then perform public.fn_ctb_b_banco(p_id, p_fecha);
    when 'compra' then perform public.fn_ctb_b_compra(p_id, p_fecha);
    when 'metal' then perform public.fn_ctb_b_metal(p_id, p_fecha);
    when 'liquidacion' then perform public.fn_ctb_b_liquidacion(p_id, p_fecha);
    when 'canje' then perform public.fn_ctb_b_canje(p_id, p_fecha);
    when 'saldo_banco' then perform public.fn_ctb_b_saldo_banco(p_id, p_fecha);
    when 'toma' then perform public.fn_ctb_b_toma(p_id, p_fecha);
    when 'factura_proveedor' then perform public.fn_ctb_b_factura_proveedor(p_id, p_fecha);
    else raise exception 'Origen contable desconocido: %', p_origen;
  end case;
end;
$$;

revoke all on function public.fn_ctb_construir(text, bigint, date) from public, anon, authenticated;
revoke all on function public.fn_ctb_fecha_evento(text, bigint) from public, anon, authenticated;

-- Verificación
select
  (select count(*) from information_schema.tables where table_schema = 'public'
     and table_name in ('facturas_proveedor', 'factura_proveedor_lineas', 'pagos_proveedor')) as tablas,
  (select position('vw_gastos_er' in pg_get_functiondef('public.fn_estado_resultados(date,date)'::regprocedure)) > 0) as estado_resultados_con_cxp;
