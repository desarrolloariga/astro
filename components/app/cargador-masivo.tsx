'use client'

import { useState, useTransition, type ChangeEvent } from 'react'
import Papa from 'papaparse'
import { Download, Upload, CheckCircle2, AlertCircle } from 'lucide-react'
import { cargarPiezasMasivo } from '@/app/(app)/produccion/carga-masiva/acciones'

type Categoria = { id: number; nombre: string; grupo: string }
type Material = { id: number; nombre: string }

type FilaCsv = Record<string, string>

type FilaValidada = {
  fila: number
  codigo: string
  nombre: string
  categoriaTexto: string
  cantidadTexto: string
  errores: string[]
  datos: {
    codigo: string
    nombre: string
    descripcion: string | null
    categoria_id: number
    material_id: number | null
    origen: 'local' | 'importado'
    costo_produccion: number | null
    peso_gramos: number | null
    kilataje: string | null
    piedras: string | null
    modo_inventario: 'pieza_unica' | 'por_cantidad'
    cantidad_inicial: number | null
    atributos: Record<string, unknown>
  } | null
}

const plantillasPorGrupo: Record<string, { archivo: string; etiqueta: string }> = {
  joyeria: { archivo: '/plantillas/joyeria.csv', etiqueta: 'Joyería' },
  cosmetico: { archivo: '/plantillas/cosmetico.csv', etiqueta: 'Cosmético' },
  lenceria: { archivo: '/plantillas/lenceria.csv', etiqueta: 'Lencería' },
}

function aNumeroONull(valor: string | undefined): number | null {
  const texto = (valor ?? '').trim()
  if (!texto) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function validarFilas(filas: FilaCsv[], grupo: string, categorias: Categoria[], materiales: Material[]): FilaValidada[] {
  return filas.map((raw, index) => {
    const errores: string[] = []
    const codigo = (raw.codigo ?? '').trim()
    const nombre = (raw.nombre ?? '').trim()
    if (!codigo) errores.push('Falta código')
    if (!nombre) errores.push('Falta nombre')

    const categoriaTexto = (raw.categoria ?? '').trim()
    const categoria = categorias.find((c) => c.nombre.toLowerCase() === categoriaTexto.toLowerCase())
    if (!categoriaTexto) errores.push('Falta categoría')
    else if (!categoria) errores.push(`Categoría "${categoriaTexto}" no existe`)

    const materialTexto = (raw.material ?? '').trim()
    let materialId: number | null = null
    if (materialTexto) {
      const material = materiales.find((m) => m.nombre.toLowerCase() === materialTexto.toLowerCase())
      if (!material) errores.push(`Material "${materialTexto}" no existe`)
      else materialId = material.id
    }

    const origenTexto = (raw.origen ?? '').trim().toLowerCase()
    if (origenTexto && origenTexto !== 'local' && origenTexto !== 'importado') {
      errores.push('Origen debe ser "local" o "importado"')
    }
    const origen: 'local' | 'importado' = origenTexto === 'importado' ? 'importado' : 'local'

    const modoTexto = (raw.modo_inventario ?? '').trim().toLowerCase()
    if (modoTexto && modoTexto !== 'pieza_unica' && modoTexto !== 'por_cantidad') {
      errores.push('modo_inventario debe ser "pieza_unica" o "por_cantidad"')
    }
    const modoInventario: 'pieza_unica' | 'por_cantidad' = modoTexto === 'por_cantidad' ? 'por_cantidad' : 'pieza_unica'

    const cantidadInicial = aNumeroONull(raw.cantidad)
    if (modoInventario === 'por_cantidad' && (cantidadInicial == null || cantidadInicial <= 0)) {
      errores.push('Cantidad obligatoria (mayor a 0) para artículos por cantidad')
    }

    let atributos: Record<string, unknown> = {}
    const atributosTexto = (raw.atributos_json ?? '').trim()
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
      if (raw.volumen_ml?.trim()) atributos = { ...atributos, volumen_ml: raw.volumen_ml.trim() }
      if (raw.fragancia?.trim()) atributos = { ...atributos, fragancia: raw.fragancia.trim() }
    }
    if (grupo === 'lenceria') {
      if (raw.talla?.trim()) atributos = { ...atributos, talla: raw.talla.trim() }
      if (raw.color?.trim()) atributos = { ...atributos, color: raw.color.trim() }
      if (raw.tela?.trim()) atributos = { ...atributos, tela: raw.tela.trim() }
    }

    return {
      fila: index + 2, // +1 por encabezado, +1 por índice base 1
      codigo,
      nombre,
      categoriaTexto,
      cantidadTexto: modoInventario === 'por_cantidad' ? String(cantidadInicial ?? '') : 'Única',
      errores,
      datos:
        errores.length === 0
          ? {
              codigo,
              nombre,
              descripcion: raw.descripcion?.trim() || null,
              categoria_id: categoria!.id,
              material_id: materialId,
              origen,
              costo_produccion: aNumeroONull(raw.costo_produccion),
              peso_gramos: grupo === 'joyeria' ? aNumeroONull(raw.peso_gramos) : null,
              kilataje: grupo === 'joyeria' ? raw.kilataje?.trim() || null : null,
              piedras: grupo === 'joyeria' ? raw.piedras?.trim() || null : null,
              modo_inventario: modoInventario,
              cantidad_inicial: modoInventario === 'por_cantidad' ? cantidadInicial : null,
              atributos,
            }
          : null,
    }
  })
}

export function CargadorMasivo({ categorias, materiales }: { categorias: Categoria[]; materiales: Material[] }) {
  const [grupo, setGrupo] = useState('joyeria')
  const [filas, setFilas] = useState<FilaValidada[]>([])
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [pending, startTransition] = useTransition()

  const totalErrores = filas.reduce((acc, f) => acc + f.errores.length, 0)
  const puedeConfirmar = filas.length > 0 && totalErrores === 0 && !pending

  function manejarArchivo(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setNombreArchivo(archivo.name)
    Papa.parse<FilaCsv>(archivo, {
      header: true,
      skipEmptyLines: true,
      complete: (resultado) => {
        setFilas(validarFilas(resultado.data, grupo, categorias, materiales))
      },
    })
  }

  function confirmar() {
    const datos = filas.map((f) => f.datos).filter((d): d is NonNullable<typeof d> => d !== null)
    startTransition(async () => {
      await cargarPiezasMasivo(datos)
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
            Descargar plantilla CSV
          </a>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          2. Sube el CSV completo
        </h2>
        <label className="mt-4 flex flex-col gap-1.5">
          <input
            type="file"
            accept=".csv"
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
                {totalErrores} error{totalErrores !== 1 ? 'es' : ''} — corrige el CSV y vuelve a subirlo
              </span>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Fila</th>
                  <th className="px-3 py-2 font-semibold">Código</th>
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
                    <td className="px-3 py-2 text-muted-foreground">{f.categoriaTexto || '—'}</td>
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
