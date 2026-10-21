'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'astro-gastos'
const MAX_BYTES = 9 * 1024 * 1024

function volver(destino: string, clave: 'ok' | 'error', mensaje: string): never {
  redirect(`${destino}${destino.includes('?') ? '&' : '?'}${clave}=${encodeURIComponent(mensaje)}`)
}

function texto(formData: FormData, nombre: string) {
  return String(formData.get(nombre) ?? '').trim()
}

export async function registrarGasto(formData: FormData) {
  const destino = texto(formData, 'volver') || '/contabilidad/gastos'
  const archivo = formData.get('soporte')
  let ruta: string | null = null

  // El soporte (factura/recibo) va al bucket privado; si el registro falla se borra.
  if (archivo instanceof File && archivo.size > 0) {
    if (archivo.size > MAX_BYTES) volver(destino, 'error', 'El soporte supera 9 MB')
    if (!archivo.type.startsWith('image/') && archivo.type !== 'application/pdf') {
      volver(destino, 'error', 'El soporte debe ser una imagen o un PDF')
    }
    const extension = archivo.name.split('.').pop()?.toLowerCase() || 'pdf'
    ruta = `gastos/${Date.now()}.${extension}`
    const { error } = await createAdminClient().storage.from(BUCKET).upload(ruta, archivo, { contentType: archivo.type })
    if (error) volver(destino, 'error', `No se pudo subir el soporte: ${error.message}`)
  }

  const proveedor = Number(texto(formData, 'proveedor_id'))
  const supabase = await createClient()
  const { data: gastoId, error } = await supabase.rpc('fn_registrar_gasto', {
    p_fecha: texto(formData, 'fecha'),
    p_clasificacion: texto(formData, 'clasificacion') || 'operativo',
    p_categoria: texto(formData, 'categoria'),
    p_descripcion: texto(formData, 'descripcion'),
    p_monto: Number(texto(formData, 'monto').replace(',', '.')),
    p_proveedor_id: Number.isInteger(proveedor) && proveedor > 0 ? proveedor : null,
    p_metodo_pago: texto(formData, 'metodo_pago') || null,
    p_referencia: texto(formData, 'referencia') || null,
    p_soporte_url: ruta,
  })

  if (error) {
    if (ruta) await createAdminClient().storage.from(BUCKET).remove([ruta])
    volver(destino, 'error', error.message)
  }
  // Con cuenta elegida, el gasto queda también en el libro de bancos.
  let aviso = ''
  const cuenta = Number(texto(formData, 'cuenta_id'))
  if (gastoId && Number.isInteger(cuenta) && cuenta > 0) {
    const { error: errorBanco } = await supabase.rpc('fn_banco_registrar_gasto', {
      p_gasto_id: gastoId,
      p_cuenta_id: cuenta,
      p_fecha: texto(formData, 'fecha'),
    })
    aviso = errorBanco ? ` · no se registró en bancos: ${errorBanco.message}` : ' y en bancos'
  }
  revalidatePath('/contabilidad/gastos')
  revalidatePath('/contabilidad/estado-resultados')
  revalidatePath('/contabilidad/bancos')
  volver(destino, 'ok', `Gasto registrado${aviso}`)
}

export async function anularGasto(formData: FormData) {
  const destino = texto(formData, 'volver') || '/contabilidad/gastos'
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_anular_gasto', {
    p_gasto_id: Number(texto(formData, 'gasto_id')),
    p_motivo: texto(formData, 'motivo'),
  })
  revalidatePath('/contabilidad/gastos')
  revalidatePath('/contabilidad/estado-resultados')
  if (error) volver(destino, 'error', error.message)
  volver(destino, 'ok', 'Gasto anulado')
}
