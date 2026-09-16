-- ============================================================
-- ASTRO — Dos ajustes de carga masiva:
--
-- 1) Costo por gramo: cuando la fila trae "Peso (gramos)", el valor
--    de "Coste" se interpreta como costo POR GRAMO y el costo real
--    de la pieza es Coste × Peso — esto ya lo calcula el cliente
--    (cargador-masivo.tsx) antes de enviar el costo final, así que
--    aquí no hace falta tocar nada del lado de base de datos: llega
--    ya multiplicado en costo_produccion, igual que cualquier otro
--    costo manual.
--
-- 2) Eliminar un borrador subido por error: fn_eliminar_producto_
--    borrador hace un soft-delete (activo=false) — nunca un DELETE
--    real, para no perder trazabilidad ni romper referencias (fotos,
--    historial de precio). Solo aplica a piezas en_produccion: una
--    vez publicada, "eliminarla" ya no es una corrección de captura,
--    es dar de baja inventario real — eso queda fuera de esta función
--    a propósito.
-- ============================================================

create or replace function public.fn_eliminar_producto_borrador(
  p_producto_id bigint
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
  if public.fn_rol_actual() not in ('admin', 'produccion') then
    raise exception 'No tienes permiso para eliminar artículos';
  end if;

  select * into v_producto from public.productos where id = p_producto_id for update;
  if not found then
    raise exception 'La pieza no existe';
  end if;

  if public.fn_rol_actual() = 'produccion' and v_producto.creado_por <> public.fn_usuario_id() then
    raise exception 'Solo puedes eliminar artículos que tú mismo creaste';
  end if;

  if v_producto.estado <> 'en_produccion' then
    raise exception 'Solo se pueden eliminar borradores (estado actual: %). Una pieza publicada se da de baja, no se elimina.', v_producto.estado;
  end if;

  update public.productos set activo = false where id = p_producto_id;
end;
$$;
