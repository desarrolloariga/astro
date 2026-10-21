-- ============================================================
-- ASTRO — Billetera ASTRO: máximo 95% de la compra.
--
-- Al comprar "para mí" con la Billetera, se puede usar como máximo el
-- 95% del total; el resto (al menos 5%) siempre se paga con
-- transferencia o depósito + comprobante, que pasa por contabilidad.
-- Con esto ya no existen compras pagadas 100% con Billetera.
--
-- El % queda en el parámetro pct_max_billetera (editable en
-- Parámetros) para no tocar código si cambia.
-- ============================================================

insert into public.parametros (clave, valor, tipo_dato, descripcion, modulo)
values ('pct_max_billetera', '95', 'numero',
        'Porcentaje máximo de una compra que el embajador puede pagar con su Billetera ASTRO (el resto, con dinero)',
        'ventas')
on conflict (clave) do nothing;

-- fn_confirmar_carrito_interno: misma firma; solo cambia el tope de la Billetera.
do $$
declare
  v_firma constant text := 'public.fn_confirmar_carrito_interno(bigint,bigint,text,bigint,bigint,jsonb,jsonb,jsonb,boolean,boolean)';
  v_def text;
  v_nueva text;
begin
  v_def := pg_get_functiondef(v_firma::regprocedure);
  v_nueva := replace(v_def,
    'v_bolsa := least(greatest(public.fn_saldo_bolsa(p_comprador_id), 0), v_total);',
    'v_bolsa := least(greatest(public.fn_saldo_bolsa(p_comprador_id), 0),
                    round(v_total * least(greatest(coalesce(public.fn_parametro(''pct_max_billetera'')::numeric, 95), 0), 100) / 100, 2));');
  if v_nueva = v_def then
    raise exception 'No se encontró la línea del tope de Billetera en fn_confirmar_carrito_interno — no se aplicó el cambio';
  end if;
  execute v_nueva;
end $$;

-- Verificación: debe mostrar 1 fila (la función ya usa el parámetro).
select p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_confirmar_carrito_interno'
  and p.prosrc like '%pct_max_billetera%';
