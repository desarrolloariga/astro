-- ============================================================
-- ASTRO — Cierra un hueco de auditoría real: las excepciones
-- individuales de permisos (usuarios_permisos) se otorgaban/revocaban
-- sin dejar rastro de quién lo hizo, pese a ser lo más sensible en
-- seguridad del sistema. De paso se engancha fn_auditar() en el resto
-- de tablas de configuración que tampoco lo tenían (publicidad interna
-- y contenido de fidelización), reutilizando el mismo trigger genérico
-- ya usado en usuarios/parametros/roles_permisos/tiendas/ventas/etc.
-- ============================================================

create trigger trg_auditar_usuarios_permisos
  after insert or update or delete on public.usuarios_permisos
  for each row execute function public.fn_auditar();

create trigger trg_auditar_publicidad_interna
  after insert or update or delete on public.publicidad_interna
  for each row execute function public.fn_auditar();

create trigger trg_auditar_niveles
  after insert or update or delete on public.niveles
  for each row execute function public.fn_auditar();

create trigger trg_auditar_insignias
  after insert or update or delete on public.insignias
  for each row execute function public.fn_auditar();

create trigger trg_auditar_premios
  after insert or update or delete on public.premios
  for each row execute function public.fn_auditar();

create trigger trg_auditar_reconocimientos
  after insert or update or delete on public.reconocimientos
  for each row execute function public.fn_auditar();
