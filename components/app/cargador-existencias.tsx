'use client'

import { useState, useTransition, type ChangeEvent } from 'react'
import * as XLSX from 'xlsx'
import { Download, Upload, CheckCircle2, AlertCircle } from 'lucide-react'
import { cargarExistenciasMasivo } from '@/app/(app)/existencias/acciones'

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
  referencia: string
  nombre: string
  cantidadTexto: string
  error: string | null
  datos: { producto_id: number; cantidad: number } | null
}

const PLANTILLA_EXCEL = '/plantillas/existencias.xlsx'

/** "Referencia " → "referencia" — sin acentos ni mayúsculas. */
function normalizarEncabezado(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function valorDe(n: Record<string, string>, ...alias: string[]): string {
  for (const a of alias) {
    if (n[a]) return n[a]
  }
  return ''
}

function validarFilas(filas: FilaCsv[], productosExistentes: ProductoExistente[]): FilaValidada[] {
  const existentesPorCodigo = new Map(productosExistentes.map((p) => [p.codigo.toLowerCase(), p]))

  return filas.map((raw, index) => {
    const n: Record<string, string> = {}
    for (const [clave, valor] of Object.entries(raw)) {
      n[normalizarEncabezado(clave)] = String(valor ?? '').trim()
    }

    const referencia = valorDe(n, 'referencia', 'codigo', 'referencia interna')
    const cantidadTexto = valorDe(n, 'cantidad')
    const cantidad = Number(cantidadTexto.replace(',', '.'))

    let error: string | null = null
    let nombre = ''
    let productoId: number | null = null

    if (!referencia) {
      error = 'Falta la referencia'
    } else {
      const existente = existentesPorCodigo.get(referencia.toLowerCase())
      if (!existente) {
        error = `La referencia "${referencia}" no existe — este módulo no crea artículos nuevos`
      } else if (existente.modo_inventario === 'pieza_unica') {
        error = `"${referencia}" es una pieza única — no se le puede sumar cantidad`
      } else {
        nombre = existente.nombre
        productoId = existente.id
      }
    }

    if (!error && (!Number.isFinite(cantidad) || cantidad <= 0)) {
      error = 'Cantidad obligatoria (mayor a 0)'
    }

    return {
      fila: index + 2,
      referencia,
      nombre,
      cantidadTexto,
      error,
      datos: !error && productoId != null ? { producto_id: productoId, cantidad } : null,
    }
  })
}

export function CargadorExistencias({ productosExistentes }: { productosExistentes: ProductoExistente[] }) {
  const [filas, setFilas] = useState<FilaValidada[]>([])
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [pending, startTransition] = useTransition()

  const filasValidas = filas.filter((f) => f.datos !== null)
  const filasConError = filas.length - filasValidas.length
  const puedeConfirmar = filasValidas.length > 0 && !pending

  async function manejarArchivo(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setNombreArchivo(archivo.name)
    const buffer = await archivo.arrayBuffer()
    const libro = XLSX.read(buffer, { type: 'array' })
    const hoja = libro.Sheets[libro.SheetNames[0]]
    const datos = XLSX.utils.sheet_to_json<FilaCsv>(hoja, { defval: '', raw: false })
    setFilas(validarFilas(datos, productosExistentes))
  }

  function confirmar() {
    if (filasConError > 0) {
      const detalle = filas
        .filter((f) => f.error)
        .map((f) => `· Fila ${f.fila} (${f.referencia || 'sin referencia'}): ${f.error}`)
        .join('\n')
      if (!window.confirm(`${filasConError} fila(s) con error NO se van a cargar:\n\n${detalle}\n\n¿Continuar solo con las ${filasValidas.length} filas válidas?`)) {
        return
      }
    }
    const datos = filas.map((f) => f.datos).filter((d): d is NonNullable<typeof d> => d !== null)
    startTransition(async () => {
      await cargarExistenciasMasivo(datos)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">1. Descarga la plantilla</h2>
        <p className="mt-1 text-xs text-muted-foreground">Dos columnas: Referencia y Cantidad. Nada de costos.</p>
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
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">2. Sube el Excel completo</h2>
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
            {filasConError === 0 ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Todo listo para cargar
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                {filasConError} fila{filasConError !== 1 ? 's' : ''} con error se omitirá
                {filasConError !== 1 ? 'n' : ''}
              </span>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Fila</th>
                  <th className="px-3 py-2 font-semibold">Referencia</th>
                  <th className="px-3 py-2 font-semibold">Nombre</th>
                  <th className="px-3 py-2 font-semibold text-right">Cantidad a sumar</th>
                  <th className="px-3 py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.fila} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{f.fila}</td>
                    <td className="px-3 py-2 text-foreground">{f.referencia || '—'}</td>
                    <td className="px-3 py-2 text-foreground">{f.nombre || '—'}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{f.cantidadTexto || '—'}</td>
                    <td className="px-3 py-2">
                      {f.error ? (
                        <span className="text-xs text-destructive">{f.error}</span>
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
            {pending ? 'Cargando…' : `Confirmar carga (${filasValidas.length} artículos)`}
          </button>
        </section>
      )}
    </div>
  )
}
