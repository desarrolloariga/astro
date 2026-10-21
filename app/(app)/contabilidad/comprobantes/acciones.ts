'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { generarOrdenDespacho } from '@/lib/pdf/orden-despacho'

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

  // Pago aprobado y pedido liberado → se genera la Orden de despacho
  // (PDF). Si falla, la aprobación ya quedó hecha: solo se avisa.
  let avisoPdf = ''
  if (aprobado) {
    const { data: fila } = await supabase
      .from('comprobantes')
      .select('pagos ( ventas ( pedidos ( id, estado ) ) )')
      .eq('id', comprobanteId)
      .maybeSingle()
    const pedido = (fila as unknown as { pagos: { ventas: { pedidos: { id: number; estado: string }[] } } } | null)
      ?.pagos?.ventas?.pedidos?.[0]
    if (pedido && pedido.estado === 'listo_para_despacho') {
      try {
        const usuario = await obtenerUsuarioActual()
        await generarOrdenDespacho(pedido.id, usuario.id)
        revalidatePath(`/pedidos/${pedido.id}`)
      } catch (e) {
        avisoPdf = ` · no se pudo generar la orden de despacho: ${(e as Error).message}`
      }
    }
  }

  redirect(
    `/contabilidad/comprobantes?ok=${encodeURIComponent(
      (aprobado ? 'Comprobante aprobado — pedido liberado a logística' : 'Comprobante rechazado') + avisoPdf,
    )}`,
  )
}
