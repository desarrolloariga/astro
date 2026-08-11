'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'astro-pedidos'

function aNumero(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export async function avanzarPedido(formData: FormData) {
  const pedidoId = aNumero(formData.get('pedido_id'))
  const nuevoEstado = String(formData.get('nuevo_estado') ?? '').trim()
  if (!pedidoId || !nuevoEstado) redirect('/pedidos')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_avanzar_pedido', {
    p_pedido_id: pedidoId,
    p_nuevo_estado: nuevoEstado,
  })

  if (error) {
    redirect(`/pedidos?error=${encodeURIComponent(error.message)}`)
  }

  const archivo = formData.get('archivo')
  if (archivo instanceof File && archivo.size > 0) {
    const tipo = nuevoEstado === 'despachado' ? 'guia' : 'evidencia_entrega'
    const extension = archivo.name.split('.').pop()?.toLowerCase() || 'jpg'
    const ruta = `pedido-${pedidoId}/${tipo}-${Date.now()}.${extension}`

    const admin = createAdminClient()
    const { error: errorSubida } = await admin.storage
      .from(BUCKET)
      .upload(ruta, archivo, { contentType: archivo.type || 'application/octet-stream' })

    if (!errorSubida) {
      await supabase.from('pedido_documentos').insert({ pedido_id: pedidoId, tipo, url: ruta })
    }
  }

  revalidatePath('/pedidos')
  redirect(`/pedidos?ok=${encodeURIComponent('Pedido actualizado')}`)
}
