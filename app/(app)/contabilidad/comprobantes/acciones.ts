'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'

function aNumero(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export async function revisarComprobante(formData: FormData) {
  if (!(await tienePermiso('comprobantes', 'aprobar'))) redirect('/inicio')

  const comprobanteId = aNumero(formData.get('comprobante_id'))
  const aprobado = formData.get('accion') === 'aprobar'
  const comentario = String(formData.get('comentario') ?? '').trim()

  if (!comprobanteId) redirect('/contabilidad/comprobantes')
  if (!aprobado && !comentario) {
    redirect(
      `/contabilidad/comprobantes?error=${encodeURIComponent('Indica el motivo del rechazo')}`,
    )
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_revisar_comprobante', {
    p_comprobante_id: comprobanteId,
    p_aprobado: aprobado,
    p_comentario: comentario || null,
  })

  revalidatePath('/contabilidad/comprobantes')
  if (error) {
    redirect(`/contabilidad/comprobantes?error=${encodeURIComponent(error.message)}`)
  }
  redirect(
    `/contabilidad/comprobantes?ok=${encodeURIComponent(
      aprobado ? 'Comprobante aprobado' : 'Comprobante rechazado',
    )}`,
  )
}
