-- ============================================================
-- ASTRO — Motor de precios calculado (Fase 1 de la adaptación a la
-- especificación funcional de negocio).
--
-- Reemplaza el motor de "sugerencia" (politicas_margen/vw_producto_costeo,
-- nunca conectado a ningún flujo de escritura) por un cálculo real:
-- productos.precio_venta deja de escribirse a mano y pasa a derivarse
-- de costo_produccion + una cascada de factores parametrizados.
--
-- Cascada (documento fuente, Sección 4.2):
--   CostoBase → CostoOrigen → CostoLogistico → PrecioSinImpuesto
--   → Impuesto → PrecioFinalPublico
--
-- Decisiones de negocio confirmadas (ver plan de esta fase):
--   - IVA = 5% (advertido: el IVA general de Guatemala es 12%; el
--     negocio eligió 5% y confirmará con contabilidad antes de
--     facturar en producción real — ver comentario en el seed).
--   - El impuesto se calcula sobre PrecioSinImpuesto (después del
--     margen del embajador).
--   - Precio calculado automáticamente: producción ya no escribe
--     precio_venta a mano, solo costo_produccion + origen + categoría.
--   - Costo real (compra/importación) reemplaza el factor teórico de
--     origen cuando existe — nunca se apilan ambos (parámetro
--     p_omitir_factor_origen en fn_calcular_precio, usado desde las
--     fases de Compras/Importaciones que redefinen el orquestador).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Retira el motor de sugerencia actual — confirmado por grep que
-- solo se usa en app/(app)/admin/costeo/* y produccion/nueva/page.tsx,
-- en ningún flujo de escritura.
-- ------------------------------------------------------------
drop view if exists public.vw_producto_costeo;
drop table if exists public.politicas_margen cascade;

delete from public.parametros where clave in ('pct_empaque', 'pct_flete_importado');

delete from public.roles_permisos
  where permiso_id = (select id from public.permisos where modulo = 'costeo' and accion = 'editar');
delete from public.usuarios_permisos
  where permiso_id = (select id from public.permisos where modulo = 'costeo' and accion = 'editar');
delete from public.permisos where modulo = 'costeo' and accion = 'editar';

-- ------------------------------------------------------------
-- 2. Parámetros del motor de precios — versionados y con vigencia
-- (global → categoría → producto, el más específico gana), a
-- diferencia de la tabla plana `parametros`.
-- ------------------------------------------------------------
create table public.parametros_precio (
  id bigint generated always as identity primary key,
  clave text not null check (clave in
    ('factor_importacion', 'factor_margen_local', 'factor_envio',
     'factor_empaque', 'factor_impuesto', 'factor_comision_embajador')),
  categoria_id bigint references public.categorias (id),   -- null = global
  producto_id bigint references public.productos (id),     -- null = sin excepción por pieza
  valor_pct numeric(6,2) not null,
  motivo text,
  activo boolean not null default true,
  version int not null default 1,
  vigencia_inicio timestamptz not null default now(),
  vigencia_fin timestamptz,
  creado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create or replace function public.fn_versionar_parametro_precio()
returns trigger
language plpgsql
as $$
begin
  if new.valor_pct is distinct from old.valor_pct then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create trigger trg_parametros_precio_version
  before update on public.parametros_precio
  for each row execute function public.fn_versionar_parametro_precio();

create trigger trg_parametros_precio_fecha_actualizacion
  before update on public.parametros_precio
  for each row execute function public.fn_fecha_actualizacion();

create trigger trg_auditar_parametros_precio
  after insert or update or delete on public.parametros_precio
  for each row execute function public.fn_auditar();

alter table public.parametros_precio enable row level security;

insert into public.permisos (modulo, accion, descripcion) values
  ('precios', 'editar', 'Configurar los factores del motor de precios'),
  ('precios', 'recalcular', 'Recalcular el precio de una pieza ya publicada')
on conflict (modulo, accion) do nothing;

insert into public.roles_permisos (rol_id, permiso_id)
select r.id, p.id
from (values
  ('admin', 'precios', 'editar'),
  ('admin', 'precios', 'recalcular'),
  ('contabilidad', 'precios', 'editar')
) as base(rol_nombre, modulo, accion)
join public.roles r on r.nombre = base.rol_nombre
join public.permisos p on p.modulo = base.modulo and p.accion = base.accion
on conflict (rol_id, permiso_id) do nothing;

-- Mismo círculo de visibilidad que ya protege costo_produccion hoy
-- (sel_productos): la red comercial (embajador/asesor/tienda) nunca
-- ve factores de costeo (RN-06).
create policy sel_parametros_precio on public.parametros_precio
  for select to authenticated
  using (public.fn_rol_actual() in ('admin', 'contabilidad', 'coordinador', 'produccion'));

create policy adm_parametros_precio on public.parametros_precio for all to authenticated
  using (public.fn_tiene_permiso('precios', 'editar'))
  with check (public.fn_tiene_permiso('precios', 'editar'));

-- Valores confirmados por el negocio. IVA=5%: el IVA general de
-- Guatemala es 12% — el negocio eligió 5% de forma explícita y debe
-- confirmarlo con contabilidad antes de usarlo para facturar en serio.
insert into public.parametros_precio (clave, valor_pct, motivo) values
  ('factor_importacion', 40,
   'Factor teórico de costeo importado (fallback cuando no hay compra/importación real detrás)'),
  ('factor_margen_local', 20,
   'Factor teórico de costeo local (fallback cuando no hay compra real detrás)'),
  ('factor_envio', 2, 'Envío/distribución local, aplica a todo origen'),
  ('factor_empaque', 2, 'Empaque, aplica a todo origen'),
  ('factor_impuesto', 5,
   'IVA — NOTA: la tasa general en Guatemala es 12%; se usa 5% por decisión expresa del negocio, pendiente de validar con contabilidad antes de facturar en producción real'),
  ('factor_comision_embajador', 30,
   'Margen de comisión del embajador — se resta del PrecioSinImpuesto, el impuesto se calcula después de este paso');

-- ------------------------------------------------------------
-- 3. Búsqueda del factor vigente más específico (producto > categoría
-- > global) para una clave y fecha dadas.
-- ------------------------------------------------------------
create or replace function public.fn_buscar_parametro_precio(
  p_clave text,
  p_categoria_id bigint,
  p_producto_id bigint,
  p_fecha timestamptz default now()
)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select valor_pct from public.parametros_precio
  where clave = p_clave and activo
    and vigencia_inicio <= p_fecha
    and (vigencia_fin is null or vigencia_fin >= p_fecha)
    and (producto_id = p_producto_id or producto_id is null)
    and (categoria_id = p_categoria_id or categoria_id is null)
  order by (producto_id is not null) desc, (categoria_id is not null) desc, fecha_creacion desc
  limit 1;
$$;

-- ------------------------------------------------------------
-- 4. Cascada pura (Sección 4.2 del documento). No conoce compras ni
-- importaciones — p_omitir_factor_origen es lo único que las fases
-- futuras necesitan para evitar duplicar el factor teórico sobre un
-- costo que ya es real.
-- ------------------------------------------------------------
create or replace function public.fn_calcular_precio(
  p_costo_base numeric,
  p_origen text,
  p_categoria_id bigint default null,
  p_producto_id bigint default null,
  p_omitir_factor_origen boolean default false,
  p_fecha timestamptz default now()
)
returns table (
  costo_base numeric,
  costo_origen numeric,
  costo_logistico numeric,
  precio_sin_impuesto numeric,
  base_comisionable numeric,
  impuesto numeric,
  precio_final numeric,
  factor_origen_usado numeric,
  factor_envio_usado numeric,
  factor_empaque_usado numeric,
  factor_comision_usado numeric,
  factor_impuesto_usado numeric
)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_factor_origen numeric;
  v_factor_envio numeric;
  v_factor_empaque numeric;
  v_factor_comision numeric;
  v_factor_impuesto numeric;
  v_costo_origen numeric;
  v_costo_logistico numeric;
  v_psi numeric;
  v_impuesto numeric;
  v_final numeric;
begin
  if p_costo_base is null or p_costo_base <= 0 then
    raise exception 'El costo base debe ser mayor a 0 para calcular un precio';
  end if;
  if p_origen not in ('local', 'importado') then
    raise exception 'Origen inválido: %', p_origen;
  end if;

  v_factor_origen := case when p_omitir_factor_origen then 0 else
    public.fn_buscar_parametro_precio(
      case when p_origen = 'importado' then 'factor_importacion' else 'factor_margen_local' end,
      p_categoria_id, p_producto_id, p_fecha)
    end;
  v_factor_envio := coalesce(
    public.fn_buscar_parametro_precio('factor_envio', p_categoria_id, p_producto_id, p_fecha), 0);
  v_factor_empaque := coalesce(
    public.fn_buscar_parametro_precio('factor_empaque', p_categoria_id, p_producto_id, p_fecha), 0);
  v_factor_comision :=
    public.fn_buscar_parametro_precio('factor_comision_embajador', p_categoria_id, p_producto_id, p_fecha);
  v_factor_impuesto := coalesce(
    public.fn_buscar_parametro_precio('factor_impuesto', p_categoria_id, p_producto_id, p_fecha), 0);

  if v_factor_comision is null or v_factor_comision < 0 or v_factor_comision >= 100 then
    raise exception 'factor_comision_embajador no está configurado o es inválido (debe ser >= 0 y < 100)';
  end if;

  -- RN-12: numeric sin truncar en los pasos intermedios; redondeo
  -- solo al devolver el resultado.
  v_costo_origen := p_costo_base * (1 + coalesce(v_factor_origen, 0) / 100);
  v_costo_logistico := v_costo_origen * (1 + (v_factor_envio + v_factor_empaque) / 100);
  -- RN-13: PrecioSinImpuesto se despeja para que la comisión del
  -- embajador sea ese % DEL precio final, garantizando algebraicamente
  -- precio_final >= costo_logistico (comisión < 100%).
  v_psi := v_costo_logistico / (1 - v_factor_comision / 100);
  v_impuesto := v_psi * v_factor_impuesto / 100;
  v_final := v_psi + v_impuesto;

  return query select
    round(p_costo_base, 2), round(v_costo_origen, 2), round(v_costo_logistico, 2),
    round(v_psi, 2), round(v_psi, 2), round(v_impuesto, 2), round(v_final, 2),
    v_factor_origen, v_factor_envio, v_factor_empaque, v_factor_comision, v_factor_impuesto;
end;
$$;

-- ------------------------------------------------------------
-- 5. Historial de precios — ledger inmutable (como comisiones/puntos):
-- nunca se actualiza ni se borra, sin política de escritura para
-- ningún rol autenticado. Solo fn_recalcular_precio_producto inserta.
-- ------------------------------------------------------------
create table public.producto_precio_historial (
  id bigint generated always as identity primary key,
  producto_id bigint not null references public.productos (id),
  costo_base numeric(12,2) not null,
  origen text not null check (origen in ('local', 'importado')),
  fuente_costo text not null default 'manual' check (fuente_costo in ('manual', 'compra', 'importacion')),
  costo_origen numeric(12,2) not null,
  costo_logistico numeric(12,2) not null,
  precio_sin_impuesto numeric(12,2) not null,
  base_comisionable numeric(12,2) not null,
  impuesto numeric(12,2) not null,
  precio_final numeric(12,2) not null,
  factor_origen_pct numeric(6,2),
  factor_envio_pct numeric(6,2),
  factor_empaque_pct numeric(6,2),
  factor_comision_pct numeric(6,2),
  factor_impuesto_pct numeric(6,2),
  calculado_por bigint references public.usuarios (id),
  motivo text not null,
  fecha_creacion timestamptz not null default now()
);

create index idx_producto_precio_historial_producto
  on public.producto_precio_historial (producto_id, fecha_creacion desc);

alter table public.producto_precio_historial enable row level security;

create policy sel_producto_precio_historial on public.producto_precio_historial
  for select to authenticated
  using (
    public.fn_rol_actual() in ('admin', 'contabilidad', 'coordinador')
    or (public.fn_rol_actual() = 'produccion'
        and exists (
          select 1 from public.productos p
          where p.id = producto_id and p.creado_por = public.fn_usuario_id()
        ))
  );

-- ------------------------------------------------------------
-- 6. Orquestador — decide de dónde viene el costo de la pieza y llama
-- a la cascada pura. Las fases de Compras/Importaciones vuelven a
-- CREATE OR REPLACE esta misma firma para saber leer sus propios
-- campos de trazabilidad (compra_detalle_id / importacion_detalle_id).
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
  v_fuente text := 'manual';
  v_omitir_origen boolean := false;
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

  select * into v_r from public.fn_calcular_precio(
    v_costo_base, v_producto.origen, v_producto.categoria_id, v_producto.id, v_omitir_origen);

  insert into public.producto_precio_historial (
    producto_id, costo_base, origen, fuente_costo,
    costo_origen, costo_logistico, precio_sin_impuesto, base_comisionable, impuesto, precio_final,
    factor_origen_pct, factor_envio_pct, factor_empaque_pct, factor_comision_pct, factor_impuesto_pct,
    calculado_por, motivo
  ) values (
    p_producto_id, v_r.costo_base, v_producto.origen, v_fuente,
    v_r.costo_origen, v_r.costo_logistico, v_r.precio_sin_impuesto, v_r.base_comisionable,
    v_r.impuesto, v_r.precio_final,
    v_r.factor_origen_usado, v_r.factor_envio_usado, v_r.factor_empaque_usado,
    v_r.factor_comision_usado, v_r.factor_impuesto_usado,
    public.fn_usuario_id(), p_motivo
  );

  update public.productos set precio_venta = v_r.precio_final where id = p_producto_id;
end;
$$;

grant execute on function public.fn_recalcular_precio_producto(bigint, text) to authenticated;

-- ------------------------------------------------------------
-- 7. fn_publicar_producto — misma firma que 20260814100001; cambia la
-- validación de ficha ("requiere precio_venta") por "requiere
-- costo_produccion", y calcula el snapshot final justo antes de
-- publicar (RN-05: última repreciación automática de esta pieza).
-- ------------------------------------------------------------
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
  if public.fn_rol_actual() not in ('admin', 'produccion') then
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

  if v_producto.nombre is null or v_producto.costo_produccion is null
     or v_producto.categoria_id is null or v_producto.material_id is null then
    raise exception 'Ficha incompleta: nombre, costo, categoría y material son obligatorios';
  end if;

  if v_producto.modo_inventario = 'por_cantidad'
     and (v_producto.cantidad_inicial is null or v_producto.cantidad_inicial <= 0) then
    raise exception 'Indica la cantidad inicial antes de publicar esta referencia';
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

  -- Snapshot final de precio antes de publicar (RN-05).
  perform public.fn_recalcular_precio_producto(p_producto_id, 'publicacion');

  update public.productos
    set estado = 'disponible_cedi',
        tienda_id = v_cedi_id,
        fecha_publicacion = now()
    where id = p_producto_id;

  if v_producto.modo_inventario = 'por_cantidad' then
    insert into public.inventario_cantidad (producto_id, tienda_id, cantidad_disponible)
    values (p_producto_id, v_cedi_id, v_producto.cantidad_inicial);

    insert into public.movimientos_inventario
      (producto_id, tipo, tienda_destino_id, usuario_id, referencia, cantidad)
    values
      (p_producto_id, 'alta_cedi', v_cedi_id, public.fn_usuario_id(), 'publicacion', v_producto.cantidad_inicial);
  else
    insert into public.movimientos_inventario
      (producto_id, tipo, tienda_destino_id, usuario_id, referencia)
    values
      (p_producto_id, 'alta_cedi', v_cedi_id, public.fn_usuario_id(), 'publicacion');
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 8. fn_marcar_descuento_pieza — misma firma; gana el piso duro de
-- RN-13 contra el costo logístico del último snapshot de precio.
-- ------------------------------------------------------------
create or replace function public.fn_marcar_descuento_pieza(
  p_producto_id bigint,
  p_precio_descuento numeric,
  p_motivo text
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
  v_costo_logistico numeric;
begin
  if not public.fn_tiene_permiso('inventario', 'marcar_descuento') then
    raise exception 'No tienes permiso para marcar descuentos';
  end if;

  select * into v_producto from public.productos where id = p_producto_id;
  if not found then
    raise exception 'La pieza no existe';
  end if;
  if p_precio_descuento is null or p_precio_descuento <= 0 or p_precio_descuento >= coalesce(v_producto.precio_venta, 0) then
    raise exception 'El precio de descuento debe ser mayor a 0 y menor al precio de lista';
  end if;

  -- RN-13: piso duro = costo logístico del último cálculo. Sin matriz
  -- de autorización todavía — bloqueo directo (se conectará a la
  -- matriz de autorización cuando esa fase exista).
  select costo_logistico into v_costo_logistico
    from public.producto_precio_historial
    where producto_id = p_producto_id
    order by fecha_creacion desc
    limit 1;

  if v_costo_logistico is not null and p_precio_descuento < v_costo_logistico then
    raise exception 'El precio de descuento (%) no puede quedar por debajo del costo logístico (%)',
      p_precio_descuento, v_costo_logistico;
  end if;

  update public.productos
    set precio_descuento = p_precio_descuento,
        descuento_motivo = p_motivo,
        descuento_por = public.fn_usuario_id(),
        descuento_fecha = now()
    where id = p_producto_id;
end;
$$;

-- ------------------------------------------------------------
-- 9. Backfill — solo piezas en borrador (en_produccion) con costo
-- válido. Las ya publicadas/vendidas NO se tocan: no hay forma de
-- reconstruir con qué insumos se calculó su precio histórico, e
-- inventar uno falsificaría el historial (RN-05).
--
-- No se usa fn_recalcular_precio_producto aquí: exige una sesión
-- autenticada (fn_usuario_id()) que no existe al pegar esta migración
-- en el editor SQL, así que se inlinea la misma lógica llamando
-- directamente a la cascada pura (fn_calcular_precio, sin ese guard).
-- ------------------------------------------------------------
do $$
declare
  v_producto public.productos%rowtype;
  v_r record;
begin
  for v_producto in
    select * from public.productos
    where estado = 'en_produccion' and costo_produccion is not null and costo_produccion > 0
  loop
    begin
      select * into v_r from public.fn_calcular_precio(
        v_producto.costo_produccion, v_producto.origen, v_producto.categoria_id, v_producto.id, false);

      insert into public.producto_precio_historial (
        producto_id, costo_base, origen, fuente_costo,
        costo_origen, costo_logistico, precio_sin_impuesto, base_comisionable, impuesto, precio_final,
        factor_origen_pct, factor_envio_pct, factor_empaque_pct, factor_comision_pct, factor_impuesto_pct,
        calculado_por, motivo
      ) values (
        v_producto.id, v_r.costo_base, v_producto.origen, 'manual',
        v_r.costo_origen, v_r.costo_logistico, v_r.precio_sin_impuesto, v_r.base_comisionable,
        v_r.impuesto, v_r.precio_final,
        v_r.factor_origen_usado, v_r.factor_envio_usado, v_r.factor_empaque_usado,
        v_r.factor_comision_usado, v_r.factor_impuesto_usado,
        v_producto.creado_por, 'backfill_migracion_20260825'
      );

      update public.productos set precio_venta = v_r.precio_final where id = v_producto.id;
    exception when others then
      raise notice 'No se pudo calcular precio para producto %: %', v_producto.id, sqlerrm;
    end;
  end loop;
end $$;

-- Verificación
select * from public.fn_calcular_precio(100, 'local');
