'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const txt = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

function volver(clave: 'ok' | 'error', mensaje: string, extra = ''): never {
  redirect(`/contabilidad/nomenclatura?${clave}=${encodeURIComponent(mensaje)}${extra}`)
}

export async function guardarCuenta(formData: FormData) {
  const id = Number(txt(formData, 'id')) || null
  const codigo = txt(formData, 'codigo')
  const nombre = txt(formData, 'nombre')
  if (!/^[0-9]+(\.[0-9]+)*$/.test(codigo)) volver('error', 'El código solo lleva números separados por punto (ej. 1.01.01.001)')
  if (!nombre) volver('error', 'Escribe el nombre de la cuenta')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_guardar_cuenta_contable', {
    p_id: id,
    p_codigo: codigo,
    p_nombre: nombre,
    p_tipo: txt(formData, 'tipo'),
    p_naturaleza: txt(formData, 'naturaleza') || null,
    p_es_detalle: txt(formData, 'es_detalle') !== 'madre',
    p_activo: id ? formData.get('activo') === 'on' : true,
    p_descripcion: txt(formData, 'descripcion') || null,
  })
  if (error) volver('error', error.message, id ? `&editar=${id}` : '')
  revalidatePath('/contabilidad/nomenclatura')
  volver('ok', id ? `Cuenta ${codigo} actualizada` : `Cuenta ${codigo} creada`, `#c-${codigo}`)
}

export async function cambiarEstadoCuenta(formData: FormData) {
  const id = Number(txt(formData, 'id'))
  const supabase = await createClient()
  const { data: cuenta } = await supabase
    .from('cuentas_contables')
    .select('codigo, nombre, tipo, naturaleza, es_detalle, activo, descripcion')
    .eq('id', id)
    .maybeSingle()
  if (!cuenta) volver('error', 'La cuenta no existe')
  const { error } = await supabase.rpc('fn_guardar_cuenta_contable', {
    p_id: id,
    p_codigo: cuenta.codigo,
    p_nombre: cuenta.nombre,
    p_tipo: cuenta.tipo,
    p_naturaleza: cuenta.naturaleza,
    p_es_detalle: cuenta.es_detalle,
    p_activo: !cuenta.activo,
    p_descripcion: cuenta.descripcion,
  })
  if (error) volver('error', error.message)
  revalidatePath('/contabilidad/nomenclatura')
  volver('ok', `Cuenta ${cuenta.codigo} ${cuenta.activo ? 'desactivada' : 'activada'}`, `#c-${cuenta.codigo}`)
}

export async function eliminarCuenta(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_eliminar_cuenta_contable', { p_id: Number(txt(formData, 'id')) })
  if (error) volver('error', error.message)
  revalidatePath('/contabilidad/nomenclatura')
  volver('ok', 'Cuenta eliminada')
}
