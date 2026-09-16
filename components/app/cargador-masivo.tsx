'use client'

import { useState, useTransition, type ChangeEvent } from 'react'
import * as XLSX from 'xlsx'
import { Download, Upload, CheckCircle2, AlertCircle, Sparkles, AlertTriangle } from 'lucide-react'
import { cargarPiezasMasivo } from '@/app/(app)/produccion/carga-masiva/acciones'

type Categoria = { id: number; nombre: string }
type Material = { id: number; nombre: string }
type Proveedor = { id: number; nombre: string }
type ProductoExistente = {
  id: number
  codigo: string
  nombre: string
  modo_inventario: 'pieza_unica' | 'por_cantidad'
  estado: string
}

type FilaCsv = Record<string, string>

type FilaValidada = {
  fila: number
  codigo: string
  nombre: string
  categoriaTexto: string
  cantidadTexto: string
  nivelGananciaTexto: string
  errores: string[]
  nuevasDependencias: string[]
  duplicado: ProductoExistente | null
  datos: {
    codigo: string
    nombre: string
    descripcion: string | null
    categoria: string
    material: string | null
    origen: 'local' | 'importado'
    costo_produccion: number | null
    peso_gramos: number | null
    kilataje: string | null
    piedras: string | null
    modo_inventario: 'pieza_unica' | 'por_cantidad'
    cantidad_inicial: number | null
    atributos: Record<string, unknown>
    marca: string | null
    coleccion: string | null
    codigo_barras: string | null
    etiquetas: string[]
    proveedor: string | null
    punto_reorden: number | null
    nivel_ganancia: 'introduccion' | 'socio_comercial' | 'importacion'
    producto_existente_id: number | null
  } | null
}

// Una sola plantilla para cualquier tipo de artículo — la "Categoría"
// es texto libre en el Excel (se crea sola si no existe todavía) y el
// margen depende de "Nivel de ganancia", no de la categoría ni de un
// grupo elegido de antemano.
const PLANTILLA_EXCEL = '/plantillas/articulos.xlsx'

function aNumeroONull(valor: string | undefined): number | null {
  const texto = (valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** "Referencia Interna (código)" → "referencia interna" — sin acentos, sin paréntesis, sin mayúsculas. */
function normalizarEncabezado(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** "Socio Comercial" / "socio_comercial" → "socio comercial" — sin acentos, sin guiones bajos. */
function normalizarValor(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Traduce el texto de la columna "Nivel de ganancia" a la clave interna, o null si no coincide con ninguno de los 3 valores del desplegable. */
function nivelGananciaDesdeTexto(texto: string): 'introduccion' | 'socio_comercial' | 'importacion' | null {
  const n = normalizarValor(texto)
  if (n === 'introduccion') return 'introduccion'
  if (n === 'socio comercial') return 'socio_comercial'
  if (n === 'importacion') return 'importacion'
  return null
}

/** Prueba varios nombres de columna equivalentes (ya normalizados) y devuelve el primero que traiga valor. */
function valorDe(normalizada: Record<string, string>, ...alias: string[]): string {
  for (const a of alias) {
    const v = normalizada[a]
    if (v) return v
  }
  return ''
}

function validarFilas(
  filas: FilaCsv[],
  categorias: Categoria[],
  materiales: Material[],
  proveedores: Proveedor[],
  productosExistentes: ProductoExistente[],
): FilaValidada[] {
  const existentesPorCodigo = new Map(productosExistentes.map((p) => [p.codigo.toLowerCase(), p]))

  return filas.map((raw, index) => {
    const n: Record<string, string> = {}
    for (const [clave, valor] of Object.entries(raw)) {
      n[normalizarEncabezado(clave)] = String(valor ?? '').trim()
    }

    const errores: string[] = []
    const codigo = valorDe(n, 'referencia interna', 'codigo')
    const nombre = valorDe(n, 'nombre')
    if (!codigo) errores.push('Falta la referencia interna (código)')
    if (!nombre) errores.push('Falta nombre')

    // Código ya existente: para pieza única es un error de captura (no
    // hay "cantidad" que sumar a una pieza única) — para por_cantidad
    // no es error, esa fila reabastece el inventario existente en vez
    // de crear un producto nuevo (ver resumen y confirmación abajo).
    const existente = codigo ? (existentesPorCodigo.get(codigo.toLowerCase()) ?? null) : null
    if (existente?.modo_inventario === 'pieza_unica') {
      errores.push(`El código "${codigo}" ya existe (pieza única) — usa otro código`)
    }
    const duplicado = existente?.modo_inventario === 'por_cantidad' ? existente : null

    // Categoría, material y proveedor ya no bloquean la fila si no
    // existen todavía — se crean automáticamente al confirmar la
    // carga (se informa en "nuevasDependencias", no como error).
    const nuevasDependencias: string[] = []

    const categoriaTexto = valorDe(n, 'categoria')
    if (!categoriaTexto) errores.push('Falta categoría')
    else if (!categorias.some((c) => c.nombre.toLowerCase() === categoriaTexto.toLowerCase())) {
      nuevasDependencias.push(`Categoría "${categoriaTexto}"`)
    }

    const materialTexto = valorDe(n, 'material')
    if (materialTexto && !materiales.some((m) => m.nombre.toLowerCase() === materialTexto.toLowerCase())) {
      nuevasDependencias.push(`Material "${materialTexto}"`)
    }

    const proveedorTexto = valorDe(n, 'proveedor')
    if (proveedorTexto && !proveedores.some((p) => p.nombre.toLowerCase() === proveedorTexto.toLowerCase())) {
      nuevasDependencias.push(`Proveedor "${proveedorTexto}"`)
    }

    const origenTexto = valorDe(n, 'origen').toLowerCase()
    if (origenTexto && origenTexto !== 'local' && origenTexto !== 'importado') {
      errores.push('Origen debe ser "local" o "importado"')
    }
    const origen: 'local' | 'importado' = origenTexto === 'importado' ? 'importado' : 'local'

    const nivelGananciaTexto = valorDe(n, 'nivel de ganancia')
    const nivelGanancia = nivelGananciaTexto ? nivelGananciaDesdeTexto(nivelGananciaTexto) : null
    if (!nivelGananciaTexto) errores.push('Falta el nivel de ganancia')
    else if (!nivelGanancia) {
      errores.push('Nivel de ganancia debe ser "Introducción", "Socio Comercial" o "Importación"')
    }

    // Tipo = modo de inventario (pieza única / por cantidad). Cualquier
    // valor que mencione "cantidad" cuenta como por_cantidad.
    const tipoTexto = valorDe(n, 'tipo', 'modo inventario').toLowerCase()
    const modoInventario: 'pieza_unica' | 'por_cantidad' = tipoTexto.includes('cantidad')
      ? 'por_cantidad'
      : 'pieza_unica'

    const cantidadInicial = aNumeroONull(valorDe(n, 'cantidad'))
    if (duplicado) {
      // Fila de reabastecimiento: lo único que importa es cuánto se va
      // a sumar, sin importar qué diga la columna "Tipo" del Excel.
      if (cantidadInicial == null || cantidadInicial <= 0) {
        errores.push('Cantidad obligatoria (mayor a 0) para reabastecer este código')
      }
    } else if (modoInventario === 'por_cantidad' && (cantidadInicial == null || cantidadInicial <= 0)) {
      errores.push('Cantidad obligatoria (mayor a 0) para artículos por cantidad')
    }

    let atributos: Record<string, unknown> = {}
    const atributosTexto = valorDe(n, 'atributos json')
    if (atributosTexto) {
      try {
        const parseado = JSON.parse(atributosTexto)
        if (parseado && typeof parseado === 'object') atributos = parseado
        else errores.push('atributos_json debe ser un objeto JSON')
      } catch {
        errores.push('atributos_json no es JSON válido')
      }
    }
    // Los campos de ficha técnica específicos ya no dependen de un
    // grupo elegido de antemano — se toman si la columna viene con
    // valor, sin importar qué diga "Categoría" en esa fila.
    const talla = valorDe(n, 'talla')
    if (talla) atributos = { ...atributos, talla }
    const color = valorDe(n, 'color')
    if (color) atributos = { ...atributos, color }
    const tela = valorDe(n, 'tela')
    if (tela) atributos = { ...atributos, tela }

    return {
      fila: index + 2, // +1 por encabezado, +1 por índice base 1
      codigo,
      nombre,
      categoriaTexto,
      cantidadTexto: duplicado || modoInventario === 'por_cantidad' ? String(cantidadInicial ?? '') : 'Única',
      nivelGananciaTexto: nivelGananciaTexto || '—',
      errores,
      nuevasDependencias,
      duplicado,
      datos:
        errores.length === 0
          ? {
              codigo,
              nombre,
              descripcion: valorDe(n, 'descripcion') || null,
              categoria: categoriaTexto,
              material: materialTexto || null,
              origen,
              costo_produccion: aNumeroONull(valorDe(n, 'coste', 'costo')),
              peso_gramos: aNumeroONull(valorDe(n, 'peso')),
              kilataje: valorDe(n, 'kilataje') || null,
              piedras: valorDe(n, 'piedras') || null,
              modo_inventario: duplicado ? 'por_cantidad' : modoInventario,
              cantidad_inicial: duplicado || modoInventario === 'por_cantidad' ? cantidadInicial : null,
              atributos,
              marca: valorDe(n, 'marca') || null,
              coleccion: valorDe(n, 'coleccion') || null,
              codigo_barras: valorDe(n, 'codigo de barras') || null,
              etiquetas: valorDe(n, 'etiquetas')
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
              proveedor: proveedorTexto || null,
              punto_reorden: aNumeroONull(valorDe(n, 'punto de reorden', 'punto reorden')),
              nivel_ganancia: nivelGanancia ?? 'socio_comercial',
              producto_existente_id: duplicado?.id ?? null,
            }
          : null,
    }
  })
}

export function CargadorMasivo({
  categorias,
  materiales,
  proveedores,
  productosExistentes,
}: {
  categorias: Categoria[]
  materiales: Material[]
  proveedores: Proveedor[]
  productosExistentes: ProductoExistente[]
}) {
  const [filas, setFilas] = useState<FilaValidada[]>([])
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [pending, startTransition] = useTransition()

  const totalErrores = filas.reduce((acc, f) => acc + f.errores.length, 0)
  const puedeConfirmar = filas.length > 0 && totalErrores === 0 && !pending
  const dependenciasNuevas = Array.from(new Set(filas.flatMap((f) => f.nuevasDependencias))).sort()
  const filasDuplicadas = filas.filter((f) => f.duplicado)

  async function manejarArchivo(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setNombreArchivo(archivo.name)
    const buffer = await archivo.arrayBuffer()
    const libro = XLSX.read(buffer, { type: 'array' })
    const hoja = libro.Sheets[libro.SheetNames[0]]
    const datos = XLSX.utils.sheet_to_json<FilaCsv>(hoja, { defval: '', raw: false })
    setFilas(validarFilas(datos, categorias, materiales, proveedores, productosExistentes))
  }

  function confirmar() {
    if (filasDuplicadas.length > 0) {
      const detalle = filasDuplicadas
        .map((f) => `· ${f.codigo} (${f.duplicado?.nombre}) +${f.cantidadTexto}`)
        .join('\n')
      const continuar = window.confirm(
        `${filasDuplicadas.length} código(s) ya existen y NO se crearán de nuevo — se sumará la cantidad del Excel a su inventario actual:\n\n${detalle}\n\n¿Continuar con la carga?`,
      )
      if (!continuar) return
    }
    const datos = filas.map((f) => f.datos).filter((d): d is NonNullable<typeof d> => d !== null)
    startTransition(async () => {
      await cargarPiezasMasivo(datos)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          1. Descarga la plantilla
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          La columna "Categoría" es texto libre — escribe cualquier categoría; si no existe
          todavía, se crea sola al confirmar la carga.
        </p>
        <div className="mt-4">
          <a
            href={PLANTILLA_EXCEL}
            download
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            <Download className="h-4 w-4" />
            Descargar plantilla Excel
          </a>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          2. Sube el Excel completo
        </h2>
        <label className="mt-4 flex flex-col gap-1.5">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={manejarArchivo}
            className="rounded-lg border border-dashed border-input bg-background px-3 py-4 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground hover:file:opacity-90"
          />
          {nombreArchivo && <span className="text-xs text-muted-foreground">{nombreArchivo}</span>}
        </label>
      </section>

      {filas.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              3. Previsualización ({filas.length} filas)
            </h2>
            {totalErrores === 0 ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Todo listo para cargar
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                {totalErrores} error{totalErrores !== 1 ? 'es' : ''} — corrige el archivo y vuelve a subirlo
              </span>
            )}
          </div>

          {dependenciasNuevas.length > 0 && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-accent px-3 py-2.5 text-xs text-accent-foreground">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Se crearán automáticamente: <strong>{dependenciasNuevas.join(', ')}</strong>
              </span>
            </div>
          )}

          {filasDuplicadas.length > 0 && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {filasDuplicadas.length} código{filasDuplicadas.length !== 1 ? 's' : ''} ya{' '}
                {filasDuplicadas.length !== 1 ? 'existen' : 'existe'} — no se crearán de nuevo, se sumará
                la cantidad del Excel a su inventario actual (sin tocar nombre, costo ni otros datos de
                la ficha).
              </span>
            </div>
          )}

          <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Fila</th>
                  <th className="px-3 py-2 font-semibold">Referencia</th>
                  <th className="px-3 py-2 font-semibold">Nombre</th>
                  <th className="px-3 py-2 font-semibold">Categoría</th>
                  <th className="px-3 py-2 font-semibold">Nivel de ganancia</th>
                  <th className="px-3 py-2 font-semibold">Cantidad</th>
                  <th className="px-3 py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.fila} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{f.fila}</td>
                    <td className="px-3 py-2 text-foreground">{f.codigo || '—'}</td>
                    <td className="px-3 py-2 text-foreground">{f.nombre || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {f.categoriaTexto || '—'}
                      {f.nuevasDependencias.some((d) => d.startsWith('Categoría')) && (
                        <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                          nueva
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{f.nivelGananciaTexto}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {f.duplicado ? `+${f.cantidadTexto || 0}` : f.cantidadTexto || '—'}
                    </td>
                    <td className="px-3 py-2">
                      {f.errores.length > 0 ? (
                        <span className="text-xs text-destructive">{f.errores.join('; ')}</span>
                      ) : f.duplicado ? (
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                          Ya existe · se reabastece
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-primary">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            disabled={!puedeConfirmar}
            onClick={confirmar}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {pending
              ? 'Cargando…'
              : filasDuplicadas.length > 0
                ? `Confirmar (${filas.length - filasDuplicadas.length} nuevos, ${filasDuplicadas.length} reabastecidos)`
                : `Confirmar carga de ${filas.length} artículos`}
          </button>
        </section>
      )}
    </div>
  )
}
