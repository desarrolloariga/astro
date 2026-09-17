-- ============================================================
-- ASTRO — Fix: fn_cambiar_nivel_ganancia_producto todavía validaba
-- contra la lista vieja de 3 niveles (sin "descuento"), aunque la
-- migración anterior ya había agregado "descuento" al check
-- constraint de la tabla. Misma firma, no requiere drop.
-- ============================================================

create or replace function public.fn_cambiar_nivel_ganancia_producto(
  p_producto_id bigint,
  p_nivel_ganancia text,
  p_motivo text default 'cambio_nivel_ganancia'
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ASTRO';
  end if;
  if public.fn_rol_actual() not in ('admin', 'produccion')
     and not public.fn_tiene_permiso('precios', 'recalcular') then
    raise exception 'No tienes permiso para cambiar el nivel de ganancia';
  end if;
  if p_nivel_ganancia not in ('introduccion', 'socio_comercial', 'importacion', 'descuento') then
    raise exception 'Nivel de ganancia inválido: %', p_nivel_ganancia;
  end if;

  select * into v_producto from public.productos where id = p_producto_id for update;
  if not found then
    raise exception 'La pieza no existe';
  end if;

  update public.productos set nivel_ganancia = p_nivel_ganancia where id = p_producto_id;

  if v_producto.costo_produccion is not null and v_producto.costo_produccion > 0 then
    perform public.fn_recalcular_precio_producto(p_producto_id, p_motivo);
  end if;
end;
$$;
