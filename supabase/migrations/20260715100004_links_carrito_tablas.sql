-- ============================================================
-- ARIGA — Migración 0010: Links de venta y carrito público
-- (Módulo H — cliente final sin cuenta, pago manual por ahora)
-- ============================================================

create extension if not exists pgcrypto;

-- Nuevos estados de pieza: 'retenida' mientras está en un carrito
-- público dentro de la ventana de retención.
alter table public.productos drop constraint productos_estado_check;
alter table public.productos add constraint productos_estado_check
  check (estado in ('en_produccion','disponible_cedi','en_transito','disponible_tienda',
                    'separada','retenida','vendida','entregada','devuelta','baja'));

alter table public.movimientos_inventario drop constraint movimientos_inventario_tipo_check;
alter table public.movimientos_inventario add constraint movimientos_inventario_tipo_check
  check (tipo in ('alta_cedi','salida_transferencia','entrada_transferencia',
                  'separado','retencion_carrito','liberacion','venta','devolucion','ajuste','baja'));

-- ------------------------------------------------------------
-- Links de venta (catálogo completo, subconjunto o pieza única)
-- ------------------------------------------------------------
create table public.links_venta (
  id bigint generated always as identity primary key,
  vendedor_id bigint not null references public.usuarios (id),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  tipo text not null check (tipo in ('catalogo','subconjunto','pieza')),
  estado text not null default 'activo' check (estado in ('activo','vencido','desactivado')),
  fecha_vencimiento timestamptz,
  contador_visitas int not null default 0,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create index idx_links_venta_vendedor on public.links_venta (vendedor_id);
create index idx_links_venta_token on public.links_venta (token);

create table public.link_productos (
  id bigint generated always as identity primary key,
  link_id bigint not null references public.links_venta (id),
  producto_id bigint not null references public.productos (id),
  unique (link_id, producto_id)
);

-- ------------------------------------------------------------
-- Carrito del cliente final (identificado por token propio, sin
-- cuenta). Vive mientras esté "abierto"; se confirma en una venta
-- o se libera automáticamente al expirar la retención de sus piezas.
-- ------------------------------------------------------------
create table public.carritos (
  id bigint generated always as identity primary key,
  link_id bigint not null references public.links_venta (id),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  nombre_cliente text,
  telefono text,
  correo text,
  direccion text,
  estado text not null default 'abierto' check (estado in ('abierto','confirmado')),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create index idx_carritos_link on public.carritos (link_id);
create index idx_carritos_token on public.carritos (token);

create table public.carrito_detalles (
  id bigint generated always as identity primary key,
  carrito_id bigint not null references public.carritos (id),
  producto_id bigint not null references public.productos (id),
  fecha_expiracion timestamptz not null,
  fecha_creacion timestamptz not null default now(),
  unique (carrito_id, producto_id)
);

create index idx_carrito_detalles_carrito on public.carrito_detalles (carrito_id);
create index idx_carrito_detalles_expiracion on public.carrito_detalles (fecha_expiracion);

-- Triggers de fecha_actualizacion y auditoría
create trigger trg_links_venta_fecha_actualizacion before update on public.links_venta
  for each row execute function public.fn_fecha_actualizacion();
create trigger trg_carritos_fecha_actualizacion before update on public.carritos
  for each row execute function public.fn_fecha_actualizacion();

create trigger trg_auditar_links_venta
  after insert or update or delete on public.links_venta
  for each row execute function public.fn_auditar();
