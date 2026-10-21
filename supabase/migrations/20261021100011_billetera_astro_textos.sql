-- ============================================================
-- ASTRO — La "bolsa" del embajador ahora se llama "Billetera ASTRO".
--
-- Solo cambian los TEXTOS que ve la gente (notificaciones, historial
-- del pedido, referencia del pago, movimientos y un mensaje de error).
-- Los nombres técnicos (tabla movimientos_bolsa, método de pago 'bolsa',
-- funciones fn_*_bolsa) se mantienen para no romper nada.
--
-- Para no copiar funciones largas, se toma la definición vigente de
-- cada función (pg_get_functiondef), se reemplazan solo las frases y se
-- vuelve a crear con CREATE OR REPLACE (misma firma: conserva permisos).
-- ============================================================

do $$
declare
  r record;
  v_def text;
  v_nueva text;
  v_par text[];
begin
  for r in
    select * from (values
      ('public.fn_confirmar_carrito_interno(bigint,bigint,text,bigint,bigint,jsonb,jsonb,jsonb,boolean,boolean)'),
      ('public.fn_abonar_bolsa(bigint)'),
      ('public.fn_banco_registrar_cobro(bigint,bigint,date)')
    ) as f(firma)
  loop
    v_def := pg_get_functiondef(r.firma::regprocedure);
    v_nueva := v_def;
    foreach v_par slice 1 in array array[
      ['''Saldo de bolsa''', '''Billetera ASTRO'''],
      [''' pagada con bolsa''', ''' pagada con Billetera ASTRO'''],
      ['''Pagado con bolsa — sin aprobación de pago''', '''Pagado con Billetera ASTRO — sin aprobación de pago'''],
      [''' se pagó con bolsa — listo para preparar y enviar.''', ''' se pagó con Billetera ASTRO — listo para preparar y enviar.'''],
      ['''Se registró un pedido pagado con bolsa — pasa directo a despacho.''', '''Se registró un pedido pagado con Billetera ASTRO — pasa directo a despacho.'''],
      ['''Sumaste a tu bolsa''', '''Sumaste a tu Billetera ASTRO'''],
      [''' a tu bolsa.''', ''' a tu Billetera ASTRO.'''],
      ['''Un pago con bolsa no mueve dinero: no se registra en bancos''', '''Un pago con Billetera ASTRO no mueve dinero: no se registra en bancos''']
    ]
    loop
      v_nueva := replace(v_nueva, v_par[1], v_par[2]);
    end loop;
    if v_nueva <> v_def then
      execute v_nueva;
      raise notice 'Actualizada: %', r.firma;
    end if;
  end loop;
end $$;

-- Textos ya guardados (cosméticos).
update public.pagos set referencia = 'Billetera ASTRO' where metodo = 'bolsa' and referencia = 'Saldo de bolsa';
update public.movimientos_bolsa set comentario = replace(comentario, 'pagada con bolsa', 'pagada con Billetera ASTRO')
  where comentario like '%pagada con bolsa%';
update public.pedido_eventos set comentario = 'Pagado con Billetera ASTRO — sin aprobación de pago'
  where comentario = 'Pagado con bolsa — sin aprobación de pago';
update public.notificaciones
  set titulo = replace(titulo, 'tu bolsa', 'tu Billetera ASTRO'),
      mensaje = replace(replace(replace(mensaje, 'a tu bolsa', 'a tu Billetera ASTRO'), 'pagó con bolsa', 'pagó con Billetera ASTRO'),
                        'pagado con bolsa', 'pagado con Billetera ASTRO')
  where titulo like '%bolsa%' or mensaje like '%bolsa%';

-- Verificación: no debe quedar la frase vieja en estas funciones (0 filas).
select p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('fn_confirmar_carrito_interno', 'fn_abonar_bolsa', 'fn_banco_registrar_cobro')
  and (p.prosrc like '%''Saldo de bolsa''%' or p.prosrc like '%pagada con bolsa''%' or p.prosrc like '%pagado con bolsa —%'
       or p.prosrc like '%se pagó con bolsa%' or p.prosrc like '%Sumaste a tu bolsa%' or p.prosrc like '%Un pago con bolsa%');
