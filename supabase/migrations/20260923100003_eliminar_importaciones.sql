-- ============================================================
-- ASTRO — Se elimina por completo el módulo de Importaciones: de aquí
-- en adelante todo ingreso de mercadería (local o importada) se
-- maneja desde Órdenes de compra (recepción con reconfirmación de
-- cantidad y costo) o desde Recepción de oro y plata.
--
-- Investigación previa confirmó que el módulo de Importaciones está
-- completamente aislado: solo dos migraciones lo crearon/tocaron
-- (20260828100001_importaciones.sql, 20260831100001_...robustas.sql)
-- y el único acoplamiento externo es productos.importacion_detalle_id
-- (consumido solo dentro de fn_recalcular_precio_producto, únicamente
-- para etiquetar fuente_costo — no afecta el cálculo del precio en sí
-- desde 20260911/20260916). proveedores.tipo (local/importado) es un
-- concepto aparte y NO se toca.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Funciones
-- ------------------------------------------------------------
drop function if exists public.fn_crear_importacion(
  bigint, bigint, numeric, text, date, text, text, text, text, text
);
drop function if exists public.fn_agregar_linea_importacion(bigint, bigint, text, numeric, numeric, numeric);
drop function if exists public.fn_autorizar_importacion(bigint);
drop function if exists public.fn_marcar_en_transito_importacion(bigint);
drop function if exists public.fn_recibir_linea_importacion(bigint, numeric);
drop function if exists public.fn_nacionalizar_importacion(bigint, numeric, numeric, numeric, numeric, numeric);
drop function if exists public.fn_marcar_facturada_importacion(bigint, text);
drop function if exists public.fn_marcar_pagada_importacion(bigint);
drop function if exists public.fn_cancelar_importacion(bigint, text);

-- ------------------------------------------------------------
-- 2. productos.importacion_detalle_id — quitar la columna y
-- simplificar fn_recalcular_precio_producto (deja de tener rama
-- 'importacion'; compra/manual se mantienen).
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

alter table public.productos drop column if exists importacion_detalle_id;

-- ------------------------------------------------------------
-- 3. Tablas (drop cascade se lleva triggers, RLS policies e índices
-- propios de estas tablas)
-- ------------------------------------------------------------
drop table if exists public.importacion_detalles cascade;
drop table if exists public.importaciones cascade;

-- ------------------------------------------------------------
-- 4. Permisos — se retira el módulo 'importaciones' del catálogo
-- ------------------------------------------------------------
delete from public.usuarios_permisos
  where permiso_id in (select id from public.permisos where modulo = 'importaciones');
delete from public.roles_permisos
  where permiso_id in (select id from public.permisos where modulo = 'importaciones');
delete from public.permisos where modulo = 'importaciones';
