-- ============================================================
-- ASTRO — Nuevo nivel de ganancia "Descuento" (15% empresa / 7%
-- embajador) + la regla de días sin venta deja de ser 100% automática.
--
-- Se corrige el diseño de la migración anterior (20260919100002): en
-- vez de que un cron aplique el descuento solo, "días sin venta"
-- ahora es únicamente el umbral que hace aparecer una alerta en la
-- ficha del artículo — el cambio de nivel de ganancia a "Descuento"
-- (y el recálculo de precio que eso implica) lo sigue haciendo una
-- persona a mano, con el selector de nivel de ganancia que ya existe
-- en la hoja de costos (fn_cambiar_nivel_ganancia_producto). No hace
-- falta ningún proceso que corra solo: "días transcurridos desde la
-- última venta >= umbral configurado" se puede calcular al vuelo cada
-- vez que se carga la pantalla.
--
-- Por eso se desprograma el cron diario que la migración anterior
-- dejó armado — ya no aplica nada automáticamente.
-- ============================================================

select cron.unschedule('descuentos_automaticos_diario');

-- ------------------------------------------------------------
-- 1. "descuento" como cuarto valor válido de nivel_ganancia, en
-- productos y en parametros_precio.
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.productos'::regclass
      and pg_get_constraintdef(oid) ilike '%nivel_ganancia%'
  loop
    execute format('alter table public.productos drop constraint %I', r.conname);
  end loop;

  for r in
    select conname from pg_constraint
    where conrelid = 'public.parametros_precio'::regclass
      and pg_get_constraintdef(oid) ilike '%nivel_ganancia%'
  loop
    execute format('alter table public.parametros_precio drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.productos add constraint productos_nivel_ganancia_check
  check (nivel_ganancia in ('introduccion', 'socio_comercial', 'importacion', 'descuento'));

alter table public.parametros_precio add constraint parametros_precio_nivel_ganancia_check
  check (nivel_ganancia in ('introduccion', 'socio_comercial', 'importacion', 'descuento'));

insert into public.parametros_precio (clave, nivel_ganancia, valor_pct, motivo) values
  ('factor_margen_empresa', 'descuento', 15, 'Margen de empresa — nivel Descuento'),
  ('factor_comision_embajador', 'descuento', 7, 'Comisión de embajador — nivel Descuento');

-- ------------------------------------------------------------
-- 2. Se retira el % de descuento manual por artículo — el nivel
-- "Descuento" ya fija ese porcentaje para todos por igual. La regla
-- que queda por artículo es solo "días sin venta" (el umbral de la
-- alerta).
-- ------------------------------------------------------------
alter table public.productos drop column descuento_automatico_pct;

-- ------------------------------------------------------------
-- 3. fn_actualizar_parametros_articulo — pierde
-- p_descuento_automatico_pct (cambia de firma, requiere drop).
-- ------------------------------------------------------------
drop function if exists public.fn_actualizar_parametros_articulo(bigint, numeric, int, numeric);

create or replace function public.fn_actualizar_parametros_articulo(
  p_producto_id bigint,
  p_punto_reorden numeric default null,
  p_dias_sin_venta_descuento int default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if public.fn_rol_actual() not in ('admin', 'produccion') then
    raise exception 'No tienes permiso para editar parámetros de artículos';
  end if;
  if p_dias_sin_venta_descuento is not null and p_dias_sin_venta_descuento <= 0 then
    raise exception 'Los días sin venta deben ser mayores a 0';
  end if;

  update public.productos
    set punto_reorden = p_punto_reorden,
        dias_sin_venta_descuento = p_dias_sin_venta_descuento
    where id = p_producto_id;

  if not found then
    raise exception 'La pieza no existe';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 4. fn_aplicar_descuentos_automaticos ya no tiene razón de ser (no
-- hay nada que aplicar solo) — se retira.
-- ------------------------------------------------------------
drop function if exists public.fn_aplicar_descuentos_automaticos();
