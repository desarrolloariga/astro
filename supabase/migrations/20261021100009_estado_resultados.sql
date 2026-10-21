-- ============================================================
-- ASTRO — Estado de resultados (Fase 1 de contabilidad).
--
--   Ventas brutas − descuentos = ventas netas − IVA incluido
--   = ingresos sin IVA − costo de mercancía vendida = UTILIDAD BRUTA
--   − comisiones de embajadores (bolsa) − comisiones de red
--   − costo de premios entregados − gastos operativos = UTILIDAD OPERATIVA
--   − gastos financieros + otros ingresos = UTILIDAD NETA
--
-- Decisiones confirmadas:
--   - Las ventas cuentan por FECHA DE LA VENTA (toda venta no anulada),
--     en hora de Guatemala.
--   - Ingresos SIN IVA: el IVA viene incluido en el precio y se separa
--     con el % del motor de precios de cada pieza.
--   - Comisión del embajador = comisión de bolsa de sus ventas del
--     período (devengada aunque el pago aún no se apruebe).
--   - Entran como gasto las comisiones de red/liderazgo y el costo de
--     los premios entregados.
--
-- Se agrega:
--   1. Costo e IVA congelados en cada línea de venta (antes el costo
--      solo existía en el producto y cambiaba con cada compra).
--   2. Registro de gastos (con soporte adjunto).
--   3. Costo de los premios canjeables.
--   4. Permisos estado_resultados.ver y gastos.registrar.
--   5. fn_estado_resultados(desde, hasta) con los cuadres de cobros y
--      de bolsa.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Costo e IVA congelados por línea de venta
-- ------------------------------------------------------------
alter table public.venta_detalles
  add column if not exists costo_unitario numeric(12,2),
  add column if not exists iva_pct numeric(6,2);

-- % de IVA de una pieza: el de su último cálculo de precio; si no, el parámetro vigente.
create or replace function public.fn_iva_pct_producto(p_producto_id bigint)
returns numeric
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
  v_pct numeric;
begin
  select h.factor_impuesto_pct into v_pct
    from public.producto_precio_historial h
    where h.producto_id = p_producto_id
    order by h.id desc
    limit 1;
  if v_pct is null then
    select * into v_producto from public.productos where id = p_producto_id;
    if found then
      v_pct := public.fn_buscar_parametro_precio('factor_impuesto', v_producto.categoria_id, v_producto.id, now());
    end if;
  end if;
  return greatest(coalesce(v_pct, 0), 0);
end;
$$;

revoke all on function public.fn_iva_pct_producto(bigint) from public, anon, authenticated;

create or replace function public.fn_congelar_costo_venta_detalle()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.costo_unitario is null then
    select costo_produccion into new.costo_unitario from public.productos where id = new.producto_id;
  end if;
  if new.iva_pct is null then
    new.iva_pct := public.fn_iva_pct_producto(new.producto_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_congelar_costo_venta_detalle on public.venta_detalles;
create trigger trg_congelar_costo_venta_detalle
  before insert on public.venta_detalles
  for each row execute function public.fn_congelar_costo_venta_detalle();

-- Ventas anteriores: se llenan con el costo actual del producto (mejor dato disponible).
update public.venta_detalles vd
  set costo_unitario = p.costo_produccion
  from public.productos p
  where p.id = vd.producto_id and vd.costo_unitario is null;

update public.venta_detalles
  set iva_pct = public.fn_iva_pct_producto(producto_id)
  where iva_pct is null;

-- ------------------------------------------------------------
-- 2. Permisos
-- ------------------------------------------------------------
insert into public.permisos (modulo, accion, descripcion) values
  ('estado_resultados', 'ver', 'Consultar el estado de resultados y los cuadres de dinero'),
  ('gastos', 'registrar', 'Registrar y anular gastos de la empresa')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('admin', 'estado_resultados', 'ver'),
  ('coordinador', 'estado_resultados', 'ver'),
  ('contabilidad', 'estado_resultados', 'ver'),
  ('admin', 'gastos', 'registrar'),
  ('contabilidad', 'gastos', 'registrar')
) as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

-- ------------------------------------------------------------
-- 3. Gastos
-- ------------------------------------------------------------
create table public.gastos (
  id bigint generated always as identity primary key,
  fecha date not null,
  clasificacion text not null default 'operativo'
    check (clasificacion in ('operativo', 'financiero', 'otro_ingreso')),
  categoria text not null check (categoria in (
    'nomina', 'alquiler', 'servicios_basicos', 'marketing', 'envios', 'comisiones_bancarias',
    'tecnologia', 'mantenimiento', 'oficina', 'impuestos_tasas', 'honorarios', 'viaticos',
    'intereses', 'otros')),
  descripcion text not null,
  monto numeric(12,2) not null check (monto > 0),
  proveedor_id bigint references public.proveedores (id),
  metodo_pago text check (metodo_pago is null or metodo_pago in ('transferencia', 'deposito', 'efectivo', 'tarjeta', 'cheque')),
  referencia text,
  soporte_url text,                       -- ruta en el bucket privado astro-gastos
  anulado boolean not null default false,
  motivo_anulacion text,
  registrado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create index idx_gastos_fecha on public.gastos (fecha) where not anulado;

create trigger trg_gastos_fecha_actualizacion before update on public.gastos
  for each row execute function public.fn_fecha_actualizacion();

create trigger trg_auditar_gastos
  after insert or update or delete on public.gastos
  for each row execute function public.fn_auditar();

alter table public.gastos enable row level security;

create policy sel_gastos on public.gastos
  for select to authenticated
  using (public.fn_tiene_permiso('estado_resultados', 'ver') or public.fn_tiene_permiso('gastos', 'registrar'));

grant select on public.gastos to authenticated;

insert into storage.buckets (id, name, public)
values ('astro-gastos', 'astro-gastos', false)
on conflict (id) do nothing;

create or replace function public.fn_registrar_gasto(
  p_fecha date,
  p_clasificacion text,
  p_categoria text,
  p_descripcion text,
  p_monto numeric,
  p_proveedor_id bigint default null,
  p_metodo_pago text default null,
  p_referencia text default null,
  p_soporte_url text default null
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.fn_tiene_permiso('gastos', 'registrar') then
    raise exception 'No tienes permiso para registrar gastos';
  end if;
  if p_fecha is null then
    raise exception 'Indica la fecha del gasto';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a 0';
  end if;
  if nullif(btrim(coalesce(p_descripcion, '')), '') is null then
    raise exception 'Describe el gasto';
  end if;

  insert into public.gastos
    (fecha, clasificacion, categoria, descripcion, monto, proveedor_id, metodo_pago, referencia, soporte_url, registrado_por)
  values
    (p_fecha, coalesce(p_clasificacion, 'operativo'), p_categoria, btrim(p_descripcion), round(p_monto, 2), p_proveedor_id,
     nullif(p_metodo_pago, ''), nullif(btrim(coalesce(p_referencia, '')), ''), p_soporte_url, public.fn_usuario_id())
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.fn_registrar_gasto(date, text, text, text, numeric, bigint, text, text, text) to authenticated;

create or replace function public.fn_anular_gasto(p_gasto_id bigint, p_motivo text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.fn_tiene_permiso('gastos', 'registrar') then
    raise exception 'No tienes permiso para anular gastos';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Indica el motivo de la anulación';
  end if;
  update public.gastos
    set anulado = true, motivo_anulacion = btrim(p_motivo)
    where id = p_gasto_id and not anulado;
  if not found then
    raise exception 'El gasto no existe o ya estaba anulado';
  end if;
end;
$$;

grant execute on function public.fn_anular_gasto(bigint, text) to authenticated;

-- ------------------------------------------------------------
-- 4. Costo de los premios (gasto al entregarse)
-- ------------------------------------------------------------
alter table public.premios_canje add column if not exists costo numeric(12,2) not null default 0 check (costo >= 0);
alter table public.canjes_premios add column if not exists costo numeric(12,2) not null default 0;

create or replace function public.fn_congelar_costo_canje()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  select coalesce(costo, 0) into new.costo from public.premios_canje where id = new.premio_id;
  return new;
end;
$$;

drop trigger if exists trg_congelar_costo_canje on public.canjes_premios;
create trigger trg_congelar_costo_canje
  before insert on public.canjes_premios
  for each row execute function public.fn_congelar_costo_canje();

-- fn_guardar_premio_canje gana p_costo (DROP: cambia la lista de argumentos).
drop function if exists public.fn_guardar_premio_canje(bigint, text, text, int, int, text[], boolean);

create or replace function public.fn_guardar_premio_canje(
  p_id bigint,
  p_nombre text,
  p_descripcion text,
  p_puntos int,
  p_stock int,
  p_imagenes text[],
  p_activo boolean,
  p_costo numeric default 0
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.fn_puede_admin_premios() then
    raise exception 'No tienes permiso para administrar premiaciones';
  end if;
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El premio necesita un nombre';
  end if;
  if p_puntos is null or p_puntos <= 0 then
    raise exception 'Indica cuántos puntos cuesta el premio';
  end if;
  if p_stock is not null and p_stock < 0 then
    raise exception 'El stock no puede ser negativo';
  end if;
  if coalesce(p_costo, 0) < 0 then
    raise exception 'El costo no puede ser negativo';
  end if;

  if p_id is null then
    insert into public.premios_canje (nombre, descripcion, puntos, stock, imagenes, activo, costo, creado_por)
    values (btrim(p_nombre), nullif(btrim(coalesce(p_descripcion, '')), ''), p_puntos, p_stock,
            coalesce(p_imagenes, '{}'), coalesce(p_activo, true), round(coalesce(p_costo, 0), 2), public.fn_usuario_id())
    returning id into v_id;
  else
    update public.premios_canje
      set nombre = btrim(p_nombre),
          descripcion = nullif(btrim(coalesce(p_descripcion, '')), ''),
          puntos = p_puntos,
          stock = p_stock,
          imagenes = coalesce(p_imagenes, '{}'),
          activo = coalesce(p_activo, true),
          costo = round(coalesce(p_costo, 0), 2)
      where id = p_id
      returning id into v_id;
    if v_id is null then
      raise exception 'El premio no existe';
    end if;
  end if;
  return v_id;
end;
$$;

grant execute on function public.fn_guardar_premio_canje(bigint, text, text, int, int, text[], boolean, numeric) to authenticated;

-- ------------------------------------------------------------
-- 5. Estado de resultados + cuadres
-- ------------------------------------------------------------
create or replace function public.fn_estado_resultados(p_desde date, p_hasta date)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_tz constant text := 'America/Guatemala';
  v jsonb;
  v_brutas numeric; v_desc numeric; v_netas numeric; v_iva numeric; v_cmv numeric;
  v_num int; v_sin_costo int;
  v_com_bolsa numeric; v_com_red numeric; v_premios numeric;
  v_gastos_op numeric; v_gastos_fin numeric; v_otros_ing numeric;
  v_categorias jsonb;
  v_pag_total numeric; v_pag_dinero numeric; v_pag_bolsa numeric; v_por_cobrar numeric;
  v_b_ini numeric; v_b_abonos numeric; v_b_reden numeric; v_b_rev numeric; v_b_aj numeric;
begin
  if not public.fn_tiene_permiso('estado_resultados', 'ver') then
    raise exception 'No tienes permiso para ver el estado de resultados';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Rango de fechas inválido';
  end if;

  -- Ventas del período (por fecha de la venta, no anuladas)
  create temp table if not exists tmp_er_ventas (id bigint primary key) on commit drop;
  truncate tmp_er_ventas;
  insert into tmp_er_ventas
    select id from public.ventas
    where estado <> 'anulada'
      and (fecha_creacion at time zone v_tz)::date between p_desde and p_hasta;

  select count(*), coalesce(sum(v.subtotal), 0), coalesce(sum(v.descuento_desempeno), 0), coalesce(sum(v.total), 0)
    into v_num, v_brutas, v_desc, v_netas
    from public.ventas v join tmp_er_ventas t on t.id = v.id;

  -- IVA incluido (prorrateando el descuento de cada venta) y costo de lo vendido
  select
    coalesce(sum(vd.precio * vd.cantidad
                 * case when v.subtotal > 0 then v.total / v.subtotal else 1 end
                 * coalesce(vd.iva_pct, 0) / (100 + coalesce(vd.iva_pct, 0))), 0),
    coalesce(sum(coalesce(vd.costo_unitario, 0) * vd.cantidad), 0),
    count(*) filter (where coalesce(vd.costo_unitario, 0) = 0)
    into v_iva, v_cmv, v_sin_costo
    from public.venta_detalles vd
    join public.ventas v on v.id = vd.venta_id
    join tmp_er_ventas t on t.id = v.id;

  -- Comisión de embajadores (bolsa) devengada en sus ventas del período
  select coalesce(sum(public.fn_comision_bolsa_venta(v.id)), 0) into v_com_bolsa
    from public.ventas v
    join tmp_er_ventas t on t.id = v.id
    join public.usuarios u on u.id = v.vendedor_id
    join public.roles r on r.id = u.rol_id
    where r.nombre = 'embajador' and not coalesce(v.precio_embajador, false);

  -- Comisiones de red / liderazgo / bonos
  select coalesce(sum(c.monto), 0) into v_com_red
    from public.comisiones c
    where c.venta_id in (select id from tmp_er_ventas)
       or (c.venta_id is null and exists (
             select 1 from public.periodos pe
             where pe.id = c.periodo_id and (pe.fecha_inicio at time zone v_tz)::date between p_desde and p_hasta));

  -- Premios entregados
  select coalesce(sum(costo), 0) into v_premios
    from public.canjes_premios
    where estado = 'entregado' and (fecha_atencion at time zone v_tz)::date between p_desde and p_hasta;

  -- Gastos
  select
    coalesce(sum(monto) filter (where clasificacion = 'operativo'), 0),
    coalesce(sum(monto) filter (where clasificacion = 'financiero'), 0),
    coalesce(sum(monto) filter (where clasificacion = 'otro_ingreso'), 0)
    into v_gastos_op, v_gastos_fin, v_otros_ing
    from public.gastos
    where not anulado and fecha between p_desde and p_hasta;

  select coalesce(jsonb_agg(jsonb_build_object('categoria', categoria, 'monto', monto) order by monto desc), '[]'::jsonb)
    into v_categorias
    from (
      select categoria, sum(monto) as monto from public.gastos
      where not anulado and clasificacion = 'operativo' and fecha between p_desde and p_hasta
      group by categoria
    ) x;

  -- Cuadre ①: ventas pagadas del período = dinero + bolsa
  select coalesce(sum(v.total), 0) into v_pag_total
    from public.ventas v join tmp_er_ventas t on t.id = v.id where v.estado = 'pagada';
  select
    coalesce(sum(p.monto) filter (where p.metodo <> 'bolsa'), 0),
    coalesce(sum(p.monto) filter (where p.metodo = 'bolsa'), 0)
    into v_pag_dinero, v_pag_bolsa
    from public.pagos p
    join public.ventas v on v.id = p.venta_id
    join tmp_er_ventas t on t.id = v.id
    where v.estado = 'pagada' and p.estado = 'confirmado';
  select coalesce(sum(v.total), 0) into v_por_cobrar
    from public.ventas v join tmp_er_ventas t on t.id = v.id where v.estado = 'registrada';

  -- Cuadre ②: bolsa (deuda con embajadores, pagada en producto)
  select coalesce(sum(monto), 0) into v_b_ini
    from public.movimientos_bolsa where (fecha at time zone v_tz)::date < p_desde;
  select
    coalesce(sum(monto) filter (where tipo = 'abono'), 0),
    coalesce(sum(monto) filter (where tipo = 'redencion'), 0),
    coalesce(sum(monto) filter (where tipo = 'reverso'), 0),
    coalesce(sum(monto) filter (where tipo = 'ajuste'), 0)
    into v_b_abonos, v_b_reden, v_b_rev, v_b_aj
    from public.movimientos_bolsa
    where (fecha at time zone v_tz)::date between p_desde and p_hasta;

  v := jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'num_ventas', v_num,
    'lineas_sin_costo', v_sin_costo,
    'ventas_brutas', round(v_brutas, 2),
    'descuentos', round(v_desc, 2),
    'ventas_netas', round(v_netas, 2),
    'iva', round(v_iva, 2),
    'ingresos_sin_iva', round(v_netas - v_iva, 2),
    'cmv', round(v_cmv, 2),
    'utilidad_bruta', round(v_netas - v_iva - v_cmv, 2),
    'comisiones_bolsa', round(v_com_bolsa, 2),
    'comisiones_red', round(v_com_red, 2),
    'premios', round(v_premios, 2),
    'gastos_operativos', round(v_gastos_op, 2),
    'gastos_por_categoria', v_categorias,
    'utilidad_operativa', round(v_netas - v_iva - v_cmv - v_com_bolsa - v_com_red - v_premios - v_gastos_op, 2),
    'gastos_financieros', round(v_gastos_fin, 2),
    'otros_ingresos', round(v_otros_ing, 2),
    'utilidad_neta', round(v_netas - v_iva - v_cmv - v_com_bolsa - v_com_red - v_premios - v_gastos_op - v_gastos_fin + v_otros_ing, 2),
    'cuadre_cobros', jsonb_build_object(
      'ventas_pagadas', round(v_pag_total, 2),
      'cobrado_dinero', round(v_pag_dinero, 2),
      'cobrado_bolsa', round(v_pag_bolsa, 2),
      'diferencia', round(v_pag_total - v_pag_dinero - v_pag_bolsa, 2),
      'por_cobrar', round(v_por_cobrar, 2)
    ),
    'cuadre_bolsa', jsonb_build_object(
      'saldo_inicial', round(v_b_ini, 2),
      'abonos', round(v_b_abonos, 2),
      'redenciones', round(v_b_reden, 2),
      'reversos', round(v_b_rev, 2),
      'ajustes', round(v_b_aj, 2),
      'saldo_final', round(v_b_ini + v_b_abonos + v_b_reden + v_b_rev + v_b_aj, 2),
      'saldo_actual_total', round((select coalesce(sum(monto), 0) from public.movimientos_bolsa), 2)
    )
  );
  return v;
end;
$$;

grant execute on function public.fn_estado_resultados(date, date) to authenticated;

-- ------------------------------------------------------------
-- Verificación
-- ------------------------------------------------------------
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('fn_estado_resultados', 'fn_registrar_gasto', 'fn_anular_gasto', 'fn_guardar_premio_canje',
                    'fn_iva_pct_producto')
order by 1;
