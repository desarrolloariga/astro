-- ============================================================
-- ASTRO — fn_actualizar_estado_ticket ahora sobrescribe asignado_a
-- en vez de usar coalesce(). Antes era imposible desasignar un ticket:
-- pasar NULL nunca limpiaba el valor existente. El único llamante
-- (actualizarEstadoTicket) ahora siempre envía el valor real del
-- formulario (incluido "sin asignar" → null), así que sobrescribir
-- directamente es lo correcto. Misma firma — CREATE OR REPLACE seguro.
-- ============================================================

create or replace function public.fn_actualizar_estado_ticket(
  p_ticket_id bigint,
  p_estado text,
  p_asignado_a bigint default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if public.fn_usuario_id() is null or public.fn_rol_actual() <> 'admin' then
    raise exception 'Solo administración gestiona el estado de los tickets';
  end if;
  if p_estado not in ('abierto','en_proceso','resuelto','cerrado') then
    raise exception 'Estado de ticket inválido';
  end if;

  update public.tickets
    set estado = p_estado,
        asignado_a = p_asignado_a
    where id = p_ticket_id;
end;
$$;
