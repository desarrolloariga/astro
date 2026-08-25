'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { obtenerUsuarioActual } from '@/lib/usuario'

const BUCKET = 'ariga-comprobantes'

function aNumero(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export async function subirComprobante(formData: FormData) {
  const usuario = await obtenerUsuarioActual()
  const pagoId = aNumero(formData.get('pago_id'))
  const ventaId = aNumero(formData.get('venta_id'))
  const archivo = formData.get('archivo')

  if (!pagoId || !ventaId) redirect('/ventas')
  if (!(archivo instanceof File) || archivo.size === 0) {
    redirect(`/ventas?error=${encodeURIComponent('Selecciona un archivo de comprobante')}`)
  }

  const extension = archivo.name.split('.').pop()?.toLowerCase() || 'jpg'
  const ruta = `venta-${ventaId}/pago-${pagoId}-${usuario.id}-${Date.now()}.${extension}`

  const admin = createAdminClient()
  const { error: errorSubida } = await admin.storage
    .from(BUCKET)
    .upload(ruta, archivo, { contentType: archivo.type || 'application/octet-stream' })

  if (errorSubida) {
    redirect(`/ventas?error=${encodeURIComponent('No se pudo subir el archivo: ' + errorSubida.message)}`)
  }

  const supabase = await createClient()
  const { error } = await supabase.from('comprobantes').insert({
    pago_id: pagoId,
    url_archivo: ruta,
    numero_referencia: String(formData.get('numero_referencia') ?? '').trim() || null,
    banco_origen: String(formData.get('banco_origen') ?? '').trim() || null,
    fecha_pago: String(formData.get('fecha_pago') ?? '').trim() || null,
    monto_declarado: aNumero(formData.get('monto_declarado')),
    subido_por: usuario.id,
  })

  revalidatePath('/ventas')
  if (error) {
    redirect(`/ventas?error=${encodeURIComponent(error.message)}`)
  }
  redirect(`/ventas?ok=${encodeURIComponent('Comprobante enviado, en espera de aprobación')}`)
}
