-- ============================================================
-- ASTRO — Contabilidad (fase 2a): mapeo de cuentas por evento,
-- cuenta contable de cada cuenta bancaria y bitácora de pendientes.
--
--   config_contable_eventos   clave de evento → cuenta y centro de costo
--                             por defecto (editable en Datos contables →
--                             Mapeo de cuentas). Claves cc.* solo llevan
--                             centro de costo (centro por canal de venta).
--   cuentas_bancarias.cuenta_contable_id
--                             se crea sola al registrar la cuenta bancaria
--                             (1.01.02.xxx banco / 1.01.01.xxx caja).
--   contabilizacion_pendientes
--                             operaciones que no se pudieron contabilizar
--                             (falta un mapeo, mes cerrado…); la operación
--                             nunca se bloquea por la contabilidad.
-- Requiere 022–024.
-- ============================================================

create table public.config_contable_eventos (
  clave text primary key,
  grupo text not null,
  descripcion text not null,
  cuenta_id bigint references public.cuentas_contables (id),
  centro_costo_id bigint references public.centros_costo (id),
  requiere_cuenta boolean not null default true,
  orden int not null default 0,
  fecha_actualizacion timestamptz
);

alter table public.config_contable_eventos enable row level security;
create policy sel_config_contable_eventos on public.config_contable_eventos for select to authenticated
  using ((select public.fn_tiene_permiso('contabilidad', 'ver')));
grant select on public.config_contable_eventos to authenticated;

insert into public.config_contable_eventos (clave, grupo, descripcion, cuenta_id, centro_costo_id, requiere_cuenta, orden)
select e.clave, e.grupo, e.descripcion, c.id, cc.id, e.requiere_cuenta, e.orden
from (values
  -- Ventas
  ('venta.anticipos', 'Ventas', 'Anticipos de clientes (cobros aplicados a la venta)', '2.01.04.001', null, true, 10),
  ('venta.ingresos', 'Ventas', 'Ventas (tienda, asesores, embajadores y links)', '4.01.01.001', null, true, 11),
  ('venta.ingresos_mayorista', 'Ventas', 'Ventas a mayoristas', '4.01.01.002', null, true, 12),
  ('venta.envio', 'Ventas', 'Ingresos por envío cobrado', '4.01.01.003', null, true, 13),
  ('venta.iva_debito', 'Ventas', 'IVA débito fiscal (régimen general)', '2.01.05.001', null, true, 14),
  ('venta.impuesto_pc_gasto', 'Ventas', 'Gasto de impuesto Pequeño Contribuyente', '6.01.02.009', 'CC-ADM', true, 15),
  ('venta.impuesto_pc_pasivo', 'Ventas', 'Impuesto Pequeño Contribuyente por pagar', '2.01.05.002', null, true, 16),
  ('venta.costo', 'Ventas', 'Costo de ventas', '5.01.01.001', null, true, 17),
  ('venta.inventario', 'Ventas', 'Inventario que se descarga al vender', '1.01.06.001', null, true, 18),
  ('cc.tienda', 'Centro de costo por canal', 'Ventas en tienda', null, 'CC-VTA', false, 20),
  ('cc.asesor', 'Centro de costo por canal', 'Ventas de asesores', null, 'CC-VTA', false, 21),
  ('cc.embajador', 'Centro de costo por canal', 'Ventas de embajadores', null, 'CC-RED', false, 22),
  ('cc.link', 'Centro de costo por canal', 'Ventas por link de catálogo', null, 'CC-RED', false, 23),
  ('cc.mayorista', 'Centro de costo por canal', 'Ventas a mayoristas', null, 'CC-MAY', false, 24),
  -- Cobros
  ('pago.cobros_por_depositar', 'Cobros', 'Transferencias y depósitos confirmados por depositar/identificar en bancos', '1.01.03.001', null, true, 30),
  ('pago.tarjetas_por_liquidar', 'Cobros', 'Cobros con tarjeta o pasarela por liquidar', '1.01.03.002', null, true, 31),
  -- Billetera
  ('bolsa.pasivo', 'Billetera ASTRO', 'Saldo de embajadores en la Billetera (pasivo)', '2.01.03.001', null, true, 40),
  ('bolsa.gasto_comision', 'Billetera ASTRO', 'Comisión de embajadores abonada a la Billetera', '6.01.03.004', 'CC-RED', true, 41),
  -- Comisiones de red
  ('liquidacion.gasto', 'Comisiones de red', 'Gasto de comisiones de red (liquidación aprobada)', '6.01.03.003', 'CC-RED', true, 50),
  ('liquidacion.por_pagar', 'Comisiones de red', 'Comisiones de red por pagar', '2.01.03.002', null, true, 51),
  -- Gastos
  ('gasto.acreedores', 'Gastos', 'Acreedores por gastos (gasto registrado, pendiente de pago)', '2.01.02.001', null, true, 60),
  ('gasto.deudores_otros_ingresos', 'Gastos', 'Otros ingresos por cobrar', '1.01.04.003', null, true, 61),
  ('gasto.otros_ingresos', 'Gastos', 'Otros ingresos', '4.02.01.002', null, true, 62),
  ('gasto.nomina', 'Gastos por categoría', 'Nómina y planilla', '6.01.01.001', 'CC-ADM', true, 70),
  ('gasto.alquiler', 'Gastos por categoría', 'Alquiler', '6.01.02.001', 'CC-ADM', true, 71),
  ('gasto.servicios_basicos', 'Gastos por categoría', 'Servicios (luz, agua, internet)', '6.01.02.002', 'CC-ADM', true, 72),
  ('gasto.marketing', 'Gastos por categoría', 'Marketing y publicidad', '6.01.03.001', 'CC-MKT', true, 73),
  ('gasto.envios', 'Gastos por categoría', 'Envíos y logística', '6.01.03.002', 'CC-LOG', true, 74),
  ('gasto.comisiones_bancarias', 'Gastos por categoría', 'Comisiones bancarias', '6.02.01.001', 'CC-ADM', true, 75),
  ('gasto.tecnologia', 'Gastos por categoría', 'Tecnología y software', '6.01.02.003', 'CC-ADM', true, 76),
  ('gasto.mantenimiento', 'Gastos por categoría', 'Mantenimiento', '6.01.02.004', 'CC-ADM', true, 77),
  ('gasto.oficina', 'Gastos por categoría', 'Oficina y papelería', '6.01.02.005', 'CC-ADM', true, 78),
  ('gasto.impuestos_tasas', 'Gastos por categoría', 'Impuestos y tasas', '6.01.02.006', 'CC-ADM', true, 79),
  ('gasto.honorarios', 'Gastos por categoría', 'Honorarios profesionales', '6.01.02.007', 'CC-ADM', true, 80),
  ('gasto.viaticos', 'Gastos por categoría', 'Viáticos', '6.01.02.008', 'CC-ADM', true, 81),
  ('gasto.intereses', 'Gastos por categoría', 'Intereses', '6.02.01.002', 'CC-ADM', true, 82),
  ('gasto.otros', 'Gastos por categoría', 'Otros gastos', '6.01.02.010', 'CC-ADM', true, 83),
  -- Bancos
  ('banco.transito', 'Bancos', 'Transferencias entre cuentas propias en tránsito', '1.01.03.003', null, true, 90),
  ('banco.comision', 'Bancos', 'Comisiones y cargos bancarios', '6.02.01.001', 'CC-ADM', true, 91),
  ('banco.ajuste_gasto', 'Bancos', 'Ajustes y otros egresos bancarios', '6.01.02.010', 'CC-ADM', true, 92),
  ('banco.ajuste_ingreso', 'Bancos', 'Ajustes y otros ingresos bancarios', '4.02.01.002', null, true, 93),
  -- Compras y metal
  ('compra.inventario', 'Compras', 'Inventario recibido por orden de compra', '1.01.06.001', null, true, 100),
  ('compra.iva_credito', 'Compras', 'IVA crédito fiscal de compras (régimen general)', '1.01.05.001', null, true, 101),
  ('compra.proveedores', 'Compras', 'Proveedores por pagar', '2.01.01.001', null, true, 102),
  ('metal.inventario', 'Compras', 'Inventario recibido en recepción de oro y plata', '1.01.06.001', null, true, 103),
  ('metal.acreedor', 'Compras', 'Por pagar en recepciones de metal sin proveedor', '2.01.02.002', null, true, 104),
  -- Premios
  ('premio.gasto', 'Premios', 'Premios e incentivos entregados', '6.01.03.005', 'CC-RED', true, 110),
  ('premio.inventario', 'Premios', 'Inventario de premios', '1.01.06.003', null, true, 111),
  -- Apertura
  ('apertura.ajuste', 'Apertura', 'Diferencia de la partida de apertura', '3.03.01.004', null, true, 120)
) as e(clave, grupo, descripcion, codigo, cc_codigo, requiere_cuenta, orden)
left join public.cuentas_contables c on c.codigo = e.codigo
left join public.centros_costo cc on cc.codigo = e.cc_codigo
on conflict (clave) do nothing;

-- ------------------------------------------------------------
-- Cuenta contable de cada cuenta bancaria
-- ------------------------------------------------------------
alter table public.cuentas_bancarias add column if not exists cuenta_contable_id bigint references public.cuentas_contables (id);

-- Crea la cuenta de detalle bajo 1.01.02 (bancos) o 1.01.01 (caja) si la madre existe.
create or replace function public.fn_ctb_crear_cuenta_banco(p_nombre text, p_tipo text)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_madre public.cuentas_contables%rowtype;
  v_siguiente int;
  v_id bigint;
begin
  select * into v_madre from public.cuentas_contables
    where codigo = case when p_tipo = 'caja' then '1.01.01' else '1.01.02' end and not es_detalle;
  if not found then
    return null;
  end if;
  select coalesce(max(split_part(codigo, '.', 4)::int), 0) + 1 into v_siguiente
    from public.cuentas_contables where padre_id = v_madre.id;
  insert into public.cuentas_contables (codigo, nombre, tipo, naturaleza, es_detalle)
  values (v_madre.codigo || '.' || lpad(v_siguiente::text, 3, '0'),
          case when p_tipo = 'caja' then '' else 'Banco · ' end || btrim(p_nombre), 'activo', 'deudora', true)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.fn_ctb_crear_cuenta_banco(text, text) from public, anon, authenticated;

create or replace function public.fn_trg_cuenta_bancaria_contable()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.cuenta_contable_id is null then
    new.cuenta_contable_id := public.fn_ctb_crear_cuenta_banco(new.nombre, new.tipo);
  end if;
  return new;
end;
$$;

create trigger trg_cuenta_bancaria_contable before insert on public.cuentas_bancarias
  for each row execute function public.fn_trg_cuenta_bancaria_contable();

-- Cuentas bancarias ya existentes
update public.cuentas_bancarias
  set cuenta_contable_id = public.fn_ctb_crear_cuenta_banco(nombre, tipo)
  where cuenta_contable_id is null;

-- ------------------------------------------------------------
-- Pendientes de contabilizar
-- ------------------------------------------------------------
create table public.contabilizacion_pendientes (
  id bigint generated always as identity primary key,
  origen text not null,
  origen_id bigint not null,
  accion text not null check (accion in ('contabilizar', 'revertir')),
  mensaje text not null,
  intentos int not null default 1,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'resuelto', 'descartado')),
  resuelto_por bigint references public.usuarios (id),
  motivo_descarte text,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now(),
  unique (origen, origen_id, accion)
);
create index idx_contabilizacion_pendientes_estado on public.contabilizacion_pendientes (estado, fecha_creacion);

alter table public.contabilizacion_pendientes enable row level security;
create policy sel_contabilizacion_pendientes on public.contabilizacion_pendientes for select to authenticated
  using ((select public.fn_tiene_permiso('contabilidad', 'ver')));
grant select on public.contabilizacion_pendientes to authenticated;

-- Guardar el mapeo: [{clave, cuenta_id, centro_costo_id}] y [{cuenta_bancaria_id, cuenta_contable_id}]
create or replace function public.fn_ctb_guardar_mapeo(p_eventos jsonb, p_bancos jsonb default '[]'::jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v jsonb;
  v_cuenta public.cuentas_contables%rowtype;
begin
  if not public.fn_tiene_permiso('contabilidad', 'configurar') then
    raise exception 'No tienes permiso para configurar la contabilidad';
  end if;
  for v in select * from jsonb_array_elements(coalesce(p_eventos, '[]'::jsonb)) loop
    if nullif(v ->> 'cuenta_id', '') is not null then
      select * into v_cuenta from public.cuentas_contables where id = (v ->> 'cuenta_id')::bigint;
      if not found or not v_cuenta.es_detalle then
        raise exception 'El evento % debe usar una cuenta de detalle', v ->> 'clave';
      end if;
    end if;
    update public.config_contable_eventos
      set cuenta_id = nullif(v ->> 'cuenta_id', '')::bigint,
          centro_costo_id = nullif(v ->> 'centro_costo_id', '')::bigint,
          fecha_actualizacion = now()
      where clave = v ->> 'clave';
  end loop;
  for v in select * from jsonb_array_elements(coalesce(p_bancos, '[]'::jsonb)) loop
    update public.cuentas_bancarias
      set cuenta_contable_id = nullif(v ->> 'cuenta_contable_id', '')::bigint
      where id = (v ->> 'cuenta_bancaria_id')::bigint;
  end loop;
end;
$$;

grant execute on function public.fn_ctb_guardar_mapeo(jsonb, jsonb) to authenticated;

-- Verificación
select
  (select count(*) from public.config_contable_eventos) as eventos,
  (select count(*) from public.config_contable_eventos where requiere_cuenta and cuenta_id is null) as eventos_sin_cuenta,
  (select count(*) from public.cuentas_bancarias where cuenta_contable_id is null) as bancos_sin_cuenta;
