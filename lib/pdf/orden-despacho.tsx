import 'server-only'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'astro-pedidos'

const estilos = StyleSheet.create({
  pagina: { padding: 36, fontSize: 10, fontFamily: 'Helvetica', color: '#1f2937' },
  encabezado: { flexDirection: 'row', justifyContent: 'space-between', borderBottom: '2 solid #0b2545', paddingBottom: 10, marginBottom: 16 },
  marca: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#0b2545' },
  submarca: { fontSize: 8, color: '#6b7280' },
  titulo: { fontSize: 14, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  seccion: { marginBottom: 14 },
  rotulo: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 },
  fila: { flexDirection: 'row', marginBottom: 2 },
  clave: { width: 110, color: '#6b7280' },
  valor: { flex: 1 },
  tabla: { border: '1 solid #e5e7eb' },
  tablaEncabezado: { flexDirection: 'row', backgroundColor: '#f3f4f6', fontFamily: 'Helvetica-Bold', padding: 5 },
  tablaFila: { flexDirection: 'row', borderTop: '1 solid #e5e7eb', padding: 5 },
  colCodigo: { width: 80 },
  colNombre: { flex: 1 },
  colCantidad: { width: 50, textAlign: 'right' },
  colPrecio: { width: 80, textAlign: 'right' },
  total: { marginTop: 6, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 11 },
  sello: { marginTop: 18, padding: 10, border: '1 solid #16a34a', color: '#166534', backgroundColor: '#f0fdf4' },
  pie: { position: 'absolute', bottom: 24, left: 36, right: 36, fontSize: 7, color: '#9ca3af', textAlign: 'center' },
})

function q(n: number | null | undefined) {
  return `Q${Number(n ?? 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fecha(f: string | null | undefined) {
  return f ? new Date(f).toLocaleString('es-GT', { timeZone: 'America/Guatemala' }) : '—'
}

type DatosOrden = {
  pedidoId: number
  ventaId: number
  fechaAprobacion: string | null
  aprobadoPor: string | null
  cliente: string | null
  vendedor: string | null
  destinatario: string | null
  telefono: string | null
  departamento: string | null
  ciudad: string | null
  direccion: string | null
  referencia: string | null
  latitud: number | null
  longitud: number | null
  lineas: { codigo: string; nombre: string; cantidad: number; precio: number }[]
  total: number
  pago: { metodo: string; monto: number; referencia: string | null } | null
}

function OrdenDespacho({ d }: { d: DatosOrden }) {
  return (
    <Document title={`Orden de despacho — pedido ${d.pedidoId}`}>
      <Page size="LETTER" style={estilos.pagina}>
        <View style={estilos.encabezado}>
          <View>
            <Text style={estilos.marca}>ASTRO</Text>
            <Text style={estilos.submarca}>Ecosistema Comercial</Text>
          </View>
          <View>
            <Text style={estilos.titulo}>Orden de despacho</Text>
            <Text style={{ textAlign: 'right' }}>Pedido #{d.pedidoId} · Venta #{d.ventaId}</Text>
          </View>
        </View>

        <View style={estilos.seccion}>
          <Text style={estilos.rotulo}>Cliente y venta</Text>
          <View style={estilos.fila}><Text style={estilos.clave}>Cliente</Text><Text style={estilos.valor}>{d.cliente ?? '—'}</Text></View>
          <View style={estilos.fila}><Text style={estilos.clave}>Vendedor</Text><Text style={estilos.valor}>{d.vendedor ?? '—'}</Text></View>
        </View>

        <View style={estilos.seccion}>
          <Text style={estilos.rotulo}>Envío</Text>
          <View style={estilos.fila}><Text style={estilos.clave}>Recibe</Text><Text style={estilos.valor}>{d.destinatario ?? '—'}</Text></View>
          <View style={estilos.fila}><Text style={estilos.clave}>Teléfono</Text><Text style={estilos.valor}>{d.telefono ?? '—'}</Text></View>
          <View style={estilos.fila}>
            <Text style={estilos.clave}>Ubicación</Text>
            <Text style={estilos.valor}>{[d.ciudad, d.departamento].filter(Boolean).join(', ') || '—'}</Text>
          </View>
          <View style={estilos.fila}><Text style={estilos.clave}>Dirección</Text><Text style={estilos.valor}>{d.direccion ?? '—'}</Text></View>
          {d.referencia && (
            <View style={estilos.fila}><Text style={estilos.clave}>Referencias</Text><Text style={estilos.valor}>{d.referencia}</Text></View>
          )}
          {d.latitud != null && d.longitud != null && (
            <View style={estilos.fila}>
              <Text style={estilos.clave}>Coordenadas</Text>
              <Text style={estilos.valor}>{`${d.latitud}, ${d.longitud} — maps.google.com/?q=${d.latitud},${d.longitud}`}</Text>
            </View>
          )}
        </View>

        <View style={estilos.seccion}>
          <Text style={estilos.rotulo}>Productos a despachar</Text>
          <View style={estilos.tabla}>
            <View style={estilos.tablaEncabezado}>
              <Text style={estilos.colCodigo}>Código</Text>
              <Text style={estilos.colNombre}>Artículo</Text>
              <Text style={estilos.colCantidad}>Cant.</Text>
              <Text style={estilos.colPrecio}>Precio</Text>
            </View>
            {d.lineas.map((l, i) => (
              <View key={i} style={estilos.tablaFila}>
                <Text style={estilos.colCodigo}>{l.codigo}</Text>
                <Text style={estilos.colNombre}>{l.nombre}</Text>
                <Text style={estilos.colCantidad}>{l.cantidad}</Text>
                <Text style={estilos.colPrecio}>{q(l.precio * l.cantidad)}</Text>
              </View>
            ))}
          </View>
          <Text style={estilos.total}>Total venta: {q(d.total)}</Text>
        </View>

        <View style={estilos.sello}>
          <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 3 }}>PAGO APROBADO — LIBERADO PARA ENVÍO</Text>
          <Text>
            Aprobado por {d.aprobadoPor ?? '—'} el {fecha(d.fechaAprobacion)}
            {d.pago ? ` · ${d.pago.metodo} ${q(d.pago.monto)}${d.pago.referencia ? ` · ref. ${d.pago.referencia}` : ''}` : ''}
          </Text>
        </View>

        <Text style={estilos.pie} fixed>
          Documento generado automáticamente por ASTRO al aprobarse el pago. Pedido #{d.pedidoId}.
        </Text>
      </Page>
    </Document>
  )
}

/**
 * Genera la Orden de despacho de un pedido con pago aprobado, la guarda
 * en el bucket astro-pedidos y la registra en pedido_documentos. Es un
 * snapshot inmutable: si ya existe una para el pedido, no se regenera.
 */
export async function generarOrdenDespacho(pedidoId: number, subidoPor: number | null) {
  const admin = createAdminClient()

  const { data: existente } = await admin
    .from('pedido_documentos')
    .select('id')
    .eq('pedido_id', pedidoId)
    .eq('tipo', 'orden_despacho')
    .maybeSingle()
  if (existente) return

  const { data: pedido, error } = await admin
    .from('pedidos')
    .select(
      'id, venta_id, estado, fecha_aprobacion_pago, nombre_destinatario, telefono_destinatario, departamento, ciudad, direccion_entrega, referencia_entrega, latitud, longitud, aprobador:aprobado_por ( nombre ), ventas ( id, total, clientes ( nombre ), vendedor:vendedor_id ( nombre ), venta_detalles ( cantidad, precio, productos ( codigo, nombre ) ), pagos ( metodo, monto, referencia, estado ) )',
    )
    .eq('id', pedidoId)
    .single()
  if (error || !pedido) throw new Error(error?.message ?? 'Pedido no encontrado')

  type Fila = {
    id: number
    venta_id: number
    fecha_aprobacion_pago: string | null
    nombre_destinatario: string | null
    telefono_destinatario: string | null
    departamento: string | null
    ciudad: string | null
    direccion_entrega: string | null
    referencia_entrega: string | null
    latitud: number | null
    longitud: number | null
    aprobador: { nombre: string } | null
    ventas: {
      id: number
      total: number
      clientes: { nombre: string } | null
      vendedor: { nombre: string } | null
      venta_detalles: { cantidad: number; precio: number; productos: { codigo: string; nombre: string } | null }[]
      pagos: { metodo: string; monto: number; referencia: string | null; estado: string }[]
    } | null
  }
  const p = pedido as unknown as Fila
  const pagoConfirmado = p.ventas?.pagos.find((x) => x.estado === 'confirmado') ?? null

  const buffer = await renderToBuffer(
    <OrdenDespacho
      d={{
        pedidoId: p.id,
        ventaId: p.venta_id,
        fechaAprobacion: p.fecha_aprobacion_pago,
        aprobadoPor: p.aprobador?.nombre ?? null,
        cliente: p.ventas?.clientes?.nombre ?? null,
        vendedor: p.ventas?.vendedor?.nombre ?? null,
        destinatario: p.nombre_destinatario,
        telefono: p.telefono_destinatario,
        departamento: p.departamento,
        ciudad: p.ciudad,
        direccion: p.direccion_entrega,
        referencia: p.referencia_entrega,
        latitud: p.latitud,
        longitud: p.longitud,
        lineas: (p.ventas?.venta_detalles ?? []).map((l) => ({
          codigo: l.productos?.codigo ?? '—',
          nombre: l.productos?.nombre ?? '—',
          cantidad: l.cantidad,
          precio: Number(l.precio),
        })),
        total: Number(p.ventas?.total ?? 0),
        pago: pagoConfirmado
          ? { metodo: pagoConfirmado.metodo, monto: Number(pagoConfirmado.monto), referencia: pagoConfirmado.referencia }
          : null,
      }}
    />,
  )

  const ruta = `pedido-${pedidoId}/orden-despacho-${Date.now()}.pdf`
  const { error: errorSubida } = await admin.storage
    .from(BUCKET)
    .upload(ruta, buffer, { contentType: 'application/pdf' })
  if (errorSubida) throw new Error(errorSubida.message)

  await admin.from('pedido_documentos').insert({
    pedido_id: pedidoId,
    tipo: 'orden_despacho',
    url: ruta,
    subido_por: subidoPor,
  })
}
