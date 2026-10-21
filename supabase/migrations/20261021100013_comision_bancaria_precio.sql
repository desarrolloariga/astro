-- ============================================================
-- ASTRO — Comisión bancaria (5%) en la estructura de precios.
--
-- Cascada nueva (decisión confirmada: sobre el precio, antes del IVA):
--   costo base
--   → costo logístico      = costo × (1 + envío% + empaque%)
--   → precio antes embaj.  = costo logístico ÷ (1 − margen empresa%)
--   → + comisión embajador = × (1 + comisión%)
--   → + COMISIÓN BANCARIA  = × (1 + factor_comision_bancaria%)   ← nuevo
--   → + IVA                = × (1 + IVA%)
--   = precio final al consumidor
--
-- El margen de empresa y la comisión del embajador no cambian; el
-- precio público sube 5%. El precio embajador (público ÷ (1+comisión%))
-- también incluye la comisión bancaria, porque el embajador también
-- paga por banco.
--
-- El factor queda en parametros_precio (editable en /admin/precios,
-- con excepciones por categoría/nivel/producto como los demás).
-- Al final se recalcula el precio de todos los productos activos no
-- vendidos (motivo 'comision_bancaria'). precio_descuento (ofertas
-- manuales) no se toca.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Nuevo factor
-- ------------------------------------------------------------
alter table public.parametros_precio drop constraint if exists parametros_precio_clave_check;
alter table public.parametros_precio add constraint parametros_precio_clave_check
  check (clave in (
    'factor_margen_empresa', 'factor_envio', 'factor_empaque',
    'factor_impuesto', 'factor_comision_embajador', 'factor_comision_bancaria',
    'factor_importacion', 'factor_margen_local' -- conservadas solo por compatibilidad de lectura histórica
  ));

insert into public.parametros_precio (clave, valor_pct, motivo)
select 'factor_comision_bancaria', 5, 'Comisión bancaria sobre el precio de venta'
where not exists (
  select 1 from public.parametros_precio
  where clave = 'factor_comision_bancaria' and categoria_id is null and producto_id is null and nivel_ganancia is null and activo
);

-- ------------------------------------------------------------
-- 2. Historial de precios: guarda la comisión bancaria
-- ------------------------------------------------------------
alter table public.producto_precio_historial
  add column if not exists factor_comision_bancaria_pct numeric(6,2),
  add column if not exists comision_bancaria numeric(12,2);

-- ------------------------------------------------------------
-- 3. fn_calcular_precio — agrega la comisión bancaria (cambia el
-- return type → DROP; se agregan columnas al final)
-- ------------------------------------------------------------
drop function if exists public.fn_calcular_precio(numeric, text, bigint, bigint, timestamptz, text);

create or replace function public.fn_calcular_precio(
  p_costo_base numeric,
  p_origen text,
  p_categoria_id bigint default null,
  p_producto_id bigint default null,
  p_fecha timestamptz default now(),
  p_nivel_ganancia text default null
)
returns table (
  costo_base numeric,
  costo_logistico numeric,
  precio_antes_embajador numeric,
  precio_sin_impuesto numeric,
  base_comisionable numeric,
  impuesto numeric,
  precio_final numeric,
  factor_margen_empresa_usado numeric,
  factor_envio_usado numeric,
  factor_empaque_usado numeric,
  factor_comision_usado numeric,
  factor_impuesto_usado numeric,
  factor_comision_bancaria_usado numeric,
  comision_bancaria numeric
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_factor_margen numeric;
  v_factor_envio numeric;
  v_factor_empaque numeric;
  v_factor_comision numeric;
  v_factor_impuesto numeric;
  v_factor_banco numeric;
  v_costo_logistico numeric;
  v_precio_antes_embajador numeric;
  v_con_comision numeric;
  v_banco numeric;
  v_psi numeric;
  v_impuesto numeric;
  v_final numeric;
begin
  if p_costo_base is null or p_costo_base <= 0 then
    raise exception 'El costo base debe ser mayor a 0 para calcular un precio';
  end if;

  v_factor_margen := public.fn_buscar_parametro_precio(
    'factor_margen_empresa', p_categoria_id, p_producto_id, p_fecha, p_nivel_ganancia);
  v_factor_envio := coalesce(
    public.fn_buscar_parametro_precio('factor_envio', p_categoria_id, p_producto_id, p_fecha), 0);
  v_factor_empaque := coalesce(
    public.fn_buscar_parametro_precio('factor_empaque', p_categoria_id, p_producto_id, p_fecha), 0);
  v_factor_comision := public.fn_buscar_parametro_precio(
    'factor_comision_embajador', p_categoria_id, p_producto_id, p_fecha, p_nivel_ganancia);
  v_factor_impuesto := coalesce(
    public.fn_buscar_parametro_precio('factor_impuesto', p_categoria_id, p_producto_id, p_fecha), 0);
  v_factor_banco := coalesce(
    public.fn_buscar_parametro_precio('factor_comision_bancaria', p_categoria_id, p_producto_id, p_fecha, p_nivel_ganancia), 0);

  if v_factor_margen is null or v_factor_margen < 0 or v_factor_margen >= 100 then
    raise exception 'factor_margen_empresa no está configurado o es inválido (debe ser >= 0 y < 100)';
  end if;
  if v_factor_comision is null or v_factor_comision < 0 then
    raise exception 'factor_comision_embajador no está configurado o es inválido (debe ser >= 0)';
  end if;
  if v_factor_banco < 0 then
    raise exception 'factor_comision_bancaria no puede ser negativo';
  end if;

  v_costo_logistico := p_costo_base * (1 + (v_factor_envio + v_factor_empaque) / 100);
  v_precio_antes_embajador := v_costo_logistico / (1 - v_factor_margen / 100);
  v_con_comision := v_precio_antes_embajador * (1 + v_factor_comision / 100);
  v_banco := v_con_comision * v_factor_banco / 100;
  v_psi := v_con_comision + v_banco;
  v_impuesto := v_psi * v_factor_impuesto / 100;
  v_final := v_psi + v_impuesto;

  return query select
    round(p_costo_base, 2), round(v_costo_logistico, 2), round(v_precio_antes_embajador, 2),
    round(v_psi, 2), round(v_con_comision - v_precio_antes_embajador, 2), round(v_impuesto, 2), round(v_final, 2),
    v_factor_margen, v_factor_envio, v_factor_empaque, v_factor_comision, v_factor_impuesto,
    v_factor_banco, round(v_banco, 2);
end;
$$;

grant execute on function public.fn_calcular_precio(numeric, text, bigint, bigint, timestamptz, text) to authenticated;

-- ------------------------------------------------------------
-- 4. fn_recalcular_precio_producto — misma firma; guarda la comisión bancaria
-- ------------------------------------------------------------
create or replace function public.fn_recalcular_precio_producto(
  p_producto_id bigint,
  p_motivo text default 'recalculo'
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
  v_costo_base numeric;
  v_fuente text;
  v_r record;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if public.fn_rol_actual() not in ('admin', 'produccion')
     and not public.fn_tiene_permiso('precios', 'recalcular') then
    raise exception 'No tienes permiso para calcular el precio de esta pieza';
  end if;

  select * into v_producto from public.productos where id = p_producto_id for update;
  if not found then
    raise exception 'La pieza no existe';
  end if;

  v_costo_base := v_producto.costo_produccion;
  if v_costo_base is null or v_costo_base <= 0 then
    raise exception 'Indica un costo de producción válido antes de calcular el precio';
  end if;

  v_fuente := case
    when v_producto.compra_detalle_id is not null then 'compra'
    else 'manual'
  end;

  select * into v_r from public.fn_calcular_precio(
    v_costo_base, v_producto.origen, v_producto.categoria_id, v_producto.id,
    now(), v_producto.nivel_ganancia);

  insert into public.producto_precio_historial (
    producto_id, costo_base, origen, fuente_costo,
    costo_logistico, precio_antes_embajador, precio_sin_impuesto, base_comisionable, impuesto, precio_final,
    factor_margen_empresa_pct, factor_envio_pct, factor_empaque_pct, factor_comision_pct, factor_impuesto_pct,
    factor_comision_bancaria_pct, comision_bancaria,
    nivel_ganancia, calculado_por, motivo
  ) values (
    p_producto_id, v_r.costo_base, v_producto.origen, v_fuente,
    v_r.costo_logistico, v_r.precio_antes_embajador, v_r.precio_sin_impuesto, v_r.base_comisionable,
    v_r.impuesto, v_r.precio_final,
    v_r.factor_margen_empresa_usado, v_r.factor_envio_usado, v_r.factor_empaque_usado,
    v_r.factor_comision_usado, v_r.factor_impuesto_usado,
    v_r.factor_comision_bancaria_usado, v_r.comision_bancaria,
    v_producto.nivel_ganancia, public.fn_usuario_id(), p_motivo
  );

  update public.productos set precio_venta = v_r.precio_final where id = p_producto_id;
end;
$$;

-- ------------------------------------------------------------
-- 5. Recalcular todos los productos activos no vendidos
-- ------------------------------------------------------------
do $$
declare
  v_producto public.productos%rowtype;
  v_r record;
  v_ok int := 0;
  v_omitidos int := 0;
begin
  for v_producto in
    select * from public.productos
    where activo and estado <> 'vendida' and costo_produccion is not null and costo_produccion > 0
    order by id
  loop
    begin
      select * into v_r from public.fn_calcular_precio(
        v_producto.costo_produccion, v_producto.origen, v_producto.categoria_id, v_producto.id,
        now(), v_producto.nivel_ganancia);

      insert into public.producto_precio_historial (
        producto_id, costo_base, origen, fuente_costo,
        costo_logistico, precio_antes_embajador, precio_sin_impuesto, base_comisionable, impuesto, precio_final,
        factor_margen_empresa_pct, factor_envio_pct, factor_empaque_pct, factor_comision_pct, factor_impuesto_pct,
        factor_comision_bancaria_pct, comision_bancaria,
        nivel_ganancia, calculado_por, motivo
      ) values (
        v_producto.id, v_r.costo_base, v_producto.origen,
        case when v_producto.compra_detalle_id is not null then 'compra' else 'manual' end,
        v_r.costo_logistico, v_r.precio_antes_embajador, v_r.precio_sin_impuesto, v_r.base_comisionable,
        v_r.impuesto, v_r.precio_final,
        v_r.factor_margen_empresa_usado, v_r.factor_envio_usado, v_r.factor_empaque_usado,
        v_r.factor_comision_usado, v_r.factor_impuesto_usado,
        v_r.factor_comision_bancaria_usado, v_r.comision_bancaria,
        v_producto.nivel_ganancia, null, 'comision_bancaria'
      );

      update public.productos set precio_venta = v_r.precio_final where id = v_producto.id;
      v_ok := v_ok + 1;
    exception when others then
      v_omitidos := v_omitidos + 1;
      raise notice 'Producto % (%) no se recalculó: %', v_producto.id, v_producto.codigo, sqlerrm;
    end;
  end loop;
  raise notice 'Precios recalculados: %, omitidos: %', v_ok, v_omitidos;
end $$;

-- ------------------------------------------------------------
-- Verificación: productos recalculados con comisión bancaria
-- ------------------------------------------------------------
select count(*) as productos_recalculados,
       round(avg(factor_comision_bancaria_pct), 2) as pct_comision_bancaria
from public.producto_precio_historial
where motivo = 'comision_bancaria';
