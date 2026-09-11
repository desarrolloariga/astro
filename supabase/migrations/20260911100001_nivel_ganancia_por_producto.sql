-- ============================================================
-- ASTRO — Nivel de ganancia por producto (reemplaza a categoría como
-- lo que determina el margen). Confirmado con el negocio:
--   - Categoría sigue existiendo, pero ahora es solo clasificación de
--     catálogo — deja de mover el precio.
--   - Cada producto tiene su propio "nivel de ganancia", elegible
--     libremente sin importar su categoría:
--       Introducción     → 15% empresa / 10% embajador
--       Socio Comercial  → 20% empresa / 15% embajador
--       Importación      → 35% empresa / 25% embajador
--   - Envío, empaque e impuesto siguen 100% globales — sin cambios.
--   - Productos existentes migran mapeando su categoría actual al
--     nivel equivalente (mismos porcentajes que ya tenían, ningún
--     precio publicado cambia con esta migración): Ropa→Introducción,
--     Tecnología→Socio Comercial, Joyería→Importación. Cualquier otra
--     categoría (o sin categoría) cae en Socio Comercial, el nivel
--     intermedio, a falta de un equivalente exacto.
-- ============================================================

-- ------------------------------------------------------------
-- 1. productos.nivel_ganancia
-- ------------------------------------------------------------
alter table public.productos
  add column nivel_ganancia text not null default 'socio_comercial'
  check (nivel_ganancia in ('introduccion', 'socio_comercial', 'importacion'));

comment on column public.productos.nivel_ganancia is
  'Determina el % de margen de empresa y comisión de embajador de esta pieza (ver parametros_precio con nivel_ganancia). Independiente de categoria_id — categoría es solo clasificación de catálogo.';

update public.productos p
set nivel_ganancia = case lower(c.nombre)
  when 'ropa' then 'introduccion'
  when 'tecnología' then 'socio_comercial'
  when 'joyería' then 'importacion'
  else 'socio_comercial'
end
from public.categorias c
where p.categoria_id = c.id;

-- ------------------------------------------------------------
-- 2. parametros_precio gana nivel_ganancia como tercera dimensión de
-- excepción (además de categoria_id/producto_id, que se conservan
-- por si algún día vuelve a hacer falta una excepción por categoría
-- para otro factor).
-- ------------------------------------------------------------
alter table public.parametros_precio
  add column nivel_ganancia text
  check (nivel_ganancia in ('introduccion', 'socio_comercial', 'importacion'));

-- Se desactivan (no se borran) las excepciones por categoría de
-- margen/comisión — quedan como registro histórico, ya no las usa
-- fn_calcular_precio.
update public.parametros_precio
set activo = false
where categoria_id is not null
  and clave in ('factor_margen_empresa', 'factor_comision_embajador')
  and activo;

insert into public.parametros_precio (clave, nivel_ganancia, valor_pct, motivo)
values
  ('factor_margen_empresa', 'introduccion', 15, 'Margen de empresa — nivel Introducción'),
  ('factor_margen_empresa', 'socio_comercial', 20, 'Margen de empresa — nivel Socio Comercial'),
  ('factor_margen_empresa', 'importacion', 35, 'Margen de empresa — nivel Importación'),
  ('factor_comision_embajador', 'introduccion', 10, 'Comisión de embajador — nivel Introducción'),
  ('factor_comision_embajador', 'socio_comercial', 15, 'Comisión de embajador — nivel Socio Comercial'),
  ('factor_comision_embajador', 'importacion', 25, 'Comisión de embajador — nivel Importación');

-- ------------------------------------------------------------
-- 3. producto_precio_historial: registra con qué nivel se calculó
-- cada snapshot (trazabilidad — nunca se reescribe historial viejo).
-- ------------------------------------------------------------
alter table public.producto_precio_historial add column nivel_ganancia text;

-- ------------------------------------------------------------
-- 4. fn_buscar_parametro_precio — gana p_nivel_ganancia al final de
-- la lista (default null) para no romper las llamadas existentes de
-- 4 argumentos posicionales (envío/empaque/impuesto, que no usan
-- nivel_ganancia). Precedencia: pieza > nivel_ganancia > categoría >
-- global.
-- ------------------------------------------------------------
drop function if exists public.fn_buscar_parametro_precio(text, bigint, bigint, timestamptz);

create or replace function public.fn_buscar_parametro_precio(
  p_clave text,
  p_categoria_id bigint,
  p_producto_id bigint,
  p_fecha timestamptz default now(),
  p_nivel_ganancia text default null
)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select valor_pct from public.parametros_precio
  where clave = p_clave and activo
    and vigencia_inicio <= p_fecha
    and (vigencia_fin is null or vigencia_fin >= p_fecha)
    and (producto_id = p_producto_id or producto_id is null)
    and (nivel_ganancia = p_nivel_ganancia or nivel_ganancia is null)
    and (categoria_id = p_categoria_id or categoria_id is null)
  order by
    (producto_id is not null) desc,
    (nivel_ganancia is not null) desc,
    (categoria_id is not null) desc,
    fecha_creacion desc
  limit 1;
$$;

-- ------------------------------------------------------------
-- 5. fn_calcular_precio — gana p_nivel_ganancia al final (default
-- null) y lo usa solo para margen de empresa y comisión de embajador.
-- ------------------------------------------------------------
drop function if exists public.fn_calcular_precio(numeric, text, bigint, bigint, timestamptz);

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
  if p_origen not in ('local', 'importado') then
    raise exception 'Origen inválido: %', p_origen;
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

-- ------------------------------------------------------------
-- 6. fn_recalcular_precio_producto — misma firma; ahora lee y guarda
-- nivel_ganancia.
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
    when v_producto.importacion_detalle_id is not null then 'importacion'
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
    nivel_ganancia, calculado_por, motivo
  ) values (
    p_producto_id, v_r.costo_base, v_producto.origen, v_fuente,
    v_r.costo_logistico, v_r.precio_antes_embajador, v_r.precio_sin_impuesto, v_r.base_comisionable,
    v_r.impuesto, v_r.precio_final,
    v_r.factor_margen_empresa_usado, v_r.factor_envio_usado, v_r.factor_empaque_usado,
    v_r.factor_comision_usado, v_r.factor_impuesto_usado,
    v_producto.nivel_ganancia, public.fn_usuario_id(), p_motivo
  );

  update public.productos set precio_venta = v_r.precio_final where id = p_producto_id;
end;
$$;

-- ------------------------------------------------------------
-- 7. fn_cambiar_nivel_ganancia_producto — la pieza que faltaba: desde
-- la hoja de costos, cambiar el nivel de ganancia de una pieza ya
-- creada (publicada o no) y recalcular su precio en vivo. Mismo
-- círculo de permiso que fn_recalcular_precio_producto — la
-- alcanzabilidad real de p_producto_id ya la filtra el RLS de
-- productos/producto_precio_historial en la página que la llama.
-- ------------------------------------------------------------
create or replace function public.fn_cambiar_nivel_ganancia_producto(
  p_producto_id bigint,
  p_nivel_ganancia text,
  p_motivo text default 'cambio_nivel_ganancia'
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if public.fn_rol_actual() not in ('admin', 'produccion')
     and not public.fn_tiene_permiso('precios', 'recalcular') then
    raise exception 'No tienes permiso para cambiar el nivel de ganancia';
  end if;
  if p_nivel_ganancia not in ('introduccion', 'socio_comercial', 'importacion') then
    raise exception 'Nivel de ganancia inválido: %', p_nivel_ganancia;
  end if;

  select * into v_producto from public.productos where id = p_producto_id for update;
  if not found then
    raise exception 'La pieza no existe';
  end if;

  update public.productos set nivel_ganancia = p_nivel_ganancia where id = p_producto_id;

  if v_producto.costo_produccion is not null and v_producto.costo_produccion > 0 then
    perform public.fn_recalcular_precio_producto(p_producto_id, p_motivo);
  end if;
end;
$$;

-- Verificación
select * from public.fn_calcular_precio(100, 'local', null, null, now(), 'importacion');
