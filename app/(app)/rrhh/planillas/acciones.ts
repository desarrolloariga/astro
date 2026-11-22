'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const txt = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const nulo = (f: FormData, k: string) => txt(f, k) || null

function volver(destino: string, clave: 'ok' | 'error', mensaje: string): never {
  redirect(`${destino}${destino.includes('?') ? '&' : '?'}${clave}=${encodeURIComponent(mensaje)}`)
}

export async function generarPlanilla(formData: FormData) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_rrhh_planilla_generar', {
    p_tipo: txt(formData, 'tipo'),
    p_anio: Number(txt(formData, 'anio')),
    p_mes: Number(txt(formData, 'mes')),
    p_quincena: Number(txt(formData, 'quincena')),
    p_fecha_pago: nulo(formData, 'fecha_pago'),
  })
  if (error) volver('/rrhh/planillas', 'error', error.message)
  revalidatePath('/rrhh/planillas')
  volver(`/rrhh/planillas/${data}`, 'ok', 'Planilla generada: revisa días, captura horas extra, comisiones y descuentos')
}

export async function editarLinea(formData: FormData) {
  const id = txt(formData, 'planilla_id')
  const destino = `/rrhh/planillas/${id}`
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_rrhh_planilla_editar_linea', {
    p_linea_id: Number(txt(formData, 'linea_id')),
    p_datos: {
      dias_manual: txt(formData, 'dias_manual').replace(/,/g, ''),
      horas_extra: txt(formData, 'horas_extra').replace(/,/g, ''),
      extras_monto: txt(formData, 'extras_monto').replace(/,/g, ''),
      comisiones: txt(formData, 'comisiones').replace(/,/g, ''),
      bonos_adicionales: txt(formData, 'bonos_adicionales').replace(/,/g, ''),
      otros_descuentos: txt(formData, 'otros_descuentos').replace(/,/g, ''),
      otros_descuentos_detalle: txt(formData, 'otros_descuentos_detalle'),
      notas: txt(formData, 'notas'),
    },
  })
  if (error) volver(destino, 'error', /invalid input syntax/.test(error.message) ? 'Revisa los números: usa solo cifras y punto decimal' : error.message)
  revalidatePath(destino)
  volver(destino, 'ok', 'Línea recalculada')
}

/** Recalcular, aprobar, eliminar y anular. */
export async function accionPlanilla(formData: FormData) {
  const id = Number(txt(formData, 'planilla_id'))
  const destino = `/rrhh/planillas/${id}`
  const accion = txt(formData, 'accion')
  const supabase = await createClient()
  const llamadas = {
    recalcular: () => supabase.rpc('fn_rrhh_planilla_recalcular', { p_id: id }),
    aprobar: () => supabase.rpc('fn_rrhh_planilla_aprobar', { p_id: id }),
    eliminar: () => supabase.rpc('fn_rrhh_planilla_eliminar', { p_id: id }),
    anular: () => supabase.rpc('fn_rrhh_planilla_anular', { p_id: id, p_motivo: txt(formData, 'motivo') }),
  } as const
  if (!(accion in llamadas)) volver(destino, 'error', 'Acción desconocida')
  const { error } = await llamadas[accion as keyof typeof llamadas]()
  if (error) volver(destino, 'error', error.message)
  revalidatePath('/rrhh/planillas', 'layout')
  if (accion === 'eliminar') volver('/rrhh/planillas', 'ok', 'Planilla eliminada')
  volver(
    destino,
    'ok',
    accion === 'recalcular' ? 'Planilla recalculada con los salarios y ausencias actuales' : accion === 'aprobar' ? 'Planilla aprobada' : 'Planilla anulada',
  )
}

export async function pagarPlanilla(formData: FormData) {
  const id = Number(txt(formData, 'planilla_id'))
  const destino = `/rrhh/planillas/${id}`
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_rrhh_planilla_pagar', {
    p_id: id,
    p_cuenta_bancaria_id: Number(txt(formData, 'cuenta_bancaria_id')),
    p_fecha: nulo(formData, 'fecha'),
    p_referencia: nulo(formData, 'referencia'),
  })
  if (error) volver(destino, 'error', error.message)
  revalidatePath('/rrhh/planillas', 'layout')
  revalidatePath('/contabilidad/bancos')
  volver(destino, 'ok', 'Pago registrado en bancos')
}
