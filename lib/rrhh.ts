/** Catálogos y utilidades del módulo de Recursos Humanos. */

export const DEPARTAMENTOS_GT = [
  'Alta Verapaz', 'Baja Verapaz', 'Chimaltenango', 'Chiquimula', 'El Progreso', 'Escuintla', 'Guatemala', 'Huehuetenango',
  'Izabal', 'Jalapa', 'Jutiapa', 'Petén', 'Quetzaltenango', 'Quiché', 'Retalhuleu', 'Sacatepéquez', 'San Marcos',
  'Santa Rosa', 'Sololá', 'Suchitepéquez', 'Totonicapán', 'Zacapa',
]

export const GENEROS: Record<string, string> = { masculino: 'Masculino', femenino: 'Femenino', otro: 'Otro' }
export const ESTADOS_CIVILES: Record<string, string> = {
  soltero: 'Soltero(a)',
  casado: 'Casado(a)',
  unido: 'Unido(a)',
  divorciado: 'Divorciado(a)',
  viudo: 'Viudo(a)',
}
export const LICENCIAS: Record<string, string> = { A: 'Tipo A', B: 'Tipo B', C: 'Tipo C', M: 'Tipo M (moto)', E: 'Tipo E (maquinaria)' }
export const TIPOS_CONTRATO: Record<string, string> = {
  indefinido: 'Por tiempo indefinido',
  plazo_fijo: 'A plazo fijo',
  por_obra: 'Por obra determinada',
  servicios: 'Servicios profesionales (no laboral)',
}
export const JORNADAS: Record<string, string> = {
  diurna: 'Diurna (8 h diarias / 44 semanales)',
  mixta: 'Mixta (7 h diarias / 42 semanales)',
  nocturna: 'Nocturna (6 h diarias / 36 semanales)',
}
export const MODALIDADES: Record<string, string> = { presencial: 'Presencial', remoto: 'Remoto', hibrido: 'Híbrido' }
export const ESTADOS_COLABORADOR: Record<string, { etiqueta: string; clase: string }> = {
  activo: { etiqueta: 'Activo', clase: 'bg-primary/10 text-primary' },
  periodo_prueba: { etiqueta: 'Período de prueba', clase: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  suspendido: { etiqueta: 'Suspendido', clase: 'bg-destructive/10 text-destructive' },
  baja: { etiqueta: 'Baja', clase: 'bg-muted text-muted-foreground' },
}
export const TIPOS_PLANILLA: Record<string, string> = { contrato: 'Planilla por contrato laboral', servicios: 'Planilla por otros pagos (servicios)' }
export const TIPOS_SALARIO: Record<string, string> = { mensual: 'Mensual', por_dia: 'Por día', por_hora: 'Por hora', por_servicio: 'Por servicio' }
export const FORMAS_PAGO: Record<string, string> = { transferencia: 'Transferencia', cheque: 'Cheque', efectivo: 'Efectivo' }
export const TIPOS_DEDUCCION: Record<string, string> = {
  prestamo: 'Préstamo',
  anticipo: 'Anticipo de salario',
  embargo: 'Embargo judicial',
  cuota: 'Cuota (asociación, seguro…)',
  otro: 'Otro',
}
export const ETAPAS_DOCUMENTO: Record<string, string> = {
  inicio: 'Al inicio de la relación laboral',
  durante: 'Durante la relación laboral',
  finalizacion: 'Finalización de la relación laboral',
}

export const TIPOS_MOVIMIENTO: Record<string, string> = {
  ascenso: 'Ascenso',
  cambio_puesto: 'Cambio de puesto',
  traslado: 'Traslado',
  cambio_jefe: 'Cambio de jefe inmediato',
  cambio_contrato: 'Cambio de contrato',
  cambio_estado: 'Cambio de estado',
  otro: 'Otro (nota en el historial)',
}
export const CATEGORIAS_AUSENCIA: Record<string, string> = {
  vacaciones: 'Vacaciones',
  permiso: 'Permisos',
  licencia: 'Licencias',
  falta: 'Faltas y suspensiones',
}
export const ESTADOS_AUSENCIA: Record<string, { etiqueta: string; clase: string }> = {
  solicitada: { etiqueta: 'Por autorizar', clase: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  aprobada: { etiqueta: 'Aprobada', clase: 'bg-primary/10 text-primary' },
  rechazada: { etiqueta: 'Rechazada', clase: 'bg-destructive/10 text-destructive' },
  cancelada: { etiqueta: 'Cancelada', clase: 'bg-muted text-muted-foreground' },
}
export const SABADO_LABORAL: Record<string, string> = { no: 'No se trabaja', medio: 'Medio día', completo: 'Día completo' }
export const CATEGORIAS_ASIGNACION: Record<string, string> = {
  uniforme: 'Uniforme',
  computadora: 'Computadora',
  telefono: 'Teléfono',
  papeleria: 'Papelería',
  herramienta: 'Herramienta',
  vehiculo: 'Vehículo',
  otro: 'Otro',
}
export const ESTADOS_ASIGNACION: Record<string, { etiqueta: string; clase: string }> = {
  asignado: { etiqueta: 'Asignado', clase: 'bg-primary/10 text-primary' },
  devuelto: { etiqueta: 'Devuelto', clase: 'bg-muted text-muted-foreground' },
  extraviado: { etiqueta: 'Extraviado', clase: 'bg-destructive/10 text-destructive' },
  danado: { etiqueta: 'Dañado', clase: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
}

/** Días con un decimal solo si hace falta: 15, 10.5, 7.19 */
export const dias = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0)
  return Number.isInteger(v) ? String(v) : v.toFixed(Math.abs(v * 10 - Math.round(v * 10)) < 1e-9 ? 1 : 2)
}

export const ESTADOS_PLANILLA: Record<string, { etiqueta: string; clase: string }> = {
  borrador: { etiqueta: 'Borrador', clase: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  aprobada: { etiqueta: 'Aprobada · por pagar', clase: 'bg-primary/10 text-primary' },
  pagada: { etiqueta: 'Pagada', clase: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  anulada: { etiqueta: 'Anulada', clase: 'bg-muted text-muted-foreground line-through' },
}
export const MESES_NOMBRE = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
/** "1.ª quincena de noviembre 2026", "Aguinaldo 2026 (1 dic 2025 – 30 nov 2026)" */
export const periodoPlanilla = (p: { anio: number; mes: number; quincena: number; tipo?: string }) =>
  p.tipo === 'aguinaldo'
    ? `Aguinaldo ${p.anio} (1 dic ${p.anio - 1} – 30 nov ${p.anio})`
    : p.tipo === 'bono14'
      ? `Bono 14 ${p.anio} (1 jul ${p.anio - 1} – 30 jun ${p.anio})`
      : `${p.quincena === 1 ? '1.ª' : '2.ª'} quincena de ${MESES_NOMBRE[p.mes - 1]} ${p.anio}`

/** Tipos de planilla que se generan (las de colaborador son contrato y servicios). */
export const TIPOS_PLANILLA_GENERAR: Record<string, string> = {
  contrato: 'Quincenal por contrato laboral',
  servicios: 'Quincenal por otros pagos (servicios)',
  aguinaldo: 'Aguinaldo (diciembre)',
  bono14: 'Bono 14 (julio)',
}
export const NOMBRE_TIPO_PLANILLA: Record<string, string> = {
  contrato: 'Planilla por contrato laboral',
  servicios: 'Planilla por otros pagos (servicios)',
  aguinaldo: 'Planilla de aguinaldo',
  bono14: 'Planilla de bono 14',
}

export const TIPOS_FINALIZACION: Record<string, string> = {
  renuncia: 'Renuncia',
  despido_justificado: 'Despido con causa justificada',
  despido_injustificado: 'Despido sin causa justificada',
  mutuo_acuerdo: 'Mutuo acuerdo',
  fin_contrato: 'Fin de contrato o de obra',
  abandono: 'Abandono de labores',
  fallecimiento: 'Fallecimiento',
  jubilacion: 'Jubilación',
  otro: 'Otro',
}
/** Consulta de una finalización con colaborador, deducciones aplicadas y responsables. */
export const SELECT_FINALIZACION = `*,
  colaborador:colaborador_id ( codigo, nombres, apellidos, dpi, puesto:puesto_id ( nombre ), departamento:departamento_id ( nombre ) ),
  aplicadas:rrhh_finalizacion_deducciones ( monto, deduccion:deduccion_id ( descripcion, tipo ) ),
  aprobado:aprobado_por ( nombre ), pagado:pagado_por ( nombre ), cuenta:cuenta_bancaria_id ( nombre )`

export const ESTADOS_FINALIZACION: Record<string, { etiqueta: string; clase: string }> = {
  borrador: { etiqueta: 'Liquidación en borrador', clase: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  aprobada: { etiqueta: 'Aprobada · por pagar', clase: 'bg-primary/10 text-primary' },
  pagada: { etiqueta: 'Liquidación pagada', clase: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  anulada: { etiqueta: 'Anulada', clase: 'bg-muted text-muted-foreground line-through' },
}

export const BANCOS_GT = ['Banco Industrial', 'Banrural', 'BAC Credomatic', 'G&T Continental', 'Banco Promerica', 'Bantrab', 'Banco Agromercantil (BAM)', 'Banco Internacional', 'Banco Ficohsa', 'Vivibanco', 'Otro']

/** Edad en años cumplidos a hoy. */
export function edad(fechaNacimiento: string | null): number | null {
  if (!fechaNacimiento) return null
  const [a, m, d] = fechaNacimiento.split('-').map(Number)
  const hoy = new Date()
  let e = hoy.getFullYear() - a
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) e--
  return e
}

/** Antigüedad legible: "2 años y 3 meses". */
export function antiguedad(fechaIngreso: string | null, hasta?: string | null): string | null {
  if (!fechaIngreso) return null
  const [a, m, d] = fechaIngreso.split('-').map(Number)
  const fin = hasta ? new Date(`${hasta}T12:00:00`) : new Date()
  let meses = (fin.getFullYear() - a) * 12 + (fin.getMonth() + 1 - m)
  if (fin.getDate() < d) meses--
  if (meses < 0) return 'Aún no ingresa'
  const anios = Math.floor(meses / 12)
  const resto = meses % 12
  const partes = [anios ? `${anios} año${anios === 1 ? '' : 's'}` : '', resto ? `${resto} mes${resto === 1 ? '' : 'es'}` : '']
  return partes.filter(Boolean).join(' y ') || 'Menos de un mes'
}

export type Colaborador = {
  id: number
  codigo: string
  usuario_id: number | null
  foto_url: string | null
  nombres: string
  apellidos: string
  dpi: string | null
  dpi_lugar_emision: string | null
  nit: string | null
  fecha_nacimiento: string | null
  genero: string | null
  estado_civil: string | null
  hijos: number | null
  nacionalidad: string | null
  direccion: string | null
  departamento_geo: string | null
  municipio: string | null
  telefono: string | null
  licencia_tipo: string | null
  licencia_numero: string | null
  licencia_vence: string | null
  correo_personal: string | null
  titulo_estudios: string | null
  emergencia_nombre: string | null
  emergencia_telefono: string | null
  emergencia_parentesco: string | null
  afiliacion_igss: string | null
  fecha_ingreso: string | null
  departamento_id: number | null
  area_id: number | null
  puesto_id: number | null
  jefe_id: number | null
  tienda_id: number | null
  area_trabajo: string | null
  tipo_contrato: string | null
  jornada: string | null
  horario: string | null
  modalidad: string | null
  estado: string
  fin_periodo_prueba: string | null
  tipo_planilla: string
  centro_costo_id: number | null
  fecha_baja: string | null
  notas: string | null
  talla_camisa: string | null
  talla_pantalon: string | null
  talla_calzado: string | null
}

export const fechaCorta = (f: string | null | undefined) => (f ? f.split('-').reverse().join('/') : '—')
export const nombreCompleto = (c: { nombres: string; apellidos: string }) => `${c.nombres} ${c.apellidos}`
