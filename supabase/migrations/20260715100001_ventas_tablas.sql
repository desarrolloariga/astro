-- ============================================================
-- ARIGA — Migración 0007: Clientes, separados, ventas y pedidos
-- (Módulos E, F, G, I)
-- ============================================================

-- ------------------------------------------------------------
-- Clientes finales (CRM ligero)
-- ------------------------------------------------------------
create table public.clientes (
  id bigint generated always as identity primary key,
  nombre text not null,
  telefono text,
  correo text,
  direccion text,
  fecha_nacimiento date,
  vendedor_id bigint references public.usuarios (id),   -- quien lo captó
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create index idx_clientes_vendedor on public.clientes (vendedor_id);

-- ------------------------------------------------------------
-- Separados (reserva con promesa de venta)
-- ------------------------------------------------------------
create table public.separados (
  id bigint generated always as identity primary key,
  producto_id bigint not null references public.productos (id),
  vendedor_id bigint not null references public.usuarios (id),
  cliente_id bigint references public.clientes (id),
  estado text not null default 'activo'
    check (estado in ('activo','convertido','liberado','vencido')),
  fecha_expiracion timestamptz not null,
  aviso_enviado boolean not null default false,
  abono_monto numeric(12,2),
  abono_porcentaje numeric(5,2),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create index idx_separados_producto on public.separados (producto_id);
create index idx_separados_vendedor on public.separados (vendedor_id);
create index idx_separados_estado_expiracion on public.separados (estado, fecha_expiracion);

-- ------------------------------------------------------------
-- Ventas y pagos
-- ------------------------------------------------------------
create table public.ventas (
  id bigint generated always as identity primary key,
  vendedor_id bigint not null references public.usuarios (id),
  tienda_id bigint references public.tiendas (id),
  cliente_id bigint references public.clientes (id),
  canal text not null check (canal in ('tienda','asesor','embajador','link')),
  link_id bigint,                                     -- se referenciará en fase 4 (links_venta)
  subtotal numeric(12,2) not null default 0,
  descuento_desempeno numeric(12,2) not null default 0,  -- motor de incentivos: fase 5
  total numeric(12,2) not null default 0,
  moneda_id bigint references public.monedas (id),
  estado text not null default 'registrada'
    check (estado in ('registrada','pagada','anulada')),
  separado_id bigint references public.separados (id),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create index idx_ventas_vendedor on public.ventas (vendedor_id);
create index idx_ventas_tienda on public.ventas (tienda_id);
create index idx_ventas_estado on public.ventas (estado);

create table public.venta_detalles (
  id bigint generated always as identity primary key,
  venta_id bigint not null references public.ventas (id),
  producto_id bigint not null references public.productos (id),
  precio numeric(12,2) not null,
  descuento numeric(12,2) not null default 0
);

create index idx_venta_detalles_venta on public.venta_detalles (venta_id);

create table public.pagos (
  id bigint generated always as identity primary key,
  venta_id bigint not null references public.ventas (id),
  metodo text not null check (metodo in ('tarjeta','transferencia','deposito','pasarela')),
  monto numeric(12,2) not null,
  referencia text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','confirmado','rechazado')),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create index idx_pagos_venta on public.pagos (venta_id);

create table public.comprobantes (
  id bigint generated always as identity primary key,
  pago_id bigint not null references public.pagos (id),
  url_archivo text not null,       -- ruta en el bucket privado ariga-comprobantes
  estado text not null default 'pendiente'
    check (estado in ('pendiente','aprobado','rechazado')),
  revisado_por bigint references public.usuarios (id),
  comentario text,
  fecha_revision timestamptz,
  fecha_creacion timestamptz not null default now()
);

create index idx_comprobantes_pago on public.comprobantes (pago_id);
create index idx_comprobantes_estado on public.comprobantes (estado);

-- ------------------------------------------------------------
-- Pedidos y logística
-- ------------------------------------------------------------
create table public.pedidos (
  id bigint generated always as identity primary key,
  venta_id bigint not null references public.ventas (id),
  estado text not null default 'en_espera'
    check (estado in ('en_espera','despachado','entregado')),
  direccion_entrega text,
  fecha_despacho timestamptz,
  fecha_entrega timestamptz,
  confirmado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create index idx_pedidos_venta on public.pedidos (venta_id);
create index idx_pedidos_estado on public.pedidos (estado);

create table public.pedido_documentos (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references public.pedidos (id),
  tipo text not null check (tipo in ('guia','evidencia_entrega','otro')),
  url text not null,
  fecha_creacion timestamptz not null default now()
);

create index idx_pedido_documentos_pedido on public.pedido_documentos (pedido_id);

-- ------------------------------------------------------------
-- Triggers de fecha_actualizacion y auditoría
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['clientes','separados','ventas','pagos','pedidos']
  loop
    execute format(
      'create trigger trg_%s_fecha_actualizacion before update on public.%I
       for each row execute function public.fn_fecha_actualizacion()', t, t);
  end loop;
end $$;

-- Operaciones sensibles bajo auditoría (cambios de estado, anulaciones,
-- aprobaciones de comprobantes)
create trigger trg_auditar_ventas
  after insert or update or delete on public.ventas
  for each row execute function public.fn_auditar();

create trigger trg_auditar_pagos
  after insert or update or delete on public.pagos
  for each row execute function public.fn_auditar();

create trigger trg_auditar_comprobantes
  after insert or update or delete on public.comprobantes
  for each row execute function public.fn_auditar();

create trigger trg_auditar_separados
  after insert or update or delete on public.separados
  for each row execute function public.fn_auditar();
