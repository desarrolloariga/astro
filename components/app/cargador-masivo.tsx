'use client'

import { useState, useTransition, type ChangeEvent } from 'react'
import * as XLSX from 'xlsx'
import { Download, Upload, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react'
import { cargarPiezasMasivo } from '@/app/(app)/produccion/carga-masiva/acciones'

type Categoria = { id: number; nombre: string; grupo: string }
type Material = { id: number; nombre: string }
type Proveedor = { id: number; nombre: string }

type FilaCsv = Record<string, string>

type FilaValidada = {
  fila: number
  codigo: string
  nombre: string
  categoriaTexto: string
  cantidadTexto: string
  errores: string[]
  nuevasDependencias: string[]
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
  } | null
}

const plantillasPorGrupo: Record<string, { archivo: string; etiqueta: string }> = {
  joyeria: { archivo: '/plantillas/joyeria.xlsx', etiqueta: 'Joyería' },
  cosmetico: { archivo: '/plantillas/cosmetico.xlsx', etiqueta: 'Cosmético' },
  lenceria: { archivo: '/plantillas/lenceria.xlsx', etiqueta: 'Lencería' },
}

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
  grupo: string,
  categorias: Categoria[],
  materiales: Material[],
  proveedores: Proveedor[],
): FilaValidada[] {
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

    // Tipo = modo de inventario (pieza única / por cantidad). Cualquier
    // valor que mencione "cantidad" cuenta como por_cantidad.
    const tipoTexto = valorDe(n, 'tipo', 'modo inventario').toLowerCase()
    const modoInventario: 'pieza_unica' | 'por_cantidad' = tipoTexto.includes('cantidad')
      ? 'por_cantidad'
      : 'pieza_unica'

    const cantidadInicial = aNumeroONull(valorDe(n, 'cantidad'))
    if (modoInventario === 'por_cantidad' && (cantidadInicial == null || cantidadInicial <= 0)) {
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
    if (grupo === 'cosmetico') {
      const volumen = valorDe(n, 'volumen')
      if (volumen) atributos = { ...atributos, volumen_ml: volumen }
      const fragancia = valorDe(n, 'fragancia')
      if (fragancia) atributos = { ...atributos, fragancia }
    }
    if (grupo === 'lenceria') {
      const talla = valorDe(n, 'talla')
      if (talla) atributos = { ...atributos, talla }
      const color = valorDe(n, 'color')
      if (color) atributos = { ...atributos, color }
      const tela = valorDe(n, 'tela')
      if (tela) atributos = { ...atributos, tela }
    }

    return {
      fila: index + 2, // +1 por encabezado, +1 por índice base 1
      codigo,
      nombre,
      categoriaTexto,
      cantidadTexto: modoInventario === 'por_cantidad' ? String(cantidadInicial ?? '') : 'Única',
      errores,
      nuevasDependencias,
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
              kilataje: grupo === 'joyeria' ? valorDe(n, 'kilataje') || null : null,
              piedras: grupo === 'joyeria' ? valorDe(n, 'piedras') || null : null,
              modo_inventario: modoInventario,
              cantidad_inicial: modoInventario === 'por_cantidad' ? cantidadInicial : null,
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
            }
          : null,
    }
  })
}

export function CargadorMasivo({
  categorias,
  materiales,
  proveedores,
}: {
  categorias: Categoria[]
  materiales: Material[]
  proveedores: Proveedor[]
}) {
  const [grupo, setGrupo] = useState('joyeria')
  const [filas, setFilas] = useState<FilaValidada[]>([])
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [pending, startTransition] = useTransition()

  const totalErrores = filas.reduce((acc, f) => acc + f.errores.length, 0)
  const puedeConfirmar = filas.length > 0 && totalErrores === 0 && !pending
  const dependenciasNuevas = Array.from(new Set(filas.flatMap((f) => f.nuevasDependencias))).sort()

  async function manejarArchivo(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setNombreArchivo(archivo.name)
    const buffer = await archivo.arrayBuffer()
    const libro = XLSX.read(buffer, { type: 'array' })
    const hoja = libro.Sheets[libro.SheetNames[0]]
    const datos = XLSX.utils.sheet_to_json<FilaCsv>(hoja, { defval: '', raw: false })
    setFilas(validarFilas(datos, grupo, categorias, materiales, proveedores))
  }

  function confirmar() {
    const datos = filas.map((f) => f.datos).filter((d): d is NonNullable<typeof d> => d !== null)
    startTransition(async () => {
      await cargarPiezasMasivo(datos, grupo)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          1. Elige la plantilla
        </h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            value={grupo}
            onChange={(e) => {
              setGrupo(e.target.value)
              setFilas([])
              setNombreArchivo('')
            }}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            {Object.entries(plantillasPorGrupo).map(([valor, info]) => (
              <option key={valor} value={valor}>
                {info.etiqueta}
              </option>
            ))}
          </select>
          <a
            href={plantillasPorGrupo[grupo].archivo}
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

          <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Fila</th>
                  <th className="px-3 py-2 font-semibold">Referencia</th>
                  <th className="px-3 py-2 font-semibold">Nombre</th>
                  <th className="px-3 py-2 font-semibold">Categoría</th>
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
                    <td className="px-3 py-2 text-muted-foreground">{f.cantidadTexto || '—'}</td>
                    <td className="px-3 py-2">
                      {f.errores.length === 0 ? (
                        <span className="text-xs font-semibold text-primary">OK</span>
                      ) : (
                        <span className="text-xs text-destructive">{f.errores.join('; ')}</span>
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
            {pending ? 'Cargando…' : `Confirmar carga de ${filas.length} artículos`}
          </button>
        </section>
      )}
    </div>
  )
}
