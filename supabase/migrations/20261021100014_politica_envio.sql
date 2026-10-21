-- ============================================================
-- ASTRO — Política de costos de envío.
--
-- Decisiones confirmadas:
--   - Una sola política nacional (misma tarifa para todo el país).
--   - Se cobra envío a: compras por enlace (catálogo público) y compras
--     del backoffice "para un cliente". Las compras "para mí" no pagan
--     envío. (Configurable con las banderas de la política.)
--   - Envío gratis a partir de un monto (opcional).
--   - El costo REAL de enviar se registra en cada venta y entra como
--     gasto al estado de resultados (aunque el envío sea gratis).
--   - El envío cobrado suma al total de la venta: se paga con el resto
--     de la compra y la Billetera ASTRO puede cubrirlo (tope del 95%
--     sobre ese total).
--   - Comisiones y puntos se calculan sin el envío.
--
-- Las políticas se versionan: guardar una nueva desactiva la anterior
-- y queda el historial.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabla de políticas
-- ------------------------------------------------------------
create table public.politicas_envio (
  id bigint generated always as identity primary key,
  tarifa numeric(12,2) not null default 0 check (tarifa >= 0),              -- lo que se cobra al cliente
  envio_gratis_desde numeric(12,2) check (envio_gratis_desde is null or envio_gratis_desde >= 0),
  costo_real numeric(12,2) not null default 0 check (costo_real >= 0),      -- lo que le cuesta a la empresa enviar
  cobrar_publico boolean not null default true,
  cobrar_backoffice_cliente boolean not null default true,
  cobrar_compra_propia boolean not null default false,
  notas text,
  activo boolean not null default true,
  creado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now()
);

create trigger trg_auditar_politicas_envio
  after insert or update or delete on public.politicas_envio
  for each row execute function public.fn_auditar();

alter table public.politicas_envio enable row level security;
create policy sel_politicas_envio on public.politicas_envio for select to authenticated using (true);
grant select on public.politicas_envio to authenticated;

-- Política inicial en cero (no cambia nada hasta que se configure).
insert into public.politicas_envio (tarifa, envio_gratis_desde, costo_real, notas)
values (0, null, 0, 'Política inicial — configúrala en Precios → Envíos');

-- ------------------------------------------------------------
-- 2. Ventas guardan el envío cobrado y su costo real
-- ------------------------------------------------------------
alter table public.ventas
  add column if not exists envio_cobrado numeric(12,2) not null default 0,
  add column if not exists costo_envio numeric(12,2) not null default 0;

-- ------------------------------------------------------------
-- 3. Funciones
-- ------------------------------------------------------------
create or replace function public.fn_politica_envio_vigente()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select to_jsonb(p) - 'creado_por' - 'notas'
  from public.politicas_envio p
  where p.activo
  order by p.fecha_creacion desc
  limit 1;
$$;

grant execute on function public.fn_politica_envio_vigente() to anon, authenticated;

-- p_tipo: 'publico' | 'backoffice_cliente' | 'propio'
create or replace function public.fn_calcular_envio(p_monto numeric, p_tipo text)
returns table (envio_cobrado numeric, costo_real numeric)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v public.politicas_envio%rowtype;
  v_cobra boolean;
begin
  select * into v from public.politicas_envio where activo order by fecha_creacion desc limit 1;
  if not found then
    return query select 0::numeric, 0::numeric;
    return;
  end if;
  v_cobra := case p_tipo
    when 'publico' then v.cobrar_publico
    when 'backoffice_cliente' then v.cobrar_backoffice_cliente
    else v.cobrar_compra_propia
  end;
  return query select
    case
      when not v_cobra then 0::numeric
      when v.envio_gratis_desde is not null and coalesce(p_monto, 0) >= v.envio_gratis_desde then 0::numeric
      else v.tarifa
    end,
    v.costo_real;
end;
$$;

grant execute on function public.fn_calcular_envio(numeric, text) to anon, authenticated;

create or replace function public.fn_guardar_politica_envio(
  p_tarifa numeric,
  p_envio_gratis_desde numeric,
  p_costo_real numeric,
  p_cobrar_publico boolean,
  p_cobrar_backoffice_cliente boolean,
  p_cobrar_compra_propia boolean,
  p_notas text default null
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.fn_tiene_permiso('precios', 'editar') then
    raise exception 'No tienes permiso para configurar la política de envío';
  end if;
  if coalesce(p_tarifa, 0) < 0 or coalesce(p_costo_real, 0) < 0 or coalesce(p_envio_gratis_desde, 0) < 0 then
    raise exception 'Los montos no pueden ser negativos';
  end if;

  update public.politicas_envio set activo = false where activo;
  insert into public.politicas_envio
    (tarifa, envio_gratis_desde, costo_real, cobrar_publico, cobrar_backoffice_cliente, cobrar_compra_propia, notas, creado_por)
  values
    (round(coalesce(p_tarifa, 0), 2), round(p_envio_gratis_desde, 2), round(coalesce(p_costo_real, 0), 2),
     coalesce(p_cobrar_publico, true), coalesce(p_cobrar_backoffice_cliente, true), coalesce(p_cobrar_compra_propia, false),
     nullif(btrim(coalesce(p_notas, '')), ''), public.fn_usuario_id())
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.fn_guardar_politica_envio(numeric, numeric, numeric, boolean, boolean, boolean, text) to authenticated;

-- ------------------------------------------------------------
-- 4. Ajustes a funciones existentes (misma firma). Se toma la
-- definición vigente y se reemplazan solo las líneas indicadas; si
-- alguna línea no se encuentra, la migración se detiene sin cambiar nada.
-- ------------------------------------------------------------
do $$
declare
  r record;
  v_def text;
  v_nueva text;
  v_par text[];
begin
  for r in
    select * from (values
      -- Checkout: calcula el envío y lo suma al total de la venta.
      ('public.fn_confirmar_carrito_interno(bigint,bigint,text,bigint,bigint,jsonb,jsonb,jsonb,boolean,boolean)', array[
        ['  v_total numeric;',
         E'  v_total numeric;\n  v_envio numeric := 0;\n  v_costo_envio numeric := 0;\n  v_tipo_envio text;'],
        ['  v_total := v_subtotal - v_descuento_monto;',
         E'  v_total := v_subtotal - v_descuento_monto;\n\n  -- Envío según la política vigente (sobre el total de productos).\n  v_tipo_envio := case\n    when p_link_id is not null then ''publico''\n    when coalesce((p_envio->>''para_cliente'')::boolean, true) then ''backoffice_cliente''\n    else ''propio''\n  end;\n  select e.envio_cobrado, e.costo_real into v_envio, v_costo_envio\n    from public.fn_calcular_envio(v_total, v_tipo_envio) e;\n  v_total := v_total + coalesce(v_envio, 0);'],
        ['precio_embajador, estado)', 'precio_embajador, estado, envio_cobrado, costo_envio)'],
        ['case when v_restante = 0 then ''pagada'' else ''registrada'' end)',
         'case when v_restante = 0 then ''pagada'' else ''registrada'' end, coalesce(v_envio, 0), coalesce(v_costo_envio, 0))']
      ]),
      -- Comisiones sin el envío.
      ('public.fn_calcular_comision_regla(text,numeric,numeric,jsonb,bigint)', array[
        ['v_base := v_venta.total;', 'v_base := v_venta.total - coalesce(v_venta.envio_cobrado, 0);']
      ]),
      ('public.fn_calcular_comisiones(bigint)', array[
        ['+ v_venta.total * coalesce(v_regla.porcentaje, 0)', '+ (v_venta.total - coalesce(v_venta.envio_cobrado, 0)) * coalesce(v_regla.porcentaje, 0)'],
        ['round(v_venta.total * v_pct_catalogo / 100, 2)', 'round((v_venta.total - coalesce(v_venta.envio_cobrado, 0)) * v_pct_catalogo / 100, 2)']
      ]),
      -- Puntos sin el envío.
      ('public.fn_calcular_puntos_regla(text,numeric,numeric,jsonb,bigint)', array[
        ['floor(v_venta.total / v_por_cada)', 'floor((v_venta.total - coalesce(v_venta.envio_cobrado, 0)) / v_por_cada)']
      ]),
      -- Estado de resultados: ventas netas de productos + ingresos y costo de envío.
      ('public.fn_estado_resultados(date,date)', array[
        ['  v_num int; v_sin_costo int;', E'  v_num int; v_sin_costo int;\n  v_envio_ing numeric; v_envio_costo numeric;'],
        ['coalesce(sum(v.descuento_desempeno), 0), coalesce(sum(v.total), 0)
    into v_num, v_brutas, v_desc, v_netas',
         'coalesce(sum(v.descuento_desempeno), 0), coalesce(sum(v.total - coalesce(v.envio_cobrado, 0)), 0),
           coalesce(sum(v.envio_cobrado), 0), coalesce(sum(v.costo_envio), 0)
    into v_num, v_brutas, v_desc, v_netas, v_envio_ing, v_envio_costo'],
        ['case when v.subtotal > 0 then v.total / v.subtotal else 1 end',
         'case when v.subtotal > 0 then (v.total - coalesce(v.envio_cobrado, 0)) / v.subtotal else 1 end'],
        ['- v_premios - v_gastos_op, 2),',
         E'- v_premios - v_gastos_op + v_envio_ing - v_envio_costo, 2),\n    ''ingresos_envio'', round(v_envio_ing, 2),\n    ''costo_envios'', round(v_envio_costo, 2),'],
        ['- v_gastos_op - v_gastos_fin + v_otros_ing, 2),', '- v_gastos_op + v_envio_ing - v_envio_costo - v_gastos_fin + v_otros_ing, 2),']
      ])
    ) as f(firma, pares)
  loop
    v_def := pg_get_functiondef(r.firma::regprocedure);
    v_nueva := v_def;
    foreach v_par slice 1 in array r.pares loop
      if position(v_par[1] in v_nueva) = 0 then
        raise exception 'No se encontró en %: %', r.firma, v_par[1];
      end if;
      v_nueva := replace(v_nueva, v_par[1], v_par[2]);
    end loop;
    execute v_nueva;
    raise notice 'Actualizada: %', r.firma;
  end loop;
end $$;

-- ------------------------------------------------------------
-- Verificación: 5 funciones ajustadas (debe mostrar 5 filas)
-- ------------------------------------------------------------
select p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('fn_confirmar_carrito_interno', 'fn_calcular_comision_regla', 'fn_calcular_comisiones',
                    'fn_calcular_puntos_regla', 'fn_estado_resultados')
  and p.prosrc like '%envio%';
