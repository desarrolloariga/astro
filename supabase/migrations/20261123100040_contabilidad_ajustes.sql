-- ============================================================
-- ASTRO — Ajustes de contabilidad (revisión del contador, nov 2026).
--
-- 1. Mes cerrado en los módulos auxiliares: facturas de proveedor, pagos a
--    proveedores, movimientos de bancos, facturas de venta (FEL) y gastos con
--    fecha en un mes cerrado necesitan autorización con PIN contable + motivo
--    (una operación, válida 10 minutos). Un mes solo se cierra cuando terminó.
-- 2. Órdenes de compra sin factura: la factura se registra con sus datos (ya no
--    se crea sola con número provisional); una orden se puede marcar "sin
--    factura" (y deshacerlo); anular la factura de una orden permite volver a
--    registrarla.
-- 3. CxP: tipo de compra (bien, servicio, combustible, importación), póliza de
--    importación (DUCA) y combustibles con IDP por galón (Decreto 38-92):
--    el IDP no lleva IVA, se registra como exento y es costo del combustible.
-- 4. Libro de compras: columnas bienes, servicios, combustibles, importaciones,
--    exento (IDP), sin crédito fiscal, IVA y total.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Mes cerrado en módulos auxiliares
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.autorizaciones_cierre'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%accion%' loop
    execute format('alter table public.autorizaciones_cierre drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.autorizaciones_cierre add constraint autorizaciones_cierre_accion_check
  check (accion in ('reabrir_periodo', 'partida_en_periodo_cerrado', 'operacion_en_periodo_cerrado'));

create or replace function public.fn_autorizar_periodo_cerrado(p_fecha date, p_pin text, p_motivo text, p_accion text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_error text;
  v_id bigint;
begin
  if not public.fn_tiene_permiso('contabilidad', 'autorizar_cierre') then
    return jsonb_build_object('ok', false, 'error', 'Ese mes está cerrado y no tienes permiso para autorizar cambios en meses cerrados');
  end if;
  if p_accion not in ('reabrir_periodo', 'partida_en_periodo_cerrado', 'operacion_en_periodo_cerrado') then
    return jsonb_build_object('ok', false, 'error', 'Acción no válida');
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Escribe el motivo del cambio en el mes cerrado');
  end if;
  v_error := public.fn_verificar_pin_contable(p_pin);
  if v_error is not null then
    return jsonb_build_object('ok', false, 'error', v_error);
  end if;
  insert into public.autorizaciones_cierre (usuario_id, anio, mes, accion, motivo)
  values (public.fn_usuario_id(), extract(year from p_fecha), extract(month from p_fecha), p_accion, btrim(p_motivo))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

grant execute on function public.fn_autorizar_periodo_cerrado(date, text, text, text) to authenticated;

-- Trigger genérico: TG_ARGV[0] = columna de fecha del documento; el resto, columnas
-- que se pueden cambiar sin autorización (soporte, conciliación…). Si la fecha (nueva
-- o anterior) cae en un mes cerrado, consume una autorización vigente del usuario
-- para ese mes; si no hay, rechaza la operación.
create or replace function public.fn_trg_periodo_cerrado_documento()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_bloqueo date := public.fn_fecha_bloqueo_contable();
  v_col text := tg_argv[0];
  v_libres text[] := coalesce(tg_argv[1:tg_nargs - 1], '{}');
  v_nueva date;
  v_anterior date;
  v_fecha date;
  v_aut bigint;
begin
  if v_bloqueo is null or public.fn_usuario_id() is null then
    return coalesce(new, old);  -- sin meses cerrados, o proceso del sistema
  end if;
  if tg_op <> 'DELETE' then
    v_nueva := (to_jsonb(new) ->> v_col)::date;
  end if;
  if tg_op <> 'INSERT' then
    v_anterior := (to_jsonb(old) ->> v_col)::date;
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - v_libres) = (to_jsonb(old) - v_libres) then
    return new;
  end if;
  v_fecha := case when v_nueva <= v_bloqueo then v_nueva when v_anterior <= v_bloqueo then v_anterior end;
  if v_fecha is null or public.fn_autorizacion_cierre_vigente(v_fecha) then
    return coalesce(new, old);
  end if;
  select id into v_aut from public.autorizaciones_cierre
    where usuario_id = public.fn_usuario_id() and accion = 'operacion_en_periodo_cerrado' and fecha_uso is null
      and fecha >= now() - interval '10 minutes'
      and (anio, mes) = (extract(year from v_fecha)::int, extract(month from v_fecha)::int)
    order by id desc limit 1
    for update;
  if found then
    update public.autorizaciones_cierre set fecha_uso = now() where id = v_aut;
    perform set_config('astro.autorizacion_cierre', v_aut::text, true);  -- cubre también su partida automática
    return coalesce(new, old);
  end if;
  raise exception 'El mes de % está cerrado en contabilidad: autoriza la operación con tu PIN contable y el motivo, y vuelve a intentarlo',
    to_char(v_fecha, 'MM/YYYY');
end;
$$;

revoke all on function public.fn_trg_periodo_cerrado_documento() from public, anon, authenticated;

create trigger trg_periodo_cerrado_facturas_proveedor before insert or update or delete on public.facturas_proveedor
  for each row execute function public.fn_trg_periodo_cerrado_documento('fecha_emision', 'soporte_url', 'descripcion', 'fecha_vencimiento');
create trigger trg_periodo_cerrado_pagos_proveedor before insert or update or delete on public.pagos_proveedor
  for each row execute function public.fn_trg_periodo_cerrado_documento('fecha', 'movimiento_banco_id');
create trigger trg_periodo_cerrado_movimientos_banco before insert or update or delete on public.movimientos_banco
  for each row execute function public.fn_trg_periodo_cerrado_documento('fecha', 'conciliado', 'conciliacion_id', 'descripcion', 'referencia');
create trigger trg_periodo_cerrado_facturas_venta before insert or update or delete on public.facturas_venta
  for each row execute function public.fn_trg_periodo_cerrado_documento('fecha_emision', 'direccion');
create trigger trg_periodo_cerrado_gastos before insert or update or delete on public.gastos
  for each row execute function public.fn_trg_periodo_cerrado_documento('fecha', 'soporte_url', 'fecha_actualizacion', 'descripcion');

-- Un mes solo se cierra cuando ya terminó (así ventas, compras e inventario, que llevan la
-- fecha del día, nunca caen en un mes cerrado). Resto igual a la versión de la 034.
create or replace function public.fn_cerrar_mes_contable(p_anio int, p_mes int, p_notas text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_ultimo record;
  v_fin date := (make_date(p_anio, p_mes, 1) + interval '1 month' - interval '1 day')::date;
  v_borradores int;
  v_descuadre numeric;
  v_bancos text;
begin
  if not public.fn_tiene_permiso('contabilidad', 'cerrar_periodo') then
    raise exception 'No tienes permiso para cerrar meses contables';
  end if;
  if v_fin >= public.fn_ctb_hoy() then
    raise exception 'El mes aún no termina: se puede cerrar a partir del %', to_char(v_fin + 1, 'DD/MM/YYYY');
  end if;
  select anio, mes into v_ultimo from public.periodos_contables
    where estado = 'cerrado' order by anio desc, mes desc limit 1;
  if found then
    if (p_anio * 12 + p_mes) <= (v_ultimo.anio * 12 + v_ultimo.mes) then
      raise exception 'Ese mes ya está cerrado';
    end if;
    if (p_anio * 12 + p_mes) <> (v_ultimo.anio * 12 + v_ultimo.mes + 1) then
      raise exception 'Los meses se cierran en orden: primero cierra %/%',
        case when v_ultimo.mes = 12 then 1 else v_ultimo.mes + 1 end,
        case when v_ultimo.mes = 12 then v_ultimo.anio + 1 else v_ultimo.anio end;
    end if;
  end if;

  -- Depreciación automática de activos fijos del mes (si aún no se registró).
  perform public.fn_af_depreciar_mes_interno(p_anio, p_mes);

  select count(*) into v_borradores from public.partidas where estado = 'borrador' and fecha <= v_fin;
  if v_borradores > 0 then
    raise exception 'Hay % partida(s) en borrador con fecha hasta el %: contabilízalas o descártalas antes de cerrar',
      v_borradores, to_char(v_fin, 'DD/MM/YYYY');
  end if;

  select coalesce(sum(l.debe) - sum(l.haber), 0) into v_descuadre
    from public.partida_lineas l join public.partidas p on p.id = l.partida_id
    where p.estado = 'contabilizada' and p.fecha <= v_fin;
  if v_descuadre <> 0 then
    raise exception 'La contabilidad no cuadra (diferencia Q %): revisa antes de cerrar', v_descuadre;
  end if;

  -- Requisito: conciliación bancaria cerrada al fin de mes en cada cuenta (no caja) con movimientos en el mes.
  select string_agg(c.nombre, ', ' order by c.nombre) into v_bancos
    from public.cuentas_bancarias c
    where c.activa and c.tipo <> 'caja'
      and exists (select 1 from public.movimientos_banco m where m.cuenta_id = c.id and not m.anulado
                  and m.fecha between make_date(p_anio, p_mes, 1) and v_fin)
      and not exists (select 1 from public.conciliaciones_bancarias cb where cb.cuenta_id = c.id and cb.hasta >= v_fin);
  if v_bancos is not null then
    raise exception 'Antes de cerrar el mes concilia y cierra el estado de cuenta de: %', v_bancos;
  end if;

  insert into public.periodos_contables (anio, mes, estado, cerrado_por, fecha_cierre, notas)
  values (p_anio, p_mes, 'cerrado', public.fn_usuario_id(), now(), nullif(btrim(coalesce(p_notas, '')), ''))
  on conflict (anio, mes) do update
    set estado = 'cerrado', cerrado_por = excluded.cerrado_por, fecha_cierre = now(),
        notas = coalesce(excluded.notas, public.periodos_contables.notas);
end;
$$;

-- ------------------------------------------------------------
-- 2. Órdenes de compra sin factura
-- ------------------------------------------------------------
alter table public.ordenes_compra
  add column if not exists sin_factura boolean not null default false,
  add column if not exists sin_factura_motivo text,
  add column if not exists sin_factura_por bigint references public.usuarios (id),
  add column if not exists sin_factura_fecha timestamptz;

-- Una factura vigente por orden (antes: una para siempre, aunque se anulara).
alter table public.facturas_proveedor drop constraint if exists facturas_proveedor_orden_compra_id_key;
create unique index if not exists uq_factura_proveedor_oc_vigente on public.facturas_proveedor (orden_compra_id)
  where orden_compra_id is not null and estado = 'vigente';

create or replace function public.fn_cxp_ordenes_sin_factura()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select case when public.fn_tiene_permiso('contabilidad', 'ver') then
    coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'proveedor', p.nombre, 'estado', o.estado, 'total', o.total,
                                                 'fecha', public.fn_ctb_fecha(coalesce(o.fecha_recepcion_total, o.fecha_creacion)),
                                                 'sin_factura', o.sin_factura, 'sin_factura_motivo', o.sin_factura_motivo)
                               order by o.sin_factura, o.id desc)
              from public.ordenes_compra o left join public.proveedores p on p.id = o.proveedor_id
              where o.estado in ('recibida_total', 'facturada', 'pagada')
                and not exists (select 1 from public.facturas_proveedor f where f.orden_compra_id = o.id and f.estado = 'vigente')),
             '[]'::jsonb)
  else '[]'::jsonb end;
$$;

create or replace function public.fn_cxp_marcar_oc_sin_factura(p_oc_id bigint, p_sin_factura boolean, p_motivo text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para modificar facturas de proveedor';
  end if;
  if p_sin_factura and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Indica por qué la orden no tiene factura';
  end if;
  if p_sin_factura and exists (select 1 from public.facturas_proveedor where orden_compra_id = p_oc_id and estado = 'vigente') then
    raise exception 'La orden ya tiene una factura registrada: anúlala primero';
  end if;
  update public.ordenes_compra
    set sin_factura = p_sin_factura,
        sin_factura_motivo = case when p_sin_factura then btrim(p_motivo) end,
        sin_factura_por = case when p_sin_factura then public.fn_usuario_id() end,
        sin_factura_fecha = case when p_sin_factura then now() end
    where id = p_oc_id;
  if not found then
    raise exception 'La orden de compra no existe';
  end if;
end;
$$;

grant execute on function public.fn_cxp_marcar_oc_sin_factura(bigint, boolean, text) to authenticated;

-- Igual que en la 031, pero solo cuenta una factura vigente (una anulada permite registrarla de nuevo).
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
  select id into v_id from public.facturas_proveedor where orden_compra_id = p_oc_id and estado = 'vigente';
  if found then
    return v_id;
  end if;
  select * into v_prov from public.proveedores where id = o.proveedor_id;
  select regimen_iva into v_regimen from public.empresa_contable where id = 1;
  insert into public.facturas_proveedor (origen, orden_compra_id, proveedor_id, tipo_documento, tipo_compra, serie, numero, numero_autorizacion,
    fecha_emision, fecha_vencimiento, nit, nombre, descripcion, total, iva_credito, registrado_por)
  values ('orden_compra', o.id, o.proveedor_id, 'factura', 'bien', nullif(upper(btrim(coalesce(p_serie, ''))), ''),
    coalesce(nullif(btrim(coalesce(p_numero, '')), ''), 'OC-' || o.id), nullif(btrim(coalesce(p_autorizacion, '')), ''),
    coalesce(p_fecha, public.fn_ctb_fecha(coalesce(o.fecha_facturacion, o.fecha_recepcion_total, now()))),
    p_vencimiento, public.fn_cxp_normalizar_nit(v_prov.nit), coalesce(v_prov.nombre, 'Proveedor'),
    'Orden de compra #' || o.id, o.total,
    case when v_regimen = 'general' then least(coalesce(o.impuestos, 0), o.total - 0.01) else 0 end,
    public.fn_usuario_id())
  returning id into v_id;
  update public.ordenes_compra set sin_factura = false, sin_factura_motivo = null where id = o.id and sin_factura;
  return v_id;
end;
$$;

-- Desde Cuentas por pagar la factura de una orden se registra con su número (sin provisional).
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
  if coalesce(btrim(p_numero), '') = '' or p_fecha is null then
    raise exception 'Indica el número y la fecha de la factura del proveedor';
  end if;
  return public.fn_cxp_crear_desde_oc_interno(p_oc_id, p_serie, p_numero, p_autorizacion, p_fecha, p_vencimiento);
end;
$$;

-- ------------------------------------------------------------
-- 3. Tipo de compra, DUCA y combustibles con IDP
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.facturas_proveedor'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%tipo_documento%' loop
    execute format('alter table public.facturas_proveedor drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.facturas_proveedor add constraint facturas_proveedor_tipo_documento_check
  check (tipo_documento in ('factura', 'factura_pequeno_contribuyente', 'poliza_importacion', 'recibo', 'otro'));

alter table public.facturas_proveedor
  add column if not exists tipo_compra text check (tipo_compra in ('bien', 'servicio', 'combustible', 'importacion')),
  add column if not exists combustible text,
  add column if not exists galones numeric(12,3) check (galones > 0),
  add column if not exists idp numeric(14,2) not null default 0 check (idp >= 0);
update public.facturas_proveedor set tipo_compra = 'bien' where origen = 'orden_compra' and tipo_compra is null;

-- Cuentas de gasto por combustible.
do $$
declare r record;
begin
  for r in select * from (values
      ('6.01.05', 'Combustibles y lubricantes'),
      ('6.01.05.001', 'Combustible — gasolina súper'),
      ('6.01.05.002', 'Combustible — gasolina regular'),
      ('6.01.05.003', 'Combustible — diésel'),
      ('6.01.05.004', 'Combustible — gas licuado (GLP)'),
      ('6.01.05.005', 'Combustible — kerosina'),
      ('6.01.05.006', 'Lubricantes')
    ) as t(codigo, nombre)
    order by string_to_array(codigo, '.')::int[]
  loop
    insert into public.cuentas_contables (codigo, nombre, tipo, naturaleza, es_detalle)
    values (r.codigo, r.nombre, 'gasto', 'deudora', array_length(string_to_array(r.codigo, '.'), 1) = 4)
    on conflict (codigo) do nothing;
  end loop;
end $$;

-- IDP por galón (Ley del Impuesto a la Distribución de Petróleo Crudo y Combustibles
-- Derivados del Petróleo, Decreto 38-92 y reformas). Editable si cambia la tarifa.
create table if not exists public.ctb_combustibles (
  id bigint generated always as identity unique,
  clave text primary key,
  nombre text not null,
  idp_por_galon numeric(8,4) not null check (idp_por_galon >= 0),
  cuenta_id bigint references public.cuentas_contables (id),
  orden int not null default 0,
  activo boolean not null default true
);
insert into public.ctb_combustibles (clave, nombre, idp_por_galon, cuenta_id, orden)
select v.clave, v.nombre, v.idp, c.id, v.orden
from (values
  ('super', 'Gasolina súper', 4.70, '6.01.05.001', 1),
  ('regular', 'Gasolina regular', 4.60, '6.01.05.002', 2),
  ('diesel', 'Diésel', 1.30, '6.01.05.003', 3),
  ('glp', 'Gas licuado de petróleo (GLP)', 0.50, '6.01.05.004', 4),
  ('kerosina', 'Kerosina', 0.50, '6.01.05.005', 5)
) as v(clave, nombre, idp, codigo, orden)
left join public.cuentas_contables c on c.codigo = v.codigo
on conflict (clave) do nothing;

alter table public.ctb_combustibles enable row level security;
create policy sel_ctb_combustibles on public.ctb_combustibles for select to authenticated
  using ((select public.fn_tiene_permiso('contabilidad', 'ver')));
create policy upd_ctb_combustibles on public.ctb_combustibles for update to authenticated
  using ((select public.fn_tiene_permiso('contabilidad', 'configurar'))) with check ((select public.fn_tiene_permiso('contabilidad', 'configurar')));
grant select, update on public.ctb_combustibles to authenticated;
create trigger trg_auditar_ctb_combustibles after update on public.ctb_combustibles
  for each row execute function public.fn_auditar();

-- Registro de facturas: se agrega el tipo de compra, la DUCA y el combustible.
-- Combustible: IDP = galones × tarifa; IVA = (total − IDP) × 12/112; el gasto (sin IVA,
-- con el IDP) va a la cuenta del combustible con el centro de costo de la primera línea.
drop function if exists public.fn_cxp_registrar_factura(bigint, text, text, text, text, date, date, text, text, text, numeric, numeric, jsonb, text);

create or replace function public.fn_cxp_registrar_factura(
  p_proveedor_id bigint, p_tipo text, p_serie text, p_numero text, p_autorizacion text,
  p_fecha date, p_vencimiento date, p_nit text, p_nombre text, p_descripcion text,
  p_total numeric, p_iva numeric, p_lineas jsonb, p_soporte text default null,
  p_tipo_compra text default null, p_combustible text default null, p_galones numeric default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_prov public.proveedores%rowtype;
  v_comb public.ctb_combustibles%rowtype;
  v_nit text;
  v_nombre text;
  v_iva numeric := round(coalesce(p_iva, 0), 2);
  v_total numeric := round(coalesce(p_total, 0), 2);
  v_tipo_compra text := coalesce(nullif(p_tipo_compra, ''), case when p_tipo = 'poliza_importacion' then 'importacion' end);
  v_idp numeric := 0;
  v_regimen text;
  v_l jsonb;
  v_cuenta public.cuentas_contables%rowtype;
  v_suma numeric := 0;
  v_n smallint := 0;
  v_cc bigint;
  v_id bigint;
begin
  if not public.fn_tiene_permiso('contabilidad', 'registrar') then
    raise exception 'No tienes permiso para registrar facturas de proveedor';
  end if;
  if p_tipo not in ('factura', 'factura_pequeno_contribuyente', 'poliza_importacion', 'recibo', 'otro') then
    raise exception 'Tipo de documento no válido';
  end if;
  if v_tipo_compra is null or v_tipo_compra not in ('bien', 'servicio', 'combustible', 'importacion') then
    raise exception 'Indica el tipo de compra: bien, servicio, combustible o importación';
  end if;
  if (p_tipo = 'poliza_importacion') <> (v_tipo_compra = 'importacion') then
    raise exception 'Las importaciones se registran con la póliza de importación (DUCA)';
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
  select regimen_iva into v_regimen from public.empresa_contable where id = 1;

  if v_tipo_compra = 'combustible' then
    select * into v_comb from public.ctb_combustibles where clave = p_combustible and activo;
    if not found then
      raise exception 'Elige el tipo de combustible';
    end if;
    if coalesce(p_galones, 0) <= 0 then
      raise exception 'Indica los galones de la factura de combustible';
    end if;
    if v_comb.cuenta_id is null then
      raise exception 'El combustible % no tiene cuenta contable asignada', v_comb.nombre;
    end if;
    v_idp := round(p_galones * v_comb.idp_por_galon, 2);
    if v_idp >= v_total then
      raise exception 'El IDP (Q %) no puede ser igual o mayor al total: revisa los galones', to_char(v_idp, 'FM999,990.00');
    end if;
    v_iva := round((v_total - v_idp) * 12 / 112, 2);  -- el IDP no lleva IVA
  end if;
  -- Crédito fiscal: factura normal o DUCA, y solo en régimen general.
  if p_tipo not in ('factura', 'poliza_importacion') or v_regimen <> 'general' then
    v_iva := 0;
  end if;
  if v_iva >= v_total then
    raise exception 'El IVA crédito no puede ser igual o mayor al total';
  end if;

  if v_tipo_compra = 'combustible' then
    v_cc := nullif(p_lineas -> 0 ->> 'centro_costo_id', '')::bigint;
    if v_cc is null then
      raise exception 'Elige el centro de costo del combustible';
    end if;
  elsif jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Distribuye el monto en al menos una cuenta';
  end if;

  insert into public.facturas_proveedor (proveedor_id, tipo_documento, tipo_compra, combustible, galones, idp, serie, numero,
    numero_autorizacion, fecha_emision, fecha_vencimiento, nit, nombre, descripcion, total, iva_credito, soporte_url, registrado_por)
  values (p_proveedor_id, p_tipo, v_tipo_compra, case when v_tipo_compra = 'combustible' then v_comb.clave end,
    case when v_tipo_compra = 'combustible' then round(p_galones, 3) end, v_idp,
    nullif(upper(btrim(coalesce(p_serie, ''))), ''), btrim(p_numero),
    nullif(btrim(coalesce(p_autorizacion, '')), ''), p_fecha, p_vencimiento, v_nit, v_nombre,
    nullif(btrim(coalesce(p_descripcion, '')), ''), v_total, v_iva, p_soporte, public.fn_usuario_id())
  returning id into v_id;

  if v_tipo_compra = 'combustible' then
    insert into public.factura_proveedor_lineas (factura_id, linea, cuenta_id, centro_costo_id, descripcion, monto)
    values (v_id, 1, v_comb.cuenta_id, v_cc,
            v_comb.nombre || ' · ' || to_char(p_galones, 'FM999,990.000') || ' gal · IDP Q' || to_char(v_idp, 'FM999,990.00'),
            v_total - v_iva);
    return v_id;
  end if;

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

grant execute on function public.fn_cxp_registrar_factura(bigint, text, text, text, text, date, date, text, text, text, numeric, numeric, jsonb, text, text, text, numeric)
  to authenticated;

-- Ficha: agrega tipo de compra, combustible y si la contabilización automática está encendida.
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
    'compra', (select jsonb_build_object('tipo_compra', f.tipo_compra, 'combustible', c.nombre, 'galones', f.galones, 'idp', f.idp)
               from public.facturas_proveedor f left join public.ctb_combustibles c on c.clave = f.combustible where f.id = p_id),
    'contabilizacion_automatica', (select contabilizacion_automatica and fecha_inicio_contable is not null
                                   from public.empresa_contable where id = 1),
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

-- ------------------------------------------------------------
-- 4. Libro de compras con combustibles, importaciones y exento (IDP)
-- ------------------------------------------------------------
create or replace function public.fn_libro_compras(p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_filas jsonb;
  v_totales jsonb;
begin
  if not public.fn_tiene_permiso('contabilidad', 'ver') then
    raise exception 'No tienes permiso para ver libros contables';
  end if;
  with base as (
    select f.id, f.correlativo, f.fecha_emision, f.tipo_documento, f.tipo_compra, f.serie, f.numero, f.nit, f.nombre, f.estado,
           f.total, f.iva_credito, f.idp, f.total - f.iva_credito - f.idp as neto,
           case when f.origen = 'orden_compra' then f.total - f.iva_credito
                else coalesce((select sum(l.monto) from public.factura_proveedor_lineas l join public.cuentas_contables c on c.id = l.cuenta_id
                               where l.factura_id = f.id and c.tipo = 'activo'), 0) end as bienes_cuentas
    from public.facturas_proveedor f
    where f.fecha_emision between p_desde and p_hasta
  ),
  libro as (
    select id, correlativo, fecha_emision, tipo_documento, tipo_compra, serie, numero, nit, nombre, estado,
           case when estado = 'anulada' or tipo_documento not in ('factura', 'poliza_importacion') then 0
                when tipo_compra = 'bien' then neto
                when tipo_compra is null then bienes_cuentas else 0 end as bienes,
           case when estado = 'anulada' or tipo_documento not in ('factura', 'poliza_importacion') then 0
                when tipo_compra = 'servicio' then neto
                when tipo_compra is null then neto - bienes_cuentas else 0 end as servicios,
           case when estado = 'anulada' or tipo_documento not in ('factura', 'poliza_importacion') then 0
                when tipo_compra = 'combustible' then neto else 0 end as combustibles,
           case when estado = 'anulada' or tipo_documento not in ('factura', 'poliza_importacion') then 0
                when tipo_compra = 'importacion' then neto else 0 end as importaciones,
           case when estado = 'anulada' then 0 else idp end as exento,
           case when estado = 'anulada' or tipo_documento in ('factura', 'poliza_importacion') then 0 else neto end as sin_credito,
           case when estado = 'anulada' then 0 else iva_credito end as iva,
           case when estado = 'anulada' then 0 else total end as total
    from base
  )
  select coalesce(jsonb_agg(to_jsonb(libro) order by fecha_emision, correlativo), '[]'::jsonb),
         jsonb_build_object('documentos', count(*), 'bienes', coalesce(sum(bienes), 0), 'servicios', coalesce(sum(servicios), 0),
                            'combustibles', coalesce(sum(combustibles), 0), 'importaciones', coalesce(sum(importaciones), 0),
                            'exento', coalesce(sum(exento), 0), 'sin_credito', coalesce(sum(sin_credito), 0),
                            'iva', coalesce(sum(iva), 0), 'total', coalesce(sum(total), 0))
    into v_filas, v_totales from libro;
  return jsonb_build_object('filas', v_filas, 'totales', v_totales);
end;
$$;

-- Verificación
select
  (select count(*) from public.ctb_combustibles) as combustibles,
  (select count(*) from pg_trigger where tgname like 'trg_periodo_cerrado_%') as triggers_mes_cerrado,
  (select count(*) from pg_proc where proname = 'fn_cxp_registrar_factura') as versiones_registrar_factura;
