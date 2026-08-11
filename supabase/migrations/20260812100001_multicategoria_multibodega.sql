-- ============================================================
-- ASTRO — Fase 6: Multi-categoría + multi-bodega + carga masiva.
-- Se entrega el esquema completo ahora; se DIFIERE reescribir
-- fn_registrar_venta/fn_confirmar_carrito para vender por cantidad
-- hasta que exista una categoría por_cantidad real que lo requiera.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Atributos libres por categoría — JSONB sobre las columnas
-- existentes. peso_gramos/kilataje/piedras NO se migran (siguen
-- siendo la ficha técnica real de joyería; cero riesgo, cero
-- backfill, ninguna vista existente se toca).
-- ------------------------------------------------------------
alter table public.productos
  add column atributos jsonb not null default '{}'::jsonb;

-- Discriminador de alto nivel: determina qué formulario/campos de
-- "atributos" mostrar en producción. categoria_id sigue siendo la
-- FK granular real para todo lo demás (filtros, comisiones, etc.).
alter table public.categorias
  add column grupo text not null default 'joyeria'
    check (grupo in ('joyeria','cosmetico','lenceria'));

-- ------------------------------------------------------------
-- 2. Pieza única (joyería, comportamiento actual) vs. producto por
-- cantidad (SKU con stock numérico, potencialmente en varias
-- bodegas a la vez).
-- ------------------------------------------------------------
alter table public.productos
  add column modo_inventario text not null default 'pieza_unica'
    check (modo_inventario in ('pieza_unica','por_cantidad'));

-- Estado de SKU, separado del estado de piezas físicas (evita que
-- 'disponible_cedi' etc. se lean con semántica distinta según el
-- tipo de fila). Solo aplica a filas modo_inventario='por_cantidad'.
alter table public.productos
  add column estado_sku text check (estado_sku in ('borrador','activo','descontinuado'));

-- Cantidad y ubicación de un SKU — permite el mismo producto con
-- stock en varias tiendas a la vez, algo imposible hoy con el
-- tienda_id único de productos (pensado para pieza_unica).
create table public.inventario_cantidad (
  id bigint generated always as identity primary key,
  producto_id bigint not null references public.productos (id),
  tienda_id bigint not null references public.tiendas (id),
  cantidad_disponible int not null default 0 check (cantidad_disponible >= 0),
  cantidad_reservada int not null default 0 check (cantidad_reservada >= 0),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz,
  unique (producto_id, tienda_id)
);

create trigger trg_inventario_cantidad_fecha_actualizacion
  before update on public.inventario_cantidad
  for each row execute function public.fn_fecha_actualizacion();

alter table public.inventario_cantidad enable row level security;

-- Mismo alcance de visibilidad que la tabla productos (sel_productos)
-- más tienda propia; escritura acotada a quien gestiona inventario.
create policy sel_inventario_cantidad on public.inventario_cantidad
  for select to authenticated
  using (
    public.fn_rol_actual() in ('admin','contabilidad','coordinador')
    or (public.fn_rol_actual() = 'produccion'
        and exists (select 1 from public.productos p
                    where p.id = producto_id and p.creado_por = public.fn_usuario_id()))
    or (public.fn_rol_actual() = 'tienda' and tienda_id = public.fn_mi_tienda_id())
  );

create policy adm_inventario_cantidad on public.inventario_cantidad for all to authenticated
  using (public.fn_rol_actual() in ('admin','produccion','coordinador'))
  with check (public.fn_rol_actual() in ('admin','produccion','coordinador'));

-- ------------------------------------------------------------
-- 3. Multi-bodega para piezas únicas — fn_publicar_producto hoy
-- siempre elige el primer CEDI que encuentra; con selector de
-- bodega destino, retrocompatible (si se omite, mismo
-- comportamiento de hoy: el primer CEDI activo).
-- ------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION no reemplaza si la lista de argumentos
-- cambia (crearía una sobrecarga nueva, dejando viva la versión de
-- 1 parámetro) — se elimina esa firma explícitamente antes de crear
-- la de 2.
drop function if exists public.fn_publicar_producto(bigint);

create or replace function public.fn_publicar_producto(
  p_producto_id bigint,
  p_tienda_destino_id bigint default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
  v_cedi_id bigint;
  v_imagenes int;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if public.fn_rol_actual() not in ('admin','produccion') then
    raise exception 'No tienes permiso para publicar piezas';
  end if;

  select * into v_producto from public.productos
    where id = p_producto_id for update;

  if not found then
    raise exception 'La pieza no existe';
  end if;
  if v_producto.estado <> 'en_produccion' then
    raise exception 'Solo se publican piezas en estado en_produccion (actual: %)', v_producto.estado;
  end if;

  if v_producto.nombre is null or v_producto.precio_venta is null
     or v_producto.categoria_id is null or v_producto.material_id is null then
    raise exception 'Ficha incompleta: nombre, precio, categoría y material son obligatorios';
  end if;

  select count(*) into v_imagenes
    from public.producto_imagenes where producto_id = p_producto_id;
  if v_imagenes = 0 then
    raise exception 'La pieza necesita al menos una foto para publicarse';
  end if;

  if p_tienda_destino_id is not null then
    select id into v_cedi_id from public.tiendas
      where id = p_tienda_destino_id and tipo = 'cedi' and activo;
    if v_cedi_id is null then
      raise exception 'La bodega destino indicada no es un CEDI activo';
    end if;
  else
    select id into v_cedi_id from public.tiendas where tipo = 'cedi' and activo limit 1;
  end if;
  if v_cedi_id is null then
    raise exception 'No hay CEDI activo configurado';
  end if;

  update public.productos
    set estado = 'disponible_cedi',
        tienda_id = v_cedi_id,
        fecha_publicacion = now()
    where id = p_producto_id;

  insert into public.movimientos_inventario
    (producto_id, tipo, tienda_destino_id, usuario_id, referencia)
  values
    (p_producto_id, 'alta_cedi', v_cedi_id, public.fn_usuario_id(), 'publicacion');
end;
$$;

-- Verificación
select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'productos'
    and column_name in ('atributos','modo_inventario','estado_sku','origen');
