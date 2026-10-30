-- ============================================================
-- ASTRO — Contabilidad (fase 2b): motor de partidas automáticas.
--
-- Una sola fuente de verdad para el dinero: movimientos_banco registra la
-- entrada/salida real; los documentos (venta, cobro, gasto, compra…) solo
-- registran el devengo contra cuentas puente (anticipos, cobros por
-- depositar, acreedores, proveedores, comisiones por pagar).
--
--   Venta pagada       D Anticipos            H Ventas [CC] · Envío · IVA débito
--                      (Pequeño contribuyente: D Gasto impuesto PC · H Impuesto PC por pagar)
--   Costo de la venta  D Costo de ventas [CC] H Inventario
--   Cobro confirmado   D Cobros por depositar / Tarjetas por liquidar   H Anticipos
--   Billetera +        D Comisión embajadores (abono) / Anticipos (reverso de pago)   H Pasivo Billetera
--   Billetera −        D Pasivo Billetera     H Anticipos (pago con Billetera) / Comisión (reverso)
--   Liquidación        D Comisiones de red [CC-RED]   H Comisiones por pagar
--   Gasto              D Gasto de la categoría [CC]   H Acreedores por gastos
--   Otro ingreso       D Otros ingresos por cobrar    H Otros ingresos
--   Movimiento banco   Banco ↔ cuenta puente según el origen
--   OC recibida        D Inventario (+ IVA crédito)   H Proveedores
--   Recepción metal    D Inventario           H Proveedores / Acreedores
--   Premio entregado   D Premios [CC-RED]     H Inventario de premios
--   Anulación          reversión de la partida de origen
--
-- Reglas:
--   * fn_ctb_despachar NUNCA bloquea la operación: si falla (falta un mapeo,
--     mes cerrado…) queda en contabilizacion_pendientes.
--   * Idempotente por (origen, origen_id).
--   * Solo actúa con la contabilización automática activa. La fecha de la
--     partida es la de la operación, nunca anterior a la fecha de inicio.
-- Requiere 022–025.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Utilidades
-- ------------------------------------------------------------
create or replace function public.fn_ctb_hoy()
returns date language sql stable
as $$ select (now() at time zone 'America/Guatemala')::date $$;

create or replace function public.fn_ctb_fecha(p timestamptz)
returns date language sql stable
as $$ select (p at time zone 'America/Guatemala')::date $$;

create or replace function public.fn_ctb_cuenta(p_clave text)
returns bigint
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_cuenta bigint;
  v_desc text;
begin
  select cuenta_id, descripcion into v_cuenta, v_desc from public.config_contable_eventos where clave = p_clave;
  if v_cuenta is null then
    raise exception 'Falta asignar la cuenta de «%» en Datos contables → Mapeo de cuentas', coalesce(v_desc, p_clave);
  end if;
  return v_cuenta;
end;
$$;

create or replace function public.fn_ctb_cc(p_clave text)
returns bigint
language sql stable security definer
set search_path = public
as $$ select centro_costo_id from public.config_contable_eventos where clave = p_clave $$;

-- Centro de costo de una venta: el de su tienda; si no, el de su canal.
create or replace function public.fn_ctb_cc_venta(p_venta_id bigint)
returns bigint
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select cc.id from public.ventas v join public.centros_costo cc on cc.tienda_id = v.tienda_id and cc.activo where v.id = p_venta_id),
    (select public.fn_ctb_cc('cc.' || v.canal) from public.ventas v where v.id = p_venta_id));
$$;

create or replace function public.fn_ctb_linea(p_cuenta bigint, p_cc bigint, p_debe numeric, p_haber numeric, p_desc text default null)
returns jsonb language sql immutable
as $$
  select jsonb_build_object('cuenta_id', p_cuenta, 'centro_costo_id', p_cc,
                            'debe', round(coalesce(p_debe, 0), 2), 'haber', round(coalesce(p_haber, 0), 2), 'descripcion', p_desc)
$$;

-- Crea y contabiliza una partida automática. Idempotente: si ya existe una
-- partida viva con ese origen, la devuelve. Montos negativos cambian de lado.
create or replace function public.fn_ctb_registrar_auto(
  p_origen text, p_origen_id bigint, p_fecha date, p_descripcion text, p_lineas jsonb, p_tipo text default 'automatica')
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_existente public.partidas%rowtype;
  v_id bigint;
  v_l jsonb;
  v_debe numeric;
  v_haber numeric;
  v_n smallint := 0;
begin
  select * into v_existente from public.partidas
    where origen = p_origen and origen_id = p_origen_id and estado <> 'anulada' and revertida_por_id is null
    limit 1;
  if found then
    if v_existente.estado = 'borrador' and p_tipo = 'automatica' then
      perform public.fn_ctb_contabilizar_interno(v_existente.id);
    end if;
    return v_existente.id;
  end if;

  insert into public.partidas (anio, fecha, tipo, origen, origen_id, descripcion, creado_por)
  values (extract(year from p_fecha), p_fecha, p_tipo, p_origen, p_origen_id, p_descripcion, public.fn_usuario_id())
  returning id into v_id;

  for v_l in select * from jsonb_array_elements(p_lineas) loop
    v_debe := round(coalesce((v_l ->> 'debe')::numeric, 0), 2);
    v_haber := round(coalesce((v_l ->> 'haber')::numeric, 0), 2);
    if v_debe < 0 then v_haber := v_haber - v_debe; v_debe := 0; end if;
    if v_haber < 0 then v_debe := v_debe - v_haber; v_haber := 0; end if;
    if v_debe > 0 and v_haber > 0 then
      if v_debe >= v_haber then v_debe := v_debe - v_haber; v_haber := 0;
      else v_haber := v_haber - v_debe; v_debe := 0; end if;
    end if;
    continue when v_debe = 0 and v_haber = 0;
    v_n := v_n + 1;
    insert into public.partida_lineas (partida_id, linea, cuenta_id, centro_costo_id, debe, haber, descripcion)
    values (v_id, v_n, (v_l ->> 'cuenta_id')::bigint, nullif(v_l ->> 'centro_costo_id', '')::bigint, v_debe, v_haber,
            nullif(v_l ->> 'descripcion', ''));
  end loop;

  if v_n = 0 then
    delete from public.partidas where id = v_id;  -- nada que contabilizar (monto cero)
    return null;
  end if;

  update public.partidas
    set total_debe = (select sum(debe) from public.partida_lineas where partida_id = v_id),
        total_haber = (select sum(haber) from public.partida_lineas where partida_id = v_id)
    where id = v_id;
  if p_tipo = 'automatica' then
    perform public.fn_ctb_contabilizar_interno(v_id);
  end if;
  return v_id;
end;
$$;

-- Fecha de negocio de cada evento.
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
  end;
end;
$$;

-- ------------------------------------------------------------
-- 2. Constructores por evento (p_fecha = fecha de la partida)
-- ------------------------------------------------------------
create or replace function public.fn_ctb_b_venta(p_id bigint, p_fecha date)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v public.ventas%rowtype;
  v_regimen text;
  v_base numeric;
  v_imp numeric;
  v_costo numeric;
  v_cc bigint := public.fn_ctb_cc_venta(p_id);
  v_ingresos bigint;
  v_lineas jsonb;
begin
  select * into v from public.ventas where id = p_id;
  if not found or v.estado <> 'pagada' then
    return;
  end if;
  select regimen_iva into v_regimen from public.empresa_contable where id = 1;
  v_ingresos := public.fn_ctb_cuenta(case when v.canal = 'mayorista' or v.precio_mayorista then 'venta.ingresos_mayorista' else 'venta.ingresos' end);

  -- Impuesto incluido en el precio: misma fórmula que el estado de resultados
  -- (descuento prorrateado; el envío no lleva impuesto).
  v_base := v.total - v.envio_cobrado;
  select round(coalesce(sum(d.precio * d.cantidad
           * case when v.subtotal > 0 then v_base / v.subtotal else 1 end
           * coalesce(d.iva_pct, 0) / (100 + coalesce(d.iva_pct, 0))), 0), 2)
    into v_imp
    from public.venta_detalles d where d.venta_id = p_id;

  v_lineas := jsonb_build_array(
    public.fn_ctb_linea(public.fn_ctb_cuenta('venta.anticipos'), null, v.total, 0, 'Cobros aplicados a la venta'),
    public.fn_ctb_linea(public.fn_ctb_cuenta('venta.envio'), v_cc, 0, v.envio_cobrado, 'Envío cobrado'));
  if v_regimen = 'general' then
    v_lineas := v_lineas
      || public.fn_ctb_linea(v_ingresos, v_cc, 0, v_base - v_imp, 'Venta sin IVA')
      || public.fn_ctb_linea(public.fn_ctb_cuenta('venta.iva_debito'), null, 0, v_imp, 'IVA débito');
  else
    v_lineas := v_lineas
      || public.fn_ctb_linea(v_ingresos, v_cc, 0, v_base, 'Venta')
      || public.fn_ctb_linea(public.fn_ctb_cuenta('venta.impuesto_pc_gasto'), coalesce(public.fn_ctb_cc('venta.impuesto_pc_gasto'), v_cc),
                             v_imp, 0, 'Impuesto Pequeño Contribuyente')
      || public.fn_ctb_linea(public.fn_ctb_cuenta('venta.impuesto_pc_pasivo'), null, 0, v_imp, 'Impuesto por pagar');
  end if;
  perform public.fn_ctb_registrar_auto('venta', p_id, p_fecha,
    'Venta #' || p_id || ' (' || v.canal || ')', v_lineas);

  -- Costo de la venta (origen propio para que el Kardex PEPS lo reemplace).
  select round(coalesce(sum(coalesce(d.costo_unitario, 0) * d.cantidad), 0), 2) into v_costo
    from public.venta_detalles d where d.venta_id = p_id;
  perform public.fn_ctb_registrar_auto('venta_costo', p_id, p_fecha, 'Costo de la venta #' || p_id,
    jsonb_build_array(
      public.fn_ctb_linea(public.fn_ctb_cuenta('venta.costo'), coalesce(v_cc, public.fn_ctb_cc('venta.costo')), v_costo, 0),
      public.fn_ctb_linea(public.fn_ctb_cuenta('venta.inventario'), null, 0, v_costo)));
end;
$$;

create or replace function public.fn_ctb_b_pago(p_id bigint, p_fecha date)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  p public.pagos%rowtype;
begin
  select * into p from public.pagos where id = p_id;
  if not found or p.estado <> 'confirmado' or p.metodo = 'bolsa' then
    return;
  end if;
  perform public.fn_ctb_registrar_auto('pago', p_id, p_fecha,
    'Cobro confirmado de la venta #' || p.venta_id || ' (' || p.metodo || ')',
    jsonb_build_array(
      public.fn_ctb_linea(public.fn_ctb_cuenta(case when p.metodo in ('tarjeta', 'pasarela')
                            then 'pago.tarjetas_por_liquidar' else 'pago.cobros_por_depositar' end), null, p.monto, 0, p.referencia),
      public.fn_ctb_linea(public.fn_ctb_cuenta('venta.anticipos'), null, 0, p.monto)));
end;
$$;

create or replace function public.fn_ctb_b_bolsa(p_id bigint, p_fecha date)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  m public.movimientos_bolsa%rowtype;
  v_pasivo bigint;
  v_contra bigint;
  v_cc bigint;
  v_monto numeric;
begin
  select * into m from public.movimientos_bolsa where id = p_id;
  if not found or m.monto = 0 then
    return;
  end if;
  v_pasivo := public.fn_ctb_cuenta('bolsa.pasivo');
  -- Pago con Billetera (redención) y su devolución (reverso positivo) van contra Anticipos;
  -- abonos, ajustes y reversos de abono van contra la comisión de embajadores.
  if m.tipo = 'redencion' or (m.tipo = 'reverso' and m.monto > 0) then
    v_contra := public.fn_ctb_cuenta('venta.anticipos');
  else
    v_contra := public.fn_ctb_cuenta('bolsa.gasto_comision');
    v_cc := public.fn_ctb_cc('bolsa.gasto_comision');
  end if;
  v_monto := abs(m.monto);
  perform public.fn_ctb_registrar_auto('bolsa', p_id, p_fecha,
    'Billetera ASTRO: ' || m.tipo || coalesce(' · venta #' || m.venta_id, ''),
    case when m.monto > 0 then jsonb_build_array(
        public.fn_ctb_linea(v_contra, v_cc, v_monto, 0),
        public.fn_ctb_linea(v_pasivo, null, 0, v_monto))
    else jsonb_build_array(
        public.fn_ctb_linea(v_pasivo, null, v_monto, 0),
        public.fn_ctb_linea(v_contra, v_cc, 0, v_monto)) end);
end;
$$;

create or replace function public.fn_ctb_b_liquidacion(p_id bigint, p_fecha date)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  l public.liquidaciones%rowtype;
begin
  select * into l from public.liquidaciones where id = p_id;
  if not found or l.estado not in ('aprobada', 'pagada') or l.total <= 0 then
    return;
  end if;
  perform public.fn_ctb_registrar_auto('liquidacion', p_id, p_fecha,
    'Liquidación de comisiones #' || p_id || coalesce(' · ' || (select nombre from public.usuarios where id = l.usuario_id), ''),
    jsonb_build_array(
      public.fn_ctb_linea(public.fn_ctb_cuenta('liquidacion.gasto'), public.fn_ctb_cc('liquidacion.gasto'), l.total, 0),
      public.fn_ctb_linea(public.fn_ctb_cuenta('liquidacion.por_pagar'), null, 0, l.total)));
end;
$$;

create or replace function public.fn_ctb_b_gasto(p_id bigint, p_fecha date)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  g public.gastos%rowtype;
begin
  select * into g from public.gastos where id = p_id;
  if not found or g.anulado then
    return;
  end if;
  if g.clasificacion = 'otro_ingreso' then
    perform public.fn_ctb_registrar_auto('gasto', p_id, p_fecha, 'Otro ingreso: ' || g.descripcion,
      jsonb_build_array(
        public.fn_ctb_linea(public.fn_ctb_cuenta('gasto.deudores_otros_ingresos'), null, g.monto, 0),
        public.fn_ctb_linea(public.fn_ctb_cuenta('gasto.otros_ingresos'), public.fn_ctb_cc('gasto.otros_ingresos'), 0, g.monto)));
  else
    perform public.fn_ctb_registrar_auto('gasto', p_id, p_fecha, 'Gasto: ' || g.descripcion,
      jsonb_build_array(
        public.fn_ctb_linea(public.fn_ctb_cuenta('gasto.' || g.categoria), public.fn_ctb_cc('gasto.' || g.categoria), g.monto, 0, g.referencia),
        public.fn_ctb_linea(public.fn_ctb_cuenta('gasto.acreedores'), null, 0, g.monto)));
  end if;
end;
$$;

create or replace function public.fn_ctb_b_banco(p_id bigint, p_fecha date)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  m public.movimientos_banco%rowtype;
  v_banco bigint;
  v_nombre text;
  v_clave text;
  v_contra bigint;
  v_cc bigint;
begin
  select * into m from public.movimientos_banco where id = p_id;
  if not found or m.anulado then
    return;
  end if;
  select cuenta_contable_id, nombre into v_banco, v_nombre from public.cuentas_bancarias where id = m.cuenta_id;
  if v_banco is null then
    raise exception 'La cuenta bancaria «%» no tiene cuenta contable: asígnala en Datos contables → Mapeo de cuentas', v_nombre;
  end if;
  v_clave := case m.origen
    when 'cobro_venta' then
      case when (select metodo from public.pagos where id = m.pago_id) in ('tarjeta', 'pasarela')
           then 'pago.tarjetas_por_liquidar' else 'pago.cobros_por_depositar' end
    when 'gasto' then 'gasto.acreedores'
    when 'otro_ingreso' then 'gasto.deudores_otros_ingresos'
    when 'pago_proveedor' then 'compra.proveedores'
    when 'pago_comisiones' then 'liquidacion.por_pagar'
    when 'transferencia' then 'banco.transito'
    when 'comision_bancaria' then 'banco.comision'
    else case when m.tipo = 'ingreso' then 'banco.ajuste_ingreso' else 'banco.ajuste_gasto' end
  end;
  v_contra := public.fn_ctb_cuenta(v_clave);
  v_cc := public.fn_ctb_cc(v_clave);
  perform public.fn_ctb_registrar_auto('banco', p_id, p_fecha,
    v_nombre || ': ' || m.descripcion,
    case when m.tipo = 'ingreso' then jsonb_build_array(
        public.fn_ctb_linea(v_banco, null, m.monto, 0, m.referencia),
        public.fn_ctb_linea(v_contra, v_cc, 0, m.monto))
    else jsonb_build_array(
        public.fn_ctb_linea(v_contra, v_cc, m.monto, 0),
        public.fn_ctb_linea(v_banco, null, 0, m.monto, m.referencia)) end);
end;
$$;

create or replace function public.fn_ctb_b_compra(p_id bigint, p_fecha date)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  o public.ordenes_compra%rowtype;
  v_regimen text;
  v_iva numeric;
  v_proveedor text;
begin
  select * into o from public.ordenes_compra where id = p_id;
  if not found or o.estado not in ('recibida_total', 'facturada', 'pagada') or o.total <= 0 then
    return;
  end if;
  select regimen_iva into v_regimen from public.empresa_contable where id = 1;
  select nombre into v_proveedor from public.proveedores where id = o.proveedor_id;
  -- Régimen general: el impuesto de la compra es IVA crédito; pequeño contribuyente: es parte del costo.
  v_iva := case when v_regimen = 'general' then coalesce(o.impuestos, 0) else 0 end;
  perform public.fn_ctb_registrar_auto('compra', p_id, p_fecha,
    'Orden de compra #' || p_id || coalesce(' · ' || v_proveedor, '') || coalesce(' · factura ' || o.numero_factura_proveedor, ''),
    jsonb_build_array(
      public.fn_ctb_linea(public.fn_ctb_cuenta('compra.inventario'), null, o.total - v_iva, 0),
      public.fn_ctb_linea(public.fn_ctb_cuenta('compra.iva_credito'), null, v_iva, 0),
      public.fn_ctb_linea(public.fn_ctb_cuenta('compra.proveedores'), null, 0, o.total)));
end;
$$;

create or replace function public.fn_ctb_b_metal(p_id bigint, p_fecha date)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r public.recepciones_metal%rowtype;
  v_monto numeric;
begin
  select * into r from public.recepciones_metal where id = p_id;
  if not found or r.estado <> 'confirmada' then
    return;
  end if;
  select round(coalesce(sum(cantidad * costo_unitario), 0), 2) into v_monto
    from public.recepcion_metal_detalles where recepcion_metal_id = p_id;
  perform public.fn_ctb_registrar_auto('metal', p_id, p_fecha,
    'Recepción de oro y plata #' || p_id || coalesce(' · ' || (select nombre from public.proveedores where id = r.proveedor_id), ''),
    jsonb_build_array(
      public.fn_ctb_linea(public.fn_ctb_cuenta('metal.inventario'), null, v_monto, 0),
      public.fn_ctb_linea(public.fn_ctb_cuenta(case when r.proveedor_id is null then 'metal.acreedor' else 'compra.proveedores' end),
                          null, 0, v_monto)));
end;
$$;

create or replace function public.fn_ctb_b_canje(p_id bigint, p_fecha date)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  c public.canjes_premios%rowtype;
begin
  select * into c from public.canjes_premios where id = p_id;
  if not found or c.estado <> 'entregado' or coalesce(c.costo, 0) <= 0 then
    return;
  end if;
  perform public.fn_ctb_registrar_auto('canje', p_id, p_fecha,
    'Premio entregado: ' || coalesce((select nombre from public.premios_canje where id = c.premio_id), 'premio') || ' (canje #' || p_id || ')',
    jsonb_build_array(
      public.fn_ctb_linea(public.fn_ctb_cuenta('premio.gasto'), public.fn_ctb_cc('premio.gasto'), c.costo, 0),
      public.fn_ctb_linea(public.fn_ctb_cuenta('premio.inventario'), null, 0, c.costo)));
end;
$$;

-- Cuenta bancaria nueva con saldo inicial (creada después del inicio contable).
create or replace function public.fn_ctb_b_saldo_banco(p_id bigint, p_fecha date)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  c public.cuentas_bancarias%rowtype;
begin
  select * into c from public.cuentas_bancarias where id = p_id;
  if not found or coalesce(c.saldo_inicial, 0) = 0 then
    return;
  end if;
  if c.cuenta_contable_id is null then
    raise exception 'La cuenta bancaria «%» no tiene cuenta contable', c.nombre;
  end if;
  perform public.fn_ctb_registrar_auto('saldo_banco', p_id, p_fecha, 'Saldo inicial de ' || c.nombre,
    jsonb_build_array(
      public.fn_ctb_linea(c.cuenta_contable_id, null, c.saldo_inicial, 0),
      public.fn_ctb_linea(public.fn_ctb_cuenta('apertura.ajuste'), null, 0, c.saldo_inicial)));
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
    else raise exception 'Origen contable desconocido: %', p_origen;
  end case;
end;
$$;

-- Revierte las partidas vivas de una operación anulada. Devuelve cuántas.
create or replace function public.fn_ctb_revertir_origen(p_origen text, p_id bigint)
returns int
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id from public.partidas
    where origen = any (case when p_origen = 'venta' then array['venta', 'venta_costo'] else array[p_origen] end)
      and origen_id = p_id and estado = 'contabilizada' and revertida_por_id is null
    order by id
  loop
    perform public.fn_ctb_revertir_interno(r.id, public.fn_ctb_hoy(), 'anulación de la operación de origen');
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ------------------------------------------------------------
-- 3. Despachador: nunca bloquea la operación
-- ------------------------------------------------------------
create or replace function public.fn_ctb_despachar(p_origen text, p_id bigint, p_accion text default 'contabilizar')
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp public.empresa_contable%rowtype;
  v_fecha date;
  v_msg text;
begin
  select * into v_emp from public.empresa_contable where id = 1;
  if not found or not v_emp.contabilizacion_automatica or v_emp.fecha_inicio_contable is null then
    return 'omitido';
  end if;

  begin
    if p_accion = 'revertir' then
      if public.fn_ctb_revertir_origen(p_origen, p_id) = 0 then
        -- Nada contabilizado: si estaba pendiente, ya no hace falta.
        update public.contabilizacion_pendientes
          set estado = 'descartado', motivo_descarte = 'La operación se anuló antes de contabilizarse', fecha_actualizacion = now()
          where origen = p_origen and origen_id = p_id and accion = 'contabilizar' and estado = 'pendiente';
        if not found then
          v_fecha := public.fn_ctb_fecha_evento(p_origen, p_id);
          if v_fecha is not null and v_fecha < v_emp.fecha_inicio_contable then
            raise exception 'Se anuló una operación del % (anterior al inicio contable): si afecta los saldos de apertura, registra el ajuste con una partida manual',
              to_char(v_fecha, 'DD/MM/YYYY');
          end if;
        end if;
      end if;
    else
      v_fecha := greatest(coalesce(public.fn_ctb_fecha_evento(p_origen, p_id), public.fn_ctb_hoy()), v_emp.fecha_inicio_contable);
      perform public.fn_ctb_construir(p_origen, p_id, v_fecha);
    end if;
    update public.contabilizacion_pendientes
      set estado = 'resuelto', resuelto_por = public.fn_usuario_id(), fecha_actualizacion = now()
      where origen = p_origen and origen_id = p_id and accion = p_accion and estado = 'pendiente';
    return 'ok';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    insert into public.contabilizacion_pendientes (origen, origen_id, accion, mensaje)
    values (p_origen, p_id, p_accion, v_msg)
    on conflict (origen, origen_id, accion) do update
      set mensaje = excluded.mensaje, estado = 'pendiente', fecha_actualizacion = now(),
          intentos = public.contabilizacion_pendientes.intentos + 1;
    return 'pendiente';
  end;
end;
$$;

-- ------------------------------------------------------------
-- 4. Pendientes: reintentar y descartar
-- ------------------------------------------------------------
create or replace function public.fn_ctb_reintentar_pendientes(p_id bigint default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
  v_res text;
  v_ok int := 0;
  v_siguen int := 0;
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para contabilizar';
  end if;
  if not coalesce((select contabilizacion_automatica from public.empresa_contable where id = 1), false) then
    raise exception 'La contabilización automática está apagada';
  end if;
  for r in
    select * from public.contabilizacion_pendientes
    where estado = 'pendiente' and (p_id is null or id = p_id)
    order by fecha_creacion, id
  loop
    v_res := public.fn_ctb_despachar(r.origen, r.origen_id, r.accion);
    if v_res = 'pendiente' then v_siguen := v_siguen + 1; else v_ok := v_ok + 1; end if;
  end loop;
  return jsonb_build_object('resueltos', v_ok, 'pendientes', v_siguen);
end;
$$;

grant execute on function public.fn_ctb_reintentar_pendientes(bigint) to authenticated;

create or replace function public.fn_ctb_descartar_pendiente(p_id bigint, p_motivo text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para contabilizar';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo para descartar';
  end if;
  update public.contabilizacion_pendientes
    set estado = 'descartado', motivo_descarte = btrim(p_motivo), resuelto_por = public.fn_usuario_id(), fecha_actualizacion = now()
    where id = p_id and estado = 'pendiente';
  if not found then
    raise exception 'El pendiente no existe o ya se resolvió';
  end if;
end;
$$;

grant execute on function public.fn_ctb_descartar_pendiente(bigint, text) to authenticated;

-- ------------------------------------------------------------
-- 5. Partida de apertura (borrador para que el contador la revise)
-- ------------------------------------------------------------
create or replace function public.fn_ctb_generar_apertura()
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_fecha date;
  v_lineas jsonb := '[]'::jsonb;
  r record;
  v_monto numeric;
  v_dif numeric;
  v_id bigint;
begin
  if not public.fn_tiene_permiso('contabilidad', 'configurar') then
    raise exception 'No tienes permiso para configurar la contabilidad';
  end if;
  select fecha_inicio_contable into v_fecha from public.empresa_contable where id = 1;
  if v_fecha is null then
    raise exception 'Primero define la fecha de inicio contable';
  end if;
  if exists (select 1 from public.partidas where origen = 'apertura' and estado <> 'anulada' and revertida_por_id is null) then
    raise exception 'Ya existe una partida de apertura: descártala o revísala antes de generar otra';
  end if;
  -- Los saldos son los de este momento: si ya hay partidas automáticas, esas operaciones se duplicarían.
  if exists (select 1 from public.partidas where tipo = 'automatica') then
    raise exception 'Ya hay partidas automáticas: la apertura ya no se puede generar con los saldos de hoy. Regístrala como partida manual de tipo Apertura.';
  end if;

  -- Bancos y caja: saldo según el libro de bancos.
  for r in select id, nombre, cuenta_contable_id from public.cuentas_bancarias where activa order by id loop
    if r.cuenta_contable_id is null then
      raise exception 'La cuenta bancaria «%» no tiene cuenta contable', r.nombre;
    end if;
    v_monto := public.fn_saldo_cuenta(r.id, v_fecha);
    v_lineas := v_lineas || public.fn_ctb_linea(r.cuenta_contable_id, null, v_monto, 0, 'Saldo según libro de bancos');
  end loop;

  -- Inventario a costo: piezas en existencia + por cantidad + vendidas aún no pagadas.
  select coalesce(sum(p.costo_produccion), 0) into v_monto
    from public.productos p
    where coalesce(p.modo_inventario, 'pieza_unica') = 'pieza_unica'
      and p.estado in ('disponible_cedi', 'disponible_tienda', 'en_transito', 'separada', 'retenida');
  v_monto := v_monto
    + coalesce((select sum((i.cantidad_disponible + i.cantidad_reservada) * coalesce(p.costo_produccion, 0))
                from public.inventario_cantidad i join public.productos p on p.id = i.producto_id
                where p.modo_inventario = 'por_cantidad'), 0)
    + coalesce((select sum(coalesce(d.costo_unitario, 0) * d.cantidad)
                from public.venta_detalles d join public.ventas v on v.id = d.venta_id
                where v.estado = 'registrada'), 0);
  v_lineas := v_lineas || public.fn_ctb_linea(public.fn_ctb_cuenta('venta.inventario'), null, v_monto, 0,
                                              'Inventario a costo (incluye piezas de ventas aún no pagadas)');

  select coalesce(sum(stock * costo), 0) into v_monto from public.premios_canje where activo and coalesce(stock, 0) > 0;
  v_lineas := v_lineas || public.fn_ctb_linea(public.fn_ctb_cuenta('premio.inventario'), null, v_monto, 0, 'Premios en existencia a costo');

  -- Cobros confirmados que aún no están en bancos.
  for r in
    select case when p.metodo in ('tarjeta', 'pasarela') then 'pago.tarjetas_por_liquidar' else 'pago.cobros_por_depositar' end as clave,
           sum(p.monto) as monto
    from public.pagos p
    where p.estado = 'confirmado' and p.metodo <> 'bolsa'
      and not exists (select 1 from public.movimientos_banco m where m.pago_id = p.id and not m.anulado)
    group by 1
  loop
    v_lineas := v_lineas || public.fn_ctb_linea(public.fn_ctb_cuenta(r.clave), null, r.monto, 0, 'Cobros confirmados no registrados en bancos');
  end loop;

  -- Anticipos: cobros de ventas aún no pagadas por completo y de ventas anuladas (por devolver).
  select coalesce(sum(p.monto), 0) into v_monto
    from public.pagos p join public.ventas v on v.id = p.venta_id
    where p.estado = 'confirmado'
      and (v.estado = 'registrada' or (v.estado = 'anulada' and p.metodo <> 'bolsa'));
  v_lineas := v_lineas || public.fn_ctb_linea(public.fn_ctb_cuenta('venta.anticipos'), null, 0, v_monto,
                                              'Cobros de ventas pendientes de pago completo o anuladas');

  select coalesce(sum(monto), 0) into v_monto from public.movimientos_bolsa;
  v_lineas := v_lineas || public.fn_ctb_linea(public.fn_ctb_cuenta('bolsa.pasivo'), null, 0, v_monto, 'Saldo total de la Billetera ASTRO');

  select coalesce(sum(o.total), 0) into v_monto
    from public.ordenes_compra o
    where o.estado in ('recibida_total', 'facturada', 'pagada')
      and not exists (select 1 from public.movimientos_banco m where m.orden_compra_id = o.id and not m.anulado);
  v_lineas := v_lineas || public.fn_ctb_linea(public.fn_ctb_cuenta('compra.proveedores'), null, 0, v_monto,
                                              'Órdenes de compra recibidas sin pago en bancos');

  select coalesce(sum(g.monto) filter (where g.clasificacion <> 'otro_ingreso'), 0),
         coalesce(sum(g.monto) filter (where g.clasificacion = 'otro_ingreso'), 0)
    into v_monto, v_dif
    from public.gastos g
    where not g.anulado and not exists (select 1 from public.movimientos_banco m where m.gasto_id = g.id and not m.anulado);
  v_lineas := v_lineas
    || public.fn_ctb_linea(public.fn_ctb_cuenta('gasto.acreedores'), null, 0, v_monto, 'Gastos registrados sin pago en bancos')
    || public.fn_ctb_linea(public.fn_ctb_cuenta('gasto.deudores_otros_ingresos'), null, v_dif, 0, 'Otros ingresos sin cobro en bancos');

  select coalesce(sum(l.total), 0) into v_monto
    from public.liquidaciones l
    where l.total > 0 and (l.estado = 'aprobada'
      or (l.estado = 'pagada' and not exists (select 1 from public.movimientos_banco m where m.liquidacion_id = l.id and not m.anulado)));
  v_lineas := v_lineas || public.fn_ctb_linea(public.fn_ctb_cuenta('liquidacion.por_pagar'), null, 0, v_monto,
                                              'Liquidaciones aprobadas sin pago en bancos');

  -- Diferencia contra patrimonio (el contador la reclasifica a capital y resultados).
  select coalesce(sum((x ->> 'debe')::numeric - (x ->> 'haber')::numeric), 0) into v_dif from jsonb_array_elements(v_lineas) x;
  v_lineas := v_lineas || public.fn_ctb_linea(public.fn_ctb_cuenta('apertura.ajuste'), null, -v_dif, 0,
                                              'Diferencia: reclasificar a capital y resultados acumulados');

  v_id := public.fn_ctb_registrar_auto('apertura', 1, v_fecha,
    'Partida de apertura al ' || to_char(v_fecha, 'DD/MM/YYYY') || ' (generada por el sistema; revisar y completar IVA, activos fijos, préstamos y capital)',
    v_lineas, 'apertura');
  return v_id;
end;
$$;

grant execute on function public.fn_ctb_generar_apertura() to authenticated;

-- ------------------------------------------------------------
-- 6. Encender / apagar la contabilización automática
-- ------------------------------------------------------------
create or replace function public.fn_ctb_configurar_automatica(p_activa boolean)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_faltan text;
  v_emp public.empresa_contable%rowtype;
  v_primera boolean;
  v_apertura bigint;
begin
  if not public.fn_tiene_permiso('contabilidad', 'configurar') then
    raise exception 'No tienes permiso para configurar la contabilidad';
  end if;
  select * into v_emp from public.empresa_contable where id = 1 for update;
  if not p_activa then
    update public.empresa_contable set contabilizacion_automatica = false, fecha_actualizacion = now() where id = 1;
    return jsonb_build_object('activa', false);
  end if;

  select string_agg(descripcion, ', ' order by orden) into v_faltan
    from public.config_contable_eventos where requiere_cuenta and cuenta_id is null;
  if v_faltan is not null then
    raise exception 'Faltan cuentas en el mapeo: %', v_faltan;
  end if;
  select string_agg(nombre, ', ') into v_faltan from public.cuentas_bancarias where activa and cuenta_contable_id is null;
  if v_faltan is not null then
    raise exception 'Cuentas bancarias sin cuenta contable: %', v_faltan;
  end if;
  if v_emp.razon_social = 'Por definir' or v_emp.nit = 'CF' then
    raise exception 'Completa la razón social y el NIT antes de activar';
  end if;

  -- Primera activación: la contabilidad arranca hoy y se genera la apertura con los saldos de este momento.
  v_primera := not exists (select 1 from public.partidas where tipo = 'automatica' or origen = 'apertura');
  update public.empresa_contable
    set contabilizacion_automatica = true,
        fecha_inicio_contable = case when v_primera then public.fn_ctb_hoy() else coalesce(fecha_inicio_contable, public.fn_ctb_hoy()) end,
        fecha_actualizacion = now()
    where id = 1;
  if v_primera then
    v_apertura := public.fn_ctb_generar_apertura();
  end if;
  return jsonb_build_object('activa', true, 'apertura_id', v_apertura);
end;
$$;

grant execute on function public.fn_ctb_configurar_automatica(boolean) to authenticated;

-- ------------------------------------------------------------
-- 7. Cuadres: contabilidad vs. libros operativos
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

  return jsonb_build_object(
    'hasta', v_hasta,
    'activa', (select contabilizacion_automatica from public.empresa_contable where id = 1),
    'fecha_inicio', (select fecha_inicio_contable from public.empresa_contable where id = 1),
    'bancos', v_bancos,
    'billetera', jsonb_build_object('saldo_libro', v_bolsa_libro, 'saldo_contable', v_bolsa_ctb),
    'pendientes', (select count(*) from public.contabilizacion_pendientes where estado = 'pendiente'),
    'borradores', (select count(*) from public.partidas where estado = 'borrador'));
end;
$$;

grant execute on function public.fn_ctb_cuadres(date) to authenticated;

-- Funciones internas: sin acceso directo.
do $$
declare f text;
begin
  foreach f in array array[
    'fn_ctb_cuenta(text)', 'fn_ctb_cc(text)', 'fn_ctb_cc_venta(bigint)',
    'fn_ctb_registrar_auto(text, bigint, date, text, jsonb, text)', 'fn_ctb_fecha_evento(text, bigint)',
    'fn_ctb_b_venta(bigint, date)', 'fn_ctb_b_pago(bigint, date)', 'fn_ctb_b_bolsa(bigint, date)',
    'fn_ctb_b_liquidacion(bigint, date)', 'fn_ctb_b_gasto(bigint, date)', 'fn_ctb_b_banco(bigint, date)',
    'fn_ctb_b_compra(bigint, date)', 'fn_ctb_b_metal(bigint, date)', 'fn_ctb_b_canje(bigint, date)',
    'fn_ctb_b_saldo_banco(bigint, date)', 'fn_ctb_construir(text, bigint, date)', 'fn_ctb_revertir_origen(text, bigint)',
    'fn_ctb_despachar(text, bigint, text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- Verificación
select count(*) as funciones_motor from pg_proc where proname like 'fn_ctb_%';
