-- ============================================================
-- ARIGA — Migración 0019: RLS y funciones de Academia y Soporte.
-- ============================================================

alter table public.cursos enable row level security;
alter table public.curso_contenidos enable row level security;
alter table public.evaluaciones enable row level security;
alter table public.evaluacion_preguntas enable row level security;
alter table public.progreso_cursos enable row level security;
alter table public.intentos_evaluacion enable row level security;
alter table public.certificaciones enable row level security;
alter table public.faqs enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_mensajes enable row level security;

-- ------------------------------------------------------------
-- Cursos y contenidos: disponibles 24/7 para toda la red
-- autenticada; administración solo admin.
-- ------------------------------------------------------------
create policy sel_cursos on public.cursos for select to authenticated using (activo or public.fn_rol_actual() = 'admin');
create policy adm_cursos on public.cursos for all to authenticated
  using (public.fn_rol_actual() = 'admin') with check (public.fn_rol_actual() = 'admin');

create policy sel_curso_contenidos on public.curso_contenidos for select to authenticated using (true);
create policy adm_curso_contenidos on public.curso_contenidos for all to authenticated
  using (public.fn_rol_actual() = 'admin') with check (public.fn_rol_actual() = 'admin');

create policy sel_evaluaciones on public.evaluaciones for select to authenticated using (true);
create policy adm_evaluaciones on public.evaluaciones for all to authenticated
  using (public.fn_rol_actual() = 'admin') with check (public.fn_rol_actual() = 'admin');

-- Las preguntas CON su respuesta correcta solo las ve admin (evita
-- que el alumno lea la respuesta en el cliente); el examen se sirve
-- por la vista vw_evaluacion_preguntas, sin esa columna.
create policy sel_evaluacion_preguntas on public.evaluacion_preguntas
  for select to authenticated using (public.fn_rol_actual() = 'admin');
create policy adm_evaluacion_preguntas on public.evaluacion_preguntas for all to authenticated
  using (public.fn_rol_actual() = 'admin') with check (public.fn_rol_actual() = 'admin');

create view public.vw_evaluacion_preguntas as
select id, evaluacion_id, texto, opciones, orden
  from public.evaluacion_preguntas;

grant select on public.vw_evaluacion_preguntas to authenticated;
revoke all on public.vw_evaluacion_preguntas from anon;

-- ------------------------------------------------------------
-- Progreso, intentos y certificaciones: propio + cadena de mando
-- (un supervisor puede ver el avance de capacitación de su red) +
-- admin/coordinador. Sin escritura directa (solo funciones).
-- ------------------------------------------------------------
create policy sel_progreso_cursos on public.progreso_cursos
  for select to authenticated
  using (
    usuario_id = public.fn_usuario_id()
    or public.fn_es_mi_descendiente(usuario_id)
    or public.fn_rol_actual() in ('admin','coordinador')
  );

create policy sel_intentos_evaluacion on public.intentos_evaluacion
  for select to authenticated
  using (usuario_id = public.fn_usuario_id() or public.fn_rol_actual() = 'admin');

create policy sel_certificaciones on public.certificaciones
  for select to authenticated
  using (
    usuario_id = public.fn_usuario_id()
    or public.fn_es_mi_descendiente(usuario_id)
    or public.fn_rol_actual() in ('admin','coordinador')
  );

-- ------------------------------------------------------------
-- FAQs: lectura abierta a autenticados; administración admin.
-- ------------------------------------------------------------
create policy sel_faqs on public.faqs for select to authenticated using (activo or public.fn_rol_actual() = 'admin');
create policy adm_faqs on public.faqs for all to authenticated
  using (public.fn_rol_actual() = 'admin') with check (public.fn_rol_actual() = 'admin');

-- ------------------------------------------------------------
-- Tickets: el autor y la persona asignada los ven; admin ve todo.
-- Sin escritura directa (creación/respuesta/estado vía funciones).
-- ------------------------------------------------------------
create policy sel_tickets on public.tickets
  for select to authenticated
  using (
    usuario_id = public.fn_usuario_id()
    or asignado_a = public.fn_usuario_id()
    or public.fn_rol_actual() = 'admin'
  );

create policy sel_ticket_mensajes on public.ticket_mensajes
  for select to authenticated
  using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_id
        and (t.usuario_id = public.fn_usuario_id() or t.asignado_a = public.fn_usuario_id()
             or public.fn_rol_actual() = 'admin')
    )
  );

-- ============================================================
-- Otorga puntos por completar un curso (regla tipo curso_completado)
-- ============================================================
create or replace function public.fn_otorgar_puntos_curso(p_usuario_id bigint, p_curso_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_curso public.cursos%rowtype;
  v_periodo_id bigint;
  v_regla record;
  v_puntos numeric;
begin
  select * into v_curso from public.cursos where id = p_curso_id;
  if not found or not v_curso.otorga_puntos then
    return;
  end if;

  v_periodo_id := public.fn_obtener_periodo_actual();

  for v_regla in
    select * from public.reglas_puntaje
      where activo and tipo = 'curso_completado'
        and (vigencia_inicio is null or vigencia_inicio <= now())
        and (vigencia_fin is null or vigencia_fin >= now())
  loop
    v_puntos := round(coalesce(v_regla.valor, 0) * coalesce(v_regla.multiplicador, 1), 2);
    if v_puntos <> 0 then
      insert into public.puntos (usuario_id, regla_id, regla_version, periodo_id, cantidad, motivo)
      values (p_usuario_id, v_regla.id, v_regla.version, v_periodo_id, v_puntos,
              v_regla.nombre || ' — curso: ' || v_curso.titulo);
    end if;
  end loop;

  perform public.fn_actualizar_nivel(p_usuario_id, v_periodo_id);
end;
$$;

-- ============================================================
-- Marca un contenido como visto; si el curso no tiene evaluación
-- y ya se vieron todos los contenidos, lo completa automáticamente.
-- ============================================================
create or replace function public.fn_marcar_contenido_visto(p_curso_id bigint, p_contenido_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_total_contenidos int;
  v_tiene_evaluacion boolean;
  v_vistos jsonb;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
  end if;
  if not exists (select 1 from public.curso_contenidos where id = p_contenido_id and curso_id = p_curso_id) then
    raise exception 'Contenido no encontrado en este curso';
  end if;

  insert into public.progreso_cursos (usuario_id, curso_id, contenidos_vistos)
  values (public.fn_usuario_id(), p_curso_id, jsonb_build_array(p_contenido_id))
  on conflict (usuario_id, curso_id) do update
    set contenidos_vistos = (
      select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
      from jsonb_array_elements(public.progreso_cursos.contenidos_vistos || jsonb_build_array(p_contenido_id)) v
    );

  select count(*) into v_total_contenidos from public.curso_contenidos where curso_id = p_curso_id;
  select exists (select 1 from public.evaluaciones where curso_id = p_curso_id) into v_tiene_evaluacion;
  select contenidos_vistos into v_vistos
    from public.progreso_cursos where usuario_id = public.fn_usuario_id() and curso_id = p_curso_id;

  if not v_tiene_evaluacion and v_total_contenidos > 0 and jsonb_array_length(v_vistos) >= v_total_contenidos then
    update public.progreso_cursos
      set estado = 'completado', fecha_completado = now()
      where usuario_id = public.fn_usuario_id() and curso_id = p_curso_id and estado <> 'completado';
    if found then
      perform public.fn_otorgar_puntos_curso(public.fn_usuario_id(), p_curso_id);
    end if;
  end if;
end;
$$;

-- ============================================================
-- Envía y califica un intento de evaluación.
-- p_respuestas: {"<pregunta_id>": <indice_opcion_elegida>, ...}
-- ============================================================
create or replace function public.fn_enviar_evaluacion(p_evaluacion_id bigint, p_respuestas jsonb)
returns table (puntaje numeric, aprobado boolean, intentos_restantes int)
language plpgsql security definer
set search_path = public
as $$
declare
  v_eval public.evaluaciones%rowtype;
  v_total int;
  v_correctas int := 0;
  v_pregunta record;
  v_respuesta int;
  v_puntaje numeric;
  v_aprobado boolean;
  v_intentos_usados int;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
  end if;

  select * into v_eval from public.evaluaciones where id = p_evaluacion_id;
  if not found then
    raise exception 'La evaluación no existe';
  end if;

  select count(*) into v_intentos_usados from public.intentos_evaluacion
    where usuario_id = public.fn_usuario_id() and evaluacion_id = p_evaluacion_id;
  if v_intentos_usados >= v_eval.intentos_maximos then
    raise exception 'Alcanzaste el máximo de % intentos para esta evaluación', v_eval.intentos_maximos;
  end if;

  select count(*) into v_total from public.evaluacion_preguntas where evaluacion_id = p_evaluacion_id;
  if v_total = 0 then
    raise exception 'Esta evaluación no tiene preguntas configuradas';
  end if;

  for v_pregunta in select * from public.evaluacion_preguntas where evaluacion_id = p_evaluacion_id loop
    v_respuesta := (p_respuestas ->> v_pregunta.id::text)::int;
    if v_respuesta is not null and v_respuesta = v_pregunta.respuesta_correcta then
      v_correctas := v_correctas + 1;
    end if;
  end loop;

  v_puntaje := round(v_correctas::numeric / v_total * 100, 2);
  v_aprobado := v_puntaje >= v_eval.puntaje_aprobacion;

  insert into public.intentos_evaluacion (usuario_id, curso_id, evaluacion_id, puntaje, aprobado)
  values (public.fn_usuario_id(), v_eval.curso_id, p_evaluacion_id, v_puntaje, v_aprobado);

  if v_aprobado then
    insert into public.progreso_cursos (usuario_id, curso_id, estado, fecha_completado)
    values (public.fn_usuario_id(), v_eval.curso_id, 'completado', now())
    on conflict (usuario_id, curso_id) do update
      set estado = 'completado', fecha_completado = coalesce(public.progreso_cursos.fecha_completado, now());

    insert into public.certificaciones (usuario_id, curso_id, puntaje)
    values (public.fn_usuario_id(), v_eval.curso_id, v_puntaje)
    on conflict (usuario_id, curso_id) do update
      set puntaje = greatest(public.certificaciones.puntaje, excluded.puntaje), fecha = now();

    perform public.fn_otorgar_puntos_curso(public.fn_usuario_id(), v_eval.curso_id);
  end if;

  return query select v_puntaje, v_aprobado, greatest(0, v_eval.intentos_maximos - v_intentos_usados - 1);
end;
$$;

-- ============================================================
-- Tickets de soporte
-- ============================================================
create or replace function public.fn_crear_ticket(p_asunto text, p_descripcion text, p_categoria text default null)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
  end if;
  if p_asunto is null or btrim(p_asunto) = '' then
    raise exception 'El asunto es obligatorio';
  end if;

  insert into public.tickets (usuario_id, asunto, descripcion, categoria)
  values (public.fn_usuario_id(), btrim(p_asunto), p_descripcion, p_categoria)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.fn_responder_ticket(p_ticket_id bigint, p_mensaje text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_ticket public.tickets%rowtype;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
  end if;
  if p_mensaje is null or btrim(p_mensaje) = '' then
    raise exception 'El mensaje no puede estar vacío';
  end if;

  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'El ticket no existe';
  end if;
  if v_ticket.usuario_id <> public.fn_usuario_id()
     and v_ticket.asignado_a is distinct from public.fn_usuario_id()
     and public.fn_rol_actual() <> 'admin' then
    raise exception 'No tienes acceso a este ticket';
  end if;

  insert into public.ticket_mensajes (ticket_id, usuario_id, mensaje)
  values (p_ticket_id, public.fn_usuario_id(), btrim(p_mensaje));

  if public.fn_rol_actual() = 'admin' and v_ticket.estado = 'abierto' then
    update public.tickets set estado = 'en_proceso' where id = p_ticket_id;
  end if;

  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, url_destino)
  select v_ticket.usuario_id, 'ticket_respondido', 'Nueva respuesta en tu ticket',
         left(p_mensaje, 140), '/soporte/tickets/' || p_ticket_id
    where v_ticket.usuario_id <> public.fn_usuario_id();
end;
$$;

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
        asignado_a = coalesce(p_asignado_a, asignado_a)
    where id = p_ticket_id;
end;
$$;
