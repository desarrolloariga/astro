/** Política de envío vigente (espejo de public.politicas_envio). */
export type PoliticaEnvio = {
  tarifa: number
  envio_gratis_desde: number | null
  costo_real: number
  cobrar_publico: boolean
  cobrar_backoffice_cliente: boolean
  cobrar_compra_propia: boolean
}

export type TipoCompraEnvio = 'publico' | 'backoffice_cliente' | 'propio'

/** Mismo cálculo que public.fn_calcular_envio: lo que se cobra de envío por una compra de `monto` en productos. */
export function calcularEnvio(politica: PoliticaEnvio | null | undefined, monto: number, tipo: TipoCompraEnvio): number {
  if (!politica) return 0
  const cobra =
    tipo === 'publico' ? politica.cobrar_publico : tipo === 'backoffice_cliente' ? politica.cobrar_backoffice_cliente : politica.cobrar_compra_propia
  if (!cobra) return 0
  if (politica.envio_gratis_desde != null && monto >= Number(politica.envio_gratis_desde)) return 0
  return Number(politica.tarifa) || 0
}

/** Cuánto le falta al cliente para envío gratis (null si no aplica). */
export function faltaParaEnvioGratis(politica: PoliticaEnvio | null | undefined, monto: number, tipo: TipoCompraEnvio): number | null {
  if (!politica || politica.envio_gratis_desde == null) return null
  if (calcularEnvio(politica, monto, tipo) === 0) return null
  return Math.max(0, Number(politica.envio_gratis_desde) - monto)
}
