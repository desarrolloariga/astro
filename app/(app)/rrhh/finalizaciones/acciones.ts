'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const txt = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const nulo = (f: FormData, k: string) => txt(f, k) || null
const cifra = (f: FormData, k: string) => txt(f, k).replace(/,/g, '')

function volver(destino: string, clave: 'ok' | 'error', mensaje: string): never {
  redirect(`${destino}${destino.includes('?') ? '&' : '?'}${clave}=${encodeURIComponent(mensaje)}`)
}

export async function crearFinalizacion(formData: FormData) {
  const colaborador = txt(formData, 'colaborador_id')
  const destinoError = `/rrhh/${colaborador}?tab=finalizacion`
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_rrhh_finalizacion_crear', {
    p_colaborador_id: Number(colaborador),
    p_tipo: txt(formData, 'tipo'),
    p_fecha_salida: nulo(formData, 'fecha_salida'),
    p_motivo: nulo(formData, 'motivo'),
  })
  if (error) volver(destinoError, 'error', error.message)
  revalidatePath('/rrhh', 'layout')
  volver(`/rrhh/finalizaciones/${data}`, 'ok', 'Liquidación calculada: revísala, completa la entrevista de salida y apruébala')
}

export async function editarFinalizacion(formData: FormData) {
  const id = txt(formData, 'finalizacion_id')
  const destino = `/rrhh/finalizaciones/${id}`
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_rrhh_finalizacion_editar', {
    p_id: Number(id),
    p_datos: {
      tipo: txt(formData, 'tipo'),
      fecha_salida: txt(formData, 'fecha_salida'),
      motivo: txt(formData, 'motivo'),
      aplica_indemnizacion: formData.get('aplica_indemnizacion') === 'on',
      incluir_salario: formData.get('incluir_salario') === 'on',
      dias_salario_manual: cifra(formData, 'dias_salario_manual'),
      dias_vacaciones_manual: cifra(formData, 'dias_vacaciones_manual'),
      otros_pagos: cifra(formData, 'otros_pagos'),
      otros_pagos_detalle: txt(formData, 'otros_pagos_detalle'),
      otros_descuentos: cifra(formData, 'otros_descuentos'),
      otros_descuentos_detalle: txt(formData, 'otros_descuentos_detalle'),
      notas: txt(formData, 'notas'),
      entrevista_fecha: txt(formData, 'entrevista_fecha'),
      entrevista_por: txt(formData, 'entrevista_por'),
      entrevista_motivo: txt(formData, 'entrevista_motivo'),
      entrevista_comentarios: txt(formData, 'entrevista_comentarios'),
      recontratable: txt(formData, 'recontratable'),
    },
  })
  if (error) volver(destino, 'error', /invalid input syntax/.test(error.message) ? 'Revisa los números y las fechas' : error.message)
  revalidatePath(destino)
  volver(destino, 'ok', 'Liquidación recalculada')
}

/** Recalcular, aprobar, eliminar y anular. */
export async function accionFinalizacion(formData: FormData) {
  const id = Number(txt(formData, 'finalizacion_id'))
  const destino = `/rrhh/finalizaciones/${id}`
  const accion = txt(formData, 'accion')
  const supabase = await createClient()
  const llamadas = {
    recalcular: () => supabase.rpc('fn_rrhh_finalizacion_recalcular', { p_id: id }),
    aprobar: () => supabase.rpc('fn_rrhh_finalizacion_aprobar', { p_id: id }),
    eliminar: () => supabase.rpc('fn_rrhh_finalizacion_eliminar', { p_id: id }),
    anular: () => supabase.rpc('fn_rrhh_finalizacion_anular', { p_id: id, p_motivo: txt(formData, 'motivo') }),
  } as const
  if (!(accion in llamadas)) volver(destino, 'error', 'Acción desconocida')
  const { error } = await llamadas[accion as keyof typeof llamadas]()
  if (error) volver(destino, 'error', error.message)
  revalidatePath('/rrhh', 'layout')
  if (accion === 'eliminar') volver(`/rrhh/${txt(formData, 'colaborador_id')}?tab=finalizacion`, 'ok', 'Liquidación eliminada')
  volver(
    destino,
    'ok',
    accion === 'recalcular'
      ? 'Liquidación recalculada'
      : accion === 'aprobar'
        ? 'Liquidación aprobada: el colaborador quedó de baja'
        : 'Liquidación anulada: el colaborador vuelve a su estado anterior',
  )
}

export async function pagarFinalizacion(formData: FormData) {
  const id = Number(txt(formData, 'finalizacion_id'))
  const destino = `/rrhh/finalizaciones/${id}`
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_rrhh_finalizacion_pagar', {
    p_id: id,
    p_cuenta_bancaria_id: Number(txt(formData, 'cuenta_bancaria_id')),
    p_fecha: nulo(formData, 'fecha'),
    p_referencia: nulo(formData, 'referencia'),
  })
  if (error) volver(destino, 'error', error.message)
  revalidatePath('/rrhh', 'layout')
  revalidatePath('/contabilidad/bancos')
  volver(destino, 'ok', 'Pago de la liquidación registrado en bancos')
}
