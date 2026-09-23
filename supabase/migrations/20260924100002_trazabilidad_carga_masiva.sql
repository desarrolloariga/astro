-- ============================================================
-- ASTRO — Trazabilidad de carga masiva: cada carga queda registrada
-- con número de factura, referencia de orden de compra (texto libre —
-- no liga a una OC formal del módulo Compras) y proveedor, y cada
-- artículo creado por esa carga queda enlazado a su registro, igual
-- que ya existe compra_detalle_id para lo recibido por una orden de
-- compra formal.
-- ============================================================

create table public.cargas_masivas (
  id bigint generated always as identity primary key,
  numero_factura text,
  referencia_orden_compra text,
  proveedor_id bigint references public.proveedores (id),
  notas text,
  creado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now()
);

alter table public.productos
  add column carga_masiva_id bigint references public.cargas_masivas (id);

comment on table public.cargas_masivas is
  'Cabecera de trazabilidad de una carga masiva de artículos: de qué factura/orden/proveedor salió el lote. Un registro por archivo subido.';
comment on column public.productos.carga_masiva_id is
  'Si el artículo se creó por carga masiva, referencia el lote (factura/orden/proveedor) del que salió — ver cargas_masivas.';

alter table public.cargas_masivas enable row level security;

-- Mismo círculo que ya puede ver/crear en Producción — lectura amplia
-- (admin/coordinador/contabilidad/produccion), escritura solo vía
-- fn_crear_carga_masiva (security definer), sin política de insert
-- directa.
create policy sel_cargas_masivas on public.cargas_masivas
  for select to authenticated
  using (public.fn_rol_actual() in ('admin','coordinador','contabilidad','produccion'));

create or replace function public.fn_crear_carga_masiva(
  p_numero_factura text default null,
  p_referencia_orden_compra text default null,
  p_proveedor_id bigint default null,
  p_notas text default null
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

  insert into public.cargas_masivas
    (numero_factura, referencia_orden_compra, proveedor_id, notas, creado_por)
  values
    (nullif(btrim(coalesce(p_numero_factura, '')), ''),
     nullif(btrim(coalesce(p_referencia_orden_compra, '')), ''),
     p_proveedor_id,
     nullif(btrim(coalesce(p_notas, '')), ''),
     public.fn_usuario_id())
  returning id into v_id;

  return v_id;
end;
$$;
