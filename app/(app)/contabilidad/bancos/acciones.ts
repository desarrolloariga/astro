'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function texto(formData: FormData, nombre: string) {
  return String(formData.get(nombre) ?? '').trim()
}

function numero(formData: FormData, nombre: string): number | null {
  const t = texto(formData, nombre).replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function volver(formData: FormData, clave: 'ok' | 'error', mensaje: string): never {
  const destino = texto(formData, 'volver')
  const base = destino.startsWith('/contabilidad/') ? destino : '/contabilidad/bancos'
  redirect(`${base}${base.includes('?') ? '&' : '?'}${clave}=${encodeURIComponent(mensaje)}`)
}

function refrescar() {
  revalidatePath('/contabilidad/bancos')
  revalidatePath('/contabilidad/bancos/conciliacion')
  revalidatePath('/contabilidad/flujo-caja')
}

export async function guardarCuenta(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_guardar_cuenta_bancaria', {
    p_id: numero(formData, 'id'),
    p_nombre: texto(formData, 'nombre'),
    p_banco: texto(formData, 'banco'),
    p_numero: texto(formData, 'numero'),
    p_tipo: texto(formData, 'tipo') || 'monetaria',
    p_saldo_inicial: numero(formData, 'saldo_inicial') ?? 0,
    p_fecha_saldo_inicial: texto(formData, 'fecha_saldo_inicial') || null,
    p_activa: formData.get('activa') !== 'no',
  })
  refrescar()
  if (error) volver(formData, 'error', error.message)
  volver(formData, 'ok', 'Cuenta guardada')
}

/** Registra en bancos un pendiente (cobro, gasto, pago a proveedor o liquidación). */
export async function registrarPendiente(formData: FormData) {
  const tipo = texto(formData, 'tipo')
  const id = numero(formData, 'id')
  const cuenta = numero(formData, 'cuenta_id')
  const fecha = texto(formData, 'fecha') || null
  if (!id || !cuenta) volver(formData, 'error', 'Elige la cuenta')

  const supabase = await createClient()
  const llamadas: Record<string, () => PromiseLike<{ error: { message: string } | null }>> = {
    cobro: () => supabase.rpc('fn_banco_registrar_cobro', { p_pago_id: id, p_cuenta_id: cuenta, p_fecha: fecha }),
    gasto: () => supabase.rpc('fn_banco_registrar_gasto', { p_gasto_id: id, p_cuenta_id: cuenta, p_fecha: fecha }),
    compra: () =>
      supabase.rpc('fn_banco_registrar_pago_compra', {
        p_orden_compra_id: id,
        p_cuenta_id: cuenta,
        p_fecha: fecha,
        p_monto: numero(formData, 'monto'),
        p_referencia: texto(formData, 'referencia') || null,
      }),
    liquidacion: () => supabase.rpc('fn_banco_registrar_liquidacion', { p_liquidacion_id: id, p_cuenta_id: cuenta, p_fecha: fecha }),
  }
  const llamada = llamadas[tipo]
  if (!llamada) volver(formData, 'error', 'Tipo inválido')
  const { error } = await llamada()
  refrescar()
  if (error) volver(formData, 'error', error.message)
  volver(formData, 'ok', 'Registrado en bancos')
}

export async function movimientoManual(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_banco_movimiento_manual', {
    p_cuenta_id: numero(formData, 'cuenta_id'),
    p_fecha: texto(formData, 'fecha'),
    p_tipo: texto(formData, 'tipo'),
    p_origen: texto(formData, 'origen'),
    p_monto: numero(formData, 'monto'),
    p_descripcion: texto(formData, 'descripcion'),
    p_referencia: texto(formData, 'referencia') || null,
  })
  refrescar()
  if (error) volver(formData, 'error', error.message)
  volver(formData, 'ok', 'Movimiento registrado')
}

export async function transferencia(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_banco_transferencia', {
    p_cuenta_origen: numero(formData, 'cuenta_origen'),
    p_cuenta_destino: numero(formData, 'cuenta_destino'),
    p_fecha: texto(formData, 'fecha'),
    p_monto: numero(formData, 'monto'),
    p_descripcion: texto(formData, 'descripcion') || null,
  })
  refrescar()
  if (error) volver(formData, 'error', error.message)
  volver(formData, 'ok', 'Transferencia registrada')
}

export async function anularMovimiento(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_banco_anular_movimiento', {
    p_movimiento_id: numero(formData, 'movimiento_id'),
    p_motivo: texto(formData, 'motivo'),
  })
  refrescar()
  if (error) volver(formData, 'error', error.message)
  volver(formData, 'ok', 'Movimiento anulado')
}

/** Guarda las marcas de conciliado de los movimientos mostrados. */
export async function guardarConciliados(formData: FormData) {
  const mostrados = formData.getAll('mostrado').map(Number).filter(Boolean)
  const marcados = new Set(formData.getAll('conciliado').map(Number))
  const supabase = await createClient()
  const si = mostrados.filter((id) => marcados.has(id))
  const no = mostrados.filter((id) => !marcados.has(id))
  const [r1, r2] = await Promise.all([
    si.length ? supabase.rpc('fn_banco_marcar_conciliado', { p_ids: si, p_conciliado: true }) : Promise.resolve({ error: null }),
    no.length ? supabase.rpc('fn_banco_marcar_conciliado', { p_ids: no, p_conciliado: false }) : Promise.resolve({ error: null }),
  ])
  refrescar()
  const error = r1.error ?? r2.error
  if (error) volver(formData, 'error', error.message)
  volver(formData, 'ok', `Conciliación guardada: ${si.length} movimiento(s) marcados`)
}

export async function cerrarConciliacion(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('fn_cerrar_conciliacion', {
    p_cuenta_id: numero(formData, 'cuenta_id'),
    p_desde: texto(formData, 'desde'),
    p_hasta: texto(formData, 'hasta'),
    p_saldo_banco: numero(formData, 'saldo_banco'),
    p_notas: texto(formData, 'notas') || null,
  })
  refrescar()
  if (error) volver(formData, 'error', error.message)
  volver(formData, 'ok', 'Conciliación cerrada y guardada en el historial')
}
