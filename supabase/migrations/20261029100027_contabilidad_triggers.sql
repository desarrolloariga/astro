-- ============================================================
-- ASTRO — Contabilidad (fase 2c): disparadores en las operaciones.
--
-- Triggers de restricción DIFERIDOS: se ejecutan al confirmar la
-- transacción, cuando ya existen los detalles, pagos y movimientos que
-- la operación crea después del encabezado. Cada uno solo llama al
-- despachador, que no lanza errores (si algo falla queda en
-- "Pendientes de contabilizar") y no hace nada con la contabilización
-- automática apagada.
-- Requiere 022–026.
-- ============================================================

create or replace function public.fn_trg_contabilizar()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_insert boolean := tg_op = 'INSERT';
begin
  case tg_table_name
    when 'ventas' then
      if new.estado = 'pagada' and (v_insert or old.estado is distinct from 'pagada') then
        perform public.fn_ctb_despachar('venta', new.id, 'contabilizar');
      elsif not v_insert and new.estado = 'anulada' and old.estado is distinct from 'anulada' then
        perform public.fn_ctb_despachar('venta', new.id, 'revertir');
      end if;
    when 'pagos' then
      if new.estado = 'confirmado' and new.metodo <> 'bolsa' and (v_insert or old.estado is distinct from 'confirmado') then
        perform public.fn_ctb_despachar('pago', new.id, 'contabilizar');
      end if;
    when 'movimientos_bolsa' then
      perform public.fn_ctb_despachar('bolsa', new.id, 'contabilizar');
    when 'gastos' then
      if v_insert and not new.anulado then
        perform public.fn_ctb_despachar('gasto', new.id, 'contabilizar');
      elsif not v_insert and new.anulado and not old.anulado then
        perform public.fn_ctb_despachar('gasto', new.id, 'revertir');
      end if;
    when 'movimientos_banco' then
      if v_insert and not new.anulado then
        perform public.fn_ctb_despachar('banco', new.id, 'contabilizar');
      elsif not v_insert and new.anulado and not old.anulado then
        perform public.fn_ctb_despachar('banco', new.id, 'revertir');
      end if;
    when 'ordenes_compra' then
      if new.estado = 'recibida_total'
         and (v_insert or old.estado not in ('recibida_total', 'facturada', 'pagada')) then
        perform public.fn_ctb_despachar('compra', new.id, 'contabilizar');
      end if;
    when 'recepciones_metal' then
      if new.estado = 'confirmada' and (v_insert or old.estado is distinct from 'confirmada') then
        perform public.fn_ctb_despachar('metal', new.id, 'contabilizar');
      end if;
    when 'liquidaciones' then
      if new.estado in ('aprobada', 'pagada') and (v_insert or old.estado = 'calculada') then
        perform public.fn_ctb_despachar('liquidacion', new.id, 'contabilizar');
      end if;
    when 'canjes_premios' then
      if new.estado = 'entregado' and (v_insert or old.estado is distinct from 'entregado') then
        perform public.fn_ctb_despachar('canje', new.id, 'contabilizar');
      end if;
    when 'cuentas_bancarias' then
      if v_insert and coalesce(new.saldo_inicial, 0) <> 0 then
        perform public.fn_ctb_despachar('saldo_banco', new.id, 'contabilizar');
      end if;
  end case;
  return null;
end;
$$;

revoke all on function public.fn_trg_contabilizar() from public, anon, authenticated;

create constraint trigger trg_ctb_ventas after insert or update of estado on public.ventas
  deferrable initially deferred for each row execute function public.fn_trg_contabilizar();
create constraint trigger trg_ctb_pagos after insert or update of estado on public.pagos
  deferrable initially deferred for each row execute function public.fn_trg_contabilizar();
create constraint trigger trg_ctb_movimientos_bolsa after insert on public.movimientos_bolsa
  deferrable initially deferred for each row execute function public.fn_trg_contabilizar();
create constraint trigger trg_ctb_gastos after insert or update of anulado on public.gastos
  deferrable initially deferred for each row execute function public.fn_trg_contabilizar();
create constraint trigger trg_ctb_movimientos_banco after insert or update of anulado on public.movimientos_banco
  deferrable initially deferred for each row execute function public.fn_trg_contabilizar();
create constraint trigger trg_ctb_ordenes_compra after insert or update of estado on public.ordenes_compra
  deferrable initially deferred for each row execute function public.fn_trg_contabilizar();
create constraint trigger trg_ctb_recepciones_metal after update of estado on public.recepciones_metal
  deferrable initially deferred for each row execute function public.fn_trg_contabilizar();
create constraint trigger trg_ctb_liquidaciones after insert or update of estado on public.liquidaciones
  deferrable initially deferred for each row execute function public.fn_trg_contabilizar();
create constraint trigger trg_ctb_canjes_premios after update of estado on public.canjes_premios
  deferrable initially deferred for each row execute function public.fn_trg_contabilizar();
create constraint trigger trg_ctb_cuentas_bancarias after insert on public.cuentas_bancarias
  deferrable initially deferred for each row execute function public.fn_trg_contabilizar();

-- Verificación
select count(*) as triggers_contables from pg_trigger where tgname like 'trg_ctb_%';
