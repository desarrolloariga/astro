'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const txt = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

/**
 * Autoriza UNA operación en un mes cerrado (PIN contable + motivo; vale 10 minutos).
 * Se usa desde el mensaje de error de cualquier módulo: después basta con repetir la operación.
 */
export async function autorizarMesCerrado(formData: FormData) {
  const [mes, anio] = txt(formData, 'mes').split('/')
  const referer = (await headers()).get('referer')
  let destino = '/contabilidad/periodos'
  if (referer) {
    const u = new URL(referer)
    u.searchParams.delete('ok')
    u.searchParams.delete('error')
    destino = u.pathname + (u.searchParams.size ? `?${u.searchParams}` : '')
  }
  const sep = destino.includes('?') ? '&' : '?'
  if (!/^\d{2}$/.test(mes ?? '') || !/^\d{4}$/.test(anio ?? '')) redirect(`${destino}${sep}error=${encodeURIComponent('Mes no válido')}`)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_autorizar_periodo_cerrado', {
    p_fecha: `${anio}-${mes}-01`,
    p_pin: txt(formData, 'pin'),
    p_motivo: txt(formData, 'motivo_cierre'),
    p_accion: 'operacion_en_periodo_cerrado',
  })
  const r = data as { ok: boolean; error?: string } | null
  if (error || !r?.ok) redirect(`${destino}${sep}error=${encodeURIComponent(error?.message ?? r?.error ?? 'No se pudo autorizar')}`)
  redirect(
    `${destino}${sep}ok=${encodeURIComponent(`Autorizado para ${mes}/${anio}: repite la operación en los próximos 10 minutos (vale para una sola operación).`)}`,
  )
}
