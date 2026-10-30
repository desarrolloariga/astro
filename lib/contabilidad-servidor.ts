import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import type { CentroCosto, CuentaDetalle } from '@/lib/contabilidad-general'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

type Accion = 'partida_en_periodo_cerrado' | 'reabrir_periodo'

/** Último día bloqueado por cierre de mes (null = no hay meses cerrados). */
export async function fechaBloqueo(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.rpc('fn_fecha_bloqueo_contable')
  return (data as string | null) ?? null
}

/**
 * Si alguna de las fechas cae en un mes cerrado, valida PIN + motivo del
 * formulario y devuelve el id de la autorización. Es una llamada aparte de la
 * operación para que los intentos fallidos de PIN queden registrados.
 */
export async function autorizarSiCerrado(
  supabase: SupabaseClient,
  fechas: (string | null | undefined)[],
  formData: FormData,
  accion: Accion = 'partida_en_periodo_cerrado',
): Promise<{ autorizacionId: number | null; error?: string }> {
  const bloqueo = await fechaBloqueo(supabase)
  const cerrada = bloqueo ? fechas.find((f) => f && f <= bloqueo) : undefined
  if (!cerrada) return { autorizacionId: null }

  const pin = String(formData.get('pin') ?? '').trim()
  const motivo = String(formData.get('motivo_cierre') ?? '').trim()
  if (!pin) return { autorizacionId: null, error: 'Ese mes está cerrado: ingresa tu PIN contable y el motivo del cambio' }
  const { data, error } = await supabase.rpc('fn_autorizar_periodo_cerrado', {
    p_fecha: cerrada,
    p_pin: pin,
    p_motivo: motivo,
    p_accion: accion,
  })
  if (error) return { autorizacionId: null, error: error.message }
  const r = data as { ok: boolean; id?: number; error?: string }
  if (!r?.ok) return { autorizacionId: null, error: r?.error ?? 'No se pudo autorizar' }
  return { autorizacionId: r.id ?? null }
}

/** Cuentas de detalle activas y centros de costo activos para capturar partidas. */
export async function cargarCatalogosCaptura(supabase: SupabaseClient) {
  const [{ data: cuentas }, { data: centros }] = await Promise.all([
    supabase
      .from('cuentas_contables')
      .select('id, codigo, nombre, tipo, exige_centro_costo')
      .eq('es_detalle', true)
      .eq('activo', true)
      .order('codigo'),
    supabase.from('centros_costo').select('id, codigo, nombre').eq('activo', true).order('codigo'),
  ])
  return {
    cuentas: (cuentas ?? []) as CuentaDetalle[],
    centros: (centros ?? []) as CentroCosto[],
  }
}

/** Enlace a la operación de origen de cada partida o pendiente (venta y cobro llevan al pedido). */
export async function enlacesOrigen(
  supabase: SupabaseClient,
  items: { origen: string; origen_id: number | null }[],
): Promise<Map<string, string>> {
  const ids = (o: string[]) => [...new Set(items.filter((i) => o.includes(i.origen) && i.origen_id).map((i) => i.origen_id as number))]
  const ventas = ids(['venta', 'venta_costo'])
  const pagos = ids(['pago'])
  const [{ data: pagosData }] = await Promise.all([
    pagos.length ? supabase.from('pagos').select('id, venta_id').in('id', pagos) : Promise.resolve({ data: [] }),
  ])
  const ventaDePago = new Map(((pagosData ?? []) as { id: number; venta_id: number }[]).map((p) => [p.id, p.venta_id]))
  const todasVentas = [...new Set([...ventas, ...ventaDePago.values()])]
  const { data: pedidosData } = todasVentas.length
    ? await supabase.from('pedidos').select('id, venta_id').in('venta_id', todasVentas)
    : { data: [] }
  const pedidoDeVenta = new Map(((pedidosData ?? []) as { id: number; venta_id: number }[]).map((p) => [p.venta_id, p.id]))

  const enlaces = new Map<string, string>()
  for (const { origen, origen_id: id } of items) {
    if (!id) continue
    const clave = `${origen}:${id}`
    const pedido = origen === 'pago' ? pedidoDeVenta.get(ventaDePago.get(id) ?? 0) : pedidoDeVenta.get(id)
    const href =
      origen === 'venta' || origen === 'venta_costo' || origen === 'pago'
        ? pedido
          ? `/pedidos/${pedido}`
          : null
        : origen === 'compra'
          ? `/compras/${id}`
          : origen === 'metal'
            ? `/recepcion-metal/${id}`
            : origen === 'gasto'
              ? '/contabilidad/gastos'
              : origen === 'banco' || origen === 'saldo_banco'
                ? '/contabilidad/bancos'
                : origen === 'liquidacion'
                  ? '/admin/comisiones'
                  : origen === 'canje'
                    ? '/premiaciones'
                    : origen === 'baja_activo'
                      ? `/contabilidad/activos/${id}`
                      : origen === 'depreciacion'
                      ? '/contabilidad/activos'
                      : origen === 'factura_proveedor'
                      ? `/contabilidad/cxp/${id}`
                      : origen === 'toma'
                      ? `/inventario/toma-fisica/${id}`
                      : origen === 'reversion'
                      ? `/contabilidad/partidas/${id}`
                      : null
    if (href) enlaces.set(clave, href)
  }
  return enlaces
}
