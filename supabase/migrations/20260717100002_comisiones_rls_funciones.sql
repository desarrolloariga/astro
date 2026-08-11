-- ============================================================
-- ARIGA — Migración 0016: RLS y funciones del sistema de
-- comisiones. A diferencia del ranking de puntos (motivacional y
-- visible a toda la red), las comisiones son datos de nómina:
-- cada quien ve solo las suyas; admin y contabilidad ven todo.
-- ============================================================

alter table public.metas enable row level security;
alter table public.reglas_comision enable row level security;
alter table public.comisiones enable row level security;
alter table public.liquidaciones enable row level security;

-- ------------------------------------------------------------
-- Metas: lectura abierta a autenticados (referencia de objetivo,
-- no es dato sensible); escritura admin o coordinador (coordinador
-- administra metas y campañas según la especificación).
-- ------------------------------------------------------------
create policy sel_metas on public.metas for select to authenticated using (true);
create policy adm_metas on public.metas for all to authenticated
  using (public.fn_rol_actual() in ('admin','coordinador'))
  with check (public.fn_rol_actual() in ('admin','coordinador'));

-- ------------------------------------------------------------
-- Reglas de comisión: parametrización — solo admin (lectura y
-- escritura), como toda la configuración financiera.
-- ------------------------------------------------------------
create policy sel_reglas_comision on public.reglas_comision
  for select to authenticated using (public.fn_rol_actual() in ('admin','contabilidad'));
create policy adm_reglas_comision on public.reglas_comision for all to authenticated
  using (public.fn_rol_actual() = 'admin') with check (public.fn_rol_actual() = 'admin');

-- ------------------------------------------------------------
-- Comisiones y liquidaciones: cada quien ve las suyas; admin y
-- contabilidad ven todo. Sin escritura directa (solo funciones).
-- ------------------------------------------------------------
create policy sel_comisiones on public.comisiones
  for select to authenticated
  using (usuario_id = public.fn_usuario_id() or public.fn_rol_actual() in ('admin','contabilidad'));

create policy sel_liquidaciones on public.liquidaciones
  for select to authenticated
  using (usuario_id = public.fn_usuario_id() or public.fn_rol_actual() in ('admin','contabilidad'));

-- ============================================================
-- Cálculo puro de una comisión "por_venta" (reutilizable)
-- ============================================================
create or replace function public.fn_calcular_comision_regla(
  p_tipo text,
  p_porcentaje numeric,
  p_monto_fijo numeric,
  p_condiciones jsonb,
  p_venta_id bigint
)
returns numeric
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_venta public.ventas%rowtype;
  v_categoria_id bigint;
  v_base numeric;
begin
  if p_tipo <> 'por_venta' then
    return 0;
  end if;

  select * into v_venta from public.ventas where id = p_venta_id;
  if not found then
    return 0;
  end if;

  v_categoria_id := (p_condiciones ->> 'categoria_id')::bigint;
  if v_categoria_id is not null then
    select coalesce(sum(vd.precio), 0) into v_base
      from public.venta_detalles vd join public.productos p on p.id = vd.producto_id
      where vd.venta_id = p_venta_id and p.categoria_id = v_categoria_id;
  else
    v_base := v_venta.total;
  end if;

  return round(coalesce(p_monto_fijo, 0) + v_base * coalesce(p_porcentaje, 0) / 100, 2);
end;
$$;

-- ============================================================
-- Otorga comisiones por UNA venta: directa (por_venta) y de
-- liderazgo (% para la cadena de mando del vendedor). Llamada
-- internamente por fn_registrar_venta / fn_confirmar_carrito.
-- ============================================================
create or replace function public.fn_calcular_comisiones(p_venta_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_venta public.ventas%rowtype;
  v_periodo_id bigint;
  v_rol_vendedor bigint;
  v_nombre_vendedor text;
  v_regla record;
  v_ancestro record;
  v_monto numeric;
begin
  select * into v_venta from public.ventas where id = p_venta_id;
  if not found then
    return;
  end if;

  v_periodo_id := public.fn_obtener_periodo_actual();
  select rol_id, nombre into v_rol_vendedor, v_nombre_vendedor
    from public.usuarios where id = v_venta.vendedor_id;

  -- Comisión directa por venta
  for v_regla in
    select * from public.reglas_comision
      where activo and tipo = 'por_venta'
        and (rol_id is null or rol_id = v_rol_vendedor)
        and (vigencia_inicio is null or vigencia_inicio <= v_venta.fecha_creacion)
        and (vigencia_fin is null or vigencia_fin >= v_venta.fecha_creacion)
  loop
    v_monto := public.fn_calcular_comision_regla(
      v_regla.tipo, v_regla.porcentaje, v_regla.monto_fijo, v_regla.condiciones, p_venta_id);
    if v_monto <> 0 then
      insert into public.comisiones (usuario_id, venta_id, regla_id, regla_version, periodo_id, monto, motivo)
      values (v_venta.vendedor_id, p_venta_id, v_regla.id, v_regla.version, v_periodo_id, v_monto, v_regla.nombre);
    end if;
  end loop;

  -- Comisión de liderazgo: cada ascendente cuyo rol coincide con
  -- regla.rol_id gana un % de esta venta (red de supervisión)
  for v_regla in
    select * from public.reglas_comision
      where activo and tipo = 'liderazgo'
        and (vigencia_inicio is null or vigencia_inicio <= v_venta.fecha_creacion)
        and (vigencia_fin is null or vigencia_fin >= v_venta.fecha_creacion)
  loop
    for v_ancestro in
      select u.id from public.vw_cadena_mando cm
        join public.usuarios u on u.id = cm.ancestro_id
        where cm.descendiente_id = v_venta.vendedor_id
          and (v_regla.rol_id is null or u.rol_id = v_regla.rol_id)
    loop
      v_monto := round(coalesce(v_regla.monto_fijo, 0) + v_venta.total * coalesce(v_regla.porcentaje, 0) / 100, 2);
      if v_monto <> 0 then
        insert into public.comisiones (usuario_id, venta_id, regla_id, regla_version, periodo_id, monto, motivo)
        values (v_ancestro.id, p_venta_id, v_regla.id, v_regla.version, v_periodo_id, v_monto,
                v_regla.nombre || ' — red de ' || v_nombre_vendedor);
      end if;
    end loop;
  end loop;
end;
$$;

-- ============================================================
-- Cierre de período: evalúa bonos de período completo (meta,
-- crecimiento) y consolida TODAS las comisiones del período en
-- liquidaciones por persona. Solo admin, y solo una vez por período.
-- ============================================================
create or replace function public.fn_cerrar_periodo(p_periodo_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_periodo public.periodos%rowtype;
  v_periodo_anterior_id bigint;
  v_meta record;
  v_regla record;
  v_total_actual numeric;
  v_total_anterior numeric;
  v_crecimiento_pct numeric;
  v_umbral numeric;
  v_monto numeric;
  v_usuario_id bigint;
begin
  if public.fn_usuario_id() is null or public.fn_rol_actual() <> 'admin' then
    raise exception 'Solo administración puede cerrar un período';
  end if;

  select * into v_periodo from public.periodos where id = p_periodo_id for update;
  if not found then
    raise exception 'El período no existe';
  end if;
  if v_periodo.estado = 'cerrado' then
    raise exception 'El período ya está cerrado';
  end if;

  select id into v_periodo_anterior_id from public.periodos
    where tipo = v_periodo.tipo and fecha_inicio < v_periodo.fecha_inicio
    order by fecha_inicio desc limit 1;

  -- Bono por cumplimiento de meta (metas.ambito = 'vendedor')
  for v_meta in
    select * from public.metas where ambito = 'vendedor' and periodo_id = p_periodo_id
  loop
    select coalesce(sum(v.total), 0) into v_total_actual
      from public.ventas v
      where v.vendedor_id = v_meta.usuario_id and v.estado <> 'anulada'
        and v.fecha_creacion >= v_periodo.fecha_inicio and v.fecha_creacion < v_periodo.fecha_fin;

    if v_total_actual >= v_meta.monto_meta then
      for v_regla in
        select rc.* from public.reglas_comision rc
          join public.usuarios u on u.id = v_meta.usuario_id
          where rc.activo and rc.tipo = 'meta' and (rc.rol_id is null or rc.rol_id = u.rol_id)
      loop
        v_monto := round(coalesce(v_regla.monto_fijo, 0) + v_total_actual * coalesce(v_regla.porcentaje, 0) / 100, 2);
        if v_monto <> 0 then
          insert into public.comisiones (usuario_id, regla_id, regla_version, periodo_id, monto, motivo)
          values (v_meta.usuario_id, v_regla.id, v_regla.version, p_periodo_id, v_monto,
                  v_regla.nombre || ' — meta cumplida');
        end if;
      end loop;
    end if;
  end loop;

  -- Bono por crecimiento vs. el período anterior (mismo tipo)
  if v_periodo_anterior_id is not null then
    for v_usuario_id in
      select distinct vendedor_id from public.ventas
        where estado <> 'anulada'
          and fecha_creacion >= v_periodo.fecha_inicio and fecha_creacion < v_periodo.fecha_fin
    loop
      select coalesce(sum(v.total), 0) into v_total_actual
        from public.ventas v
        where v.vendedor_id = v_usuario_id and v.estado <> 'anulada'
          and v.fecha_creacion >= v_periodo.fecha_inicio and v.fecha_creacion < v_periodo.fecha_fin;

      select coalesce(sum(v.total), 0) into v_total_anterior
        from public.ventas v, public.periodos ant
        where ant.id = v_periodo_anterior_id
          and v.vendedor_id = v_usuario_id and v.estado <> 'anulada'
          and v.fecha_creacion >= ant.fecha_inicio and v.fecha_creacion < ant.fecha_fin;

      continue when v_total_anterior <= 0;

      v_crecimiento_pct := (v_total_actual - v_total_anterior) / v_total_anterior * 100;

      for v_regla in
        select rc.* from public.reglas_comision rc
          join public.usuarios u on u.id = v_usuario_id
          where rc.activo and rc.tipo = 'crecimiento' and (rc.rol_id is null or rc.rol_id = u.rol_id)
      loop
        v_umbral := coalesce((v_regla.condiciones ->> 'umbral_crecimiento')::numeric, 10);
        if v_crecimiento_pct >= v_umbral then
          v_monto := round(coalesce(v_regla.monto_fijo, 0)
            + (v_total_actual - v_total_anterior) * coalesce(v_regla.porcentaje, 0) / 100, 2);
          if v_monto <> 0 then
            insert into public.comisiones (usuario_id, regla_id, regla_version, periodo_id, monto, motivo)
            values (v_usuario_id, v_regla.id, v_regla.version, p_periodo_id, v_monto,
                    v_regla.nombre || format(' — crecimiento %s%%', round(v_crecimiento_pct, 1)));
          end if;
        end if;
      end loop;
    end loop;
  end if;

  -- Consolidar todas las comisiones del período en liquidaciones
  insert into public.liquidaciones (periodo_id, usuario_id, total)
  select periodo_id, usuario_id, sum(monto)
    from public.comisiones
    where periodo_id = p_periodo_id
    group by periodo_id, usuario_id
  on conflict (periodo_id, usuario_id) do update set total = excluded.total;

  update public.periodos set estado = 'cerrado' where id = p_periodo_id;
end;
$$;

-- ============================================================
-- Aprobación y pago de liquidaciones (solo admin) — cascada a
-- las comisiones que la componen.
-- ============================================================
create or replace function public.fn_aprobar_liquidacion(p_liquidacion_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_liq public.liquidaciones%rowtype;
begin
  if public.fn_usuario_id() is null or public.fn_rol_actual() <> 'admin' then
    raise exception 'Solo administración puede aprobar liquidaciones';
  end if;

  select * into v_liq from public.liquidaciones where id = p_liquidacion_id for update;
  if not found then
    raise exception 'La liquidación no existe';
  end if;
  if v_liq.estado <> 'calculada' then
    raise exception 'Solo se aprueba una liquidación en estado calculada (actual: %)', v_liq.estado;
  end if;

  update public.liquidaciones
    set estado = 'aprobada', fecha_aprobacion = now(), aprobado_por = public.fn_usuario_id()
    where id = p_liquidacion_id;

  update public.comisiones set estado = 'aprobada'
    where periodo_id = v_liq.periodo_id and usuario_id = v_liq.usuario_id and estado = 'calculada';
end;
$$;

create or replace function public.fn_pagar_liquidacion(p_liquidacion_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_liq public.liquidaciones%rowtype;
begin
  if public.fn_usuario_id() is null or public.fn_rol_actual() <> 'admin' then
    raise exception 'Solo administración puede marcar liquidaciones como pagadas';
  end if;

  select * into v_liq from public.liquidaciones where id = p_liquidacion_id for update;
  if not found then
    raise exception 'La liquidación no existe';
  end if;
  if v_liq.estado <> 'aprobada' then
    raise exception 'Solo se paga una liquidación previamente aprobada (actual: %)', v_liq.estado;
  end if;

  update public.liquidaciones set estado = 'pagada' where id = p_liquidacion_id;

  update public.comisiones set estado = 'pagada'
    where periodo_id = v_liq.periodo_id and usuario_id = v_liq.usuario_id and estado = 'aprobada';

  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
  values (v_liq.usuario_id, 'comision_pagada', 'Comisión pagada',
          'Tu liquidación de comisiones fue marcada como pagada.', '/comisiones');
end;
$$;
