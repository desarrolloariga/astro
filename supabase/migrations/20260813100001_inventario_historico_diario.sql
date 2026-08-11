-- ============================================================
-- ASTRO — Rediseño visual del módulo de Inventario:
-- 1. Snapshot diario de inventario (habilita tendencias reales).
-- 2. vw_inventario_tienda: agrega categoria_id/material_id (filtros).
-- 3. Fix de visibilidad: supervisor quedó fuera de Transferencias.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Snapshot diario — una fila por bodega por día. Los totales de
-- red siempre se calculan sumando filas por bodega en el cliente
-- (igual que ya hace app/(app)/inventario/page.tsx hoy), nunca se
-- guarda una fila aparte de "red completa".
-- ------------------------------------------------------------
create table public.inventario_historico_diario (
  id bigint generated always as identity primary key,
  fecha date not null,
  tienda_id bigint not null references public.tiendas (id),
  piezas int not null,
  capital_inmovilizado numeric(14,2) not null,
  valor_venta_potencial numeric(14,2) not null,
  piezas_sin_movimiento int not null,
  piezas_en_descuento int not null,
  fecha_creacion timestamptz not null default now(),
  unique (fecha, tienda_id)
);

alter table public.inventario_historico_diario enable row level security;

-- Mismo alcance que vw_inventario_valorizado hoy — no se amplía a
-- más roles, solo se le agrega tendencia encima del mismo límite.
create policy sel_inventario_historico_diario on public.inventario_historico_diario
  for select to authenticated
  using (public.fn_tiene_permiso('finanzas','ver'));

grant select on public.inventario_historico_diario to authenticated;
revoke all on public.inventario_historico_diario from anon;

-- Reimplementa la misma agregación que vw_inventario_valorizado
-- (mismo filtro de estado, mismo parámetro dias_pieza_lenta) más un
-- nuevo conteo de piezas en descuento, agrupado por tienda_id.
-- OJO: no se puede hacer "select * from vw_inventario_valorizado"
-- porque esa vista filtra por fn_tiene_permiso('finanzas','ver'),
-- que evalúa auth.uid() — null en un job de pg_cron (sin sesión),
-- así que devolvería cero filas en silencio.
create or replace function public.fn_registrar_historico_inventario_diario()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_fecha date := (now() at time zone 'America/Guatemala')::date;
  v_dias_pieza_lenta text;
begin
  select valor into v_dias_pieza_lenta from public.parametros where clave = 'dias_pieza_lenta';

  insert into public.inventario_historico_diario
    (fecha, tienda_id, piezas, capital_inmovilizado, valor_venta_potencial,
     piezas_sin_movimiento, piezas_en_descuento)
  select
    v_fecha,
    p.tienda_id,
    count(*),
    sum(coalesce(p.costo_produccion, 0)),
    sum(coalesce(p.precio_venta, 0)),
    count(*) filter (
      where coalesce(p.fecha_actualizacion, p.fecha_creacion)
        < now() - (coalesce(v_dias_pieza_lenta, '60') || ' days')::interval
    ),
    count(*) filter (where p.precio_descuento is not null)
  from public.productos p
  where p.activo
    and p.estado in ('disponible_cedi', 'disponible_tienda')
    and p.tienda_id is not null
  group by p.tienda_id
  on conflict (fecha, tienda_id) do update
    set piezas = excluded.piezas,
        capital_inmovilizado = excluded.capital_inmovilizado,
        valor_venta_potencial = excluded.valor_venta_potencial,
        piezas_sin_movimiento = excluded.piezas_sin_movimiento,
        piezas_en_descuento = excluded.piezas_en_descuento;
end;
$$;

-- 06:05 UTC = 00:05 Guatemala (UTC-6, sin horario de verano) — el
-- snapshot representa el estado al inicio del día operativo. Mismo
-- patrón que los jobs ariga_* ya existentes (prefijo técnico interno,
-- sin cambiar por el rebrand cosmético a ASTRO).
select cron.schedule(
  'ariga_registrar_historico_inventario_diario', '5 6 * * *',
  $$select public.fn_registrar_historico_inventario_diario();$$
);

-- ------------------------------------------------------------
-- 2. vw_inventario_tienda — agrega categoria_id/material_id al
-- final (CREATE OR REPLACE VIEW solo permite agregar columnas al
-- final, nunca insertar/reordenar) para poder filtrar por id real
-- en vez de por el nombre de texto ya expuesto.
-- ------------------------------------------------------------
create or replace view public.vw_inventario_tienda as
select
  p.id, p.codigo, p.nombre,
  c.nombre as categoria,
  m.nombre as material,
  p.peso_gramos, p.kilataje, p.piedras,
  p.estado,
  coalesce(p.precio_descuento, p.precio_venta) as precio_venta,
  p.precio_venta as precio_lista,
  (p.precio_descuento is not null) as en_descuento,
  p.costo_produccion, p.moneda_id,
  p.tienda_id,
  t.nombre as tienda, t.tipo as tienda_tipo,
  (select i.url from public.producto_imagenes i
     where i.producto_id = p.id
     order by i.es_principal desc, i.orden asc limit 1) as imagen_principal,
  p.fecha_actualizacion, p.fecha_creacion,
  p.categoria_id, p.material_id
from public.productos p
left join public.categorias c on c.id = p.categoria_id
left join public.materiales m on m.id = p.material_id
left join public.tiendas t on t.id = p.tienda_id
where p.activo
  and (
    public.fn_rol_actual() in ('admin','coordinador','contabilidad','supervisor')
    or (public.fn_rol_actual() = 'tienda' and p.tienda_id = public.fn_mi_tienda_id())
  );

grant select on public.vw_inventario_tienda to authenticated;
revoke all on public.vw_inventario_tienda from anon;

-- ------------------------------------------------------------
-- 3. Fix: supervisor ya tiene inventario.ver/marcar_descuento desde
-- la Fase 4, pero quedó fuera de la visibilidad de Transferencias
-- (política y vista independientes de ese permiso). Sin esto, dar
-- acceso de menú a supervisor lo dejaría viendo una página vacía.
-- ------------------------------------------------------------
drop policy if exists sel_transferencias on public.transferencias;
create policy sel_transferencias on public.transferencias
  for select to authenticated
  using (
    public.fn_rol_actual() in ('admin','coordinador','contabilidad','supervisor')
    or (public.fn_rol_actual() = 'tienda'
        and public.fn_mi_tienda_id() in (tienda_origen_id, tienda_destino_id))
  );

drop policy if exists sel_transferencia_detalles on public.transferencia_detalles;
create policy sel_transferencia_detalles on public.transferencia_detalles
  for select to authenticated
  using (
    exists (select 1 from public.transferencias t
            where t.id = transferencia_id
              and (public.fn_rol_actual() in ('admin','coordinador','contabilidad','supervisor')
                   or (public.fn_rol_actual() = 'tienda'
                       and public.fn_mi_tienda_id() in (t.tienda_origen_id, t.tienda_destino_id))))
  );

create or replace view public.vw_transferencia_detalles as
select
  td.id, td.transferencia_id, td.producto_id,
  p.codigo as producto_codigo, p.nombre as producto_nombre,
  td.estado_recepcion, td.comentario_incidencia,
  td.confirmado_por, td.fecha_confirmacion,
  t.estado as transferencia_estado,
  t.tienda_origen_id, torigen.nombre as tienda_origen,
  t.tienda_destino_id, tdestino.nombre as tienda_destino,
  t.creado_por, t.fecha_envio, t.fecha_recepcion
from public.transferencia_detalles td
join public.transferencias t on t.id = td.transferencia_id
join public.productos p on p.id = td.producto_id
left join public.tiendas torigen on torigen.id = t.tienda_origen_id
left join public.tiendas tdestino on tdestino.id = t.tienda_destino_id
where
  public.fn_rol_actual() in ('admin','coordinador','contabilidad','supervisor')
  or (public.fn_rol_actual() = 'tienda'
      and public.fn_mi_tienda_id() in (t.tienda_origen_id, t.tienda_destino_id));

grant select on public.vw_transferencia_detalles to authenticated;
revoke all on public.vw_transferencia_detalles from anon;

-- Verificación
select jobname, schedule from cron.job where jobname like 'ariga_%';
