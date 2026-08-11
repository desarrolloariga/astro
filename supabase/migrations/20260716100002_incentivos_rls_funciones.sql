-- ============================================================
-- ARIGA — Migración 0013: RLS y funciones del motor de puntos,
-- descuentos por desempeño y fidelización.
-- ============================================================

alter table public.periodos enable row level security;
alter table public.reglas_puntaje enable row level security;
alter table public.puntos enable row level security;
alter table public.topes_venta enable row level security;
alter table public.escalas_descuento enable row level security;
alter table public.premios enable row level security;
alter table public.niveles enable row level security;
alter table public.usuario_niveles enable row level security;
alter table public.insignias enable row level security;
alter table public.usuario_insignias enable row level security;
alter table public.reconocimientos enable row level security;

-- ------------------------------------------------------------
-- Configuración (reglas, topes, escalas, premios, niveles,
-- insignias): lectura para todos los autenticados — son la base
-- del ranking, visible a toda la red comercial — escritura solo
-- admin.
-- ------------------------------------------------------------
create policy sel_periodos on public.periodos for select to authenticated using (true);
create policy adm_periodos on public.periodos for all to authenticated
  using (public.fn_rol_actual() = 'admin') with check (public.fn_rol_actual() = 'admin');

create policy sel_reglas_puntaje on public.reglas_puntaje for select to authenticated using (true);
create policy adm_reglas_puntaje on public.reglas_puntaje for all to authenticated
  using (public.fn_rol_actual() = 'admin') with check (public.fn_rol_actual() = 'admin');

create policy sel_topes_venta on public.topes_venta for select to authenticated using (true);
create policy adm_topes_venta on public.topes_venta for all to authenticated
  using (public.fn_rol_actual() = 'admin') with check (public.fn_rol_actual() = 'admin');

create policy sel_escalas_descuento on public.escalas_descuento for select to authenticated using (true);
create policy adm_escalas_descuento on public.escalas_descuento for all to authenticated
  using (public.fn_rol_actual() = 'admin') with check (public.fn_rol_actual() = 'admin');

create policy sel_premios on public.premios for select to authenticated using (true);
create policy adm_premios on public.premios for all to authenticated
  using (public.fn_rol_actual() = 'admin') with check (public.fn_rol_actual() = 'admin');

create policy sel_niveles on public.niveles for select to authenticated using (true);
create policy adm_niveles on public.niveles for all to authenticated
  using (public.fn_rol_actual() = 'admin') with check (public.fn_rol_actual() = 'admin');

create policy sel_insignias on public.insignias for select to authenticated using (true);
create policy adm_insignias on public.insignias for all to authenticated
  using (public.fn_rol_actual() = 'admin') with check (public.fn_rol_actual() = 'admin');

-- ------------------------------------------------------------
-- Puntos y asignaciones: solo lectura directa (las escriben las
-- funciones de cálculo, security definer). Visibles ampliamente
-- porque alimentan el ranking motivacional de toda la red.
-- ------------------------------------------------------------
create policy sel_puntos on public.puntos for select to authenticated using (true);
create policy sel_usuario_niveles on public.usuario_niveles for select to authenticated using (true);
create policy sel_usuario_insignias on public.usuario_insignias for select to authenticated using (true);

-- ------------------------------------------------------------
-- Reconocimientos: visibles cuando están publicados; admin y
-- coordinador ven y gestionan todo (coordinador puede publicar
-- destacados del mes según la especificación).
-- ------------------------------------------------------------
create policy sel_reconocimientos on public.reconocimientos
  for select to authenticated
  using (publicado or public.fn_rol_actual() in ('admin','coordinador'));

create policy adm_reconocimientos on public.reconocimientos
  for all to authenticated
  using (public.fn_rol_actual() in ('admin','coordinador'))
  with check (public.fn_rol_actual() in ('admin','coordinador'));

-- ============================================================
-- Período vigente: reutiliza el abierto que cubre "ahora", o
-- crea el período mensual correspondiente si no existe.
-- ============================================================
create or replace function public.fn_obtener_periodo_actual()
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_inicio timestamptz;
  v_fin timestamptz;
begin
  select id into v_id from public.periodos
    where tipo = 'mensual' and now() >= fecha_inicio and now() < fecha_fin
    limit 1;

  if v_id is not null then
    return v_id;
  end if;

  v_inicio := date_trunc('month', now());
  v_fin := v_inicio + interval '1 month';

  insert into public.periodos (nombre, tipo, fecha_inicio, fecha_fin)
  values (to_char(v_inicio, 'YYYY-MM'), 'mensual', v_inicio, v_fin)
  on conflict (tipo, fecha_inicio) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.periodos where tipo = 'mensual' and fecha_inicio = v_inicio;
  end if;

  return v_id;
end;
$$;

-- ============================================================
-- Cálculo de puntos de UNA regla sobre UNA venta — función pura
-- (no escribe nada), reutilizada tanto por el cálculo real como
-- por el simulador del panel admin.
-- ============================================================
create or replace function public.fn_calcular_puntos_regla(
  p_tipo text,
  p_valor numeric,
  p_multiplicador numeric,
  p_condiciones jsonb,
  p_venta_id bigint
)
returns numeric
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_venta public.ventas%rowtype;
  v_total numeric := 0;
  v_categoria_id bigint;
  v_margen_minimo numeric;
  v_por_cada numeric;
  v_cnt int;
  v_es_primera boolean;
  v_es_cliente_nuevo boolean;
begin
  select * into v_venta from public.ventas where id = p_venta_id;
  if not found then
    return 0;
  end if;

  case p_tipo
    when 'por_venta_fija' then
      v_total := p_valor;

    when 'por_monto' then
      v_por_cada := coalesce((p_condiciones ->> 'por_cada')::numeric, 100);
      if v_por_cada > 0 then
        v_total := floor(v_venta.total / v_por_cada) * p_valor;
      end if;

    when 'por_categoria' then
      v_categoria_id := (p_condiciones ->> 'categoria_id')::bigint;
      if v_categoria_id is not null then
        select count(*) into v_cnt
          from public.venta_detalles vd join public.productos p on p.id = vd.producto_id
          where vd.venta_id = p_venta_id and p.categoria_id = v_categoria_id;
        v_total := v_cnt * p_valor;
      end if;

    when 'por_margen' then
      v_margen_minimo := coalesce((p_condiciones ->> 'margen_minimo')::numeric, 0);
      select count(*) into v_cnt
        from public.venta_detalles vd join public.productos p on p.id = vd.producto_id
        where vd.venta_id = p_venta_id
          and p.costo_produccion is not null and p.costo_produccion > 0 and vd.precio > 0
          and ((vd.precio - p.costo_produccion) / vd.precio * 100) >= v_margen_minimo;
      v_total := v_cnt * p_valor;

    when 'primera_venta_mes' then
      select not exists (
        select 1 from public.ventas v2
        where v2.vendedor_id = v_venta.vendedor_id
          and v2.id <> v_venta.id
          and v2.estado <> 'anulada'
          and v2.fecha_creacion >= date_trunc('month', v_venta.fecha_creacion)
          and v2.fecha_creacion < v_venta.fecha_creacion
      ) into v_es_primera;
      if v_es_primera then
        v_total := p_valor;
      end if;

    when 'cliente_nuevo' then
      if v_venta.cliente_id is not null then
        select not exists (
          select 1 from public.ventas v2
          where v2.cliente_id = v_venta.cliente_id
            and v2.id <> v_venta.id
            and v2.estado <> 'anulada'
            and v2.fecha_creacion < v_venta.fecha_creacion
        ) into v_es_cliente_nuevo;
        if v_es_cliente_nuevo then
          v_total := p_valor;
        end if;
      end if;

    else
      v_total := 0;
  end case;

  return round(v_total * coalesce(p_multiplicador, 1), 2);
end;
$$;

-- ============================================================
-- Otorga puntos por una venta aplicando todas las reglas vigentes
-- (llamada internamente por fn_registrar_venta / fn_confirmar_carrito)
-- ============================================================
create or replace function public.fn_calcular_puntos(p_venta_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_venta public.ventas%rowtype;
  v_periodo_id bigint;
  v_regla record;
  v_puntos numeric;
begin
  select * into v_venta from public.ventas where id = p_venta_id;
  if not found then
    return;
  end if;

  v_periodo_id := public.fn_obtener_periodo_actual();

  for v_regla in
    select * from public.reglas_puntaje
      where activo
        and (vigencia_inicio is null or vigencia_inicio <= v_venta.fecha_creacion)
        and (vigencia_fin is null or vigencia_fin >= v_venta.fecha_creacion)
  loop
    v_puntos := public.fn_calcular_puntos_regla(
      v_regla.tipo, v_regla.valor, v_regla.multiplicador, v_regla.condiciones, p_venta_id);

    if v_puntos <> 0 then
      insert into public.puntos (usuario_id, venta_id, regla_id, regla_version, periodo_id, cantidad, motivo)
      values (v_venta.vendedor_id, p_venta_id, v_regla.id, v_regla.version, v_periodo_id, v_puntos, v_regla.nombre);
    end if;
  end loop;

  perform public.fn_actualizar_nivel(v_venta.vendedor_id, v_periodo_id);
  perform public.fn_evaluar_insignias(v_venta.vendedor_id, v_periodo_id);
end;
$$;

-- ============================================================
-- Simulador (admin): "si aplico esta regla en borrador, cuántos
-- puntos habría generado" sobre las ventas de un período — no
-- escribe nada.
-- ============================================================
create or replace function public.fn_simular_regla_puntaje(
  p_tipo text,
  p_valor numeric,
  p_multiplicador numeric,
  p_condiciones jsonb,
  p_periodo_id bigint
)
returns table (usuario_id bigint, usuario_nombre text, puntos_estimados numeric)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if public.fn_usuario_id() is null or public.fn_rol_actual() <> 'admin' then
    raise exception 'Solo administración puede usar el simulador';
  end if;

  return query
    select v.vendedor_id, u.nombre,
           sum(public.fn_calcular_puntos_regla(p_tipo, p_valor, p_multiplicador, p_condiciones, v.id))
    from public.ventas v
    join public.usuarios u on u.id = v.vendedor_id
    join public.periodos per on per.id = p_periodo_id
    where v.estado <> 'anulada'
      and v.fecha_creacion >= per.fecha_inicio and v.fecha_creacion < per.fecha_fin
    group by v.vendedor_id, u.nombre
    having sum(public.fn_calcular_puntos_regla(p_tipo, p_valor, p_multiplicador, p_condiciones, v.id)) <> 0
    order by 3 desc;
end;
$$;

-- ============================================================
-- Descuento por desempeño aplicable a la siguiente venta del
-- vendedor (según su acumulado del período vs. su tope)
-- ============================================================
create or replace function public.fn_descuento_desempeno(p_vendedor_id bigint)
returns numeric
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_periodo_id bigint;
  v_rol_id bigint;
  v_tope public.topes_venta%rowtype;
  v_acumulado numeric;
  v_exceso numeric;
  v_porcentaje numeric;
begin
  v_periodo_id := public.fn_obtener_periodo_actual();
  select rol_id into v_rol_id from public.usuarios where id = p_vendedor_id;

  select * into v_tope from public.topes_venta
    where activo and (
      (ambito = 'individual' and usuario_id = p_vendedor_id) or
      (ambito = 'rol' and rol_id = v_rol_id) or
      (ambito = 'global')
    )
    order by case ambito when 'individual' then 1 when 'rol' then 2 else 3 end
    limit 1;

  if not found then
    return 0;
  end if;

  select coalesce(sum(v.subtotal), 0) into v_acumulado
    from public.ventas v, public.periodos per
    where per.id = v_periodo_id
      and v.vendedor_id = p_vendedor_id and v.estado <> 'anulada'
      and v.fecha_creacion >= per.fecha_inicio and v.fecha_creacion < per.fecha_fin;

  if v_acumulado < v_tope.monto_tope then
    return 0;
  end if;

  v_exceso := v_acumulado - v_tope.monto_tope;

  select porcentaje_descuento into v_porcentaje
    from public.escalas_descuento
    where tope_id = v_tope.id and desde_monto <= v_exceso
    order by desde_monto desc
    limit 1;

  return coalesce(v_porcentaje, 0);
end;
$$;

-- ============================================================
-- Fidelización: nivel según puntos acumulados del período
-- ============================================================
create or replace function public.fn_actualizar_nivel(p_usuario_id bigint, p_periodo_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_total numeric;
  v_nivel_id bigint;
begin
  select coalesce(sum(cantidad), 0) into v_total
    from public.puntos where usuario_id = p_usuario_id and periodo_id = p_periodo_id;

  select id into v_nivel_id from public.niveles
    where activo and umbral_puntos <= v_total
    order by umbral_puntos desc
    limit 1;

  if v_nivel_id is not null then
    insert into public.usuario_niveles (usuario_id, nivel_id, periodo_id)
    values (p_usuario_id, v_nivel_id, p_periodo_id)
    on conflict (usuario_id, periodo_id) do update
      set nivel_id = excluded.nivel_id, fecha_obtencion = now()
      where public.usuario_niveles.nivel_id is distinct from excluded.nivel_id;
  end if;
end;
$$;

-- ============================================================
-- Fidelización: insignias automáticas (hitos configurables vía
-- insignias.criterio->>'tipo': 'primera_venta' | 'ventas_mes')
-- ============================================================
create or replace function public.fn_evaluar_insignias(p_usuario_id bigint, p_periodo_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_insignia record;
  v_cuenta int;
begin
  for v_insignia in select * from public.insignias where activo loop
    if v_insignia.criterio ->> 'tipo' = 'primera_venta' then
      select count(*) into v_cuenta from public.ventas
        where vendedor_id = p_usuario_id and estado <> 'anulada';
      if v_cuenta >= 1 then
        insert into public.usuario_insignias (usuario_id, insignia_id)
        values (p_usuario_id, v_insignia.id)
        on conflict (usuario_id, insignia_id) do nothing;
      end if;

    elsif v_insignia.criterio ->> 'tipo' = 'ventas_mes' then
      select count(*) into v_cuenta
        from public.ventas v, public.periodos per
        where per.id = p_periodo_id
          and v.vendedor_id = p_usuario_id and v.estado <> 'anulada'
          and v.fecha_creacion >= per.fecha_inicio and v.fecha_creacion < per.fecha_fin;
      if v_cuenta >= coalesce((v_insignia.criterio ->> 'umbral')::int, 10) then
        insert into public.usuario_insignias (usuario_id, insignia_id)
        values (p_usuario_id, v_insignia.id)
        on conflict (usuario_id, insignia_id) do nothing;
      end if;
    end if;
  end loop;
end;
$$;

-- ============================================================
-- Ranking: posiciones por período — visible a toda la red
-- comercial (no expone costos ni márgenes, solo puntos agregados)
-- ============================================================
create view public.vw_ranking as
select
  p.periodo_id,
  u.id as usuario_id,
  u.nombre,
  r.nombre as rol,
  u.tienda_id,
  t.nombre as tienda,
  u.superior_id,
  sum(p.cantidad) as puntos_totales,
  rank() over (partition by p.periodo_id order by sum(p.cantidad) desc) as posicion
from public.puntos p
join public.usuarios u on u.id = p.usuario_id
join public.roles r on r.id = u.rol_id
left join public.tiendas t on t.id = u.tienda_id
group by p.periodo_id, u.id, u.nombre, r.nombre, u.tienda_id, t.nombre, u.superior_id;

grant select on public.vw_ranking to authenticated;
revoke all on public.vw_ranking from anon;

grant execute on function public.fn_simular_regla_puntaje(text, numeric, numeric, jsonb, bigint) to authenticated;
