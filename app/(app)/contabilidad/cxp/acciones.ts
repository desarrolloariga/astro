'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { esFecha } from '@/lib/contabilidad-general'

const BUCKET = 'astro-gastos'
const MAX_BYTES = 9 * 1024 * 1024
const txt = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const num = (f: FormData, k: string) => Number(txt(f, k).replace(/,/g, '')) || 0

/** pedirPin: la fecha cae en un mes cerrado y hace falta el PIN contable + motivo. */
export type EstadoCxp = { error?: string; pedirPin?: boolean }

const MES_CERRADO = /está cerrado en contabilidad/

function refrescar(id?: number | string) {
  revalidatePath('/contabilidad/cxp')
  if (id) revalidatePath(`/contabilidad/cxp/${id}`)
  revalidatePath('/contabilidad/bancos')
}

function volver(id: string | number, clave: 'ok' | 'error', mensaje: string): never {
  redirect(`/contabilidad/cxp/${id}?${clave}=${encodeURIComponent(mensaje)}`)
}

export async function registrarFacturaProveedor(_previo: EstadoCxp, formData: FormData): Promise<EstadoCxp> {
  const fecha = txt(formData, 'fecha')
  if (!esFecha(fecha)) return { error: 'Indica la fecha del documento' }
  if (!txt(formData, 'numero')) return { error: 'Escribe el número del documento' }
  let lineas: unknown[]
  try {
    lineas = JSON.parse(txt(formData, 'lineas') || '[]')
  } catch {
    return { error: 'No se pudieron leer las líneas' }
  }

  // Soporte (PDF o imagen) en el bucket privado; si el registro falla se borra.
  let ruta: string | null = null
  const archivo = formData.get('soporte')
  if (archivo instanceof File && archivo.size > 0) {
    if (archivo.size > MAX_BYTES) return { error: 'El soporte supera 9 MB' }
    if (!archivo.type.startsWith('image/') && archivo.type !== 'application/pdf') return { error: 'El soporte debe ser una imagen o un PDF' }
    ruta = `cxp/${Date.now()}.${archivo.name.split('.').pop()?.toLowerCase() || 'pdf'}`
    const { error } = await createAdminClient().storage.from(BUCKET).upload(ruta, archivo, { contentType: archivo.type })
    if (error) return { error: `No se pudo subir el soporte: ${error.message}` }
  }

  const supabase = await createClient()
  // Mes cerrado: con PIN y motivo se crea la autorización (un uso, 10 minutos) que consume el registro.
  if (txt(formData, 'pin')) {
    const { data: aut, error: errAut } = await supabase.rpc('fn_autorizar_periodo_cerrado', {
      p_fecha: fecha,
      p_pin: txt(formData, 'pin'),
      p_motivo: txt(formData, 'motivo_cierre'),
      p_accion: 'operacion_en_periodo_cerrado',
    })
    const r = aut as { ok: boolean; error?: string } | null
    if (errAut || !r?.ok) {
      if (ruta) await createAdminClient().storage.from(BUCKET).remove([ruta])
      return { error: errAut?.message ?? r?.error ?? 'No se pudo autorizar', pedirPin: true }
    }
  }
  const { data, error } = await supabase.rpc('fn_cxp_registrar_factura', {
    p_proveedor_id: Number(txt(formData, 'proveedor_id')) || null,
    p_tipo: txt(formData, 'tipo') || 'factura',
    p_serie: txt(formData, 'serie') || null,
    p_numero: txt(formData, 'numero'),
    p_autorizacion: txt(formData, 'autorizacion') || null,
    p_fecha: fecha,
    p_vencimiento: txt(formData, 'vencimiento') || null,
    p_nit: txt(formData, 'nit') || null,
    p_nombre: txt(formData, 'nombre') || null,
    p_descripcion: txt(formData, 'descripcion') || null,
    p_total: num(formData, 'total'),
    p_iva: num(formData, 'iva'),
    p_lineas: lineas,
    p_soporte: ruta,
    p_tipo_compra: txt(formData, 'tipo_compra') || null,
    p_combustible: txt(formData, 'combustible') || null,
    p_galones: num(formData, 'galones') || null,
  })
  if (error) {
    if (ruta) await createAdminClient().storage.from(BUCKET).remove([ruta])
    return { error: error.message, pedirPin: MES_CERRADO.test(error.message) }
  }
  refrescar()
  redirect(`/contabilidad/cxp/${data as number}?ok=${encodeURIComponent('Factura registrada')}`)
}

export async function registrarPagoProveedor(formData: FormData) {
  const id = txt(formData, 'factura_id')
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_cxp_registrar_pago', {
    p_factura_id: Number(id),
    p_cuenta_bancaria_id: Number(txt(formData, 'cuenta_bancaria_id')) || null,
    p_fecha: txt(formData, 'fecha'),
    p_monto: num(formData, 'monto'),
    p_referencia: txt(formData, 'referencia') || null,
  })
  if (error) volver(id, 'error', error.message)
  refrescar(id)
  volver(id, 'ok', 'Pago registrado y enviado al libro de bancos')
}

export async function anularPagoProveedor(formData: FormData) {
  const id = txt(formData, 'factura_id')
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_cxp_anular_pago', { p_pago_id: Number(txt(formData, 'pago_id')), p_motivo: txt(formData, 'motivo') })
  if (error) volver(id, 'error', error.message)
  refrescar(id)
  volver(id, 'ok', 'Pago anulado (y su movimiento bancario)')
}

export async function anularFacturaProveedor(formData: FormData) {
  const id = txt(formData, 'factura_id')
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_cxp_anular_factura', { p_id: Number(id), p_motivo: txt(formData, 'motivo') })
  if (error) volver(id, 'error', error.message)
  refrescar(id)
  volver(id, 'ok', 'Factura anulada')
}

export async function completarFacturaProveedor(formData: FormData) {
  const id = txt(formData, 'factura_id')
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_cxp_completar_factura', {
    p_id: Number(id),
    p_serie: txt(formData, 'serie') || null,
    p_numero: txt(formData, 'numero') || null,
    p_autorizacion: txt(formData, 'autorizacion') || null,
    p_fecha: txt(formData, 'fecha') || null,
    p_vencimiento: txt(formData, 'vencimiento') || null,
  })
  if (error) volver(id, 'error', error.message)
  refrescar(id)
  volver(id, 'ok', 'Datos del documento actualizados')
}

export async function facturaDesdeOrden(formData: FormData) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_cxp_crear_desde_oc', {
    p_oc_id: Number(txt(formData, 'orden_compra_id')),
    p_serie: txt(formData, 'serie') || null,
    p_numero: txt(formData, 'numero') || null,
    p_autorizacion: txt(formData, 'autorizacion') || null,
    p_fecha: txt(formData, 'fecha') || null,
    p_vencimiento: txt(formData, 'vencimiento') || null,
  })
  if (error) redirect(`/contabilidad/cxp?error=${encodeURIComponent(error.message)}`)
  refrescar()
  volver(data as number, 'ok', 'Factura de la orden de compra registrada')
}

/** Marca una orden de compra recibida como "sin factura" (o lo deshace). */
export async function marcarOrdenSinFactura(formData: FormData) {
  const supabase = await createClient()
  const sinFactura = txt(formData, 'sin_factura') === 'si'
  const { error } = await supabase.rpc('fn_cxp_marcar_oc_sin_factura', {
    p_oc_id: Number(txt(formData, 'orden_compra_id')),
    p_sin_factura: sinFactura,
    p_motivo: txt(formData, 'motivo') || null,
  })
  if (error) redirect(`/contabilidad/cxp?error=${encodeURIComponent(error.message)}`)
  refrescar()
  redirect(`/contabilidad/cxp?ok=${encodeURIComponent(sinFactura ? 'Orden marcada sin factura' : 'La orden vuelve a la lista de pendientes de factura')}`)
}
