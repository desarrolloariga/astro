-- ============================================================
-- ASTRO — "Origen" de producto pasa de local/importado a texto libre
-- (país de procedencia). Ya no afecta el cálculo de precio (eso lo
-- decide "nivel de ganancia" desde la migración anterior) — origen es
-- puramente informativo, así que puede ser cualquier texto ("China",
-- "Guatemala", "Estados Unidos"...) en vez de solo dos valores fijos.
--
-- No se toca public.proveedores.tipo (local/importado) — es un
-- concepto distinto (tipo de proveedor), sin relación con esta
-- columna.
-- ============================================================

-- Se busca y elimina dinámicamente el check constraint de origen en
-- cada tabla, sin asumir su nombre exacto (evita un DROP CONSTRAINT
-- con el nombre equivocado si en algún momento se renombró a mano).
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.productos'::regclass
      and pg_get_constraintdef(oid) ilike '%origen%'
  loop
    execute format('alter table public.productos drop constraint %I', r.conname);
  end loop;

  for r in
    select conname from pg_constraint
    where conrelid = 'public.producto_precio_historial'::regclass
      and pg_get_constraintdef(oid) ilike '%origen%'
  loop
    execute format('alter table public.producto_precio_historial drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.productos
  add constraint productos_origen_check check (length(trim(origen)) > 0);
alter table public.productos alter column origen set default 'Local';

alter table public.producto_precio_historial
  add constraint producto_precio_historial_origen_check check (length(trim(origen)) > 0);

-- fn_calcular_precio: se quita la validación "solo local/importado"
-- (origen ya no participa en la fórmula desde el motor por nivel de
-- ganancia, así que ni siquiera hace falta seguir recibiéndolo para
-- calcular — se mantiene solo para no romper la firma ni el registro
-- histórico). Misma firma, no requiere drop.
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
  factor_impuesto_usado numeric
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
  v_costo_logistico numeric;
  v_precio_antes_embajador numeric;
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

  if v_factor_margen is null or v_factor_margen < 0 or v_factor_margen >= 100 then
    raise exception 'factor_margen_empresa no está configurado o es inválido (debe ser >= 0 y < 100)';
  end if;
  if v_factor_comision is null or v_factor_comision < 0 then
    raise exception 'factor_comision_embajador no está configurado o es inválido (debe ser >= 0)';
  end if;

  v_costo_logistico := p_costo_base * (1 + (v_factor_envio + v_factor_empaque) / 100);
  v_precio_antes_embajador := v_costo_logistico / (1 - v_factor_margen / 100);
  v_psi := v_precio_antes_embajador * (1 + v_factor_comision / 100);
  v_impuesto := v_psi * v_factor_impuesto / 100;
  v_final := v_psi + v_impuesto;

  return query select
    round(p_costo_base, 2), round(v_costo_logistico, 2), round(v_precio_antes_embajador, 2),
    round(v_psi, 2), round(v_psi - v_precio_antes_embajador, 2), round(v_impuesto, 2), round(v_final, 2),
    v_factor_margen, v_factor_envio, v_factor_empaque, v_factor_comision, v_factor_impuesto;
end;
$$;
