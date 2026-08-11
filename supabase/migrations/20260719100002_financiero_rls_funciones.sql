-- ============================================================
-- ARIGA — Migración 0021: RLS y funciones de campañas y conteo
-- físico de inventario.
-- ============================================================

alter table public.campanas enable row level security;
alter table public.conteos_fisicos enable row level security;
alter table public.conteo_fisico_detalles enable row level security;

-- ------------------------------------------------------------
-- Campañas: lectura abierta a autenticados; escritura admin o
-- coordinador (administra metas y campañas, según la especificación).
-- ------------------------------------------------------------
create policy sel_campanas on public.campanas for select to authenticated using (true);
create policy adm_campanas on public.campanas for all to authenticated
  using (public.fn_rol_actual() in ('admin','coordinador'))
  with check (public.fn_rol_actual() in ('admin','coordinador'));

-- ------------------------------------------------------------
-- Conteo físico: visible para admin/coordinador y para la tienda
-- involucrada. Sin escritura directa (solo funciones).
-- ------------------------------------------------------------
create policy sel_conteos_fisicos on public.conteos_fisicos
  for select to authenticated
  using (
    public.fn_rol_actual() in ('admin','coordinador')
    or (public.fn_rol_actual() = 'tienda' and tienda_id = public.fn_mi_tienda_id())
  );

create policy sel_conteo_fisico_detalles on public.conteo_fisico_detalles
  for select to authenticated
  using (
    exists (
      select 1 from public.conteos_fisicos c
      where c.id = conteo_id
        and (
          public.fn_rol_actual() in ('admin','coordinador')
          or (public.fn_rol_actual() = 'tienda' and c.tienda_id = public.fn_mi_tienda_id())
        )
    )
  );

-- ============================================================
-- Inicia un conteo físico: registra todas las piezas que el
-- sistema espera actualmente en esa tienda.
-- ============================================================
create or replace function public.fn_iniciar_conteo(p_tienda_id bigint)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare
  v_conteo_id bigint;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
  end if;
  if public.fn_rol_actual() <> 'admin'
     and (public.fn_rol_actual() <> 'tienda' or public.fn_mi_tienda_id() is distinct from p_tienda_id) then
    raise exception 'Solo la propia tienda (o admin) puede iniciar su conteo físico';
  end if;
  if exists (select 1 from public.conteos_fisicos where tienda_id = p_tienda_id and estado = 'abierto') then
    raise exception 'Ya hay un conteo físico abierto para esta tienda';
  end if;

  insert into public.conteos_fisicos (tienda_id, iniciado_por)
  values (p_tienda_id, public.fn_usuario_id())
  returning id into v_conteo_id;

  insert into public.conteo_fisico_detalles (conteo_id, producto_id)
  select v_conteo_id, p.id
    from public.productos p
    where p.activo and p.tienda_id = p_tienda_id and p.estado = 'disponible_tienda';

  return v_conteo_id;
end;
$$;

-- ============================================================
-- Marca una pieza como encontrada (escaneada) durante el conteo
-- ============================================================
create or replace function public.fn_marcar_pieza_contada(p_conteo_id bigint, p_producto_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_conteo public.conteos_fisicos%rowtype;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
  end if;

  select * into v_conteo from public.conteos_fisicos where id = p_conteo_id;
  if not found or v_conteo.estado <> 'abierto' then
    raise exception 'El conteo no existe o ya está cerrado';
  end if;
  if public.fn_rol_actual() <> 'admin'
     and (public.fn_rol_actual() <> 'tienda' or public.fn_mi_tienda_id() is distinct from v_conteo.tienda_id) then
    raise exception 'No tienes acceso a este conteo';
  end if;

  update public.conteo_fisico_detalles
    set contado = true, fecha_conteo = now()
    where conteo_id = p_conteo_id and producto_id = p_producto_id;

  if not found then
    raise exception 'Esta pieza no forma parte del conteo (¿código correcto?)';
  end if;
end;
$$;

-- ============================================================
-- Cierra el conteo; las piezas no marcadas quedan como faltantes
-- en el reporte (no se ajusta el inventario automáticamente: el
-- ajuste es una operación sensible que revisa administración).
-- ============================================================
create or replace function public.fn_cerrar_conteo(p_conteo_id bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_conteo public.conteos_fisicos%rowtype;
begin
  if public.fn_usuario_id() is null then
    raise exception 'Debes iniciar sesión con una cuenta ARIGA';
  end if;

  select * into v_conteo from public.conteos_fisicos where id = p_conteo_id for update;
  if not found or v_conteo.estado <> 'abierto' then
    raise exception 'El conteo no existe o ya está cerrado';
  end if;
  if public.fn_rol_actual() <> 'admin'
     and (public.fn_rol_actual() <> 'tienda' or public.fn_mi_tienda_id() is distinct from v_conteo.tienda_id) then
    raise exception 'No tienes acceso a este conteo';
  end if;

  update public.conteos_fisicos set estado = 'cerrado', fecha_cierre = now() where id = p_conteo_id;
end;
$$;
