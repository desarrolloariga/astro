'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const txt = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

function volver(tab: string, clave: 'ok' | 'error', mensaje: string): never {
  redirect(`/contabilidad/configuracion?tab=${tab}&${clave}=${encodeURIComponent(mensaje)}`)
}

export async function guardarEmpresaContable(formData: FormData) {
  const razon = txt(formData, 'razon_social')
  const nit = txt(formData, 'nit')
  const direccion = txt(formData, 'direccion')
  const regimen = txt(formData, 'regimen_iva')
  const tasa = Number(txt(formData, 'tasa_impuesto').replace(',', '.'))
  if (!razon || !nit || !direccion) volver('datos', 'error', 'Razón social, NIT y dirección son obligatorios')
  if (!Number.isFinite(tasa) || tasa < 0 || tasa >= 100) volver('datos', 'error', 'La tasa debe estar entre 0 y 99.99 %')

  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_guardar_empresa_contable', {
    p_razon_social: razon,
    p_nombre_comercial: txt(formData, 'nombre_comercial') || null,
    p_nit: nit,
    p_direccion: direccion,
    p_regimen_iva: regimen,
    p_tasa_impuesto: tasa,
    p_fecha_inicio_contable: txt(formData, 'fecha_inicio_contable') || null,
    p_contador_nombre: txt(formData, 'contador_nombre') || null,
    p_contador_registro: txt(formData, 'contador_registro') || null,
  })
  if (error) volver('datos', 'error', error.message)
  revalidatePath('/contabilidad', 'layout')
  volver('datos', 'ok', 'Datos contables guardados')
}

export async function guardarMapeo(formData: FormData) {
  const eventos = formData.getAll('clave').map((v) => {
    const clave = String(v)
    return {
      clave,
      cuenta_id: txt(formData, `cuenta_${clave}`) || null,
      centro_costo_id: txt(formData, `cc_${clave}`) || null,
    }
  })
  const bancos = formData.getAll('cuenta_bancaria_id').map((v) => ({
    cuenta_bancaria_id: String(v),
    cuenta_contable_id: txt(formData, `banco_${v}`) || null,
  }))
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_ctb_guardar_mapeo', { p_eventos: eventos, p_bancos: bancos })
  if (error) volver('mapeo', 'error', error.message)
  revalidatePath('/contabilidad/configuracion')
  volver('mapeo', 'ok', 'Mapeo de cuentas guardado')
}

export async function cambiarAutomatica(formData: FormData) {
  const activar = txt(formData, 'activar') === '1'
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_ctb_configurar_automatica', { p_activa: activar })
  if (error) volver('automatica', 'error', error.message)
  revalidatePath('/contabilidad', 'layout')
  const apertura = (data as { apertura_id?: number } | null)?.apertura_id
  if (apertura) {
    redirect(
      `/contabilidad/partidas/${apertura}?ok=${encodeURIComponent(
        'Partidas automáticas activadas. Esta es la partida de apertura generada con los saldos de hoy: revísala, complétala y contabilízala.',
      )}`,
    )
  }
  volver('automatica', 'ok', activar ? 'Partidas automáticas activadas' : 'Partidas automáticas apagadas')
}

export async function generarApertura() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_ctb_generar_apertura')
  if (error) volver('automatica', 'error', error.message)
  revalidatePath('/contabilidad/partidas')
  redirect(`/contabilidad/partidas/${data as number}?ok=${encodeURIComponent('Partida de apertura generada en borrador')}`)
}
