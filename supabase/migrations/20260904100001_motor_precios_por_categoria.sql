-- ============================================================
-- ASTRO — Motor de precios por categoría (reemplaza el margen por
-- origen). Confirmado con el negocio:
--   - Empaque, envío e impuesto siguen siendo % globales, aplicados
--     exactamente igual que hoy — sin cambios ahí.
--   - El margen de la empresa y la comisión del embajador ya NO
--     dependen de origen (local/importado) — dependen de la
--     categoría del producto. origen queda como dato puramente
--     informativo, deja de multiplicar el costo.
--   - Fórmula nueva (reemplaza la cascada anterior):
--       CostoLogistico       = CostoBase * (1 + (envío+empaque)/100)
--       PrecioAntesEmbajador = CostoLogistico / (1 - %margen_empresa)
--       PrecioSinImpuesto    = PrecioAntesEmbajador * (1 + %embajador)
--       Impuesto             = PrecioSinImpuesto * %impuesto
--       PrecioFinal          = PrecioSinImpuesto + Impuesto
--   - %margen_empresa y %embajador varían por categoría, usando el
--     mismo mecanismo de excepciones que ya existía en
--     parametros_precio (categoria_id) — solo se agrega la clave
--     nueva "factor_margen_empresa" y se siembran las 3 categorías.
--   - D-01 (usar costo real de compra/importación) ya no necesita un
--     "omitir factor de origen": al no existir más un paso de origen
--     en la cascada, cualquier costo_produccion (manual, de compra o
--     de importación) entra igual — se simplifica fn_calcular_precio
--     quitándole ese parámetro.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Categorías principales con margen propio. "Tecnología" es un
-- grupo nuevo (sin campos de ficha técnica específicos todavía);
-- "Ropa" reutiliza el grupo "lenceria" (talla/color/tela ya le
-- calzan); "Joyería" usa el grupo "joyeria" existente.
-- ------------------------------------------------------------
alter table public.categorias drop constraint categorias_grupo_check;
alter table public.categorias add constraint categorias_grupo_check
  check (grupo in ('joyeria', 'cosmetico', 'lenceria', 'tecnologia'));

insert into public.categorias (nombre, grupo)
select v.nombre, v.grupo
from (values ('Ropa', 'lenceria'), ('Tecnología', 'tecnologia'), ('Joyería', 'joyeria')) as v(nombre, grupo)
where not exists (select 1 from public.categorias c where lower(c.nombre) = lower(v.nombre));

-- ------------------------------------------------------------
-- 2. Nueva clave de factor + retiro de las claves basadas en origen.
-- ------------------------------------------------------------
alter table public.parametros_precio drop constraint parametros_precio_clave_check;
alter table public.parametros_precio add constraint parametros_precio_clave_check
  check (clave in (
    'factor_margen_empresa', 'factor_envio', 'factor_empaque',
    'factor_impuesto', 'factor_comision_embajador',
    'factor_importacion', 'factor_margen_local' -- conservadas solo por compatibilidad de lectura histórica
  ));

-- Se desactivan (no se borran, quedan como registro) — ya no las usa
-- fn_calcular_precio.
update public.parametros_precio set activo = false
where clave in ('factor_importacion', 'factor_margen_local') and activo;

-- Reemplazo global: el margen de empresa por defecto para productos
-- sin categoría (o categoría sin excepción propia). Se puede ajustar
-- después desde /admin/precios.
insert into public.parametros_precio (clave, valor_pct, motivo) values
  ('factor_margen_empresa', 25,
   'Margen de empresa por defecto — se usa cuando la categoría del producto no tiene su propio % (ver Ropa/Tecnología/Joyería para los específicos)');

-- ------------------------------------------------------------
-- 3. Margen por categoría (% empresa y % embajador confirmados).
-- ------------------------------------------------------------
insert into public.parametros_precio (clave, categoria_id, valor_pct, motivo)
select 'factor_margen_empresa', c.id, v.margen_empresa, 'Margen de empresa de ' || c.nombre
from public.categorias c
join (values ('Ropa', 15), ('Tecnología', 20), ('Joyería', 35)) as v(nombre, margen_empresa)
  on lower(c.nombre) = lower(v.nombre);

insert into public.parametros_precio (clave, categoria_id, valor_pct, motivo)
select 'factor_comision_embajador', c.id, v.comision_embajador, 'Comisión de embajador de ' || c.nombre
from public.categorias c
join (values ('Ropa', 10), ('Tecnología', 15), ('Joyería', 25)) as v(nombre, comision_embajador)
  on lower(c.nombre) = lower(v.nombre);

-- ------------------------------------------------------------
-- 4. producto_precio_historial — cambia de forma: ya no hay paso de
-- origen (costo_origen/factor_origen_pct), en su lugar el nuevo paso
-- intermedio precio_antes_embajador/factor_margen_empresa_pct.
-- ------------------------------------------------------------
alter table public.producto_precio_historial
  drop column costo_origen,
  drop column factor_origen_pct,
  add column precio_antes_embajador numeric(12,2) not null default 0,
  add column factor_margen_empresa_pct numeric(6,2);

alter table public.producto_precio_historial alter column precio_antes_embajador drop default;

-- ------------------------------------------------------------
-- 5. fn_calcular_precio — cambia de firma (se quita
-- p_omitir_factor_origen, ya no aplica) y de forma de retorno.
-- ------------------------------------------------------------
drop function if exists public.fn_calcular_precio(numeric, text, bigint, bigint, boolean, timestamptz);

create or replace function public.fn_calcular_precio(
  p_costo_base numeric,
  p_origen text,
  p_categoria_id bigint default null,
  p_producto_id bigint default null,
  p_fecha timestamptz default now()
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

  v_factor_margen :=
    public.fn_buscar_parametro_precio('factor_margen_empresa', p_categoria_id, p_producto_id, p_fecha);
  v_factor_envio := coalesce(
    public.fn_buscar_parametro_precio('factor_envio', p_categoria_id, p_producto_id, p_fecha), 0);
  v_factor_empaque := coalesce(
    public.fn_buscar_parametro_precio('factor_empaque', p_categoria_id, p_producto_id, p_fecha), 0);
  v_factor_comision :=
    public.fn_buscar_parametro_precio('factor_comision_embajador', p_categoria_id, p_producto_id, p_fecha);
  v_factor_impuesto := coalesce(
    public.fn_buscar_parametro_precio('factor_impuesto', p_categoria_id, p_producto_id, p_fecha), 0);

  if v_factor_margen is null or v_factor_margen < 0 or v_factor_margen >= 100 then
    raise exception 'factor_margen_empresa no está configurado o es inválido (debe ser >= 0 y < 100)';
  end if;
  if v_factor_comision is null or v_factor_comision < 0 then
    raise exception 'factor_comision_embajador no está configurado o es inválido (debe ser >= 0)';
  end if;

  -- RN-12: numeric sin truncar en los pasos intermedios; redondeo
  -- solo al devolver el resultado.
  v_costo_logistico := p_costo_base * (1 + (v_factor_envio + v_factor_empaque) / 100);
  -- Margen de empresa: división por (1 - %), estilo margen sobre
  -- precio (no markup) — garantiza algebraicamente
  -- precio_antes_embajador >= costo_logistico siempre que el margen < 100%.
  v_precio_antes_embajador := v_costo_logistico / (1 - v_factor_margen / 100);
  -- Comisión del embajador: markup sobre precio_antes_embajador (no
  -- margen) — así lo confirmó el negocio explícitamente.
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
-- 6. fn_recalcular_precio_producto — misma firma; se simplifica
-- porque ya no hay que decidir "omitir factor de origen" (ese paso
-- no existe más). fuente_costo se sigue registrando para trazabilidad
-- (D-01: de dónde vino el costo), solo que ya no cambia la fórmula.
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
    v_costo_base, v_producto.origen, v_producto.categoria_id, v_producto.id);

  insert into public.producto_precio_historial (
    producto_id, costo_base, origen, fuente_costo,
    costo_logistico, precio_antes_embajador, precio_sin_impuesto, base_comisionable, impuesto, precio_final,
    factor_margen_empresa_pct, factor_envio_pct, factor_empaque_pct, factor_comision_pct, factor_impuesto_pct,
    calculado_por, motivo
  ) values (
    p_producto_id, v_r.costo_base, v_producto.origen, v_fuente,
    v_r.costo_logistico, v_r.precio_antes_embajador, v_r.precio_sin_impuesto, v_r.base_comisionable,
    v_r.impuesto, v_r.precio_final,
    v_r.factor_margen_empresa_usado, v_r.factor_envio_usado, v_r.factor_empaque_usado,
    v_r.factor_comision_usado, v_r.factor_impuesto_usado,
    public.fn_usuario_id(), p_motivo
  );

  update public.productos set precio_venta = v_r.precio_final where id = p_producto_id;
end;
$$;

-- Verificación
select * from public.fn_calcular_precio(100, 'local', (select id from public.categorias where lower(nombre) = 'joyería' limit 1));
