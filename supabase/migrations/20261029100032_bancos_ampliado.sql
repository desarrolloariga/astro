-- ============================================================
-- ASTRO — Bancos ampliado (fase 6).
--
--   * Moneda por cuenta (GTQ / USD) y tipo de cambio por movimiento;
--     la contabilidad se lleva en quetzales (monto_gtq). Tipos de cambio
--     diarios en tipos_cambio.
--   * Notas de débito y de crédito bancarias con cuenta contable de
--     contrapartida y centro de costo (partida automática).
--   * Transferencias entre cuentas de distinta moneda: la diferencia en
--     quetzales va a Diferencial cambiario.
--   * Estado de cuenta importado (Excel/CSV), cruce masivo contra el libro
--     de bancos, cruce manual, crear movimiento desde una línea del banco.
--   * Reporte de conciliación y cierre mensual; el cierre contable del mes
--     exige conciliar las cuentas bancarias con movimientos en ese mes.
-- Usa el permiso bancos.gestionar (fn_puede_bancos). Requiere 022–031.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Moneda y tipo de cambio
-- ------------------------------------------------------------
alter table public.cuentas_bancarias add column if not exists moneda text not null default 'GTQ' check (moneda in ('GTQ', 'USD'));

create table public.tipos_cambio (
  fecha date primary key,
  tasa numeric(12,6) not null check (tasa > 0),
  fuente text,
  registrado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now()
);
alter table public.tipos_cambio enable row level security;
create policy sel_tipos_cambio on public.tipos_cambio for select to authenticated using (true);
grant select on public.tipos_cambio to authenticated;

-- Tasa vigente a una fecha (la última registrada en o antes de esa fecha).
create or replace function public.fn_tipo_cambio(p_fecha date)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select tasa from public.tipos_cambio where fecha <= p_fecha order by fecha desc limit 1;
$$;

grant execute on function public.fn_tipo_cambio(date) to authenticated;

create or replace function public.fn_guardar_tipo_cambio(p_fecha date, p_tasa numeric, p_fuente text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_puede_bancos() then
    raise exception 'No tienes permiso para registrar tipos de cambio';
  end if;
  if p_fecha is null or coalesce(p_tasa, 0) <= 0 then
    raise exception 'Indica la fecha y una tasa mayor a 0';
  end if;
  insert into public.tipos_cambio (fecha, tasa, fuente, registrado_por)
  values (p_fecha, round(p_tasa, 6), nullif(btrim(coalesce(p_fuente, '')), ''), public.fn_usuario_id())
  on conflict (fecha) do update set tasa = excluded.tasa, fuente = excluded.fuente, registrado_por = excluded.registrado_por;
end;
$$;

grant execute on function public.fn_guardar_tipo_cambio(date, numeric, text) to authenticated;

create or replace function public.fn_banco_definir_moneda(p_cuenta_id bigint, p_moneda text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_puede_bancos() then
    raise exception 'No tienes permiso para administrar cuentas bancarias';
  end if;
  if p_moneda not in ('GTQ', 'USD') then
    raise exception 'Moneda no válida';
  end if;
  if exists (select 1 from public.cuentas_bancarias where id = p_cuenta_id and moneda <> p_moneda)
     and exists (select 1 from public.movimientos_banco where cuenta_id = p_cuenta_id) then
    raise exception 'La cuenta ya tiene movimientos: no se puede cambiar su moneda';
  end if;
  update public.cuentas_bancarias set moneda = p_moneda where id = p_cuenta_id;
end;
$$;

grant execute on function public.fn_banco_definir_moneda(bigint, text) to authenticated;

-- Movimientos: tipo de cambio, equivalente en quetzales, contrapartida y centro de costo (notas).
alter table public.movimientos_banco
  add column if not exists tipo_cambio numeric(12,6) not null default 1 check (tipo_cambio > 0),
  add column if not exists cuenta_contrapartida_id bigint references public.cuentas_contables (id),
  add column if not exists centro_costo_id bigint references public.centros_costo (id);
alter table public.movimientos_banco add column if not exists monto_gtq numeric(14,2) generated always as (round(monto * tipo_cambio, 2)) stored;

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.movimientos_banco'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%origen%'
  loop
    execute format('alter table public.movimientos_banco drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.movimientos_banco add constraint movimientos_banco_origen_check check (origen in (
  'cobro_venta', 'gasto', 'otro_ingreso', 'pago_proveedor', 'pago_comisiones', 'transferencia',
  'comision_bancaria', 'ajuste', 'otro', 'nota_debito', 'nota_credito'));

-- Tipo de cambio del movimiento: GTQ siempre 1; USD toma la tasa del día si no se indicó.
create or replace function public.fn_trg_movimiento_banco_tc()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_moneda text;
  v_tasa numeric;
begin
  select moneda into v_moneda from public.cuentas_bancarias where id = new.cuenta_id;
  if coalesce(v_moneda, 'GTQ') = 'GTQ' then
    new.tipo_cambio := 1;
  elsif new.tipo_cambio = 1 then
    v_tasa := public.fn_tipo_cambio(new.fecha);
    if v_tasa is null then
      raise exception 'Registra el tipo de cambio del dólar para el % (Bancos → Tipo de cambio)', to_char(new.fecha, 'DD/MM/YYYY');
    end if;
    new.tipo_cambio := v_tasa;
  end if;
  return new;
end;
$$;

create trigger trg_movimiento_banco_tc before insert on public.movimientos_banco
  for each row execute function public.fn_trg_movimiento_banco_tc();

-- Saldo de una cuenta expresado en quetzales (para contabilidad, apertura y cuadres).
create or replace function public.fn_saldo_cuenta_gtq(p_cuenta_id bigint, p_hasta date)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select round(c.saldo_inicial * case when c.moneda = 'USD' then coalesce(public.fn_tipo_cambio(c.fecha_saldo_inicial), 1) else 1 end, 2)
       + coalesce((
           select sum(case when m.tipo = 'ingreso' then m.monto_gtq else -m.monto_gtq end)
           from public.movimientos_banco m
           where m.cuenta_id = c.id and not m.anulado and m.fecha >= c.fecha_saldo_inicial and m.fecha <= p_hasta), 0)
  from public.cuentas_bancarias c where c.id = p_cuenta_id;
$$;

revoke all on function public.fn_saldo_cuenta_gtq(bigint, date) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. Notas de débito / crédito y transferencias entre monedas
-- ------------------------------------------------------------
create or replace function public.fn_banco_nota(
  p_cuenta_id bigint, p_fecha date, p_tipo_nota text, p_monto numeric, p_descripcion text, p_referencia text,
  p_cuenta_contrapartida_id bigint, p_centro_costo_id bigint default null, p_tipo_cambio numeric default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_cuenta public.cuentas_contables%rowtype;
  v_id bigint;
begin
  if not public.fn_puede_bancos() then
    raise exception 'No tienes permiso para registrar movimientos en bancos';
  end if;
  if p_tipo_nota not in ('debito', 'credito') then
    raise exception 'Indica si es nota de débito o de crédito';
  end if;
  if nullif(btrim(coalesce(p_descripcion, '')), '') is null then
    raise exception 'Describe la nota';
  end if;
  select * into v_cuenta from public.cuentas_contables where id = p_cuenta_contrapartida_id;
  if not found or not v_cuenta.es_detalle or not v_cuenta.activo then
    raise exception 'Elige la cuenta contable de contrapartida (de detalle y activa)';
  end if;
  if v_cuenta.exige_centro_costo and p_centro_costo_id is null then
    raise exception 'La cuenta % es de %: asigna un centro de costo', v_cuenta.codigo, v_cuenta.tipo;
  end if;
  v_id := public.fn_banco_insertar(p_cuenta_id, p_fecha, case when p_tipo_nota = 'debito' then 'egreso' else 'ingreso' end,
                                   'nota_' || p_tipo_nota, p_monto, btrim(p_descripcion), p_referencia);
  update public.movimientos_banco
    set cuenta_contrapartida_id = v_cuenta.id,
        centro_costo_id = case when v_cuenta.tipo in ('activo', 'pasivo', 'patrimonio') then null else p_centro_costo_id end,
        tipo_cambio = case when coalesce(p_tipo_cambio, 0) > 0 and tipo_cambio <> 1 then p_tipo_cambio else tipo_cambio end
    where id = v_id;
  return v_id;
end;
$$;

grant execute on function public.fn_banco_nota(bigint, date, text, numeric, text, text, bigint, bigint, numeric) to authenticated;

-- Transferencia entre cuentas propias; p_monto_destino para cuentas de distinta moneda.
create or replace function public.fn_banco_transferir(
  p_cuenta_origen bigint, p_cuenta_destino bigint, p_fecha date, p_monto numeric,
  p_monto_destino numeric default null, p_descripcion text default null, p_referencia text default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_grupo bigint := nextval('public.seq_transferencia_banco');
  v_desc text := coalesce(nullif(btrim(coalesce(p_descripcion, '')), ''), 'Transferencia entre cuentas propias');
  v_mon_o text;
  v_mon_d text;
begin
  if not public.fn_puede_bancos() then
    raise exception 'No tienes permiso para registrar transferencias';
  end if;
  if p_cuenta_origen = p_cuenta_destino then
    raise exception 'Elige dos cuentas distintas';
  end if;
  select moneda into v_mon_o from public.cuentas_bancarias where id = p_cuenta_origen;
  select moneda into v_mon_d from public.cuentas_bancarias where id = p_cuenta_destino;
  if v_mon_o <> v_mon_d and coalesce(p_monto_destino, 0) <= 0 then
    raise exception 'Las cuentas son de distinta moneda: indica el monto que se acreditó en la cuenta destino';
  end if;
  perform public.fn_banco_insertar(p_cuenta_origen, p_fecha, 'egreso', 'transferencia', p_monto, v_desc, p_referencia,
                                   null, null, null, null, v_grupo);
  perform public.fn_banco_insertar(p_cuenta_destino, p_fecha, 'ingreso', 'transferencia',
                                   case when v_mon_o = v_mon_d then p_monto else p_monto_destino end, v_desc, p_referencia,
                                   null, null, null, null, v_grupo);
  return v_grupo;
end;
$$;

grant execute on function public.fn_banco_transferir(bigint, bigint, date, numeric, numeric, text, text) to authenticated;

insert into public.config_contable_eventos (clave, grupo, descripcion, cuenta_id, centro_costo_id, requiere_cuenta, orden)
select 'banco.diferencial_cambiario', 'Bancos', 'Diferencial cambiario (transferencias entre monedas)', c.id, cc.id, true, 94
from public.cuentas_contables c, public.centros_costo cc
where c.codigo = '6.02.01.003' and cc.codigo = 'CC-ADM'
on conflict (clave) do nothing;

-- Motor: movimientos bancarios en quetzales, notas con contrapartida y diferencial cambiario.
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
  v_salida numeric;
  v_dif numeric := 0;
begin
  select * into m from public.movimientos_banco where id = p_id;
  if not found or m.anulado then
    return;
  end if;
  select cuenta_contable_id, nombre into v_banco, v_nombre from public.cuentas_bancarias where id = m.cuenta_id;
  if v_banco is null then
    raise exception 'La cuenta bancaria «%» no tiene cuenta contable: asígnala en Datos contables → Mapeo de cuentas', v_nombre;
  end if;

  if m.cuenta_contrapartida_id is not null then
    v_contra := m.cuenta_contrapartida_id;
    v_cc := m.centro_costo_id;
  else
    if m.origen in ('nota_debito', 'nota_credito') then
      raise exception 'La nota bancaria no tiene cuenta de contrapartida';
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
  end if;

  -- Transferencia entre monedas: la entrada salda el tránsito por lo que salió y la diferencia es diferencial cambiario.
  if m.origen = 'transferencia' and m.tipo = 'ingreso' and m.transferencia_grupo is not null then
    select sum(monto_gtq) into v_salida from public.movimientos_banco
      where transferencia_grupo = m.transferencia_grupo and tipo = 'egreso' and not anulado;
    if v_salida is not null then
      v_dif := v_salida - m.monto_gtq;
    end if;
  end if;

  perform public.fn_ctb_registrar_auto('banco', p_id, p_fecha,
    v_nombre || ': ' || m.descripcion || case when m.tipo_cambio <> 1 then ' (USD ' || m.monto || ' × ' || m.tipo_cambio || ')' else '' end,
    case when m.tipo = 'ingreso' then jsonb_build_array(
        public.fn_ctb_linea(v_banco, null, m.monto_gtq, 0, m.referencia),
        public.fn_ctb_linea(v_contra, v_cc, 0, m.monto_gtq + v_dif),
        public.fn_ctb_linea(public.fn_ctb_cuenta('banco.diferencial_cambiario'), public.fn_ctb_cc('banco.diferencial_cambiario'),
                            v_dif, 0, 'Diferencial cambiario'))
    else jsonb_build_array(
        public.fn_ctb_linea(v_contra, v_cc, m.monto_gtq, 0),
        public.fn_ctb_linea(v_banco, null, 0, m.monto_gtq, m.referencia)) end);
end;
$$;

revoke all on function public.fn_ctb_b_banco(bigint, date) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Estado de cuenta importado y cruce
-- ------------------------------------------------------------
create table public.estados_cuenta (
  id bigint generated always as identity primary key,
  cuenta_id bigint not null references public.cuentas_bancarias (id),
  desde date not null,
  hasta date not null,
  saldo_inicial numeric(14,2),
  saldo_final numeric(14,2) not null,
  archivo text,
  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  conciliacion_id bigint references public.conciliaciones_bancarias (id),
  importado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now(),
  check (hasta >= desde)
);

create table public.estado_cuenta_lineas (
  id bigint generated always as identity primary key,
  estado_cuenta_id bigint not null references public.estados_cuenta (id) on delete cascade,
  fila int,
  fecha date not null,
  descripcion text,
  referencia text,
  monto numeric(14,2) not null check (monto <> 0),
  saldo numeric(14,2),
  movimiento_id bigint references public.movimientos_banco (id),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'conciliada', 'ignorada')),
  nota text
);
create unique index uq_estado_linea_movimiento on public.estado_cuenta_lineas (movimiento_id) where movimiento_id is not null;
create index idx_estado_cuenta_lineas on public.estado_cuenta_lineas (estado_cuenta_id, estado);

create trigger trg_auditar_estados_cuenta after insert or update or delete on public.estados_cuenta
  for each row execute function public.fn_auditar();

alter table public.estados_cuenta enable row level security;
alter table public.estado_cuenta_lineas enable row level security;
create policy sel_estados_cuenta on public.estados_cuenta for select to authenticated using ((select public.fn_puede_bancos()));
create policy sel_estado_cuenta_lineas on public.estado_cuenta_lineas for select to authenticated using ((select public.fn_puede_bancos()));
grant select on public.estados_cuenta, public.estado_cuenta_lineas to authenticated;

-- p_lineas: [{fila, fecha, descripcion, referencia, monto (+ crédito / − débito), saldo}]
create or replace function public.fn_banco_importar_estado(
  p_cuenta_id bigint, p_desde date, p_hasta date, p_saldo_inicial numeric, p_saldo_final numeric,
  p_archivo text, p_lineas jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_n int;
  v_suma numeric;
begin
  if not public.fn_puede_bancos() then
    raise exception 'No tienes permiso para importar estados de cuenta';
  end if;
  if not exists (select 1 from public.cuentas_bancarias where id = p_cuenta_id) then
    raise exception 'La cuenta bancaria no existe';
  end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El archivo no trae movimientos';
  end if;
  if p_saldo_final is null then
    raise exception 'Indica el saldo final del estado de cuenta';
  end if;
  insert into public.estados_cuenta (cuenta_id, desde, hasta, saldo_inicial, saldo_final, archivo, importado_por)
  values (p_cuenta_id, p_desde, p_hasta, round(p_saldo_inicial, 2), round(p_saldo_final, 2), p_archivo, public.fn_usuario_id())
  returning id into v_id;
  insert into public.estado_cuenta_lineas (estado_cuenta_id, fila, fecha, descripcion, referencia, monto, saldo)
  select v_id, (l ->> 'fila')::int, (l ->> 'fecha')::date, nullif(btrim(coalesce(l ->> 'descripcion', '')), ''),
         nullif(btrim(coalesce(l ->> 'referencia', '')), ''), round((l ->> 'monto')::numeric, 2),
         round(nullif(l ->> 'saldo', '')::numeric, 2)
  from jsonb_array_elements(p_lineas) l
  where coalesce(nullif(l ->> 'monto', '')::numeric, 0) <> 0;
  get diagnostics v_n = row_count;
  select coalesce(sum(monto), 0) into v_suma from public.estado_cuenta_lineas where estado_cuenta_id = v_id;
  return jsonb_build_object('id', v_id, 'lineas', v_n,
    'cuadra', p_saldo_inicial is null or round(p_saldo_inicial + v_suma, 2) = round(p_saldo_final, 2),
    'diferencia', case when p_saldo_inicial is null then null else round(p_saldo_final - p_saldo_inicial - v_suma, 2) end);
end;
$$;

grant execute on function public.fn_banco_importar_estado(bigint, date, date, numeric, numeric, text, jsonb) to authenticated;

-- Cruce masivo: misma cuenta, mismo monto con signo, fecha dentro de ±p_dias; prefiere la referencia igual y la fecha más cercana.
create or replace function public.fn_banco_cruzar_estado(p_estado_id bigint, p_dias int default 3)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  e public.estados_cuenta%rowtype;
  l record;
  v_mov bigint;
  v_n int := 0;
begin
  if not public.fn_puede_bancos() then
    raise exception 'No tienes permiso para conciliar';
  end if;
  select * into e from public.estados_cuenta where id = p_estado_id;
  if not found or e.estado <> 'abierto' then
    raise exception 'El estado de cuenta no existe o ya está cerrado';
  end if;
  for l in select * from public.estado_cuenta_lineas where estado_cuenta_id = p_estado_id and estado = 'pendiente' order by fecha, id loop
    select m.id into v_mov
    from public.movimientos_banco m
    where m.cuenta_id = e.cuenta_id and not m.anulado and m.conciliacion_id is null
      and (case when m.tipo = 'ingreso' then m.monto else -m.monto end) = l.monto
      and abs(m.fecha - l.fecha) <= greatest(coalesce(p_dias, 3), 0)
      and not exists (select 1 from public.estado_cuenta_lineas x where x.movimiento_id = m.id)
    order by (l.referencia is not null and m.referencia is not null
              and (m.referencia ilike '%' || l.referencia || '%' or l.referencia ilike '%' || m.referencia || '%')) desc,
             abs(m.fecha - l.fecha), m.id
    limit 1;
    if v_mov is not null then
      update public.estado_cuenta_lineas set movimiento_id = v_mov, estado = 'conciliada' where id = l.id;
      update public.movimientos_banco set conciliado = true where id = v_mov;
      v_n := v_n + 1;
    end if;
  end loop;
  return jsonb_build_object('cruzadas', v_n,
    'pendientes', (select count(*) from public.estado_cuenta_lineas where estado_cuenta_id = p_estado_id and estado = 'pendiente'));
end;
$$;

grant execute on function public.fn_banco_cruzar_estado(bigint, int) to authenticated;

create or replace function public.fn_banco_cruzar_linea(p_linea_id bigint, p_movimiento_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  l public.estado_cuenta_lineas%rowtype;
  e public.estados_cuenta%rowtype;
  m public.movimientos_banco%rowtype;
begin
  if not public.fn_puede_bancos() then
    raise exception 'No tienes permiso para conciliar';
  end if;
  select * into l from public.estado_cuenta_lineas where id = p_linea_id for update;
  select * into e from public.estados_cuenta where id = l.estado_cuenta_id;
  select * into m from public.movimientos_banco where id = p_movimiento_id for update;
  if l.id is null or e.estado <> 'abierto' then
    raise exception 'La línea no existe o el estado de cuenta está cerrado';
  end if;
  if m.id is null or m.cuenta_id <> e.cuenta_id or m.anulado or m.conciliacion_id is not null then
    raise exception 'El movimiento no es de esta cuenta, está anulado o ya pertenece a una conciliación cerrada';
  end if;
  if (case when m.tipo = 'ingreso' then m.monto else -m.monto end) <> l.monto then
    raise exception 'Los montos no coinciden (banco %, libros %)', l.monto, case when m.tipo = 'ingreso' then m.monto else -m.monto end;
  end if;
  if exists (select 1 from public.estado_cuenta_lineas where movimiento_id = p_movimiento_id and id <> p_linea_id) then
    raise exception 'Ese movimiento ya está cruzado con otra línea del banco';
  end if;
  if l.movimiento_id is not null and l.movimiento_id <> p_movimiento_id then
    update public.movimientos_banco set conciliado = false where id = l.movimiento_id and conciliacion_id is null;
  end if;
  update public.estado_cuenta_lineas set movimiento_id = p_movimiento_id, estado = 'conciliada', nota = null where id = p_linea_id;
  update public.movimientos_banco set conciliado = true where id = p_movimiento_id;
end;
$$;

grant execute on function public.fn_banco_cruzar_linea(bigint, bigint) to authenticated;

-- Deshacer cruce, ignorar línea (con nota) o volverla a pendiente.
create or replace function public.fn_banco_estado_linea(p_linea_id bigint, p_accion text, p_nota text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  l public.estado_cuenta_lineas%rowtype;
begin
  if not public.fn_puede_bancos() then
    raise exception 'No tienes permiso para conciliar';
  end if;
  select * into l from public.estado_cuenta_lineas where id = p_linea_id for update;
  if not found or (select estado from public.estados_cuenta where id = l.estado_cuenta_id) <> 'abierto' then
    raise exception 'La línea no existe o el estado de cuenta está cerrado';
  end if;
  if p_accion not in ('descruzar', 'ignorar', 'pendiente') then
    raise exception 'Acción no válida';
  end if;
  if p_accion = 'ignorar' and coalesce(btrim(p_nota), '') = '' then
    raise exception 'Explica por qué se ignora la línea';
  end if;
  if l.movimiento_id is not null then
    update public.movimientos_banco set conciliado = false where id = l.movimiento_id and conciliacion_id is null;
  end if;
  update public.estado_cuenta_lineas
    set movimiento_id = null, estado = case when p_accion = 'ignorar' then 'ignorada' else 'pendiente' end,
        nota = case when p_accion = 'ignorar' then btrim(p_nota) end
    where id = p_linea_id;
end;
$$;

grant execute on function public.fn_banco_estado_linea(bigint, text, text) to authenticated;

-- Registrar en libros una partida que solo está en el banco (nota de débito/crédito) y cruzarla.
create or replace function public.fn_banco_crear_desde_linea(p_linea_id bigint, p_cuenta_contrapartida_id bigint,
  p_centro_costo_id bigint default null, p_descripcion text default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  l public.estado_cuenta_lineas%rowtype;
  e public.estados_cuenta%rowtype;
  v_mov bigint;
begin
  select * into l from public.estado_cuenta_lineas where id = p_linea_id for update;
  select * into e from public.estados_cuenta where id = l.estado_cuenta_id;
  if l.id is null or e.estado <> 'abierto' or l.estado <> 'pendiente' then
    raise exception 'Solo se registran líneas pendientes de un estado de cuenta abierto';
  end if;
  v_mov := public.fn_banco_nota(e.cuenta_id, l.fecha, case when l.monto > 0 then 'credito' else 'debito' end, abs(l.monto),
                                coalesce(nullif(btrim(coalesce(p_descripcion, '')), ''), l.descripcion, 'Partida del estado de cuenta'),
                                l.referencia, p_cuenta_contrapartida_id, p_centro_costo_id);
  perform public.fn_banco_cruzar_linea(p_linea_id, v_mov);
  return v_mov;
end;
$$;

grant execute on function public.fn_banco_crear_desde_linea(bigint, bigint, bigint, text) to authenticated;

create or replace function public.fn_banco_candidatos_linea(p_linea_id bigint)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select case when public.fn_puede_bancos() then coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'fecha', m.fecha, 'tipo', m.tipo, 'origen', m.origen, 'monto', m.monto,
                                        'descripcion', m.descripcion, 'referencia', m.referencia,
                                        'mismo_monto', (case when m.tipo = 'ingreso' then m.monto else -m.monto end) = l.monto)
                     order by ((case when m.tipo = 'ingreso' then m.monto else -m.monto end) = l.monto) desc, abs(m.fecha - l.fecha), m.id)
    from public.estado_cuenta_lineas l
    join public.estados_cuenta e on e.id = l.estado_cuenta_id
    join public.movimientos_banco m on m.cuenta_id = e.cuenta_id
    where l.id = p_linea_id and not m.anulado and m.conciliacion_id is null
      and abs(m.fecha - l.fecha) <= 31
      and sign(case when m.tipo = 'ingreso' then m.monto else -m.monto end) = sign(l.monto)
      and not exists (select 1 from public.estado_cuenta_lineas x where x.movimiento_id = m.id)), '[]'::jsonb)
  else '[]'::jsonb end;
$$;

grant execute on function public.fn_banco_candidatos_linea(bigint) to authenticated;

-- ------------------------------------------------------------
-- 4. Reporte de conciliación y cierre del mes
-- ------------------------------------------------------------
-- Saldo según banco + depósitos en tránsito − pagos en circulación ± partidas del banco aún no registradas = saldo según libros.
create or replace function public.fn_banco_reporte_conciliacion(p_estado_id bigint)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  e public.estados_cuenta%rowtype;
  c public.cuentas_bancarias%rowtype;
  v_libros numeric;
  v_transito jsonb;
  v_circulacion jsonb;
  v_no_registradas jsonb;
  v_t numeric;
  v_c numeric;
  v_nr numeric;
begin
  if not public.fn_puede_bancos() then
    raise exception 'No tienes permiso para ver conciliaciones';
  end if;
  select * into e from public.estados_cuenta where id = p_estado_id;
  if not found then
    raise exception 'El estado de cuenta no existe';
  end if;
  select * into c from public.cuentas_bancarias where id = e.cuenta_id;
  v_libros := public.fn_saldo_cuenta(e.cuenta_id, e.hasta);

  with libro as (
    select m.* from public.movimientos_banco m
    where m.cuenta_id = e.cuenta_id and not m.anulado and m.fecha <= e.hasta and m.fecha >= c.fecha_saldo_inicial
      and not m.conciliado
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'fecha', fecha, 'descripcion', descripcion, 'referencia', referencia, 'monto', monto)
                            order by fecha) filter (where tipo = 'ingreso'), '[]'::jsonb),
         coalesce(sum(monto) filter (where tipo = 'ingreso'), 0),
         coalesce(jsonb_agg(jsonb_build_object('id', id, 'fecha', fecha, 'descripcion', descripcion, 'referencia', referencia, 'monto', monto)
                            order by fecha) filter (where tipo = 'egreso'), '[]'::jsonb),
         coalesce(sum(monto) filter (where tipo = 'egreso'), 0)
    into v_transito, v_t, v_circulacion, v_c
    from libro;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'fecha', fecha, 'descripcion', descripcion, 'referencia', referencia, 'monto', monto)
                            order by fecha), '[]'::jsonb),
         coalesce(sum(monto), 0)
    into v_no_registradas, v_nr
    from public.estado_cuenta_lineas where estado_cuenta_id = p_estado_id and estado = 'pendiente';

  return jsonb_build_object(
    'cuenta', jsonb_build_object('id', c.id, 'nombre', c.nombre, 'banco', c.banco, 'numero', c.numero, 'moneda', c.moneda),
    'desde', e.desde, 'hasta', e.hasta, 'estado', e.estado, 'conciliacion_id', e.conciliacion_id,
    'saldo_banco', e.saldo_final,
    'depositos_transito', v_t, 'lista_transito', v_transito,
    'pagos_circulacion', v_c, 'lista_circulacion', v_circulacion,
    'no_registradas', v_nr, 'lista_no_registradas', v_no_registradas,
    'saldo_conciliado', round(e.saldo_final + v_t - v_c - v_nr, 2),
    'saldo_libros', round(v_libros, 2),
    'diferencia', round(e.saldo_final + v_t - v_c - v_nr - v_libros, 2),
    'lineas', (select jsonb_build_object('total', count(*), 'conciliadas', count(*) filter (where estado = 'conciliada'),
                                         'pendientes', count(*) filter (where estado = 'pendiente'),
                                         'ignoradas', count(*) filter (where estado = 'ignorada'))
               from public.estado_cuenta_lineas where estado_cuenta_id = p_estado_id));
end;
$$;

grant execute on function public.fn_banco_reporte_conciliacion(bigint) to authenticated;

-- Cierra el mes de la cuenta: exige que todo cuadre y guarda la conciliación.
create or replace function public.fn_banco_cerrar_estado(p_estado_id bigint, p_notas text default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  e public.estados_cuenta%rowtype;
  r jsonb;
  v_conc bigint;
begin
  if not public.fn_puede_bancos() then
    raise exception 'No tienes permiso para cerrar conciliaciones';
  end if;
  select * into e from public.estados_cuenta where id = p_estado_id for update;
  if not found or e.estado <> 'abierto' then
    raise exception 'El estado de cuenta no existe o ya está cerrado';
  end if;
  r := public.fn_banco_reporte_conciliacion(p_estado_id);
  if (r ->> 'no_registradas')::numeric <> 0 or ((r -> 'lineas') ->> 'pendientes')::int > 0 then
    raise exception 'Quedan líneas del banco sin cruzar: crúzalas, regístralas o ignóralas con su explicación';
  end if;
  if (r ->> 'diferencia')::numeric <> 0 then
    raise exception 'La conciliación no cuadra (diferencia %): revisa antes de cerrar', r ->> 'diferencia';
  end if;
  v_conc := public.fn_cerrar_conciliacion(e.cuenta_id, e.desde, e.hasta, e.saldo_final, p_notas);
  update public.estados_cuenta set estado = 'cerrado', conciliacion_id = v_conc where id = p_estado_id;
  return v_conc;
end;
$$;

grant execute on function public.fn_banco_cerrar_estado(bigint, text) to authenticated;

-- ------------------------------------------------------------
-- 5. Contabilidad en quetzales para cuentas en dólares
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
    v_monto := public.fn_saldo_cuenta_gtq(r.id, v_fecha);
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

create or replace function public.fn_ctb_b_saldo_banco(p_id bigint, p_fecha date)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  c public.cuentas_bancarias%rowtype;
  v_gtq numeric;
begin
  select * into c from public.cuentas_bancarias where id = p_id;
  if not found or coalesce(c.saldo_inicial, 0) = 0 then
    return;
  end if;
  v_gtq := round(c.saldo_inicial * case when c.moneda = 'USD' then coalesce(public.fn_tipo_cambio(c.fecha_saldo_inicial), 1) else 1 end, 2);
  if c.cuenta_contable_id is null then
    raise exception 'La cuenta bancaria «%» no tiene cuenta contable', c.nombre;
  end if;
  perform public.fn_ctb_registrar_auto('saldo_banco', p_id, p_fecha, 'Saldo inicial de ' || c.nombre,
    jsonb_build_array(
      public.fn_ctb_linea(c.cuenta_contable_id, null, v_gtq, 0),
      public.fn_ctb_linea(public.fn_ctb_cuenta('apertura.ajuste'), null, 0, v_gtq)));
end;
$$;

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
  v_inv_kardex numeric;
  v_inv_ctb numeric;
begin
  if not public.fn_tiene_permiso('contabilidad', 'ver') then
    raise exception 'No tienes permiso para ver la contabilidad';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'cuenta_bancaria', b.nombre, 'codigo', c.codigo,
           'saldo_bancos', public.fn_saldo_cuenta_gtq(b.id, v_hasta),
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

  -- Inventario: valor PEPS del Kardex vs. saldo de la cuenta de inventario.
  select coalesce(sum(saldo_valor), 0) into v_inv_kardex from (
    select distinct on (producto_id) saldo_valor from public.kardex_movimientos
    where public.fn_ctb_fecha(fecha) <= v_hasta order by producto_id, id desc) k;
  select coalesce(sum(l.debe - l.haber), 0) into v_inv_ctb
    from public.partida_lineas l join public.partidas p on p.id = l.partida_id and p.estado = 'contabilizada'
    where l.cuenta_id = (select cuenta_id from public.config_contable_eventos where clave = 'venta.inventario') and p.fecha <= v_hasta;

  return jsonb_build_object(
    'hasta', v_hasta,
    'inventario', jsonb_build_object('saldo_kardex', v_inv_kardex, 'saldo_contable', v_inv_ctb),
    'activa', (select contabilizacion_automatica from public.empresa_contable where id = 1),
    'fecha_inicio', (select fecha_inicio_contable from public.empresa_contable where id = 1),
    'bancos', v_bancos,
    'billetera', jsonb_build_object('saldo_libro', v_bolsa_libro, 'saldo_contable', v_bolsa_ctb),
    'pendientes', (select count(*) from public.contabilizacion_pendientes where estado = 'pendiente'),
    'borradores', (select count(*) from public.partidas where estado = 'borrador'));
end;
$$;

-- ------------------------------------------------------------
-- 6. El cierre contable exige la conciliación bancaria del mes
-- ------------------------------------------------------------
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

revoke all on function public.fn_ctb_b_saldo_banco(bigint, date) from public, anon, authenticated;

-- Verificación
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'cuentas_bancarias' and column_name = 'moneda') as moneda,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('tipos_cambio', 'estados_cuenta', 'estado_cuenta_lineas')) as tablas;
