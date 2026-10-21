-- ============================================================
-- ASTRO — Bancos, conciliación y flujo de caja (Fase 2 de contabilidad).
-- Requiere 20261021100009_estado_resultados.sql (tabla gastos).
--
-- Un solo LIBRO DE BANCOS (movimientos_banco): cada entrada o salida
-- real de dinero es un movimiento en una cuenta de la empresa (o en
-- caja de efectivo), ligado a su origen:
--   - cobro de venta      → pago confirmado (transferencia/depósito/tarjeta)
--   - gasto / otro ingreso → gastos
--   - pago a proveedor    → ordenes_compra pagadas
--   - pago de comisiones  → liquidaciones pagadas
--   - transferencia entre cuentas, ajuste, comisión bancaria, otro
-- Cada origen se registra una sola vez (índices únicos). Los flujos
-- existentes no cambian: lo que se movió sin cuenta aparece como
-- "pendiente de registrar en bancos".
--
-- Saldo en libros de una cuenta a una fecha = saldo inicial (a su
-- fecha) + ingresos − egresos no anulados hasta esa fecha.
-- Conciliación: por cuenta y rango (normalmente un mes), se marcan los
-- movimientos que aparecen en el estado de cuenta y se compara el
-- saldo del banco contra el saldo en libros.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Permiso
-- ------------------------------------------------------------
insert into public.permisos (modulo, accion, descripcion) values
  ('bancos', 'gestionar', 'Cuentas bancarias, libro de bancos, conciliación y flujo de caja')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values ('admin', 'bancos', 'gestionar'), ('contabilidad', 'bancos', 'gestionar')) as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

create or replace function public.fn_puede_bancos()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.fn_usuario_id() is not null and public.fn_tiene_permiso('bancos', 'gestionar');
$$;

grant execute on function public.fn_puede_bancos() to authenticated;

-- ------------------------------------------------------------
-- 2. Tablas
-- ------------------------------------------------------------
create table public.cuentas_bancarias (
  id bigint generated always as identity primary key,
  nombre text not null,
  banco text,
  numero text,
  tipo text not null default 'monetaria' check (tipo in ('monetaria', 'ahorro', 'caja')),
  saldo_inicial numeric(14,2) not null default 0,
  fecha_saldo_inicial date not null default current_date,
  activa boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create table public.conciliaciones_bancarias (
  id bigint generated always as identity primary key,
  cuenta_id bigint not null references public.cuentas_bancarias (id),
  desde date not null,
  hasta date not null,
  saldo_banco numeric(14,2) not null,
  saldo_libros numeric(14,2) not null,
  diferencia numeric(14,2) not null,
  notas text,
  cerrada_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now(),
  check (hasta >= desde)
);

create table public.movimientos_banco (
  id bigint generated always as identity primary key,
  cuenta_id bigint not null references public.cuentas_bancarias (id),
  fecha date not null,
  tipo text not null check (tipo in ('ingreso', 'egreso')),
  origen text not null check (origen in (
    'cobro_venta', 'gasto', 'otro_ingreso', 'pago_proveedor', 'pago_comisiones',
    'transferencia', 'comision_bancaria', 'ajuste', 'otro')),
  monto numeric(14,2) not null check (monto > 0),
  descripcion text not null,
  referencia text,
  pago_id bigint references public.pagos (id),
  gasto_id bigint references public.gastos (id),
  orden_compra_id bigint references public.ordenes_compra (id),
  liquidacion_id bigint references public.liquidaciones (id),
  transferencia_grupo bigint,                -- une las dos patas de una transferencia
  conciliado boolean not null default false,
  conciliacion_id bigint references public.conciliaciones_bancarias (id),
  anulado boolean not null default false,
  motivo_anulacion text,
  registrado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now()
);

create index idx_movimientos_banco_cuenta_fecha on public.movimientos_banco (cuenta_id, fecha) where not anulado;
create unique index uq_mov_banco_pago on public.movimientos_banco (pago_id) where pago_id is not null and not anulado;
create unique index uq_mov_banco_gasto on public.movimientos_banco (gasto_id) where gasto_id is not null and not anulado;
create unique index uq_mov_banco_orden on public.movimientos_banco (orden_compra_id) where orden_compra_id is not null and not anulado;
create unique index uq_mov_banco_liquidacion on public.movimientos_banco (liquidacion_id) where liquidacion_id is not null and not anulado;

create sequence if not exists public.seq_transferencia_banco;

create trigger trg_cuentas_bancarias_fecha_actualizacion before update on public.cuentas_bancarias
  for each row execute function public.fn_fecha_actualizacion();
create trigger trg_auditar_cuentas_bancarias after insert or update or delete on public.cuentas_bancarias
  for each row execute function public.fn_auditar();
create trigger trg_auditar_movimientos_banco after insert or update or delete on public.movimientos_banco
  for each row execute function public.fn_auditar();
create trigger trg_auditar_conciliaciones after insert or update or delete on public.conciliaciones_bancarias
  for each row execute function public.fn_auditar();

alter table public.cuentas_bancarias enable row level security;
alter table public.movimientos_banco enable row level security;
alter table public.conciliaciones_bancarias enable row level security;

create policy sel_cuentas_bancarias on public.cuentas_bancarias for select to authenticated
  using (public.fn_puede_bancos() or public.fn_tiene_permiso('comprobantes', 'aprobar') or public.fn_tiene_permiso('gastos', 'registrar'));
create policy sel_movimientos_banco on public.movimientos_banco for select to authenticated
  using (public.fn_puede_bancos());
create policy sel_conciliaciones on public.conciliaciones_bancarias for select to authenticated
  using (public.fn_puede_bancos());

grant select on public.cuentas_bancarias, public.movimientos_banco, public.conciliaciones_bancarias to authenticated;

-- ------------------------------------------------------------
-- 3. Cuentas
-- ------------------------------------------------------------
create or replace function public.fn_guardar_cuenta_bancaria(
  p_id bigint,
  p_nombre text,
  p_banco text,
  p_numero text,
  p_tipo text,
  p_saldo_inicial numeric,
  p_fecha_saldo_inicial date,
  p_activa boolean default true
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.fn_puede_bancos() then
    raise exception 'No tienes permiso para administrar cuentas bancarias';
  end if;
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'La cuenta necesita un nombre';
  end if;
  if p_id is null then
    insert into public.cuentas_bancarias (nombre, banco, numero, tipo, saldo_inicial, fecha_saldo_inicial, activa)
    values (btrim(p_nombre), nullif(btrim(coalesce(p_banco, '')), ''), nullif(btrim(coalesce(p_numero, '')), ''),
            coalesce(p_tipo, 'monetaria'), round(coalesce(p_saldo_inicial, 0), 2), coalesce(p_fecha_saldo_inicial, current_date),
            coalesce(p_activa, true))
    returning id into v_id;
  else
    update public.cuentas_bancarias
      set nombre = btrim(p_nombre), banco = nullif(btrim(coalesce(p_banco, '')), ''),
          numero = nullif(btrim(coalesce(p_numero, '')), ''), tipo = coalesce(p_tipo, tipo),
          saldo_inicial = round(coalesce(p_saldo_inicial, 0), 2),
          fecha_saldo_inicial = coalesce(p_fecha_saldo_inicial, fecha_saldo_inicial),
          activa = coalesce(p_activa, true)
      where id = p_id
      returning id into v_id;
    if v_id is null then
      raise exception 'La cuenta no existe';
    end if;
  end if;
  return v_id;
end;
$$;

grant execute on function public.fn_guardar_cuenta_bancaria(bigint, text, text, text, text, numeric, date, boolean) to authenticated;

-- ------------------------------------------------------------
-- 4. Registro de movimientos
-- ------------------------------------------------------------
create or replace function public.fn_banco_insertar(
  p_cuenta_id bigint, p_fecha date, p_tipo text, p_origen text, p_monto numeric, p_descripcion text,
  p_referencia text default null, p_pago_id bigint default null, p_gasto_id bigint default null,
  p_orden_compra_id bigint default null, p_liquidacion_id bigint default null, p_grupo bigint default null
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not exists (select 1 from public.cuentas_bancarias where id = p_cuenta_id and activa) then
    raise exception 'Elige una cuenta bancaria activa';
  end if;
  if p_fecha is null then
    raise exception 'Indica la fecha del movimiento';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a 0';
  end if;
  insert into public.movimientos_banco
    (cuenta_id, fecha, tipo, origen, monto, descripcion, referencia, pago_id, gasto_id, orden_compra_id, liquidacion_id,
     transferencia_grupo, registrado_por)
  values
    (p_cuenta_id, p_fecha, p_tipo, p_origen, round(p_monto, 2), p_descripcion, nullif(btrim(coalesce(p_referencia, '')), ''),
     p_pago_id, p_gasto_id, p_orden_compra_id, p_liquidacion_id, p_grupo, public.fn_usuario_id())
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Ese movimiento ya está registrado en bancos';
end;
$$;

revoke all on function public.fn_banco_insertar(bigint, date, text, text, numeric, text, text, bigint, bigint, bigint, bigint, bigint)
  from public, anon, authenticated;

-- Cobro de una venta (pago confirmado en dinero) → ingreso.
create or replace function public.fn_banco_registrar_cobro(p_pago_id bigint, p_cuenta_id bigint, p_fecha date)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_pago public.pagos%rowtype;
begin
  if not (public.fn_puede_bancos() or public.fn_tiene_permiso('comprobantes', 'aprobar')) then
    raise exception 'No tienes permiso para registrar cobros en bancos';
  end if;
  select * into v_pago from public.pagos where id = p_pago_id;
  if not found or v_pago.estado <> 'confirmado' then
    raise exception 'Solo se registra en bancos un pago confirmado';
  end if;
  if v_pago.metodo = 'bolsa' then
    raise exception 'Un pago con bolsa no mueve dinero: no se registra en bancos';
  end if;
  return public.fn_banco_insertar(p_cuenta_id, p_fecha, 'ingreso', 'cobro_venta', v_pago.monto,
    'Cobro de la venta #' || v_pago.venta_id || ' (' || v_pago.metodo || ')', v_pago.referencia, p_pago_id);
end;
$$;

grant execute on function public.fn_banco_registrar_cobro(bigint, bigint, date) to authenticated;

-- Gasto (egreso) u otro ingreso (ingreso).
create or replace function public.fn_banco_registrar_gasto(p_gasto_id bigint, p_cuenta_id bigint, p_fecha date default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_gasto public.gastos%rowtype;
begin
  if not (public.fn_puede_bancos() or public.fn_tiene_permiso('gastos', 'registrar')) then
    raise exception 'No tienes permiso para registrar gastos en bancos';
  end if;
  select * into v_gasto from public.gastos where id = p_gasto_id;
  if not found or v_gasto.anulado then
    raise exception 'El gasto no existe o está anulado';
  end if;
  return public.fn_banco_insertar(p_cuenta_id, coalesce(p_fecha, v_gasto.fecha),
    case when v_gasto.clasificacion = 'otro_ingreso' then 'ingreso' else 'egreso' end,
    case when v_gasto.clasificacion = 'otro_ingreso' then 'otro_ingreso' else 'gasto' end,
    v_gasto.monto, v_gasto.descripcion, v_gasto.referencia, null, p_gasto_id);
end;
$$;

grant execute on function public.fn_banco_registrar_gasto(bigint, bigint, date) to authenticated;

-- Pago a proveedor de una orden de compra → egreso.
create or replace function public.fn_banco_registrar_pago_compra(
  p_orden_compra_id bigint, p_cuenta_id bigint, p_fecha date, p_monto numeric default null, p_referencia text default null
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_orden public.ordenes_compra%rowtype;
  v_proveedor text;
begin
  if not public.fn_puede_bancos() then
    raise exception 'No tienes permiso para registrar pagos en bancos';
  end if;
  select * into v_orden from public.ordenes_compra where id = p_orden_compra_id;
  if not found or v_orden.estado in ('borrador', 'cancelada') then
    raise exception 'La orden de compra no existe o no se puede pagar';
  end if;
  select nombre into v_proveedor from public.proveedores where id = v_orden.proveedor_id;
  return public.fn_banco_insertar(p_cuenta_id, p_fecha, 'egreso', 'pago_proveedor', coalesce(p_monto, v_orden.total),
    'Pago OC #' || v_orden.id || coalesce(' — ' || v_proveedor, ''),
    coalesce(p_referencia, v_orden.numero_factura_proveedor), null, null, p_orden_compra_id);
end;
$$;

grant execute on function public.fn_banco_registrar_pago_compra(bigint, bigint, date, numeric, text) to authenticated;

-- Pago de una liquidación de comisiones en dinero → egreso.
create or replace function public.fn_banco_registrar_liquidacion(p_liquidacion_id bigint, p_cuenta_id bigint, p_fecha date)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_liq public.liquidaciones%rowtype;
  v_nombre text;
begin
  if not public.fn_puede_bancos() then
    raise exception 'No tienes permiso para registrar pagos en bancos';
  end if;
  select * into v_liq from public.liquidaciones where id = p_liquidacion_id;
  if not found or v_liq.estado <> 'pagada' then
    raise exception 'Solo se registra una liquidación marcada como pagada';
  end if;
  select nombre into v_nombre from public.usuarios where id = v_liq.usuario_id;
  return public.fn_banco_insertar(p_cuenta_id, p_fecha, 'egreso', 'pago_comisiones', v_liq.total,
    'Comisiones de ' || coalesce(v_nombre, 'usuario #' || v_liq.usuario_id), null, null, null, null, p_liquidacion_id);
end;
$$;

grant execute on function public.fn_banco_registrar_liquidacion(bigint, bigint, date) to authenticated;

-- Movimiento manual (comisión bancaria, ajuste, otro).
create or replace function public.fn_banco_movimiento_manual(
  p_cuenta_id bigint, p_fecha date, p_tipo text, p_origen text, p_monto numeric, p_descripcion text, p_referencia text default null
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_puede_bancos() then
    raise exception 'No tienes permiso para registrar movimientos en bancos';
  end if;
  if p_tipo not in ('ingreso', 'egreso') then
    raise exception 'Tipo de movimiento inválido';
  end if;
  if p_origen not in ('comision_bancaria', 'ajuste', 'otro') then
    raise exception 'Origen manual inválido';
  end if;
  if nullif(btrim(coalesce(p_descripcion, '')), '') is null then
    raise exception 'Describe el movimiento';
  end if;
  return public.fn_banco_insertar(p_cuenta_id, p_fecha, p_tipo, p_origen, p_monto, btrim(p_descripcion), p_referencia);
end;
$$;

grant execute on function public.fn_banco_movimiento_manual(bigint, date, text, text, numeric, text, text) to authenticated;

-- Transferencia entre cuentas (dos movimientos ligados).
create or replace function public.fn_banco_transferencia(
  p_cuenta_origen bigint, p_cuenta_destino bigint, p_fecha date, p_monto numeric, p_descripcion text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_grupo bigint := nextval('public.seq_transferencia_banco');
  v_desc text;
begin
  if not public.fn_puede_bancos() then
    raise exception 'No tienes permiso para registrar transferencias';
  end if;
  if p_cuenta_origen = p_cuenta_destino then
    raise exception 'Elige dos cuentas distintas';
  end if;
  v_desc := coalesce(nullif(btrim(coalesce(p_descripcion, '')), ''), 'Transferencia entre cuentas');
  perform public.fn_banco_insertar(p_cuenta_origen, p_fecha, 'egreso', 'transferencia', p_monto, v_desc, null, null, null, null, null, v_grupo);
  perform public.fn_banco_insertar(p_cuenta_destino, p_fecha, 'ingreso', 'transferencia', p_monto, v_desc, null, null, null, null, null, v_grupo);
end;
$$;

grant execute on function public.fn_banco_transferencia(bigint, bigint, date, numeric, text) to authenticated;

-- Anular (no si ya está conciliado). Una transferencia se anula completa.
create or replace function public.fn_banco_anular_movimiento(p_movimiento_id bigint, p_motivo text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_mov public.movimientos_banco%rowtype;
begin
  if not public.fn_puede_bancos() then
    raise exception 'No tienes permiso para anular movimientos';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Indica el motivo';
  end if;
  select * into v_mov from public.movimientos_banco where id = p_movimiento_id for update;
  if not found or v_mov.anulado then
    raise exception 'El movimiento no existe o ya está anulado';
  end if;
  if v_mov.conciliado then
    raise exception 'No se puede anular un movimiento conciliado';
  end if;
  update public.movimientos_banco
    set anulado = true, motivo_anulacion = btrim(p_motivo)
    where id = p_movimiento_id
       or (v_mov.transferencia_grupo is not null and transferencia_grupo = v_mov.transferencia_grupo and not conciliado);
end;
$$;

grant execute on function public.fn_banco_anular_movimiento(bigint, text) to authenticated;

-- Si se anula un gasto, se anula su movimiento (si aún no está conciliado).
create or replace function public.fn_trg_gasto_anulado_banco()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.anulado and not old.anulado then
    update public.movimientos_banco
      set anulado = true, motivo_anulacion = 'Gasto anulado: ' || coalesce(new.motivo_anulacion, '')
      where gasto_id = new.id and not anulado and not conciliado;
  end if;
  return new;
end;
$$;

create trigger trg_gasto_anulado_banco
  after update of anulado on public.gastos
  for each row execute function public.fn_trg_gasto_anulado_banco();

-- ------------------------------------------------------------
-- 5. Saldos y conciliación
-- ------------------------------------------------------------
create or replace function public.fn_saldo_cuenta(p_cuenta_id bigint, p_hasta date)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select c.saldo_inicial + coalesce((
    select sum(case when m.tipo = 'ingreso' then m.monto else -m.monto end)
    from public.movimientos_banco m
    where m.cuenta_id = c.id and not m.anulado
      and m.fecha >= c.fecha_saldo_inicial and m.fecha <= p_hasta
  ), 0)
  from public.cuentas_bancarias c where c.id = p_cuenta_id;
$$;

revoke all on function public.fn_saldo_cuenta(bigint, date) from public, anon, authenticated;

create or replace function public.fn_banco_marcar_conciliado(p_ids bigint[], p_conciliado boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_puede_bancos() then
    raise exception 'No tienes permiso para conciliar';
  end if;
  update public.movimientos_banco
    set conciliado = coalesce(p_conciliado, true)
    where id = any(p_ids) and not anulado and conciliacion_id is null;
end;
$$;

grant execute on function public.fn_banco_marcar_conciliado(bigint[], boolean) to authenticated;

-- Resumen de conciliación de una cuenta en un rango.
create or replace function public.fn_resumen_conciliacion(p_cuenta_id bigint, p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.fn_puede_bancos() then
    raise exception 'No tienes permiso para ver conciliaciones';
  end if;
  select jsonb_build_object(
    'saldo_inicial', public.fn_saldo_cuenta(p_cuenta_id, p_desde - 1),
    'ingresos', coalesce(sum(monto) filter (where tipo = 'ingreso'), 0),
    'egresos', coalesce(sum(monto) filter (where tipo = 'egreso'), 0),
    'saldo_final', public.fn_saldo_cuenta(p_cuenta_id, p_hasta),
    'conciliados', count(*) filter (where conciliado),
    'pendientes', count(*) filter (where not conciliado),
    'neto_pendiente', coalesce(sum(case when tipo = 'ingreso' then monto else -monto end) filter (where not conciliado), 0)
  ) into v
  from public.movimientos_banco
  where cuenta_id = p_cuenta_id and not anulado and fecha between p_desde and p_hasta;
  return v;
end;
$$;

grant execute on function public.fn_resumen_conciliacion(bigint, date, date) to authenticated;

-- Cierra la conciliación: guarda saldo banco vs libros y amarra los movimientos conciliados.
create or replace function public.fn_cerrar_conciliacion(
  p_cuenta_id bigint, p_desde date, p_hasta date, p_saldo_banco numeric, p_notas text default null
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_libros numeric;
  v_id bigint;
begin
  if not public.fn_puede_bancos() then
    raise exception 'No tienes permiso para cerrar conciliaciones';
  end if;
  if p_saldo_banco is null then
    raise exception 'Indica el saldo según el estado de cuenta';
  end if;
  v_libros := public.fn_saldo_cuenta(p_cuenta_id, p_hasta);
  insert into public.conciliaciones_bancarias (cuenta_id, desde, hasta, saldo_banco, saldo_libros, diferencia, notas, cerrada_por)
  values (p_cuenta_id, p_desde, p_hasta, round(p_saldo_banco, 2), round(v_libros, 2), round(p_saldo_banco - v_libros, 2),
          nullif(btrim(coalesce(p_notas, '')), ''), public.fn_usuario_id())
  returning id into v_id;
  update public.movimientos_banco
    set conciliacion_id = v_id
    where cuenta_id = p_cuenta_id and conciliado and conciliacion_id is null and not anulado and fecha <= p_hasta;
  return v_id;
end;
$$;

grant execute on function public.fn_cerrar_conciliacion(bigint, date, date, numeric, text) to authenticated;

-- ------------------------------------------------------------
-- 6. Pendientes de registrar en bancos
-- ------------------------------------------------------------
create or replace function public.fn_bancos_pendientes()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.fn_puede_bancos() then
    raise exception 'No tienes permiso para ver bancos';
  end if;
  return jsonb_build_object(
    'cobros', coalesce((
      select jsonb_agg(jsonb_build_object(
        'pago_id', p.id, 'venta_id', p.venta_id, 'metodo', p.metodo, 'monto', p.monto, 'referencia', p.referencia,
        'fecha', coalesce(c.fecha_pago, (p.fecha_creacion at time zone 'America/Guatemala')::date),
        'banco_origen', c.banco_origen) order by p.id)
      from public.pagos p
      left join lateral (
        select fecha_pago, banco_origen from public.comprobantes cc
        where cc.pago_id = p.id and cc.estado = 'aprobado' order by cc.id desc limit 1
      ) c on true
      where p.estado = 'confirmado' and p.metodo <> 'bolsa'
        and not exists (select 1 from public.movimientos_banco m where m.pago_id = p.id and not m.anulado)
    ), '[]'::jsonb),
    'gastos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'gasto_id', g.id, 'fecha', g.fecha, 'descripcion', g.descripcion, 'monto', g.monto,
        'clasificacion', g.clasificacion, 'metodo_pago', g.metodo_pago) order by g.fecha)
      from public.gastos g
      where not g.anulado
        and not exists (select 1 from public.movimientos_banco m where m.gasto_id = g.id and not m.anulado)
    ), '[]'::jsonb),
    'compras', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orden_id', o.id, 'proveedor', pr.nombre, 'total', o.total, 'factura', o.numero_factura_proveedor,
        'fecha', (coalesce(o.fecha_pago, o.fecha_facturacion, now()) at time zone 'America/Guatemala')::date) order by o.id)
      from public.ordenes_compra o
      left join public.proveedores pr on pr.id = o.proveedor_id
      where o.estado = 'pagada'
        and not exists (select 1 from public.movimientos_banco m where m.orden_compra_id = o.id and not m.anulado)
    ), '[]'::jsonb),
    'liquidaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'liquidacion_id', l.id, 'usuario', u.nombre, 'total', l.total, 'periodo', pe.nombre) order by l.id)
      from public.liquidaciones l
      join public.usuarios u on u.id = l.usuario_id
      join public.periodos pe on pe.id = l.periodo_id
      where l.estado = 'pagada' and l.total > 0
        and not exists (select 1 from public.movimientos_banco m where m.liquidacion_id = l.id and not m.anulado)
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.fn_bancos_pendientes() to authenticated;

-- ------------------------------------------------------------
-- 7. Flujo de caja (dinero real) por mes
-- ------------------------------------------------------------
create or replace function public.fn_flujo_caja(p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_inicial numeric;
begin
  if not public.fn_puede_bancos() then
    raise exception 'No tienes permiso para ver el flujo de caja';
  end if;
  select coalesce(sum(public.fn_saldo_cuenta(id, p_desde - 1)), 0) into v_inicial from public.cuentas_bancarias;

  return jsonb_build_object(
    'saldo_inicial', round(v_inicial, 2),
    'meses', coalesce((
      select jsonb_agg(x order by x->>'mes')
      from (
        select jsonb_build_object(
          'mes', to_char(date_trunc('month', m.fecha), 'YYYY-MM'),
          'origenes', jsonb_object_agg(m.tipo || ':' || m.origen, m.total)
        ) as x
        from (
          select date_trunc('month', fecha)::date as fecha, tipo, origen,
                 sum(monto) filter (where origen <> 'transferencia') as total
          from public.movimientos_banco
          where not anulado and fecha between p_desde and p_hasta
          group by 1, 2, 3
        ) m
        where m.total is not null
        group by date_trunc('month', m.fecha)
      ) t
    ), '[]'::jsonb),
    'cuentas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'nombre', c.nombre, 'tipo', c.tipo,
        'saldo_inicial', public.fn_saldo_cuenta(c.id, p_desde - 1),
        'saldo_final', public.fn_saldo_cuenta(c.id, p_hasta)) order by c.nombre)
      from public.cuentas_bancarias c
    ), '[]'::jsonb),
    -- Cobros de ventas aprobados en el rango vs registrados en bancos
    'cobros_confirmados', coalesce((
      select sum(p.monto) from public.pagos p
      where p.estado = 'confirmado' and p.metodo <> 'bolsa'
        and (coalesce(p.fecha_actualizacion, p.fecha_creacion) at time zone 'America/Guatemala')::date between p_desde and p_hasta
    ), 0),
    'cobros_en_bancos', coalesce((
      select sum(monto) from public.movimientos_banco
      where not anulado and origen = 'cobro_venta' and fecha between p_desde and p_hasta
    ), 0)
  );
end;
$$;

grant execute on function public.fn_flujo_caja(date, date) to authenticated;

-- ------------------------------------------------------------
-- Verificación
-- ------------------------------------------------------------
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like any (array['fn_banco_%', 'fn_guardar_cuenta_bancaria', 'fn_cerrar_conciliacion', 'fn_resumen_conciliacion',
                                'fn_bancos_pendientes', 'fn_flujo_caja', 'fn_saldo_cuenta', 'fn_puede_bancos'])
order by 1;
