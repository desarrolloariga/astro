-- ============================================================
-- ASTRO — La trazabilidad de carga masiva (cargas_masivas) gana la
-- info financiera de la factura recibida: subtotal, impuestos y
-- total (subtotal + impuestos) — ambos capturados a mano, sin asumir
-- ningún % fijo (las facturas reales varían). Con esto, cada carga
-- masiva se vuelve una "cabecera de orden recibida" completa,
-- consultable como historial con su detalle de productos (ver
-- fn_detalle_carga_masiva más abajo).
--
-- Queda como tabla propia — no crea una fila en ordenes_compra ni
-- reutiliza su máquina de estados; es un historial paralelo, propio
-- de lo cargado por Excel.
-- ============================================================

alter table public.cargas_masivas
  add column subtotal numeric(12,2),
  add column impuestos numeric(12,2) not null default 0 check (impuestos >= 0),
  add column total numeric(12,2) generated always as (coalesce(subtotal, 0) + impuestos) stored;

comment on column public.cargas_masivas.subtotal is
  'Subtotal de la factura (capturado a mano) — si se deja vacío, se toma como 0 (no se infiere de las líneas cargadas, la factura puede traer conceptos que el Excel no captura).';
comment on column public.cargas_masivas.impuestos is
  'Monto de impuestos de la factura (capturado a mano, no un % fijo).';
comment on column public.cargas_masivas.total is
  'subtotal + impuestos, calculado automáticamente.';

-- ------------------------------------------------------------
-- fn_crear_carga_masiva — misma firma, gana los dos parámetros
-- financieros opcionales al final (no rompe callers existentes).
-- ------------------------------------------------------------
create or replace function public.fn_crear_carga_masiva(
  p_numero_factura text default null,
  p_referencia_orden_compra text default null,
  p_proveedor_id bigint default null,
  p_notas text default null,
  p_subtotal numeric default null,
  p_impuestos numeric default null
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if public.fn_rol_actual() not in ('admin', 'produccion') then
    raise exception 'No tienes permiso para cargar artículos masivamente';
  end if;
  if p_subtotal is not null and p_subtotal < 0 then
    raise exception 'El subtotal no puede ser negativo';
  end if;
  if p_impuestos is not null and p_impuestos < 0 then
    raise exception 'Los impuestos no pueden ser negativos';
  end if;

  insert into public.cargas_masivas
    (numero_factura, referencia_orden_compra, proveedor_id, notas, creado_por, subtotal, impuestos)
  values
    (nullif(btrim(coalesce(p_numero_factura, '')), ''),
     nullif(btrim(coalesce(p_referencia_orden_compra, '')), ''),
     p_proveedor_id,
     nullif(btrim(coalesce(p_notas, '')), ''),
     public.fn_usuario_id(),
     p_subtotal,
     coalesce(p_impuestos, 0))
  returning id into v_id;

  return v_id;
end;
$$;
