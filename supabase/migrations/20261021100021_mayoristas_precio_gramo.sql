-- ============================================================
-- ASTRO — Precio mayorista por gramo (oro y plata).
--
-- En cada política mayorista se puede escribir un precio por gramo para
-- cada material (Oro 14k, Oro blanco, Plata 925…). Si la pieza es de un
-- material con precio por gramo y tiene peso, el mayorista paga:
--     precio = peso en gramos × precio por gramo
-- y ese precio reemplaza al % de descuento. Las demás piezas siguen con el
-- % general o el % de su categoría. La visibilidad por categoría no cambia.
-- ============================================================

create table public.politica_mayorista_materiales (
  id bigint generated always as identity primary key,
  politica_id bigint not null references public.politicas_mayoristas (id) on delete cascade,
  material_id bigint not null references public.materiales (id),
  precio_gramo numeric(12,2) not null check (precio_gramo > 0),
  unique (politica_id, material_id)
);

alter table public.politica_mayorista_materiales enable row level security;

create policy sel_politica_mayorista_materiales on public.politica_mayorista_materiales for select to authenticated
  using (
    (select public.fn_tiene_permiso('mayoristas', 'configurar'))
    or politica_id = (select politica_mayorista_id from public.usuarios where id = (select public.fn_usuario_id()))
  );
create policy adm_politica_mayorista_materiales on public.politica_mayorista_materiales for all to authenticated
  using ((select public.fn_tiene_permiso('mayoristas', 'configurar')))
  with check ((select public.fn_tiene_permiso('mayoristas', 'configurar')));

grant select, insert, update, delete on public.politica_mayorista_materiales to authenticated;

-- Precio mayorista: por gramo si aplica; si no, % de descuento. Misma firma.
create or replace function public.fn_precio_mayorista(p_producto_id bigint, p_usuario_id bigint)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select case
    when pm.precio_gramo is not null and coalesce(p.peso_gramos, 0) > 0
      then round(p.peso_gramos * pm.precio_gramo, 2)
    else round(coalesce(p.precio_descuento, p.precio_venta) * (1 - coalesce(pc.descuento_pct, pol.descuento_pct) / 100), 2)
  end
  from public.productos p
  join public.usuarios u on u.id = p_usuario_id
  join public.politicas_mayoristas pol on pol.id = u.politica_mayorista_id and pol.activo
  left join public.politica_mayorista_categorias pc on pc.politica_id = pol.id and pc.categoria_id = p.categoria_id
  left join public.politica_mayorista_materiales pm on pm.politica_id = pol.id and pm.material_id = p.material_id
  where p.id = p_producto_id
    and (
      (pm.precio_gramo is not null and coalesce(p.peso_gramos, 0) > 0)
      or coalesce(p.precio_descuento, p.precio_venta) is not null
    )
    and (pol.todas_categorias or coalesce(pc.visible, false));
$$;

-- Verificación
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'politica_mayorista_materiales') as tabla,
  (select count(*) from pg_proc where proname = 'fn_precio_mayorista') as funcion;
