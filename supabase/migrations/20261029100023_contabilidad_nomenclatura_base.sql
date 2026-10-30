-- ============================================================
-- ASTRO — Nomenclatura contable base y centros de costo iniciales.
--
-- Máscara 9.99.99.999 (ej. 1.01.01.001). Las cuentas de 4 niveles son de
-- Detalle (reciben partidas); las demás son Madre (acumulan). Todo es
-- editable desde Contabilidad → Nomenclatura; el contador puede agregar,
-- renombrar o desactivar cuentas. Las cuentas de Bancos (1.01.02.xxx) se
-- crean en la fase 2, una por cada cuenta bancaria registrada.
-- Requiere la migración 022.
-- ============================================================

do $$
declare
  r record;
  v_tipo text;
begin
  for r in
    select * from (values
      -- codigo, nombre, naturaleza (null = la del tipo)
      ('1', 'Activo', null),
      ('1.01', 'Activo corriente', null),
      ('1.01.01', 'Caja y efectivo', null),
      ('1.01.01.001', 'Caja general', null),
      ('1.01.01.002', 'Caja chica', null),
      ('1.01.02', 'Bancos', null),
      ('1.01.03', 'Fondos en tránsito', null),
      ('1.01.03.001', 'Cobros por depositar', null),
      ('1.01.03.002', 'Tarjetas y pasarelas por liquidar', null),
      ('1.01.03.003', 'Transferencias entre cuentas en tránsito', null),
      ('1.01.04', 'Cuentas por cobrar', null),
      ('1.01.04.001', 'Clientes', null),
      ('1.01.04.002', 'Clientes mayoristas', null),
      ('1.01.04.003', 'Deudores diversos', null),
      ('1.01.04.004', 'Anticipos a proveedores', null),
      ('1.01.05', 'Impuestos por recuperar', null),
      ('1.01.05.001', 'IVA crédito fiscal', null),
      ('1.01.05.002', 'Retenciones de IVA a favor', null),
      ('1.01.05.003', 'ISR pagado por anticipado', null),
      ('1.01.06', 'Inventarios', null),
      ('1.01.06.001', 'Inventario de mercadería (joyería)', null),
      ('1.01.06.002', 'Inventario de metales', null),
      ('1.01.06.003', 'Inventario de premios e incentivos', null),
      ('1.01.06.004', 'Mercadería en tránsito', null),
      ('1.01.06.005', 'Empaques y suministros', null),
      ('1.01.07', 'Gastos pagados por anticipado', null),
      ('1.01.07.001', 'Seguros pagados por anticipado', null),
      ('1.01.07.002', 'Alquileres pagados por anticipado', null),
      ('1.02', 'Activo no corriente', null),
      ('1.02.01', 'Propiedad, planta y equipo', null),
      ('1.02.01.001', 'Mobiliario y equipo', null),
      ('1.02.01.002', 'Equipo de cómputo', null),
      ('1.02.01.003', 'Vehículos', null),
      ('1.02.01.004', 'Herramientas y equipo de taller', null),
      ('1.02.01.005', 'Mejoras a locales arrendados', null),
      ('1.02.02', 'Depreciación acumulada', 'acreedora'),
      ('1.02.02.001', 'Depreciación acumulada de mobiliario y equipo', 'acreedora'),
      ('1.02.02.002', 'Depreciación acumulada de equipo de cómputo', 'acreedora'),
      ('1.02.02.003', 'Depreciación acumulada de vehículos', 'acreedora'),
      ('1.02.02.004', 'Depreciación acumulada de herramientas', 'acreedora'),
      ('1.02.02.005', 'Amortización acumulada de mejoras', 'acreedora'),
      ('1.02.03', 'Intangibles y otros activos', null),
      ('1.02.03.001', 'Software y licencias', null),
      ('1.02.03.002', 'Depósitos en garantía', null),

      ('2', 'Pasivo', null),
      ('2.01', 'Pasivo corriente', null),
      ('2.01.01', 'Proveedores', null),
      ('2.01.01.001', 'Proveedores locales', null),
      ('2.01.01.002', 'Proveedores del exterior', null),
      ('2.01.02', 'Acreedores', null),
      ('2.01.02.001', 'Acreedores por gastos', null),
      ('2.01.02.002', 'Acreedores diversos', null),
      ('2.01.03', 'Obligaciones con la red', null),
      ('2.01.03.001', 'Billetera ASTRO (saldo de embajadores)', null),
      ('2.01.03.002', 'Comisiones de red por pagar', null),
      ('2.01.04', 'Anticipos de clientes', null),
      ('2.01.04.001', 'Anticipos de clientes', null),
      ('2.01.05', 'Impuestos por pagar', null),
      ('2.01.05.001', 'IVA débito fiscal', null),
      ('2.01.05.002', 'Impuesto Pequeño Contribuyente por pagar', null),
      ('2.01.05.003', 'ISR por pagar', null),
      ('2.01.05.004', 'Retenciones por pagar', null),
      ('2.01.06', 'Obligaciones laborales', null),
      ('2.01.06.001', 'Sueldos por pagar', null),
      ('2.01.06.002', 'Cuotas IGSS por pagar', null),
      ('2.01.06.003', 'Provisión de indemnizaciones', null),
      ('2.01.06.004', 'Provisión de aguinaldo', null),
      ('2.01.06.005', 'Provisión de bono 14', null),
      ('2.01.06.006', 'Provisión de vacaciones', null),
      ('2.01.07', 'Préstamos a corto plazo', null),
      ('2.01.07.001', 'Préstamos bancarios a corto plazo', null),
      ('2.02', 'Pasivo no corriente', null),
      ('2.02.01', 'Préstamos a largo plazo', null),
      ('2.02.01.001', 'Préstamos bancarios a largo plazo', null),

      ('3', 'Patrimonio', null),
      ('3.01', 'Capital', null),
      ('3.01.01', 'Capital', null),
      ('3.01.01.001', 'Capital aportado', null),
      ('3.02', 'Reservas', null),
      ('3.02.01', 'Reservas', null),
      ('3.02.01.001', 'Reserva legal', null),
      ('3.03', 'Resultados', null),
      ('3.03.01', 'Resultados', null),
      ('3.03.01.001', 'Utilidades acumuladas', null),
      ('3.03.01.002', 'Pérdidas acumuladas', 'deudora'),
      ('3.03.01.003', 'Resultado del ejercicio', null),
      ('3.03.01.004', 'Ajustes de apertura', null),

      ('4', 'Ingresos', null),
      ('4.01', 'Ingresos de operación', null),
      ('4.01.01', 'Ventas', null),
      ('4.01.01.001', 'Ventas de joyería', null),
      ('4.01.01.002', 'Ventas a mayoristas', null),
      ('4.01.01.003', 'Ingresos por envío', null),
      ('4.01.02', 'Rebajas sobre ventas', 'deudora'),
      ('4.01.02.001', 'Descuentos sobre ventas', 'deudora'),
      ('4.01.02.002', 'Devoluciones sobre ventas', 'deudora'),
      ('4.02', 'Otros ingresos', null),
      ('4.02.01', 'Otros ingresos', null),
      ('4.02.01.001', 'Ingresos financieros', null),
      ('4.02.01.002', 'Otros ingresos', null),
      ('4.02.01.003', 'Sobrantes de inventario', null),

      ('5', 'Costos', null),
      ('5.01', 'Costo de ventas', null),
      ('5.01.01', 'Costo de ventas', null),
      ('5.01.01.001', 'Costo de ventas de joyería', null),
      ('5.01.01.002', 'Mermas y faltantes de inventario', null),
      ('5.01.01.003', 'Costo de envíos', null),

      ('6', 'Gastos', null),
      ('6.01', 'Gastos de operación', null),
      ('6.01.01', 'Gastos de personal', null),
      ('6.01.01.001', 'Sueldos y salarios', null),
      ('6.01.01.002', 'Cuotas patronales IGSS', null),
      ('6.01.01.003', 'Prestaciones laborales', null),
      ('6.01.02', 'Gastos generales', null),
      ('6.01.02.001', 'Alquiler', null),
      ('6.01.02.002', 'Servicios básicos (luz, agua, internet)', null),
      ('6.01.02.003', 'Tecnología y software', null),
      ('6.01.02.004', 'Mantenimiento', null),
      ('6.01.02.005', 'Oficina y papelería', null),
      ('6.01.02.006', 'Impuestos y tasas', null),
      ('6.01.02.007', 'Honorarios profesionales', null),
      ('6.01.02.008', 'Viáticos', null),
      ('6.01.02.009', 'Impuesto Pequeño Contribuyente', null),
      ('6.01.02.010', 'Otros gastos', null),
      ('6.01.03', 'Gastos de venta y red', null),
      ('6.01.03.001', 'Marketing y publicidad', null),
      ('6.01.03.002', 'Envíos y logística', null),
      ('6.01.03.003', 'Comisiones de red', null),
      ('6.01.03.004', 'Comisiones de embajadores (Billetera)', null),
      ('6.01.03.005', 'Premios e incentivos', null),
      ('6.01.04', 'Depreciaciones y amortizaciones', null),
      ('6.01.04.001', 'Depreciación de mobiliario y equipo', null),
      ('6.01.04.002', 'Depreciación de equipo de cómputo', null),
      ('6.01.04.003', 'Depreciación de vehículos', null),
      ('6.01.04.004', 'Depreciación de herramientas', null),
      ('6.01.04.005', 'Amortización de mejoras y software', null),
      ('6.02', 'Gastos financieros', null),
      ('6.02.01', 'Gastos financieros', null),
      ('6.02.01.001', 'Comisiones bancarias', null),
      ('6.02.01.002', 'Intereses', null),
      ('6.02.01.003', 'Diferencial cambiario', null)
    ) as t(codigo, nombre, naturaleza)
    order by string_to_array(codigo, '.')::int[]
  loop
    v_tipo := case left(r.codigo, 1)
      when '1' then 'activo' when '2' then 'pasivo' when '3' then 'patrimonio'
      when '4' then 'ingreso' when '5' then 'costo' else 'gasto' end;
    insert into public.cuentas_contables (codigo, nombre, tipo, naturaleza, es_detalle)
    values (
      r.codigo, r.nombre, v_tipo,
      coalesce(r.naturaleza, case when v_tipo in ('activo', 'costo', 'gasto') then 'deudora' else 'acreedora' end),
      array_length(string_to_array(r.codigo, '.'), 1) = 4
    )
    on conflict (codigo) do nothing;
  end loop;
end $$;

insert into public.centros_costo (codigo, nombre, descripcion) values
  ('CC-ADM', 'Administración', 'Gerencia, contabilidad, oficina y gastos generales'),
  ('CC-VTA', 'Ventas en tienda', 'Ventas directas y punto de venta'),
  ('CC-RED', 'Red de embajadores', 'Ventas por embajadores y links, comisiones, Billetera y premios'),
  ('CC-MAY', 'Mayoristas', 'Ventas y atención a clientes mayoristas'),
  ('CC-LOG', 'Logística', 'Envíos, bodegas y traslados'),
  ('CC-MKT', 'Marketing', 'Publicidad, catálogo y campañas'),
  ('CC-PRD', 'Producción y taller', 'Fabricación, metales y taller')
on conflict (codigo) do nothing;

-- Verificación
select
  (select count(*) from public.cuentas_contables) as cuentas,
  (select count(*) from public.cuentas_contables where es_detalle) as cuentas_detalle,
  (select count(*) from public.centros_costo) as centros_costo;
