-- ============================================================
-- ARIGA — Migración 0006: RLS de productos/inventario,
-- vistas de catálogo (sin costos) y bucket de imágenes.
-- ============================================================

alter table public.categorias enable row level security;
alter table public.materiales enable row level security;
alter table public.productos enable row level security;
alter table public.producto_imagenes enable row level security;
alter table public.transferencias enable row level security;
alter table public.transferencia_detalles enable row level security;
alter table public.movimientos_inventario enable row level security;

-- ------------------------------------------------------------
-- Catálogos: lectura para todos los autenticados, escritura admin
-- ------------------------------------------------------------
create policy sel_categorias on public.categorias
  for select to authenticated using (true);
create policy adm_categorias on public.categorias
  for all to authenticated
  using (public.fn_rol_actual() = 'admin')
  with check (public.fn_rol_actual() = 'admin');

create policy sel_materiales on public.materiales
  for select to authenticated using (true);
create policy adm_materiales on public.materiales
  for all to authenticated
  using (public.fn_rol_actual() = 'admin')
  with check (public.fn_rol_actual() = 'admin');

-- ------------------------------------------------------------
-- Productos: la tabla directa SOLO para roles internos.
-- La red comercial (supervisor/asesor/embajador) y las tiendas
-- consultan por vistas sin costo_produccion.
-- ------------------------------------------------------------
create policy sel_productos on public.productos
  for select to authenticated
  using (
    public.fn_rol_actual() in ('admin','contabilidad','coordinador')
    or (public.fn_rol_actual() = 'produccion' and creado_por = public.fn_usuario_id())
  );

create policy ins_productos on public.productos
  for insert to authenticated
  with check (
    public.fn_rol_actual() in ('admin','produccion')
    and estado = 'en_produccion'
    and creado_por = public.fn_usuario_id()
  );

create policy upd_productos_produccion on public.productos
  for update to authenticated
  using (
    public.fn_rol_actual() = 'produccion'
    and creado_por = public.fn_usuario_id()
    and estado = 'en_produccion'
  )
  with check (estado = 'en_produccion');

create policy adm_productos on public.productos
  for all to authenticated
  using (public.fn_rol_actual() = 'admin')
  with check (public.fn_rol_actual() = 'admin');

-- ------------------------------------------------------------
-- Imágenes: lectura autenticados; escritura producción (sus
-- borradores) y admin
-- ------------------------------------------------------------
create policy sel_producto_imagenes on public.producto_imagenes
  for select to authenticated using (true);

create policy ins_producto_imagenes on public.producto_imagenes
  for insert to authenticated
  with check (
    public.fn_rol_actual() = 'admin'
    or (public.fn_rol_actual() = 'produccion'
        and exists (select 1 from public.productos p
                    where p.id = producto_id
                      and p.creado_por = public.fn_usuario_id()
                      and p.estado = 'en_produccion'))
  );

create policy del_producto_imagenes on public.producto_imagenes
  for delete to authenticated
  using (
    public.fn_rol_actual() = 'admin'
    or (public.fn_rol_actual() = 'produccion'
        and exists (select 1 from public.productos p
                    where p.id = producto_id
                      and p.creado_por = public.fn_usuario_id()
                      and p.estado = 'en_produccion'))
  );

-- ------------------------------------------------------------
-- Transferencias: admin/coordinador todo; la tienda ve las suyas.
-- Las escrituras SOLO pasan por fn_crear_transferencia /
-- fn_confirmar_recepcion (security definer).
-- ------------------------------------------------------------
create policy sel_transferencias on public.transferencias
  for select to authenticated
  using (
    public.fn_rol_actual() in ('admin','coordinador','contabilidad')
    or (public.fn_rol_actual() = 'tienda'
        and public.fn_mi_tienda_id() in (tienda_origen_id, tienda_destino_id))
  );

create policy sel_transferencia_detalles on public.transferencia_detalles
  for select to authenticated
  using (
    exists (select 1 from public.transferencias t
            where t.id = transferencia_id
              and (public.fn_rol_actual() in ('admin','coordinador','contabilidad')
                   or (public.fn_rol_actual() = 'tienda'
                       and public.fn_mi_tienda_id() in (t.tienda_origen_id, t.tienda_destino_id))))
  );

create policy sel_movimientos on public.movimientos_inventario
  for select to authenticated
  using (
    public.fn_rol_actual() in ('admin','coordinador','contabilidad')
    or (public.fn_rol_actual() = 'tienda'
        and public.fn_mi_tienda_id() in (tienda_origen_id, tienda_destino_id))
  );

-- ============================================================
-- Vistas sin columnas de costo (se ejecutan con permisos del
-- dueño, por eso pueden leer productos aunque el rol no tenga
-- SELECT directo — y NUNCA exponen costo_produccion)
-- ============================================================

-- Catálogo comercial: solo piezas disponibles (o "próximamente"
-- si el parámetro politica_piezas_transito lo permite)
create view public.vw_catalogo as
select
  p.id,
  p.codigo,
  p.nombre,
  p.descripcion,
  p.categoria_id,
  c.nombre  as categoria,
  p.material_id,
  m.nombre  as material,
  p.peso_gramos,
  p.kilataje,
  p.piedras,
  p.precio_venta,
  p.moneda_id,
  p.estado,
  p.tienda_id,
  t.nombre  as tienda,
  (select i.url from public.producto_imagenes i
     where i.producto_id = p.id
     order by i.es_principal desc, i.orden asc limit 1) as imagen_principal,
  (select coalesce(jsonb_agg(jsonb_build_object('url', i.url, 'orden', i.orden)
                             order by i.orden), '[]'::jsonb)
     from public.producto_imagenes i where i.producto_id = p.id) as imagenes
from public.productos p
left join public.categorias c on c.id = p.categoria_id
left join public.materiales m on m.id = p.material_id
left join public.tiendas t on t.id = p.tienda_id
where p.activo
  and (
    p.estado in ('disponible_cedi','disponible_tienda')
    or (p.estado = 'en_transito'
        and public.fn_parametro('politica_piezas_transito') = 'proximamente')
  );

grant select on public.vw_catalogo to authenticated;
revoke all on public.vw_catalogo from anon;

-- Inventario de la tienda del usuario (todas sus piezas, sin costos)
create view public.vw_inventario_tienda as
select
  p.id, p.codigo, p.nombre, p.estado,
  c.nombre as categoria, m.nombre as material,
  p.peso_gramos, p.kilataje, p.precio_venta, p.moneda_id,
  p.tienda_id, p.fecha_actualizacion,
  (select i.url from public.producto_imagenes i
     where i.producto_id = p.id
     order by i.es_principal desc, i.orden asc limit 1) as imagen_principal
from public.productos p
left join public.categorias c on c.id = p.categoria_id
left join public.materiales m on m.id = p.material_id
where p.activo
  and p.tienda_id = public.fn_mi_tienda_id();

grant select on public.vw_inventario_tienda to authenticated;
revoke all on public.vw_inventario_tienda from anon;

-- ============================================================
-- Bucket de imágenes de productos (público para lectura: el
-- catálogo del cliente final necesita las fotos por URL).
-- Las subidas se hacen desde el servidor (service role) tras
-- validar el rol en la app — no hay políticas de escritura
-- para clientes.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('ariga-productos', 'ariga-productos', true)
on conflict (id) do nothing;

-- ============================================================
-- Semillas de catálogos de producto (editables desde el panel)
-- ============================================================
insert into public.categorias (nombre, orden) values
  ('Anillos', 1), ('Aretes', 2), ('Collares', 3),
  ('Pulseras', 4), ('Dijes', 5), ('Cadenas', 6);

insert into public.materiales (nombre) values
  ('Oro amarillo 14k'), ('Oro amarillo 10k'), ('Oro blanco 14k'),
  ('Oro rosa 14k'), ('Plata 925');
