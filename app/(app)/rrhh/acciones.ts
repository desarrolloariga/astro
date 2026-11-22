'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tienePermiso } from '@/lib/permisos'

const BUCKET = 'astro-rrhh'
const MAX_BYTES = 9 * 1024 * 1024
const txt = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const nulo = (f: FormData, k: string) => txt(f, k) || null
const num = (f: FormData, k: string) => {
  const t = txt(f, k).replace(/,/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function volver(destino: string, clave: 'ok' | 'error', mensaje: string): never {
  redirect(`${destino}${destino.includes('?') ? '&' : '?'}${clave}=${encodeURIComponent(mensaje)}`)
}

async function subir(archivo: FormDataEntryValue | null, carpeta: string, soloImagen = false): Promise<string | null> {
  if (!(archivo instanceof File) || archivo.size === 0) return null
  if (archivo.size > MAX_BYTES) throw new Error('El archivo supera 9 MB')
  if (!archivo.type.startsWith('image/') && (soloImagen || archivo.type !== 'application/pdf')) {
    throw new Error(soloImagen ? 'La fotografía debe ser una imagen' : 'El documento debe ser PDF o imagen')
  }
  const ext = archivo.name.split('.').pop()?.toLowerCase() || (archivo.type === 'application/pdf' ? 'pdf' : 'jpg')
  const ruta = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await createAdminClient().storage.from(BUCKET).upload(ruta, archivo, { contentType: archivo.type })
  if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`)
  return ruta
}

/** Crea o actualiza el expediente (datos personales e información de ingreso). */
export async function guardarColaborador(formData: FormData) {
  if (!(await tienePermiso('rrhh', 'editar'))) volver('/rrhh', 'error', 'No tienes permiso para editar expedientes')
  const id = Number(txt(formData, 'id')) || null
  const destinoError = id ? `/rrhh/${id}/editar` : '/rrhh/nuevo'
  if (!txt(formData, 'nombres') || !txt(formData, 'apellidos')) volver(destinoError, 'error', 'Nombres y apellidos son obligatorios')
  const dpi = txt(formData, 'dpi').replace(/\s/g, '')
  if (dpi && !/^\d{13}$/.test(dpi)) volver(destinoError, 'error', 'El DPI debe tener 13 dígitos')

  let foto: string | null = null
  try {
    foto = await subir(formData.get('foto'), 'fotos', true)
  } catch (e) {
    volver(destinoError, 'error', (e as Error).message)
  }

  const fila = {
    nombres: txt(formData, 'nombres'),
    apellidos: txt(formData, 'apellidos'),
    dpi: dpi || null,
    dpi_lugar_emision: nulo(formData, 'dpi_lugar_emision'),
    nit: nulo(formData, 'nit'),
    fecha_nacimiento: nulo(formData, 'fecha_nacimiento'),
    genero: nulo(formData, 'genero'),
    estado_civil: nulo(formData, 'estado_civil'),
    hijos: num(formData, 'hijos'),
    nacionalidad: nulo(formData, 'nacionalidad'),
    direccion: nulo(formData, 'direccion'),
    departamento_geo: nulo(formData, 'departamento_geo'),
    municipio: nulo(formData, 'municipio'),
    telefono: nulo(formData, 'telefono'),
    licencia_tipo: nulo(formData, 'licencia_tipo'),
    licencia_numero: nulo(formData, 'licencia_numero'),
    licencia_vence: nulo(formData, 'licencia_vence'),
    correo_personal: nulo(formData, 'correo_personal'),
    titulo_estudios: nulo(formData, 'titulo_estudios'),
    emergencia_nombre: nulo(formData, 'emergencia_nombre'),
    emergencia_telefono: nulo(formData, 'emergencia_telefono'),
    emergencia_parentesco: nulo(formData, 'emergencia_parentesco'),
    afiliacion_igss: nulo(formData, 'afiliacion_igss'),
    talla_camisa: nulo(formData, 'talla_camisa'),
    talla_pantalon: nulo(formData, 'talla_pantalon'),
    talla_calzado: nulo(formData, 'talla_calzado'),
    fecha_ingreso: nulo(formData, 'fecha_ingreso'),
    departamento_id: num(formData, 'departamento_id'),
    area_id: num(formData, 'area_id'),
    puesto_id: num(formData, 'puesto_id'),
    jefe_id: num(formData, 'jefe_id'),
    tienda_id: num(formData, 'tienda_id'),
    area_trabajo: nulo(formData, 'area_trabajo'),
    tipo_contrato: nulo(formData, 'tipo_contrato'),
    jornada: nulo(formData, 'jornada'),
    horario: nulo(formData, 'horario'),
    modalidad: nulo(formData, 'modalidad'),
    estado: txt(formData, 'estado') || 'activo',
    fin_periodo_prueba: nulo(formData, 'fin_periodo_prueba'),
    tipo_planilla: txt(formData, 'tipo_planilla') || 'contrato',
    centro_costo_id: num(formData, 'centro_costo_id'),
    usuario_id: num(formData, 'usuario_id'),
    notas: nulo(formData, 'notas'),
    ...(foto ? { foto_url: foto } : {}),
  }

  const supabase = await createClient()
  const { data, error } = id
    ? await supabase.from('colaboradores').update(fila).eq('id', id).select('id').single()
    : await supabase.from('colaboradores').insert({ ...fila, creado_por: null }).select('id').single()
  if (error || !data) {
    if (foto) await createAdminClient().storage.from(BUCKET).remove([foto])
    const m = error?.message ?? 'No se pudo guardar'
    volver(
      destinoError,
      'error',
      /colaboradores_dpi_key/.test(m)
        ? 'Ya existe un colaborador con ese DPI'
        : /colaboradores_usuario_id_key/.test(m)
          ? 'Ese usuario del sistema ya está enlazado a otro colaborador'
          : m,
    )
  }
  revalidatePath('/rrhh', 'layout')
  volver(`/rrhh/${data.id}`, 'ok', id ? 'Expediente actualizado' : 'Colaborador creado: completa su información salarial y documentos')
}

export async function guardarSalario(formData: FormData) {
  const id = txt(formData, 'colaborador_id')
  const destino = `/rrhh/${id}?tab=salario`
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_rrhh_guardar_salario', {
    p_colaborador_id: Number(id),
    p_datos: {
      salario_base: num(formData, 'salario_base') ?? 0,
      tipo_salario: txt(formData, 'tipo_salario'),
      bonificacion_incentiva: num(formData, 'bonificacion_incentiva') ?? 250,
      otras_bonificaciones: num(formData, 'otras_bonificaciones') ?? 0,
      otras_bonificaciones_detalle: txt(formData, 'otras_bonificaciones_detalle'),
      comisiones: formData.get('comisiones') === 'on',
      horas_extra: formData.get('horas_extra') === 'on',
      forma_pago: txt(formData, 'forma_pago'),
      banco: txt(formData, 'banco'),
      tipo_cuenta: txt(formData, 'tipo_cuenta'),
      numero_cuenta: txt(formData, 'numero_cuenta'),
      aplica_igss: formData.get('aplica_igss') === 'on',
      aplica_isr: formData.get('aplica_isr') === 'on',
    },
    p_fecha_efectiva: nulo(formData, 'fecha_efectiva'),
    p_motivo: nulo(formData, 'motivo'),
    p_autorizado_por: nulo(formData, 'autorizado_por'),
  })
  if (error) volver(destino, 'error', error.message)
  revalidatePath(`/rrhh/${id}`)
  volver(destino, 'ok', 'Información salarial guardada')
}

export async function guardarDeduccion(formData: FormData) {
  const id = txt(formData, 'colaborador_id')
  const destino = `/rrhh/${id}?tab=salario`
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_rrhh_guardar_deduccion', {
    p_id: Number(txt(formData, 'deduccion_id')) || null,
    p_colaborador_id: Number(id),
    p_tipo: txt(formData, 'tipo'),
    p_descripcion: txt(formData, 'descripcion'),
    p_monto_total: num(formData, 'monto_total'),
    p_cuota: num(formData, 'cuota'),
    p_fecha_inicio: nulo(formData, 'fecha_inicio'),
    p_activa: txt(formData, 'activa') !== 'no',
  })
  if (error) volver(destino, 'error', error.message)
  revalidatePath(`/rrhh/${id}`)
  volver(destino, 'ok', 'Deducción guardada')
}

export async function subirDocumento(formData: FormData) {
  const id = txt(formData, 'colaborador_id')
  const destino = `/rrhh/${id}?tab=documentos`
  if (!(await tienePermiso('rrhh', 'editar'))) volver(destino, 'error', 'No tienes permiso para subir documentos')
  let ruta: string | null = null
  try {
    ruta = await subir(formData.get('archivo'), `documentos/${id}`)
  } catch (e) {
    volver(destino, 'error', (e as Error).message)
  }
  if (!ruta) volver(destino, 'error', 'Adjunta el archivo (PDF o imagen)')
  const tipo = Number(txt(formData, 'tipo_documento_id')) || null
  const supabase = await createClient()
  let nombre = txt(formData, 'nombre')
  let etapa = txt(formData, 'etapa') || 'durante'
  if (tipo) {
    const { data: t } = await supabase.from('rrhh_tipos_documento').select('nombre, etapa').eq('id', tipo).maybeSingle()
    if (t) {
      nombre = nombre || t.nombre
      etapa = t.etapa
    }
  }
  const { error } = await supabase.from('colaborador_documentos').insert({
    colaborador_id: Number(id),
    tipo_documento_id: tipo,
    etapa,
    nombre: nombre || 'Documento',
    archivo_url: ruta,
    fecha_documento: nulo(formData, 'fecha_documento'),
    fecha_vencimiento: nulo(formData, 'fecha_vencimiento'),
    notas: nulo(formData, 'notas'),
  })
  if (error) {
    await createAdminClient().storage.from(BUCKET).remove([ruta])
    volver(destino, 'error', error.message)
  }
  revalidatePath(`/rrhh/${id}`)
  volver(destino, 'ok', 'Documento agregado al expediente')
}

export async function eliminarDocumento(formData: FormData) {
  const id = txt(formData, 'colaborador_id')
  const destino = `/rrhh/${id}?tab=documentos`
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('colaborador_documentos')
    .delete()
    .eq('id', Number(txt(formData, 'documento_id')))
    .eq('colaborador_id', Number(id))
    .select('archivo_url')
    .maybeSingle()
  if (error) volver(destino, 'error', error.message)
  if (data?.archivo_url) await createAdminClient().storage.from(BUCKET).remove([data.archivo_url])
  revalidatePath(`/rrhh/${id}`)
  volver(destino, 'ok', 'Documento eliminado')
}

// ---------- Catálogos ----------
export async function guardarCatalogo(formData: FormData) {
  const destino = '/rrhh/catalogos'
  const tabla = txt(formData, 'tabla')
  const id = Number(txt(formData, 'id')) || null
  const supabase = await createClient()
  const activo = txt(formData, 'activo') !== 'no'
  let fila: Record<string, unknown>
  if (tabla === 'rrhh_departamentos') fila = { nombre: txt(formData, 'nombre'), activo }
  else if (tabla === 'rrhh_areas') fila = { nombre: txt(formData, 'nombre'), departamento_id: num(formData, 'departamento_id'), activo }
  else if (tabla === 'rrhh_puestos')
    fila = {
      nombre: txt(formData, 'nombre'),
      area_id: num(formData, 'area_id'),
      descriptor: nulo(formData, 'descriptor'),
      salario_minimo: num(formData, 'salario_minimo'),
      salario_maximo: num(formData, 'salario_maximo'),
      activo,
    }
  else volver(destino, 'error', 'Catálogo desconocido')
  if (!fila.nombre) volver(destino, 'error', 'Escribe el nombre')
  const { error } = id ? await supabase.from(tabla).update(fila).eq('id', id) : await supabase.from(tabla).insert(fila)
  if (error) volver(destino, 'error', /duplicate|unique/.test(error.message) ? 'Ya existe uno con ese nombre' : error.message)
  revalidatePath('/rrhh', 'layout')
  volver(destino, 'ok', 'Catálogo guardado')
}

// ---------- Fase 2: movimientos, vacaciones y permisos, uniformes y equipo ----------
/** Ruta de regreso enviada por el formulario (solo dentro de /rrhh). */
const regreso = (f: FormData, porDefecto: string) => {
  const v = txt(f, 'volver')
  return v.startsWith('/rrhh') ? v : porDefecto
}

const CAMPOS_MOVIMIENTO = ['puesto_id', 'departamento_id', 'area_id', 'tienda_id', 'jefe_id', 'tipo_contrato', 'estado'] as const

export async function registrarMovimiento(formData: FormData) {
  const id = txt(formData, 'colaborador_id')
  const destino = `/rrhh/${id}?tab=movimientos`
  // Solo viajan los campos que el usuario cambió ("" = sin cambio; "ninguno" = quitarlo).
  const cambios: Record<string, string | null> = {}
  for (const k of CAMPOS_MOVIMIENTO) {
    const v = txt(formData, k)
    if (v === '') continue
    cambios[k] = v === 'ninguno' ? null : v
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_rrhh_registrar_movimiento', {
    p_colaborador_id: Number(id),
    p_tipo: txt(formData, 'tipo'),
    p_fecha: nulo(formData, 'fecha_efectiva'),
    p_cambios: cambios,
    p_motivo: txt(formData, 'motivo'),
    p_responsable: nulo(formData, 'responsable'),
  })
  if (error) volver(destino, 'error', error.message)
  revalidatePath('/rrhh', 'layout')
  volver(destino, 'ok', 'Movimiento registrado')
}

export async function solicitarAusencia(formData: FormData) {
  const id = txt(formData, 'colaborador_id')
  const destino = regreso(formData, `/rrhh/${id}?tab=vacaciones`)
  let ruta: string | null = null
  try {
    ruta = await subir(formData.get('documento'), `ausencias/${id}`)
  } catch (e) {
    volver(destino, 'error', (e as Error).message)
  }
  const aprobar = formData.get('aprobar') === 'on'
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_rrhh_solicitar_ausencia', {
    p_colaborador_id: Number(id),
    p_tipo_id: Number(txt(formData, 'tipo_ausencia_id')),
    p_desde: nulo(formData, 'fecha_inicio'),
    p_hasta: nulo(formData, 'fecha_fin') ?? nulo(formData, 'fecha_inicio'),
    p_dias: num(formData, 'dias'),
    p_motivo: nulo(formData, 'motivo'),
    p_documento_url: ruta,
    p_aprobar: aprobar,
    p_anticipar: formData.get('anticipar') === 'on',
  })
  if (error) {
    if (ruta) await createAdminClient().storage.from(BUCKET).remove([ruta])
    volver(destino, 'error', error.message)
  }
  revalidatePath('/rrhh', 'layout')
  volver(destino, 'ok', aprobar ? 'Ausencia registrada y aprobada' : 'Solicitud registrada: queda por autorizar')
}

export async function resolverAusencia(formData: FormData) {
  const destino = regreso(formData, '/rrhh/ausencias')
  const aprobar = txt(formData, 'decision') === 'aprobar'
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_rrhh_resolver_ausencia', {
    p_id: Number(txt(formData, 'ausencia_id')),
    p_aprobar: aprobar,
    p_comentario: nulo(formData, 'comentario'),
  })
  if (error) volver(destino, 'error', error.message)
  revalidatePath('/rrhh', 'layout')
  volver(destino, 'ok', aprobar ? 'Solicitud aprobada' : 'Solicitud rechazada')
}

export async function cancelarAusencia(formData: FormData) {
  const destino = regreso(formData, '/rrhh/ausencias')
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_rrhh_cancelar_ausencia', {
    p_id: Number(txt(formData, 'ausencia_id')),
    p_motivo: nulo(formData, 'comentario'),
  })
  if (error) volver(destino, 'error', error.message)
  revalidatePath('/rrhh', 'layout')
  volver(destino, 'ok', 'Ausencia cancelada')
}

export async function adjuntarDocumentoAusencia(formData: FormData) {
  const destino = regreso(formData, '/rrhh/ausencias')
  const id = txt(formData, 'colaborador_id')
  let ruta: string | null = null
  try {
    ruta = await subir(formData.get('documento'), `ausencias/${id}`)
  } catch (e) {
    volver(destino, 'error', (e as Error).message)
  }
  if (!ruta) volver(destino, 'error', 'Adjunta el documento (PDF o imagen)')
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_rrhh_adjuntar_documento_ausencia', { p_id: Number(txt(formData, 'ausencia_id')), p_documento_url: ruta })
  if (error) {
    await createAdminClient().storage.from(BUCKET).remove([ruta])
    volver(destino, 'error', error.message)
  }
  revalidatePath('/rrhh', 'layout')
  volver(destino, 'ok', 'Documento adjunto')
}

export async function ajustarVacaciones(formData: FormData) {
  const id = txt(formData, 'colaborador_id')
  const destino = `/rrhh/${id}?tab=vacaciones`
  const signo = txt(formData, 'sentido') === 'restar' ? -1 : 1
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_rrhh_ajustar_vacaciones', {
    p_colaborador_id: Number(id),
    p_fecha: nulo(formData, 'fecha'),
    p_dias: (num(formData, 'dias') ?? 0) * signo,
    p_motivo: txt(formData, 'motivo'),
  })
  if (error) volver(destino, 'error', error.message)
  revalidatePath(`/rrhh/${id}`)
  volver(destino, 'ok', 'Saldo de vacaciones ajustado')
}

export async function guardarAsignacion(formData: FormData) {
  const id = txt(formData, 'colaborador_id')
  const destino = `/rrhh/${id}?tab=equipo`
  if (!(await tienePermiso('rrhh', 'editar'))) volver(destino, 'error', 'No tienes permiso para asignar equipo')
  if (!txt(formData, 'descripcion')) volver(destino, 'error', 'Describe lo que se entrega')
  let ruta: string | null = null
  try {
    ruta = await subir(formData.get('responsiva'), `responsivas/${id}`)
  } catch (e) {
    volver(destino, 'error', (e as Error).message)
  }
  const supabase = await createClient()
  const { error } = await supabase.from('colaborador_asignaciones').insert({
    colaborador_id: Number(id),
    categoria: txt(formData, 'categoria') || 'otro',
    descripcion: txt(formData, 'descripcion'),
    talla: nulo(formData, 'talla'),
    cantidad: num(formData, 'cantidad') ?? 1,
    marca_modelo: nulo(formData, 'marca_modelo'),
    numero_serie: nulo(formData, 'numero_serie'),
    activo_fijo_id: num(formData, 'activo_fijo_id'),
    valor: num(formData, 'valor'),
    fecha_entrega: nulo(formData, 'fecha_entrega') ?? new Date().toISOString().slice(0, 10),
    entregado_por: nulo(formData, 'entregado_por'),
    responsiva_url: ruta,
    notas: nulo(formData, 'notas'),
  })
  if (error) {
    if (ruta) await createAdminClient().storage.from(BUCKET).remove([ruta])
    volver(destino, 'error', /uq_asignacion_activo_vigente/.test(error.message) ? 'Ese activo fijo ya está asignado a otra persona' : error.message)
  }
  revalidatePath(`/rrhh/${id}`)
  volver(destino, 'ok', 'Entrega registrada')
}

export async function devolverAsignacion(formData: FormData) {
  const id = txt(formData, 'colaborador_id')
  const destino = `/rrhh/${id}?tab=equipo`
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('colaborador_asignaciones')
    .update({
      estado: txt(formData, 'estado') || 'devuelto',
      fecha_devolucion: nulo(formData, 'fecha_devolucion') ?? new Date().toISOString().slice(0, 10),
      recibido_por: nulo(formData, 'recibido_por'),
      notas_devolucion: nulo(formData, 'notas_devolucion'),
    })
    .eq('id', Number(txt(formData, 'asignacion_id')))
    .eq('colaborador_id', Number(id))
    .eq('estado', 'asignado')
    .select('id')
  if (error) volver(destino, 'error', /check/.test(error.message) ? 'La devolución no puede ser antes de la entrega' : error.message)
  if (!data?.length) volver(destino, 'error', 'No se pudo registrar la devolución (sin permiso o ya devuelto)')
  revalidatePath(`/rrhh/${id}`)
  volver(destino, 'ok', 'Devolución registrada')
}

export async function subirResponsiva(formData: FormData) {
  const id = txt(formData, 'colaborador_id')
  const destino = `/rrhh/${id}?tab=equipo`
  let ruta: string | null = null
  try {
    ruta = await subir(formData.get('responsiva'), `responsivas/${id}`)
  } catch (e) {
    volver(destino, 'error', (e as Error).message)
  }
  if (!ruta) volver(destino, 'error', 'Adjunta la responsiva firmada')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('colaborador_asignaciones')
    .update({ responsiva_url: ruta })
    .eq('id', Number(txt(formData, 'asignacion_id')))
    .eq('colaborador_id', Number(id))
    .select('id')
  if (error || !data?.length) {
    await createAdminClient().storage.from(BUCKET).remove([ruta])
    volver(destino, 'error', error?.message ?? 'No tienes permiso para modificar la entrega')
  }
  revalidatePath(`/rrhh/${id}`)
  volver(destino, 'ok', 'Responsiva firmada adjunta')
}

export async function guardarConfigRrhh(formData: FormData) {
  const destino = '/rrhh/catalogos'
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rrhh_config')
    .update({
      dias_vacaciones: num(formData, 'dias_vacaciones') ?? 15,
      sabado_laboral: txt(formData, 'sabado_laboral') || 'no',
      ...Object.fromEntries(
        ['igss_laboral_pct', 'igss_patronal_pct', 'isr_deduccion_personal', 'isr_retencion_servicios_pct', 'prov_aguinaldo_pct', 'prov_bono14_pct', 'prov_vacaciones_pct', 'prov_indemnizacion_pct']
          .map((k) => [k, num(formData, k)])
          .filter(([, v]) => v != null),
      ),
      fecha_actualizacion: new Date().toISOString(),
    })
    .eq('id', 1)
    .select('id')
  if (error) {
    volver(destino, 'error', /check/.test(error.message) ? 'Las vacaciones no pueden ser menos de 15 días hábiles (Código de Trabajo, art. 130)' : error.message)
  }
  if (!data?.length) volver(destino, 'error', 'No tienes permiso para cambiar la configuración')
  revalidatePath('/rrhh', 'layout')
  volver(destino, 'ok', 'Configuración guardada')
}

export async function guardarFeriado(formData: FormData) {
  const destino = '/rrhh/catalogos'
  const fila = { fecha: txt(formData, 'fecha'), nombre: txt(formData, 'nombre'), medio_dia: formData.get('medio_dia') === 'on' }
  if (!fila.fecha || !fila.nombre) volver(destino, 'error', 'Indica la fecha y el nombre del asueto')
  const supabase = await createClient()
  const { error } = await supabase.from('rrhh_feriados').insert(fila)
  if (error) volver(destino, 'error', /duplicate|unique/.test(error.message) ? 'Ya hay un asueto en esa fecha' : error.message)
  revalidatePath('/rrhh', 'layout')
  volver(destino, 'ok', 'Asueto agregado')
}

export async function eliminarFeriado(formData: FormData) {
  const destino = '/rrhh/catalogos'
  const supabase = await createClient()
  const { error } = await supabase.from('rrhh_feriados').delete().eq('id', Number(txt(formData, 'id')))
  if (error) volver(destino, 'error', error.message)
  revalidatePath('/rrhh', 'layout')
  volver(destino, 'ok', 'Asueto eliminado')
}
