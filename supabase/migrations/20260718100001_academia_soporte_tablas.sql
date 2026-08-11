-- ============================================================
-- ARIGA — Migración 0018: Academia Virtual (Módulo M) y
-- Atención al cliente / soporte interno (Módulo N — FAQs y
-- tickets; "metas" ya se construyó en la fase de comisiones).
-- ============================================================

-- ------------------------------------------------------------
-- Cursos y contenidos
-- ------------------------------------------------------------
create table public.cursos (
  id bigint generated always as identity primary key,
  titulo text not null,
  descripcion text,
  portada_url text,
  otorga_puntos boolean not null default false,
  activo boolean not null default true,
  creado_por bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create table public.curso_contenidos (
  id bigint generated always as identity primary key,
  curso_id bigint not null references public.cursos (id),
  tipo text not null check (tipo in ('video','documento','texto')),
  titulo text not null,
  url text,
  contenido text,
  orden int not null default 0,
  fecha_creacion timestamptz not null default now(),
  check (
    (tipo in ('video','documento') and url is not null) or
    (tipo = 'texto' and contenido is not null)
  )
);

create index idx_curso_contenidos_curso on public.curso_contenidos (curso_id);

-- ------------------------------------------------------------
-- Evaluación final del curso (una por curso) y sus preguntas de
-- opción múltiple
-- ------------------------------------------------------------
create table public.evaluaciones (
  id bigint generated always as identity primary key,
  curso_id bigint not null unique references public.cursos (id),
  puntaje_aprobacion numeric not null default 70 check (puntaje_aprobacion between 0 and 100),
  intentos_maximos int not null default 3 check (intentos_maximos > 0),
  fecha_creacion timestamptz not null default now()
);

create table public.evaluacion_preguntas (
  id bigint generated always as identity primary key,
  evaluacion_id bigint not null references public.evaluaciones (id),
  texto text not null,
  opciones jsonb not null,          -- ["Opción A", "Opción B", ...]
  respuesta_correcta int not null,  -- índice (0-based) en "opciones"
  orden int not null default 0
);

create index idx_evaluacion_preguntas_evaluacion on public.evaluacion_preguntas (evaluacion_id);

-- ------------------------------------------------------------
-- Progreso, intentos y certificaciones
-- ------------------------------------------------------------
create table public.progreso_cursos (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references public.usuarios (id),
  curso_id bigint not null references public.cursos (id),
  contenidos_vistos jsonb not null default '[]'::jsonb,
  estado text not null default 'en_curso' check (estado in ('en_curso','completado')),
  fecha_inicio timestamptz not null default now(),
  fecha_completado timestamptz,
  unique (usuario_id, curso_id)
);

create table public.intentos_evaluacion (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references public.usuarios (id),
  curso_id bigint not null references public.cursos (id),
  evaluacion_id bigint not null references public.evaluaciones (id),
  puntaje numeric not null,
  aprobado boolean not null,
  fecha_creacion timestamptz not null default now()
);

create index idx_intentos_evaluacion_usuario on public.intentos_evaluacion (usuario_id, evaluacion_id);

create table public.certificaciones (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references public.usuarios (id),
  curso_id bigint not null references public.cursos (id),
  puntaje numeric not null,
  fecha timestamptz not null default now(),
  unique (usuario_id, curso_id)
);

-- ------------------------------------------------------------
-- Centro de ayuda (FAQs)
-- ------------------------------------------------------------
create table public.faqs (
  id bigint generated always as identity primary key,
  pregunta text not null,
  respuesta text not null,
  categoria text,
  orden int not null default 0,
  activo boolean not null default true,
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

-- ------------------------------------------------------------
-- Tickets de soporte interno
-- ------------------------------------------------------------
create table public.tickets (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references public.usuarios (id),
  asunto text not null,
  descripcion text not null,
  categoria text,
  estado text not null default 'abierto' check (estado in ('abierto','en_proceso','resuelto','cerrado')),
  asignado_a bigint references public.usuarios (id),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz
);

create index idx_tickets_usuario on public.tickets (usuario_id);
create index idx_tickets_estado on public.tickets (estado);

create table public.ticket_mensajes (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.tickets (id),
  usuario_id bigint not null references public.usuarios (id),
  mensaje text not null,
  fecha_creacion timestamptz not null default now()
);

create index idx_ticket_mensajes_ticket on public.ticket_mensajes (ticket_id);

-- Triggers de fecha_actualizacion
do $$
declare t text;
begin
  foreach t in array array['cursos','faqs','tickets']
  loop
    execute format(
      'create trigger trg_%s_fecha_actualizacion before update on public.%I
       for each row execute function public.fn_fecha_actualizacion()', t, t);
  end loop;
end $$;
