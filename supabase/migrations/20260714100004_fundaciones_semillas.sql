-- ============================================================
-- ARIGA — Migración 0004: datos semilla de fundaciones
-- (Se incluyen en migración, no en seed.sql, porque son datos
-- de producción requeridos para operar.)
-- ============================================================

-- Roles del sistema
insert into public.roles (nombre, descripcion) values
  ('admin',        'Gerencia General / Administración: acceso total y panel de configuración'),
  ('coordinador',  'Coordinación Comercial: visión completa de la red, metas y campañas'),
  ('supervisor',   'Supervisor: gestiona su equipo de asesores y la red descendiente'),
  ('asesor',       'Asesor de venta (personal ARIGA): ventas propias y red de embajadores'),
  ('embajador',    'Embajador externo: venta por catálogo, solo ve su propia información'),
  ('tienda',       'Tienda/bodega: ventas de mostrador, inventario y transferencias'),
  ('produccion',   'Producción: alta de piezas y alimentación del CEDI'),
  ('contabilidad', 'Contabilidad: comprobantes, facturación y conciliación');

-- Moneda y país iniciales
insert into public.monedas (codigo, nombre, simbolo) values
  ('MXN', 'Peso mexicano', '$');

insert into public.paises (nombre, codigo, moneda_id, configuracion_fiscal) values
  ('México', 'MX',
   (select id from public.monedas where codigo = 'MXN'),
   '{"facturacion": "SAT", "estado_integracion": "pendiente"}'::jsonb);

-- CEDI: inventario central (única fuente de verdad del stock)
insert into public.tiendas (nombre, tipo, pais_id) values
  ('CEDI Central', 'cedi', (select id from public.paises where codigo = 'MX'));

-- Parámetros operativos por defecto (editables desde el panel admin)
insert into public.parametros (clave, valor, tipo_dato, descripcion, modulo) values
  ('horas_separado', '48', 'numero',
   'Horas máximas de un separado antes de liberarse automáticamente', 'separados'),
  ('horas_aviso_vencimiento_separado', '6', 'numero',
   'Horas antes del vencimiento del separado para notificar al vendedor', 'separados'),
  ('porcentaje_minimo_abono', '20', 'numero',
   '% mínimo de abono para mantener un separado extendido', 'separados'),
  ('minutos_retencion_carrito', '20', 'numero',
   'Minutos de retención de una pieza agregada al carrito por link', 'carrito'),
  ('dias_vigencia_link', '7', 'numero',
   'Días de vigencia de un link de catálogo/carrito', 'links'),
  ('politica_piezas_transito', 'oculto', 'texto',
   'Visibilidad de piezas en tránsito en catálogo: oculto | proximamente', 'inventario'),
  ('periodo_ranking', 'mensual', 'texto',
   'Ciclo de reinicio de ranking y contadores: mensual | campana', 'incentivos');

-- Matriz base de permisos (se ampliará por módulo en cada fase;
-- la asignación rol × permiso se gestiona desde el panel admin)
insert into public.permisos (modulo, accion, descripcion) values
  ('usuarios',      'ver',     'Consultar usuarios y jerarquía'),
  ('usuarios',      'crear',   'Crear e invitar usuarios'),
  ('usuarios',      'editar',  'Editar usuarios y mover jerarquía'),
  ('tiendas',       'ver',     'Consultar tiendas y bodegas'),
  ('tiendas',       'editar',  'Crear y editar tiendas'),
  ('parametros',    'editar',  'Modificar parámetros operativos'),
  ('inventario',    'ver',     'Consultar inventario'),
  ('inventario',    'ajustar', 'Ajustes de inventario (requiere aprobación)'),
  ('catalogo',      'ver',     'Consultar catálogo'),
  ('separados',     'crear',   'Separar piezas'),
  ('ventas',        'crear',   'Registrar ventas'),
  ('ventas',        'anular',  'Anular ventas (requiere aprobación)'),
  ('comprobantes',  'aprobar', 'Aprobar o rechazar comprobantes de pago'),
  ('finanzas',      'ver',     'Consultar módulo financiero'),
  ('academia',      'editar',  'Administrar cursos y contenidos'),
  ('incentivos',    'editar',  'Configurar reglas de puntos, comisiones y premios');
