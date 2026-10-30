'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const txt = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

function volver(ventaId: string, clave: 'ok' | 'error', mensaje: string): never {
  redirect(`/contabilidad/cxc/${ventaId}?${clave}=${encodeURIComponent(mensaje)}`)
}

export async function registrarFactura(formData: FormData) {
  const ventaId = txt(formData, 'venta_id')
  if (!txt(formData, 'serie') || !txt(formData, 'numero')) volver(ventaId, 'error', 'Escribe la serie y el número de la factura FEL')
  if (!txt(formData, 'nombre')) volver(ventaId, 'error', 'Escribe el nombre del cliente de la factura')
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_cxc_registrar_factura', {
    p_venta_id: Number(ventaId),
    p_serie: txt(formData, 'serie'),
    p_numero: txt(formData, 'numero'),
    p_autorizacion: txt(formData, 'autorizacion') || null,
    p_fecha: txt(formData, 'fecha'),
    p_nit: txt(formData, 'nit') || 'CF',
    p_nombre: txt(formData, 'nombre'),
    p_direccion: txt(formData, 'direccion') || null,
  })
  if (error) volver(ventaId, 'error', error.message)
  revalidatePath('/contabilidad/cxc')
  volver(ventaId, 'ok', 'Factura registrada')
}

export async function anularFactura(formData: FormData) {
  const ventaId = txt(formData, 'venta_id')
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_cxc_anular_factura', {
    p_id: Number(txt(formData, 'factura_id')),
    p_motivo: txt(formData, 'motivo'),
  })
  if (error) volver(ventaId, 'error', error.message)
  revalidatePath('/contabilidad/cxc')
  volver(ventaId, 'ok', 'Factura anulada: ya puedes registrar la nueva')
}
