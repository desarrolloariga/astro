import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { numeroPartida, textoAlCorte, textoPeriodo, TIPOS_PARTIDA } from '@/lib/contabilidad-general'
import { ESTILO, cargarEmpresa, type Columna, type ReporteTabla } from './tabla'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export type ClaveReporte =
  | 'balance_saldos'
  | 'balance_general'
  | 'estado_resultados_cc'
  | 'flujo_directo'
  | 'flujo_indirecto'
  | 'libro_diario'
  | 'libro_mayor'
  | 'diario_mayor'
  | 'libro_compras'
  | 'libro_ventas'
  | 'libro_inventarios'
  | 'activos_fijos'

/** Catálogo: título, si es libro foliado (y su clave de folios) y si va por rango o a una fecha. */
export const REPORTES: Record<ClaveReporte, { titulo: string; libro?: string; corte?: boolean; descripcion: string }> = {
  balance_saldos: { titulo: 'Balance de saldos', descripcion: 'Saldo anterior, movimiento y saldo final por cuenta' },
  balance_general: { titulo: 'Balance general', corte: true, descripcion: 'Activo, pasivo y patrimonio a una fecha' },
  estado_resultados_cc: { titulo: 'Estado de resultados por centro de costo', descripcion: 'Ingresos, costos, gastos y utilidad por centro' },
  flujo_directo: { titulo: 'Estado de flujo de efectivo (método directo)', descripcion: 'Entradas y salidas de efectivo por actividad' },
  flujo_indirecto: { titulo: 'Estado de flujo de efectivo (método indirecto)', descripcion: 'De la utilidad neta al efectivo generado' },
  libro_diario: { titulo: 'Libro diario', libro: 'diario', descripcion: 'Partidas contabilizadas en orden cronológico' },
  libro_mayor: { titulo: 'Libro mayor', libro: 'mayor', descripcion: 'Movimientos y saldo de cada cuenta' },
  diario_mayor: { titulo: 'Libro diario mayor general', libro: 'diario_mayor', descripcion: 'Resumen por cuenta de mayor: saldo anterior, debe, haber y saldo' },
  libro_compras: { titulo: 'Libro de compras y servicios', libro: 'compras', descripcion: 'Facturas de proveedores: bienes, servicios e IVA crédito' },
  libro_ventas: { titulo: 'Libro de ventas y servicios', libro: 'ventas', descripcion: 'Facturas de venta con su impuesto' },
  libro_inventarios: { titulo: 'Libro de inventarios', libro: 'inventarios', corte: true, descripcion: 'Inventario valorizado PEPS y detalle de activo, pasivo y patrimonio' },
  activos_fijos: { titulo: 'Integración de activos fijos', corte: true, descripcion: 'Costo, depreciación acumulada y valor en libros por activo' },
}

export type ParametrosReporte = { desde: string; hasta: string; nivel?: number }

type FilaSaldos = {
  codigo: string
  nombre: string
  tipo: string
  naturaleza: string
  es_detalle: boolean
  nivel: number
  saldo_anterior: number
  debe: number
  haber: number
  saldo_final: number
}

const sangria = (nivel: number) => '  '.repeat(Math.max(0, nivel - 1))
const n = (v: unknown) => Number(v ?? 0)

async function balanceSaldos(supabase: SupabaseClient, p: ParametrosReporte, nivel: number) {
  const { data, error } = await supabase.rpc('fn_balance_saldos', { p_desde: p.desde, p_hasta: p.hasta, p_nivel: nivel, p_centro_costo_id: null })
  if (error) throw new Error(error.message)
  const filas = ((data ?? []) as FilaSaldos[]).filter((f) => n(f.saldo_anterior) || n(f.debe) || n(f.haber) || n(f.saldo_final))
  const raiz = filas.filter((f) => f.nivel === 1)
  const suma = (fn: (f: FilaSaldos) => number) => raiz.reduce((a, f) => a + fn(f), 0)
  const columnas: Columna[] = [
    { titulo: 'Código', clave: 'codigo', ancho: 10 },
    { titulo: 'Cuenta', clave: 'cuenta', ancho: 30 },
    { titulo: 'Saldo ant. deudor', clave: 'ad', ancho: 12, tipo: 'monto' },
    { titulo: 'Saldo ant. acreedor', clave: 'aa', ancho: 12, tipo: 'monto' },
    { titulo: 'Debe', clave: 'debe', ancho: 12, tipo: 'monto' },
    { titulo: 'Haber', clave: 'haber', ancho: 12, tipo: 'monto' },
    { titulo: 'Saldo deudor', clave: 'fd', ancho: 12, tipo: 'monto' },
    { titulo: 'Saldo acreedor', clave: 'fa', ancho: 12, tipo: 'monto' },
  ]
  return {
    columnas,
    filas: filas.map((f) => ({
      codigo: f.codigo,
      cuenta: sangria(f.nivel) + f.nombre,
      ad: n(f.saldo_anterior) > 0 ? n(f.saldo_anterior) : null,
      aa: n(f.saldo_anterior) < 0 ? -n(f.saldo_anterior) : null,
      debe: n(f.debe) || null,
      haber: n(f.haber) || null,
      fd: n(f.saldo_final) > 0 ? n(f.saldo_final) : null,
      fa: n(f.saldo_final) < 0 ? -n(f.saldo_final) : null,
      [ESTILO]: f.es_detalle ? undefined : 'subtotal',
    })),
    totales: {
      cuenta: 'Sumas iguales',
      ad: suma((f) => Math.max(n(f.saldo_anterior), 0)),
      aa: suma((f) => Math.max(-n(f.saldo_anterior), 0)),
      debe: suma((f) => n(f.debe)),
      haber: suma((f) => n(f.haber)),
      fd: suma((f) => Math.max(n(f.saldo_final), 0)),
      fa: suma((f) => Math.max(-n(f.saldo_final), 0)),
    },
  }
}

async function balanceGeneral(supabase: SupabaseClient, fecha: string, nivel: number) {
  const { data, error } = await supabase.rpc('fn_ctb_balance_general', { p_fecha: fecha, p_nivel: nivel })
  if (error) throw new Error(error.message)
  const b = data as {
    filas: { codigo: string; nombre: string; tipo: string; nivel: number; es_detalle: boolean; saldo: number }[]
    total_activo: number
    total_pasivo: number
    patrimonio_contable: number
    resultado_ejercicio: number
    resultados_anteriores: number
    total_patrimonio: number
    total_pasivo_patrimonio: number
  }
  const filas: Record<string, unknown>[] = []
  const seccion = (tipo: string, titulo: string, total: number, extra: Record<string, unknown>[] = []) => {
    filas.push({ cuenta: titulo, [ESTILO]: 'titulo' })
    b.filas
      .filter((f) => f.tipo === tipo && f.nivel > 1)
      .forEach((f) => filas.push({ codigo: f.codigo, cuenta: sangria(f.nivel - 1) + f.nombre, saldo: n(f.saldo), [ESTILO]: f.es_detalle ? undefined : 'subtotal' }))
    filas.push(...extra)
    filas.push({ cuenta: `Total ${titulo.toLowerCase()}`, saldo: total, [ESTILO]: 'total' })
  }
  seccion('activo', 'ACTIVO', n(b.total_activo))
  seccion('pasivo', 'PASIVO', n(b.total_pasivo))
  seccion('patrimonio', 'PATRIMONIO', n(b.total_patrimonio), [
    ...(n(b.resultados_anteriores) ? [{ cuenta: '  Resultados de ejercicios anteriores (sin partida de cierre)', saldo: n(b.resultados_anteriores) }] : []),
    { cuenta: '  Resultado del ejercicio', saldo: n(b.resultado_ejercicio) },
  ])
  return {
    columnas: [
      { titulo: 'Código', clave: 'codigo', ancho: 10 },
      { titulo: 'Cuenta', clave: 'cuenta', ancho: 46 },
      { titulo: 'Saldo', clave: 'saldo', ancho: 16, tipo: 'monto' },
    ] as Columna[],
    filas,
    totales: { cuenta: 'TOTAL PASIVO Y PATRIMONIO', saldo: n(b.total_pasivo_patrimonio) },
  }
}

async function estadoResultadosCc(supabase: SupabaseClient, p: ParametrosReporte, nivel: number) {
  const { data, error } = await supabase.rpc('fn_ctb_estado_resultados_cc', { p_desde: p.desde, p_hasta: p.hasta, p_nivel: nivel })
  if (error) throw new Error(error.message)
  const e = data as {
    centros: { id: number; codigo: string; nombre: string }[]
    filas: { codigo: string; nombre: string; tipo: string; nivel: number; es_detalle: boolean; por_cc: Record<string, number>; total: number }[]
    resumen: Record<string, { ingresos: number; costos: number; gastos: number; utilidad: number }>
  }
  const columnas: Columna[] = [
    { titulo: 'Código', clave: 'codigo', ancho: 9 },
    { titulo: 'Cuenta', clave: 'cuenta', ancho: 26 },
    ...e.centros.map((c) => ({ titulo: c.codigo, clave: `cc_${c.id}`, ancho: 11, tipo: 'monto' as const })),
    { titulo: 'Total', clave: 'total', ancho: 12, tipo: 'monto' },
  ]
  const porCc = (valor: (id: string) => number) => Object.fromEntries(e.centros.map((c) => [`cc_${c.id}`, valor(String(c.id)) || null]))
  const resumen = (k: 'ingresos' | 'costos' | 'gastos' | 'utilidad') => ({ ...porCc((id) => n(e.resumen[id]?.[k])), total: n(e.resumen['-1']?.[k]) })
  const filas: Record<string, unknown>[] = []
  for (const [tipo, titulo] of [['ingreso', 'INGRESOS'], ['costo', 'COSTOS'], ['gasto', 'GASTOS']] as const) {
    filas.push({ cuenta: titulo, [ESTILO]: 'titulo' })
    e.filas
      .filter((f) => f.tipo === tipo && f.nivel > 1)
      .forEach((f) =>
        filas.push({
          codigo: f.codigo,
          cuenta: sangria(f.nivel - 1) + f.nombre,
          ...porCc((id) => n(f.por_cc[id])),
          total: n(f.total),
          [ESTILO]: f.es_detalle ? undefined : 'subtotal',
        }),
      )
    const clave = tipo === 'ingreso' ? 'ingresos' : tipo === 'costo' ? 'costos' : 'gastos'
    filas.push({ cuenta: `Total ${titulo.toLowerCase()}`, ...resumen(clave), [ESTILO]: 'total' })
    if (tipo === 'costo') {
      filas.push({
        cuenta: 'UTILIDAD BRUTA',
        ...porCc((id) => n(e.resumen[id]?.ingresos) - n(e.resumen[id]?.costos)),
        total: n(e.resumen['-1']?.ingresos) - n(e.resumen['-1']?.costos),
        [ESTILO]: 'total',
      })
    }
  }
  return { columnas, filas, totales: { cuenta: 'UTILIDAD (PÉRDIDA) NETA', ...resumen('utilidad') } }
}

const CATEGORIAS_DIRECTO: [string, string][] = [
  ['cobros_clientes', 'Cobros a clientes'],
  ['pagos_proveedores', 'Pagos a proveedores'],
  ['pagos_red', 'Pagos de comisiones y Billetera a la red'],
  ['pagos_personal', 'Pagos al personal'],
  ['impuestos', 'Pagos de impuestos'],
  ['gastos_operacion', 'Otros gastos de operación'],
  ['otros_operacion', 'Otras entradas y salidas de operación'],
]

async function flujo(supabase: SupabaseClient, p: ParametrosReporte, metodo: 'directo' | 'indirecto') {
  const { data, error } = await supabase.rpc('fn_ctb_flujo_efectivo', { p_desde: p.desde, p_hasta: p.hasta })
  if (error) throw new Error(error.message)
  const f = data as {
    efectivo_inicial: number
    efectivo_final: number
    variacion: number
    directo: Record<string, number>
    indirecto: {
      utilidad: number
      depreciacion: number
      capital_trabajo: number
      inversion: number
      financiamiento: number
      detalle_capital_trabajo: { codigo: string; nombre: string; efecto: number }[]
    }
  }
  const filas: Record<string, unknown>[] = [{ concepto: 'ACTIVIDADES DE OPERACIÓN', [ESTILO]: 'titulo' }]
  let operacion = 0
  if (metodo === 'directo') {
    for (const [k, e] of CATEGORIAS_DIRECTO) {
      if (n(f.directo[k])) filas.push({ concepto: `  ${e}`, monto: n(f.directo[k]) })
      operacion += n(f.directo[k])
    }
  } else {
    filas.push({ concepto: '  Utilidad (pérdida) neta del período', monto: n(f.indirecto.utilidad) })
    filas.push({ concepto: '  (+) Depreciaciones y amortizaciones', monto: n(f.indirecto.depreciacion) })
    filas.push({ concepto: '  Cambios en capital de trabajo:', [ESTILO]: 'subtotal' })
    f.indirecto.detalle_capital_trabajo.forEach((d) => filas.push({ concepto: `    ${d.codigo} ${d.nombre}`, monto: n(d.efecto) }))
    operacion = n(f.indirecto.utilidad) + n(f.indirecto.depreciacion) + n(f.indirecto.capital_trabajo)
  }
  const inversion = metodo === 'directo' ? n(f.directo.inversion) : n(f.indirecto.inversion)
  const financiamiento = metodo === 'directo' ? n(f.directo.financiamiento) : n(f.indirecto.financiamiento)
  filas.push({ concepto: 'Flujo neto de actividades de operación', monto: operacion, [ESTILO]: 'total' })
  filas.push({ concepto: 'ACTIVIDADES DE INVERSIÓN', [ESTILO]: 'titulo' })
  filas.push({ concepto: '  Compra y venta de activos fijos e intangibles', monto: inversion })
  filas.push({ concepto: 'Flujo neto de actividades de inversión', monto: inversion, [ESTILO]: 'total' })
  filas.push({ concepto: 'ACTIVIDADES DE FINANCIAMIENTO', [ESTILO]: 'titulo' })
  filas.push({ concepto: '  Préstamos, aportes y retiros de capital', monto: financiamiento })
  filas.push({ concepto: 'Flujo neto de actividades de financiamiento', monto: financiamiento, [ESTILO]: 'total' })
  filas.push({ concepto: 'Variación neta del efectivo', monto: operacion + inversion + financiamiento, [ESTILO]: 'subtotal' })
  filas.push({ concepto: 'Efectivo y equivalentes al inicio del período', monto: n(f.efectivo_inicial) })
  return {
    columnas: [
      { titulo: 'Concepto', clave: 'concepto', ancho: 60 },
      { titulo: 'Monto', clave: 'monto', ancho: 16, tipo: 'monto' },
    ] as Columna[],
    filas,
    totales: { concepto: 'EFECTIVO Y EQUIVALENTES AL FINAL DEL PERÍODO', monto: n(f.efectivo_final) },
  }
}

type PartidaDiario = {
  anio: number
  numero: number
  fecha: string
  tipo: string
  descripcion: string
  total_debe: number
  total_haber: number
  lineas: { codigo: string; cuenta: string; centro_costo: string | null; debe: number; haber: number; descripcion: string | null }[]
}

async function libroDiario(supabase: SupabaseClient, p: ParametrosReporte) {
  const partidas: PartidaDiario[] = []
  let totales = { debe: 0, haber: 0 }
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.rpc('fn_libro_diario', { p_desde: p.desde, p_hasta: p.hasta, p_offset: offset, p_limit: 500 })
    if (error) throw new Error(error.message)
    const d = data as { total: number; totales: { debe: number; haber: number }; partidas: PartidaDiario[] }
    partidas.push(...d.partidas)
    totales = d.totales
    if (partidas.length >= d.total || d.partidas.length === 0) break
  }
  const filas: Record<string, unknown>[] = []
  for (const pa of partidas) {
    filas.push({
      fecha: pa.fecha,
      cuenta: `Partida ${numeroPartida(pa.anio, pa.numero)} · ${TIPOS_PARTIDA[pa.tipo] ?? pa.tipo}`,
      [ESTILO]: 'titulo',
    })
    pa.lineas.forEach((l) =>
      filas.push({
        codigo: l.codigo,
        cuenta: (n(l.haber) > 0 ? '      ' : '') + l.cuenta,
        cc: l.centro_costo,
        debe: n(l.debe) || null,
        haber: n(l.haber) || null,
      }),
    )
    filas.push({ cuenta: `   ${pa.descripcion}`, debe: n(pa.total_debe), haber: n(pa.total_haber), [ESTILO]: 'subtotal' })
  }
  return {
    columnas: [
      { titulo: 'Fecha', clave: 'fecha', ancho: 9, tipo: 'fecha' },
      { titulo: 'Código', clave: 'codigo', ancho: 10 },
      { titulo: 'Cuenta / concepto', clave: 'cuenta', ancho: 42 },
      { titulo: 'C. costo', clave: 'cc', ancho: 8 },
      { titulo: 'Debe', clave: 'debe', ancho: 13, tipo: 'monto' },
      { titulo: 'Haber', clave: 'haber', ancho: 13, tipo: 'monto' },
    ] as Columna[],
    filas,
    totales: { cuenta: `Total del período (${partidas.length} partidas)`, debe: n(totales.debe), haber: n(totales.haber) },
  }
}

async function libroMayor(supabase: SupabaseClient, p: ParametrosReporte) {
  const { data, error } = await supabase.rpc('fn_libro_mayor_general', { p_desde: p.desde, p_hasta: p.hasta })
  if (error) throw new Error(error.message)
  const cuentas = (data ?? []) as {
    cuenta: { codigo: string; nombre: string; naturaleza: string }
    saldo_anterior: number
    debe: number
    haber: number
    saldo_final: number
    movimientos: { fecha: string; anio: number; numero: number; partida: string; debe: number; haber: number; saldo: number }[]
  }[]
  const filas: Record<string, unknown>[] = []
  for (const c of cuentas) {
    const s = c.cuenta.naturaleza === 'acreedora' ? -1 : 1
    filas.push({ concepto: `${c.cuenta.codigo} ${c.cuenta.nombre}`, [ESTILO]: 'titulo' })
    filas.push({ concepto: 'Saldo anterior', saldo: s * n(c.saldo_anterior) })
    c.movimientos.forEach((m) =>
      filas.push({ fecha: m.fecha, partida: numeroPartida(m.anio, m.numero), concepto: m.partida, debe: n(m.debe) || null, haber: n(m.haber) || null, saldo: s * n(m.saldo) }),
    )
    filas.push({ concepto: 'Totales y saldo final', debe: n(c.debe), haber: n(c.haber), saldo: s * n(c.saldo_final), [ESTILO]: 'subtotal' })
  }
  return {
    columnas: [
      { titulo: 'Fecha', clave: 'fecha', ancho: 9, tipo: 'fecha' },
      { titulo: 'Partida', clave: 'partida', ancho: 11 },
      { titulo: 'Concepto', clave: 'concepto', ancho: 40 },
      { titulo: 'Debe', clave: 'debe', ancho: 13, tipo: 'monto' },
      { titulo: 'Haber', clave: 'haber', ancho: 13, tipo: 'monto' },
      { titulo: 'Saldo', clave: 'saldo', ancho: 13, tipo: 'monto' },
    ] as Columna[],
    filas,
    nota: 'Saldos expresados en la naturaleza de cada cuenta (deudora o acreedora).',
  }
}

async function libroCompras(supabase: SupabaseClient, p: ParametrosReporte) {
  const { data, error } = await supabase.rpc('fn_libro_compras', { p_desde: p.desde, p_hasta: p.hasta })
  if (error) throw new Error(error.message)
  const l = data as { filas: Record<string, unknown>[]; totales: Record<string, number> }
  const tipos: Record<string, string> = { factura: 'FACT', factura_pequeno_contribuyente: 'FPEQ', recibo: 'REC', otro: 'OTRO' }
  return {
    columnas: [
      { titulo: 'Fecha', clave: 'fecha_emision', ancho: 9, tipo: 'fecha' },
      { titulo: 'Tipo', clave: 'tipo', ancho: 6 },
      { titulo: 'Serie', clave: 'serie', ancho: 8 },
      { titulo: 'Número', clave: 'numero', ancho: 11 },
      { titulo: 'NIT', clave: 'nit', ancho: 10 },
      { titulo: 'Proveedor', clave: 'proveedor', ancho: 22 },
      { titulo: 'Bienes', clave: 'bienes', ancho: 11, tipo: 'monto' },
      { titulo: 'Servicios', clave: 'servicios', ancho: 11, tipo: 'monto' },
      { titulo: 'Sin crédito fiscal', clave: 'sin_credito', ancho: 11, tipo: 'monto' },
      { titulo: 'IVA', clave: 'iva', ancho: 10, tipo: 'monto' },
      { titulo: 'Total', clave: 'total', ancho: 11, tipo: 'monto' },
    ] as Columna[],
    filas: l.filas.map((f) => ({
      ...f,
      tipo: tipos[String(f.tipo_documento)] ?? f.tipo_documento,
      proveedor: f.estado === 'anulada' ? `ANULADA · ${f.nombre}` : f.nombre,
    })),
    totales: { proveedor: `Total (${l.totales.documentos} documentos)`, ...l.totales },
    nota: 'Sin crédito fiscal: facturas de pequeño contribuyente, recibos y otros documentos que no generan IVA crédito.',
  }
}

async function libroVentas(supabase: SupabaseClient, p: ParametrosReporte) {
  const { data, error } = await supabase.rpc('fn_libro_ventas', { p_desde: p.desde, p_hasta: p.hasta })
  if (error) throw new Error(error.message)
  const l = data as { filas: Record<string, unknown>[]; totales: Record<string, number>; regimen: string }
  return {
    columnas: [
      { titulo: 'Fecha', clave: 'fecha_emision', ancho: 9, tipo: 'fecha' },
      { titulo: 'Serie', clave: 'serie', ancho: 8 },
      { titulo: 'Número', clave: 'numero', ancho: 12 },
      { titulo: 'NIT', clave: 'nit', ancho: 10 },
      { titulo: 'Cliente', clave: 'cliente', ancho: 26 },
      { titulo: 'Ventas', clave: 'base', ancho: 12, tipo: 'monto' },
      { titulo: l.regimen === 'general' ? 'IVA débito' : 'Impuesto PC', clave: 'impuesto', ancho: 11, tipo: 'monto' },
      { titulo: 'Total', clave: 'total', ancho: 12, tipo: 'monto' },
    ] as Columna[],
    filas: l.filas.map((f) => ({ ...f, cliente: f.estado === 'anulada' ? `ANULADA · ${f.nombre}` : f.nombre })),
    totales: { cliente: `Total (${l.totales.documentos} facturas, ${l.totales.anuladas} anuladas)`, ...l.totales },
  }
}

async function libroInventarios(supabase: SupabaseClient, fecha: string) {
  const filas: Record<string, unknown>[] = [{ descripcion: 'I. INVENTARIO DE MERCADERÍAS (método PEPS)', [ESTILO]: 'titulo' }]
  let valor = 0
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.rpc('fn_kardex_resumen', { p_hasta: fecha, p_buscar: null, p_offset: offset, p_limit: 1000 })
    if (error) throw new Error(error.message)
    const r = data as { total: number; totales: { valor: number }; filas: { codigo: string; nombre: string; cantidad: number; costo_promedio: number | null; valor: number }[] }
    r.filas.forEach((f) => filas.push({ codigo: f.codigo, descripcion: f.nombre, cantidad: n(f.cantidad), unitario: f.costo_promedio, valor: n(f.valor) }))
    valor = n(r.totales.valor)
    if (offset + 1000 >= r.total) break
  }
  filas.push({ descripcion: 'Total inventario de mercaderías', valor, [ESTILO]: 'total' })
  const bg = await balanceGeneral(supabase, fecha, 4)
  filas.push({ descripcion: 'II. DETALLE DE ACTIVO, PASIVO Y PATRIMONIO', [ESTILO]: 'titulo' })
  bg.filas.forEach((f) => filas.push({ codigo: f.codigo, descripcion: f.cuenta, valor: f.saldo, [ESTILO]: f[ESTILO] === 'titulo' ? 'subtotal' : f[ESTILO] }))
  return {
    columnas: [
      { titulo: 'Código', clave: 'codigo', ancho: 11 },
      { titulo: 'Descripción', clave: 'descripcion', ancho: 42 },
      { titulo: 'Cantidad', clave: 'cantidad', ancho: 10, tipo: 'numero' },
      { titulo: 'Costo unitario', clave: 'unitario', ancho: 12, tipo: 'monto' },
      { titulo: 'Valor', clave: 'valor', ancho: 14, tipo: 'monto' },
    ] as Columna[],
    filas,
    totales: { descripcion: 'TOTAL PASIVO Y PATRIMONIO', valor: bg.totales.saldo },
  }
}

async function activosFijos(supabase: SupabaseClient, fecha: string) {
  const { data, error } = await supabase.rpc('fn_af_consulta', { p_hasta: fecha, p_buscar: null, p_tipo_id: null, p_estado: null })
  if (error) throw new Error(error.message)
  const c = data as {
    filas: { codigo: string; descripcion: string; tipo: string; estado: string; fecha_adquisicion: string; ubicacion: string | null;
             costo: number; acumulada: number; valor_libros: number; fecha_baja: string | null }[]
    totales: { activos: number; costo: number; acumulada: number; valor_libros: number }
  }
  const vigentes = c.filas.filter((f) => f.estado === 'activo' || (f.fecha_baja && f.fecha_baja > fecha))
  const filas: Record<string, unknown>[] = []
  for (const tipo of [...new Set(vigentes.map((f) => f.tipo))].sort()) {
    const grupo = vigentes.filter((f) => f.tipo === tipo)
    filas.push({ descripcion: tipo, [ESTILO]: 'titulo' })
    grupo.forEach((f) => filas.push({ ...f }))
    filas.push({
      descripcion: `Total ${tipo.toLowerCase()}`,
      costo: grupo.reduce((a, f) => a + n(f.costo), 0),
      acumulada: grupo.reduce((a, f) => a + n(f.acumulada), 0),
      valor_libros: grupo.reduce((a, f) => a + n(f.valor_libros), 0),
      [ESTILO]: 'subtotal',
    })
  }
  return {
    columnas: [
      { titulo: 'Número', clave: 'codigo', ancho: 10 },
      { titulo: 'Descripción', clave: 'descripcion', ancho: 30 },
      { titulo: 'Ubicación', clave: 'ubicacion', ancho: 14 },
      { titulo: 'Adquisición', clave: 'fecha_adquisicion', ancho: 9, tipo: 'fecha' },
      { titulo: 'Costo', clave: 'costo', ancho: 12, tipo: 'monto' },
      { titulo: 'Dep. acumulada', clave: 'acumulada', ancho: 12, tipo: 'monto' },
      { titulo: 'Valor en libros', clave: 'valor_libros', ancho: 12, tipo: 'monto' },
    ] as Columna[],
    filas,
    totales: { descripcion: `Total (${c.totales.activos} activos)`, costo: n(c.totales.costo), acumulada: n(c.totales.acumulada), valor_libros: n(c.totales.valor_libros) },
  }
}

/** Construye cualquier reporte o libro con el encabezado SAT de 4 líneas. */
export async function construirReporte(supabase: SupabaseClient, clave: ClaveReporte, p: ParametrosReporte): Promise<ReporteTabla> {
  const def = REPORTES[clave]
  const empresa = await cargarEmpresa(supabase)
  const nivel = p.nivel ?? (clave === 'balance_saldos' ? 4 : 3)
  const cuerpo =
    clave === 'balance_saldos'
      ? await balanceSaldos(supabase, p, nivel)
      : clave === 'diario_mayor'
        ? await balanceSaldos(supabase, p, 3)
        : clave === 'balance_general'
          ? await balanceGeneral(supabase, p.hasta, nivel)
          : clave === 'estado_resultados_cc'
            ? await estadoResultadosCc(supabase, p, nivel)
            : clave === 'flujo_directo'
              ? await flujo(supabase, p, 'directo')
              : clave === 'flujo_indirecto'
                ? await flujo(supabase, p, 'indirecto')
                : clave === 'libro_diario'
                  ? await libroDiario(supabase, p)
                  : clave === 'libro_mayor'
                    ? await libroMayor(supabase, p)
                    : clave === 'libro_compras'
                      ? await libroCompras(supabase, p)
                      : clave === 'libro_ventas'
                        ? await libroVentas(supabase, p)
                        : clave === 'activos_fijos'
                          ? await activosFijos(supabase, p.hasta)
                          : await libroInventarios(supabase, p.hasta)
  return {
    ...empresa,
    titulo: def.titulo,
    periodo: def.corte ? textoAlCorte(p.hasta) : textoPeriodo(p.desde, p.hasta),
    nombreArchivo: `${clave.replace(/_/g, '-')}-${def.corte ? p.hasta : `${p.desde}-${p.hasta}`}`,
    orientacion: ['balance_general', 'flujo_directo', 'flujo_indirecto', 'libro_inventarios'].includes(clave) ? 'vertical' : 'horizontal',
    ...cuerpo,
  }
}
