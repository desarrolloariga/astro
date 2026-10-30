import 'server-only'
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { CIFRAS_EN_QUETZALES, ESTILO, formatoCelda, type EstiloFila, type ReporteTabla } from './tabla'

const estilos = StyleSheet.create({
  pagina: { paddingTop: 92, paddingBottom: 36, paddingHorizontal: 28, fontSize: 7.5, fontFamily: 'Helvetica', color: '#111827' },
  encabezado: { position: 'absolute', top: 22, left: 28, right: 28, textAlign: 'center' },
  folio: { position: 'absolute', top: 22, right: 28, fontSize: 8, fontFamily: 'Helvetica-Bold' },
  razon: { fontSize: 11, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  titulo: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  linea: { fontSize: 8.5, marginTop: 1 },
  cifras: { fontSize: 8, fontFamily: 'Helvetica-Oblique', marginTop: 1, color: '#374151' },
  filaEnc: { flexDirection: 'row', backgroundColor: '#0b2545', color: '#ffffff', fontFamily: 'Helvetica-Bold' },
  fila: { flexDirection: 'row', borderBottom: '0.5 solid #e5e7eb' },
  filaTitulo: { flexDirection: 'row', backgroundColor: '#f3f4f6', fontFamily: 'Helvetica-Bold', marginTop: 4 },
  filaSubtotal: { flexDirection: 'row', borderTop: '0.5 solid #9ca3af', fontFamily: 'Helvetica-Bold' },
  filaTotal: { flexDirection: 'row', borderTop: '1 solid #111827', fontFamily: 'Helvetica-Bold' },
  celda: { paddingVertical: 3, paddingHorizontal: 3 },
  nota: { marginTop: 8, fontSize: 7, color: '#4b5563' },
  marca: { position: 'absolute', top: '45%', left: 0, right: 0, textAlign: 'center', fontSize: 54, color: '#e5e7eb', transform: 'rotate(-25deg)' },
  pie: { position: 'absolute', bottom: 16, left: 28, right: 28, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#6b7280' },
})

const estiloDe = (e: EstiloFila | undefined) =>
  e === 'titulo' ? estilos.filaTitulo : e === 'subtotal' ? estilos.filaSubtotal : e === 'total' ? estilos.filaTotal : estilos.fila

function Reporte({ r }: { r: ReporteTabla }) {
  const total = r.columnas.reduce((a, c) => a + (c.ancho ?? 12), 0)
  const ancho = (c: ReporteTabla['columnas'][number]) => `${((c.ancho ?? 12) / total) * 100}%`
  const alinear = (c: ReporteTabla['columnas'][number]) =>
    c.alinear === 'centro' ? 'center' : c.alinear === 'derecha' || c.tipo === 'monto' || c.tipo === 'numero' ? 'right' : 'left'
  return (
    <Document title={`${r.titulo} — ${r.periodo}`} author={r.razonSocial}>
      <Page size="LETTER" orientation={r.orientacion === 'vertical' ? 'portrait' : 'landscape'} style={estilos.pagina}>
        {r.marca && (
          <Text style={estilos.marca} fixed>
            {r.marca}
          </Text>
        )}
        <View style={estilos.encabezado} fixed>
          <Text style={estilos.razon}>{r.razonSocial}</Text>
          <Text style={estilos.titulo}>{r.titulo}</Text>
          <Text style={estilos.linea}>{r.periodo}</Text>
          <Text style={estilos.cifras}>{CIFRAS_EN_QUETZALES}</Text>
        </View>
        {r.folioInicial != null && (
          <Text style={estilos.folio} fixed render={({ pageNumber }) => `Folio ${(r.folioInicial as number) + pageNumber - 1}`} />
        )}
        <View style={estilos.filaEnc} fixed>
          {r.columnas.map((c) => (
            <Text key={c.clave} style={[estilos.celda, { width: ancho(c), textAlign: alinear(c) }]}>
              {c.titulo}
            </Text>
          ))}
        </View>
        {r.filas.map((f, i) => (
          <View key={i} style={estiloDe(f[ESTILO] as EstiloFila | undefined)} wrap={false}>
            {r.columnas.map((c) => (
              <Text key={c.clave} style={[estilos.celda, { width: ancho(c), textAlign: alinear(c) }]}>
                {Array.isArray(f[c.clave]) ? (f[c.clave] as unknown[]).join(', ') : formatoCelda(f[c.clave], c.tipo)}
              </Text>
            ))}
          </View>
        ))}
        {r.totales && (
          <View style={estilos.filaTotal} wrap={false}>
            {r.columnas.map((c) => (
              <Text key={c.clave} style={[estilos.celda, { width: ancho(c), textAlign: alinear(c) }]}>
                {formatoCelda(r.totales?.[c.clave], c.tipo)}
              </Text>
            ))}
          </View>
        )}
        {r.nota && <Text style={estilos.nota}>{r.nota}</Text>}
        <View style={estilos.pie} fixed>
          <Text>{r.nit ? `NIT ${r.nit}` : ''}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

export async function generarPdf(r: ReporteTabla): Promise<Buffer> {
  return renderToBuffer(<Reporte r={r} />)
}

/** Número de páginas de un PDF generado (para registrar los folios usados). */
export function contarPaginas(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
}
