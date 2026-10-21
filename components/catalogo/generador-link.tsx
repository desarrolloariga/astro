'use client'

import { useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Check, Filter, Layers, Link2, ListChecks, Search } from 'lucide-react'
import { formatearPrecio } from '@/lib/formato'
import { cn } from '@/lib/utils'

export type PiezaGenerador = {
  id: number
  codigo: string
  nombre: string
  categoria_id: number | null
  categoria: string | null
  material_id: number | null
  material: string | null
  kilataje: string | null
  precio_venta: number | null
  imagen_principal: string | null
}

type Modo = 'catalogo' | 'filtrado' | 'subconjunto'

const MODOS: { valor: Modo; titulo: string; detalle: string; icono: typeof Layers }[] = [
  { valor: 'catalogo', titulo: 'Completo', detalle: 'Todo lo disponible en la red', icono: Layers },
  { valor: 'filtrado', titulo: 'Parcial', detalle: 'Por categorías, material, kilataje o precio', icono: Filter },
  { valor: 'subconjunto', titulo: 'Por productos', detalle: 'Eliges pieza por pieza', icono: ListChecks },
]

const VIGENCIAS = [7, 15, 30, 60, 90]
const MAX_FILAS = 300

const clasesCampo =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'

function opciones<T extends string | number>(piezas: PiezaGenerador[], id: (p: PiezaGenerador) => T | null, nombre: (p: PiezaGenerador) => string | null) {
  const mapa = new Map<T, { nombre: string; total: number }>()
  for (const p of piezas) {
    const k = id(p)
    if (k == null || k === '') continue
    const actual = mapa.get(k)
    if (actual) actual.total++
    else mapa.set(k, { nombre: nombre(p) ?? String(k), total: 1 })
  }
  return [...mapa.entries()]
    .map(([valor, v]) => ({ valor, ...v }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

function alternar<T>(conjunto: Set<T>, valor: T) {
  const nuevo = new Set(conjunto)
  if (nuevo.has(valor)) nuevo.delete(valor)
  else nuevo.add(valor)
  return nuevo
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        activo ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground hover:border-primary',
      )}
    >
      {activo && <Check className="h-3 w-3" />}
      {children}
    </button>
  )
}

function BotonGenerar({ deshabilitado, texto }: { deshabilitado: boolean; texto: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={deshabilitado || pending}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Link2 className="h-4 w-4" />
      {pending ? 'Generando…' : texto}
    </button>
  )
}

export function GeneradorLink({
  piezas,
  diasPorDefecto,
  accion,
}: {
  piezas: PiezaGenerador[]
  diasPorDefecto: number
  accion: (formData: FormData) => Promise<void>
}) {
  const [modo, setModo] = useState<Modo>('catalogo')
  const [categorias, setCategorias] = useState<Set<number>>(new Set())
  const [materiales, setMateriales] = useState<Set<number>>(new Set())
  const [kilatajes, setKilatajes] = useState<Set<string>>(new Set())
  const [precioMin, setPrecioMin] = useState('')
  const [precioMax, setPrecioMax] = useState('')
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())
  const [busqueda, setBusqueda] = useState('')

  const opcionesCategoria = useMemo(() => opciones(piezas, (p) => p.categoria_id, (p) => p.categoria), [piezas])
  const opcionesMaterial = useMemo(() => opciones(piezas, (p) => p.material_id, (p) => p.material), [piezas])
  const opcionesKilataje = useMemo(() => opciones(piezas, (p) => p.kilataje || null, (p) => p.kilataje), [piezas])

  const min = precioMin.trim() === '' ? null : Number(precioMin)
  const max = precioMax.trim() === '' ? null : Number(precioMax)

  // Mismo criterio que fn_link_incluye_producto en la base.
  const cumpleFiltros = (p: PiezaGenerador) =>
    (categorias.size === 0 || (p.categoria_id != null && categorias.has(p.categoria_id))) &&
    (materiales.size === 0 || (p.material_id != null && materiales.has(p.material_id))) &&
    (kilatajes.size === 0 || kilatajes.has(p.kilataje ?? '')) &&
    (min == null || !Number.isFinite(min) || (p.precio_venta ?? 0) >= min) &&
    (max == null || !Number.isFinite(max) || (p.precio_venta ?? 0) <= max)

  const coincidencias = piezas.filter(cumpleFiltros)
  const hayCriterio =
    categorias.size > 0 || materiales.size > 0 || kilatajes.size > 0 ||
    (min != null && Number.isFinite(min)) || (max != null && Number.isFinite(max))

  // En "por productos" los chips de categoría/material sirven para acotar la lista.
  const texto = busqueda.trim().toLowerCase()
  const visibles = coincidencias.filter(
    (p) => !texto || p.nombre.toLowerCase().includes(texto) || p.codigo.toLowerCase().includes(texto),
  )

  const filtrosJson = JSON.stringify({
    categorias: [...categorias],
    materiales: [...materiales],
    kilatajes: [...kilatajes],
    ...(min != null && Number.isFinite(min) ? { precio_min: min } : {}),
    ...(max != null && Number.isFinite(max) ? { precio_max: max } : {}),
  })

  const valido = modo === 'catalogo' || (modo === 'filtrado' && hayCriterio && coincidencias.length > 0) || (modo === 'subconjunto' && seleccion.size > 0)

  const resumen =
    modo === 'catalogo'
      ? `${piezas.length} piezas disponibles hoy`
      : modo === 'filtrado'
        ? hayCriterio
          ? `${coincidencias.length} piezas cumplen el criterio hoy`
          : 'Elige al menos un criterio'
        : `${seleccion.size} pieza(s) seleccionadas`

  return (
    <form action={accion} className="flex flex-col gap-6">
      <input type="hidden" name="tipo" value={modo} />
      <input type="hidden" name="filtros" value={modo === 'filtrado' ? filtrosJson : ''} />
      <input type="hidden" name="producto_ids" value={modo === 'subconjunto' ? JSON.stringify([...seleccion]) : ''} />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {MODOS.map((m) => (
          <button
            key={m.valor}
            type="button"
            onClick={() => setModo(m.valor)}
            className={cn(
              'flex items-start gap-3 rounded-xl border p-4 text-left transition-colors',
              modo === m.valor ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card hover:border-primary/50',
            )}
          >
            <m.icono className={cn('mt-0.5 h-5 w-5 shrink-0', modo === m.valor ? 'text-primary' : 'text-muted-foreground')} />
            <span>
              <span className="block text-sm font-semibold text-foreground">{m.titulo}</span>
              <span className="block text-xs text-muted-foreground">{m.detalle}</span>
            </span>
          </button>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-[1fr_180px]">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Nombre del catálogo</span>
          <input
            name="nombre"
            maxLength={120}
            placeholder={modo === 'catalogo' ? 'Ej. Colección completa octubre' : modo === 'filtrado' ? 'Ej. Anillos de oro 18K' : 'Ej. Selección para Ana'}
            className={clasesCampo}
          />
          <span className="text-xs text-muted-foreground">Lo ve tu cliente como título y tú lo ves en Enlaces.</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Vigencia</span>
          <select name="dias" defaultValue={String(VIGENCIAS.includes(diasPorDefecto) ? diasPorDefecto : 7)} className={clasesCampo}>
            {VIGENCIAS.map((d) => (
              <option key={d} value={d}>
                {d} días
              </option>
            ))}
            <option value="0">Sin vencimiento</option>
          </select>
        </label>
      </section>

      {modo !== 'catalogo' && (
        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            {modo === 'filtrado' ? 'Criterios del catálogo' : 'Acota la lista'}
          </h2>

          {opcionesCategoria.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-foreground">Categorías</span>
              <div className="flex flex-wrap gap-2">
                {opcionesCategoria.map((o) => (
                  <Chip key={o.valor} activo={categorias.has(o.valor)} onClick={() => setCategorias(alternar(categorias, o.valor))}>
                    {o.nombre} <span className="opacity-60">({o.total})</span>
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {opcionesMaterial.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-foreground">Materiales</span>
              <div className="flex flex-wrap gap-2">
                {opcionesMaterial.map((o) => (
                  <Chip key={o.valor} activo={materiales.has(o.valor)} onClick={() => setMateriales(alternar(materiales, o.valor))}>
                    {o.nombre} <span className="opacity-60">({o.total})</span>
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {opcionesKilataje.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-foreground">Kilataje</span>
              <div className="flex flex-wrap gap-2">
                {opcionesKilataje.map((o) => (
                  <Chip key={o.valor} activo={kilatajes.has(o.valor)} onClick={() => setKilatajes(alternar(kilatajes, o.valor))}>
                    {o.nombre} <span className="opacity-60">({o.total})</span>
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div className="grid max-w-md grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
              Precio desde
              <input type="number" min="0" step="any" value={precioMin} onChange={(e) => setPrecioMin(e.target.value)} className={clasesCampo} />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
              Precio hasta
              <input type="number" min="0" step="any" value={precioMax} onChange={(e) => setPrecioMax(e.target.value)} className={clasesCampo} />
            </label>
          </div>

          {modo === 'filtrado' && (
            <p className="text-xs text-muted-foreground">
              El catálogo parcial se actualiza solo: las piezas nuevas que cumplan estos criterios aparecerán en el enlace, y
              las vendidas desaparecen.
            </p>
          )}
        </section>
      )}

      {modo === 'subconjunto' && (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-56 flex-1 items-center gap-2 rounded-lg border border-input bg-background px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o código"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setSeleccion(new Set([...seleccion, ...visibles.slice(0, MAX_FILAS).map((p) => p.id)]))}
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary"
            >
              Seleccionar visibles
            </button>
            <button
              type="button"
              onClick={() => setSeleccion(new Set())}
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary"
            >
              Quitar todas
            </button>
          </div>

          <div className="max-h-[520px] overflow-y-auto rounded-lg border border-border">
            {visibles.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Ninguna pieza coincide.</p>
            ) : (
              visibles.slice(0, MAX_FILAS).map((p) => {
                const marcada = seleccion.has(p.id)
                return (
                  <label
                    key={p.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-0',
                      marcada ? 'bg-primary/5' : 'hover:bg-secondary/50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => setSeleccion(alternar(seleccion, p.id))}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                    {p.imagen_principal ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imagen_principal} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="h-10 w-10 shrink-0 rounded bg-secondary" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{p.nombre}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[p.codigo, p.categoria, p.material, p.kilataje].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-foreground">
                      {p.precio_venta != null ? formatearPrecio(p.precio_venta) : '—'}
                    </span>
                  </label>
                )
              })
            )}
          </div>
          {visibles.length > MAX_FILAS && (
            <p className="text-xs text-muted-foreground">
              Se muestran {MAX_FILAS} de {visibles.length}. Usa la búsqueda o los filtros para encontrar el resto.
            </p>
          )}
        </section>
      )}

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-4 backdrop-blur md:bottom-0">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{resumen}</span>
          {' · '}las ventas que entren por este enlace quedan a tu nombre.
        </p>
        <BotonGenerar deshabilitado={!valido} texto="Generar link" />
      </div>
    </form>
  )
}
