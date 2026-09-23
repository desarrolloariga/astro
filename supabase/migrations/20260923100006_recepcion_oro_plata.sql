-- ============================================================
-- ASTRO — Recepción de oro y plata: ingreso directo de mercadería sin
-- pasar por una orden de compra formal. Se declara en la cabecera el
-- peso total y la cantidad total de piezas recibidas, y luego se
-- desglosa línea por línea en artículos de joyería (existentes o
-- creados ahí mismo). La suma de cantidad y peso de las líneas debe
-- cuadrar EXACTO contra lo declarado en la cabecera antes de poder
-- confirmar — al confirmar, cada línea se publica directo al CEDI
-- principal (mismo mecanismo que recepción de compras).
--
-- Proveedor es opcional (compra a particulares, fundición propia,
-- etc.). Sin máquina de estados compleja: borrador → confirmada (+
-- cancelada desde borrador) — se arma toda de una vez y se confirma,
-- no hay recepción parcial como en órdenes de compra.
-- ============================================================

create table public.recepciones_metal (
  id bigint generated always as identity primary key,
  proveedor_id bigint references public.proveedores (id),
  peso_total_gramos numeric(10,3) not null check (peso_total_gramos > 0),
  cantidad_total_piezas int not null check (cantidad_total_piezas > 0),
  estado text not null default 'borrador' check (estado in ('borrador', 'confirmada', 'cancelada')),
  notas text,
  creado_por bigint references public.usuarios (id),
  confirmado_por bigint references public.usuarios (id),
  fecha_confirmacion timestamptz,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create table public.recepcion_metal_detalles (
  id bigint generated always as identity primary key,
  recepcion_metal_id bigint not null references public.recepciones_metal (id),
  producto_id bigint not null references public.productos (id),
  cantidad numeric(10,3) not null check (cantidad > 0),
  peso_gramos numeric(10,3) not null check (peso_gramos > 0),
  costo_unitario numeric(12,2) not null check (costo_unitario >= 0),
  fecha_creacion timestamptz not null default now()
);

create index idx_recepcion_metal_detalles_recepcion on public.recepcion_metal_detalles (recepcion_metal_id);

create trigger trg_recepciones_metal_fecha_actualizacion
  before update on public.recepciones_metal
  for each row execute function public.fn_fecha_actualizacion();

create trigger trg_auditar_recepciones_metal
  after insert or update or delete on public.recepciones_metal
  for each row execute function public.fn_auditar();

create trigger trg_auditar_recepcion_metal_detalles
  after insert or update or delete on public.recepcion_metal_detalles
  for each row execute function public.fn_auditar();

alter table public.recepciones_metal enable row level security;
alter table public.recepcion_metal_detalles enable row level security;

-- ------------------------------------------------------------
-- Permisos — mismo círculo que compras.
-- ------------------------------------------------------------
insert into public.permisos (modulo, accion, descripcion) values
  ('recepcion_metal', 'ver', 'Consultar recepciones de oro y plata'),
  ('recepcion_metal', 'crear', 'Armar una recepción de oro y plata'),
  ('recepcion_metal', 'confirmar', 'Confirmar una recepción y publicar sus artículos al CEDI')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('admin','recepcion_metal','ver'), ('admin','recepcion_metal','crear'), ('admin','recepcion_metal','confirmar'),
  ('coordinador','recepcion_metal','ver'), ('coordinador','recepcion_metal','crear'),
  ('contabilidad','recepcion_metal','ver'), ('contabilidad','recepcion_metal','confirmar'),
  ('produccion','recepcion_metal','ver'), ('produccion','recepcion_metal','crear'), ('produccion','recepcion_metal','confirmar')
) as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

create policy sel_recepciones_metal on public.recepciones_metal
  for select to authenticated using (public.fn_tiene_permiso('recepcion_metal', 'ver'));
create policy sel_recepcion_metal_detalles on public.recepcion_metal_detalles
  for select to authenticated using (public.fn_tiene_permiso('recepcion_metal', 'ver'));

-- Sin políticas de insert/update/delete directas — todo pasa por las
-- funciones security definer de abajo, igual que ordenes_compra.

-- ------------------------------------------------------------
-- fn_crear_recepcion_metal — cabecera en borrador.
-- ------------------------------------------------------------
create or replace function public.fn_crear_recepcion_metal(
  p_peso_total_gramos numeric,
  p_cantidad_total_piezas int,
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
  if not public.fn_tiene_permiso('recepcion_metal', 'crear') then
    raise exception 'No tienes permiso para crear recepciones de oro y plata';
  end if;
  if p_peso_total_gramos is null or p_peso_total_gramos <= 0 then
    raise exception 'Indica el peso total recibido (gramos)';
  end if;
  if p_cantidad_total_piezas is null or p_cantidad_total_piezas <= 0 then
    raise exception 'Indica la cantidad total de piezas recibidas';
  end if;

  insert into public.recepciones_metal
    (proveedor_id, peso_total_gramos, cantidad_total_piezas, notas, creado_por)
  values
    (p_proveedor_id, p_peso_total_gramos, p_cantidad_total_piezas, p_notas, public.fn_usuario_id())
  returning id into v_id;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- fn_agregar_linea_recepcion_metal — línea ligada a un producto ya
-- existente. Para un artículo NUEVO se usa
-- fn_crear_producto_recepcion_metal primero (ver abajo), que crea la
-- pieza y devuelve su id para agregarla aquí igual que cualquier otra.
-- ------------------------------------------------------------
create or replace function public.fn_agregar_linea_recepcion_metal(
  p_recepcion_metal_id bigint,
  p_producto_id bigint,
  p_cantidad numeric,
  p_peso_gramos numeric,
  p_costo_unitario numeric
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_recepcion public.recepciones_metal%rowtype;
  v_detalle_id bigint;
begin
  if not public.fn_tiene_permiso('recepcion_metal', 'crear') then
    raise exception 'No tienes permiso para modificar recepciones de oro y plata';
  end if;

  select * into v_recepcion from public.recepciones_metal where id = p_recepcion_metal_id for update;
  if not found then
    raise exception 'La recepción no existe';
  end if;
  if v_recepcion.estado <> 'borrador' then
    raise exception 'Solo se agregan líneas a una recepción en borrador (actual: %)', v_recepcion.estado;
  end if;
  if p_producto_id is null then
    raise exception 'La línea necesita un artículo';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'Indica una cantidad válida';
  end if;
  if p_peso_gramos is null or p_peso_gramos <= 0 then
    raise exception 'Indica un peso válido (gramos)';
  end if;
  if p_costo_unitario is null or p_costo_unitario < 0 then
    raise exception 'Indica un costo unitario válido';
  end if;

  insert into public.recepcion_metal_detalles
    (recepcion_metal_id, producto_id, cantidad, peso_gramos, costo_unitario)
  values
    (p_recepcion_metal_id, p_producto_id, p_cantidad, p_peso_gramos, p_costo_unitario)
  returning id into v_detalle_id;

  return v_detalle_id;
end;
$$;

create or replace function public.fn_quitar_linea_recepcion_metal(p_detalle_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_detalle public.recepcion_metal_detalles%rowtype;
  v_recepcion public.recepciones_metal%rowtype;
begin
  if not public.fn_tiene_permiso('recepcion_metal', 'crear') then
    raise exception 'No tienes permiso para modificar recepciones de oro y plata';
  end if;

  select * into v_detalle from public.recepcion_metal_detalles where id = p_detalle_id for update;
  if not found then
    raise exception 'La línea no existe';
  end if;

  select * into v_recepcion from public.recepciones_metal where id = v_detalle.recepcion_metal_id for update;
  if v_recepcion.estado <> 'borrador' then
    raise exception 'Solo se quitan líneas de una recepción en borrador (actual: %)', v_recepcion.estado;
  end if;

  delete from public.recepcion_metal_detalles where id = p_detalle_id;
end;
$$;

-- ------------------------------------------------------------
-- fn_crear_producto_recepcion_metal — alta mínima de un artículo
-- nuevo directamente desde la recepción (nombre + costo + peso +
-- nivel de ganancia). El resto de la ficha (categoría, material,
-- fotos) se completa después desde CEDI. Se crea SIEMPRE pieza_unica
-- por defecto — el peso declarado en la recepción es de una unidad.
-- Devuelve el id para agregarlo como línea con
-- fn_agregar_linea_recepcion_metal.
-- ------------------------------------------------------------
create or replace function public.fn_crear_producto_recepcion_metal(
  p_nombre text,
  p_nivel_ganancia text,
  p_proveedor_id bigint default null,
  p_referencia_proveedor text default null,
  p_categoria_id bigint default null
)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  -- Mismo prefijo por defecto que usa la creación de artículos en TS
  -- (lib/productos.ts: prefijoDesdeCategoria) cuando no hay categoría
  -- — este flujo mínimo no la captura, así que siempre usa 'ART'.
  v_prefijo text := 'ART';
  v_codigo text;
  v_numero int;
  v_intento int;
  v_producto_id bigint;
begin
  if not public.fn_tiene_permiso('recepcion_metal', 'crear') then
    raise exception 'No tienes permiso para crear artículos desde una recepción de oro y plata';
  end if;
  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'El nombre es obligatorio';
  end if;
  if p_nivel_ganancia not in ('introduccion', 'socio_comercial', 'importacion', 'descuento') then
    raise exception 'Nivel de ganancia inválido: %', p_nivel_ganancia;
  end if;

  select coalesce(count(*), 0) + 1 into v_numero
    from public.productos where codigo like v_prefijo || '-%';

  for v_intento in 1..5 loop
    v_codigo := v_prefijo || '-' || lpad(v_numero::text, 4, '0');
    if not exists (select 1 from public.productos where codigo = v_codigo) then
      insert into public.productos
        (codigo, nombre, categoria_id, modo_inventario, nivel_ganancia, proveedor_id, referencia_proveedor, creado_por)
      values
        (v_codigo, btrim(p_nombre), p_categoria_id, 'pieza_unica', p_nivel_ganancia, p_proveedor_id, p_referencia_proveedor, public.fn_usuario_id())
      returning id into v_producto_id;
      exit;
    end if;
    v_numero := v_numero + 1;
  end loop;

  if v_producto_id is null then
    raise exception 'No se pudo generar un código único para el artículo';
  end if;

  return v_producto_id;
end;
$$;

-- ------------------------------------------------------------
-- fn_confirmar_recepcion_metal — exige que la suma de cantidad y
-- peso de TODAS las líneas cuadre EXACTO contra lo declarado en la
-- cabecera. Al confirmar: fija costo_produccion y nivel_ganancia de
-- cada línea, y publica cada artículo al CEDI principal (mismo
-- mecanismo que recepción de compras).
-- ------------------------------------------------------------
create or replace function public.fn_confirmar_recepcion_metal(p_recepcion_metal_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_recepcion public.recepciones_metal%rowtype;
  v_suma_cantidad numeric;
  v_suma_peso numeric;
  v_lineas int;
  v_detalle record;
  v_producto public.productos%rowtype;
begin
  if not public.fn_tiene_permiso('recepcion_metal', 'confirmar') then
    raise exception 'No tienes permiso para confirmar recepciones de oro y plata';
  end if;

  select * into v_recepcion from public.recepciones_metal where id = p_recepcion_metal_id for update;
  if not found then
    raise exception 'La recepción no existe';
  end if;
  if v_recepcion.estado <> 'borrador' then
    raise exception 'Solo se confirma una recepción en borrador (actual: %)', v_recepcion.estado;
  end if;

  select count(*), coalesce(sum(cantidad), 0), coalesce(sum(peso_gramos), 0)
    into v_lineas, v_suma_cantidad, v_suma_peso
    from public.recepcion_metal_detalles
    where recepcion_metal_id = p_recepcion_metal_id;

  if v_lineas = 0 then
    raise exception 'Agrega al menos un artículo antes de confirmar';
  end if;
  if v_suma_cantidad <> v_recepcion.cantidad_total_piezas then
    raise exception 'La cantidad de las líneas (%) no cuadra con la cantidad total declarada (%)',
      v_suma_cantidad, v_recepcion.cantidad_total_piezas;
  end if;
  if v_suma_peso <> v_recepcion.peso_total_gramos then
    raise exception 'El peso de las líneas (% g) no cuadra con el peso total declarado (% g)',
      v_suma_peso, v_recepcion.peso_total_gramos;
  end if;

  for v_detalle in
    select * from public.recepcion_metal_detalles where recepcion_metal_id = p_recepcion_metal_id
  loop
    select * into v_producto from public.productos where id = v_detalle.producto_id for update;

    update public.productos
      set costo_produccion = v_detalle.costo_unitario,
          peso_gramos = v_detalle.peso_gramos
      where id = v_detalle.producto_id;

    if v_producto.estado = 'en_produccion' then
      if v_producto.modo_inventario = 'por_cantidad' then
        update public.productos set cantidad_inicial = v_detalle.cantidad where id = v_detalle.producto_id;
      end if;
      perform public.fn_publicar_producto(v_detalle.producto_id);
    else
      perform public.fn_recalcular_precio_producto(v_detalle.producto_id, 'recepcion_metal');
    end if;
  end loop;

  update public.recepciones_metal
    set estado = 'confirmada', confirmado_por = public.fn_usuario_id(), fecha_confirmacion = now()
    where id = p_recepcion_metal_id;
end;
$$;

create or replace function public.fn_cancelar_recepcion_metal(p_recepcion_metal_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_recepcion public.recepciones_metal%rowtype;
begin
  if not public.fn_tiene_permiso('recepcion_metal', 'crear') then
    raise exception 'No tienes permiso para cancelar recepciones de oro y plata';
  end if;

  select * into v_recepcion from public.recepciones_metal where id = p_recepcion_metal_id for update;
  if not found then
    raise exception 'La recepción no existe';
  end if;
  if v_recepcion.estado <> 'borrador' then
    raise exception 'Solo se cancela una recepción en borrador (actual: %)', v_recepcion.estado;
  end if;

  update public.recepciones_metal set estado = 'cancelada' where id = p_recepcion_metal_id;
end;
$$;
