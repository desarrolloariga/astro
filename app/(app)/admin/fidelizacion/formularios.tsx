import { BadgeCheck, Gift, Layers } from 'lucide-react'
import { BotonConfirmar } from '@/components/app/boton-confirmar'
import { eliminarPremio, guardarInsignia, guardarNivel, guardarPremio } from './acciones-ranking'

/** Formularios de niveles, insignias y premios del ranking (crear y editar). */

const campo = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'
const etiqueta = 'flex flex-col gap-1 text-xs font-semibold text-foreground'
const boton = 'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90'

export const ICONOS = [
  { valor: 'medal', etiqueta: 'Medalla' },
  { valor: 'star', etiqueta: 'Estrella' },
  { valor: 'crown', etiqueta: 'Corona' },
  { valor: 'trophy', etiqueta: 'Trofeo' },
  { valor: 'flame', etiqueta: 'Llama' },
  { valor: 'bag', etiqueta: 'Bolsa' },
  { valor: 'userPlus', etiqueta: 'Cliente nuevo' },
  { valor: 'cap', etiqueta: 'Birrete' },
  { valor: 'target', etiqueta: 'Diana' },
  { valor: 'gift', etiqueta: 'Regalo' },
  { valor: 'bolt', etiqueta: 'Rayo' },
]

export const CRITERIOS = [
  { valor: 'primera_venta', etiqueta: 'Primera venta del ciclo', umbral: false },
  { valor: 'ventas_mes', etiqueta: 'N ventas en el ciclo', umbral: true },
  { valor: 'racha', etiqueta: 'Racha de N días con ventas', umbral: true },
  { valor: 'top', etiqueta: 'Estar entre los N primeros', umbral: true },
  { valor: 'puntos', etiqueta: 'Llegar a N puntos en el ciclo', umbral: true },
  { valor: 'clientes_nuevos', etiqueta: 'N clientes nuevos en el ciclo', umbral: true },
  { valor: 'cursos', etiqueta: 'N cursos completados', umbral: true },
]

export type NivelAdm = { id: number; nombre: string; umbral_puntos: number; orden: number; color: string | null; icono: string | null; beneficios: { texto?: string } | null; activo: boolean }
export type InsigniaAdm = {
  id: number
  nombre: string
  descripcion: string | null
  criterio: { tipo?: string; umbral?: number } | null
  icono: string | null
  color: string | null
  recompensa: string | null
  orden: number
  activo: boolean
}
export type PremioAdm = {
  id: number
  periodo_id: number | null
  titulo: string | null
  tipo: 'posicion' | 'puntos'
  posicion_desde: number | null
  posicion_hasta: number | null
  minimo_puntos: number | null
  descripcion: string
  icono: string | null
  activo: boolean
  periodos: { nombre: string } | null
}

function Selector({ name, valor, opciones }: { name: string; valor: string; opciones: { valor: string; etiqueta: string }[] }) {
  return (
    <select name={name} defaultValue={valor} className={campo}>
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.etiqueta}
        </option>
      ))}
    </select>
  )
}

function Activo({ valor }: { valor: boolean }) {
  return (
    <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold text-foreground">
      <input name="activo" type="checkbox" defaultChecked={valor} className="h-4 w-4" /> Activo
    </label>
  )
}

function FormNivel({ n }: { n?: NivelAdm }) {
  return (
    <form action={guardarNivel} className="grid grid-cols-2 gap-3 sm:grid-cols-[1.2fr_120px_80px_70px_1fr]">
      {n && <input type="hidden" name="id" value={n.id} />}
      <label className={etiqueta}>
        Nombre
        <input name="nombre" required defaultValue={n?.nombre} placeholder="Ej. Oro" className={campo} />
      </label>
      <label className={etiqueta}>
        Desde (pts)
        <input name="umbral_puntos" type="number" step="1" required defaultValue={n?.umbral_puntos ?? 0} className={campo} />
      </label>
      <label className={etiqueta}>
        Orden
        <input name="orden" type="number" defaultValue={n?.orden ?? 0} className={campo} />
      </label>
      <label className={etiqueta}>
        Color
        <input name="color" type="color" defaultValue={n?.color ?? '#D4A21B'} className="h-9 w-full cursor-pointer rounded border border-input" />
      </label>
      <label className={etiqueta}>
        Ícono
        <Selector name="icono" valor={n?.icono ?? 'star'} opciones={ICONOS} />
      </label>
      <label className={`${etiqueta} col-span-2 sm:col-span-4`}>
        Beneficio del nivel (lo ve el embajador)
        <input name="beneficio" defaultValue={n?.beneficios?.texto ?? ''} placeholder="Ej. 5% extra de comisión" className={campo} />
      </label>
      <div className="col-span-2 flex items-end justify-between gap-3 sm:col-span-1">
        <Activo valor={n?.activo ?? true} />
        <button type="submit" className={boton}>
          {n ? 'Guardar' : 'Crear'}
        </button>
      </div>
    </form>
  )
}

function FormInsignia({ i }: { i?: InsigniaAdm }) {
  return (
    <form action={guardarInsignia} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {i && <input type="hidden" name="id" value={i.id} />}
      <label className={`${etiqueta} col-span-2`}>
        Nombre
        <input name="nombre" required defaultValue={i?.nombre} className={campo} />
      </label>
      <label className={etiqueta}>
        Ícono
        <Selector name="icono" valor={i?.icono ?? 'trophy'} opciones={ICONOS} />
      </label>
      <label className={etiqueta}>
        Color
        <input name="color" type="color" defaultValue={i?.color ?? '#2453D6'} className="h-9 w-full cursor-pointer rounded border border-input" />
      </label>
      <label className={`${etiqueta} col-span-2 sm:col-span-4`}>
        Descripción
        <input name="descripcion" defaultValue={i?.descripcion ?? ''} className={campo} />
      </label>
      <label className={`${etiqueta} col-span-2`}>
        Se desbloquea al…
        <Selector name="criterio_tipo" valor={i?.criterio?.tipo ?? 'primera_venta'} opciones={CRITERIOS} />
      </label>
      <label className={etiqueta}>
        N (meta)
        <input name="criterio_umbral" type="number" min={1} defaultValue={i?.criterio?.umbral ?? ''} placeholder="Ej. 10" className={campo} />
      </label>
      <label className={etiqueta}>
        Orden
        <input name="orden" type="number" defaultValue={i?.orden ?? 0} className={campo} />
      </label>
      <label className={`${etiqueta} col-span-2 sm:col-span-3`}>
        Recompensa
        <input name="recompensa" defaultValue={i?.recompensa ?? ''} placeholder="Ej. 100 pts extra o un detalle" className={campo} />
      </label>
      <div className="col-span-2 flex items-end justify-between gap-3 sm:col-span-1">
        <Activo valor={i?.activo ?? true} />
        <button type="submit" className={boton}>
          {i ? 'Guardar' : 'Crear'}
        </button>
      </div>
    </form>
  )
}

function FormPremio({ p, periodos }: { p?: PremioAdm; periodos: { id: number; nombre: string }[] }) {
  return (
    <form action={guardarPremio} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {p && <input type="hidden" name="id" value={p.id} />}
      <label className={etiqueta}>
        Título
        <input name="titulo" defaultValue={p?.titulo ?? ''} placeholder="Ej. 1.er lugar" className={campo} />
      </label>
      <label className={etiqueta}>
        Ciclo
        <select name="periodo_id" defaultValue={p?.periodo_id ?? ''} className={campo}>
          <option value="">Todos los ciclos</option>
          {periodos.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className={etiqueta}>
        Se gana por
        <Selector
          name="tipo"
          valor={p?.tipo ?? 'posicion'}
          opciones={[
            { valor: 'posicion', etiqueta: 'Posición' },
            { valor: 'puntos', etiqueta: 'Puntos del ciclo' },
          ]}
        />
      </label>
      <label className={etiqueta}>
        Ícono
        <Selector name="icono" valor={p?.icono ?? 'trophy'} opciones={ICONOS} />
      </label>
      <label className={etiqueta}>
        Desde posición
        <input name="posicion_desde" type="number" min={1} defaultValue={p?.posicion_desde ?? 1} className={campo} />
      </label>
      <label className={etiqueta}>
        Hasta posición
        <input name="posicion_hasta" type="number" min={1} defaultValue={p?.posicion_hasta ?? 1} className={campo} />
      </label>
      <label className={`${etiqueta} col-span-2`}>
        O mínimo de puntos (si se gana por puntos)
        <input name="minimo_puntos" type="number" min={0} defaultValue={p?.minimo_puntos ?? ''} className={campo} />
      </label>
      <label className={`${etiqueta} col-span-2 sm:col-span-3`}>
        Premio
        <input name="descripcion" required defaultValue={p?.descripcion ?? ''} placeholder="Ej. Q 500 en mercadería" className={campo} />
      </label>
      <div className="col-span-2 flex items-end justify-between gap-3 sm:col-span-1">
        <Activo valor={p?.activo ?? true} />
        <button type="submit" className={boton}>
          {p ? 'Guardar' : 'Crear'}
        </button>
      </div>
    </form>
  )
}

function Elemento({ titulo, detalle, children }: { titulo: string; detalle: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3">
        <span className="text-sm font-semibold text-foreground">{titulo}</span>
        <span className="text-xs text-muted-foreground">
          {detalle} <span className="ml-2 font-semibold text-primary group-open:hidden">Editar</span>
        </span>
      </summary>
      <div className="border-t border-border px-4 py-4">{children}</div>
    </details>
  )
}

export function SeccionNiveles({ niveles, esAdmin }: { niveles: NivelAdm[]; esAdmin: boolean }) {
  return (
    <section id="niveles" className="flex scroll-mt-6 flex-col gap-3">
      <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
        <Layers className="h-4 w-4 text-primary" /> Niveles del ranking
      </h2>
      {niveles.map((n) =>
        esAdmin ? (
          <Elemento key={n.id} titulo={n.nombre} detalle={`desde ${n.umbral_puntos} pts${n.activo ? '' : ' · inactivo'}`}>
            <FormNivel n={n} />
          </Elemento>
        ) : (
          <p key={n.id} className="text-sm text-foreground">
            {n.nombre} · desde {n.umbral_puntos} pts
          </p>
        ),
      )}
      {esAdmin && (
        <Elemento titulo="+ Nuevo nivel" detalle="">
          <FormNivel />
        </Elemento>
      )}
    </section>
  )
}

export function SeccionInsignias({ insignias, esAdmin }: { insignias: InsigniaAdm[]; esAdmin: boolean }) {
  const criterio = (i: InsigniaAdm) => {
    const c = CRITERIOS.find((x) => x.valor === i.criterio?.tipo)
    return c ? `${c.etiqueta.replace('N', String(i.criterio?.umbral ?? 'N'))}` : 'Sin criterio'
  }
  return (
    <section id="insignias" className="flex scroll-mt-6 flex-col gap-3">
      <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
        <BadgeCheck className="h-4 w-4 text-primary" /> Logros (insignias)
      </h2>
      {insignias.map((i) =>
        esAdmin ? (
          <Elemento key={i.id} titulo={i.nombre} detalle={`${criterio(i)}${i.activo ? '' : ' · inactiva'}`}>
            <FormInsignia i={i} />
          </Elemento>
        ) : (
          <p key={i.id} className="text-sm text-foreground">
            {i.nombre} · {criterio(i)}
          </p>
        ),
      )}
      {esAdmin && (
        <Elemento titulo="+ Nueva insignia" detalle="">
          <FormInsignia />
        </Elemento>
      )}
    </section>
  )
}

export function SeccionPremios({ premios, periodos, esAdmin }: { premios: PremioAdm[]; periodos: { id: number; nombre: string }[]; esAdmin: boolean }) {
  const detalle = (p: PremioAdm) =>
    `${p.periodos?.nombre ?? 'Todos los ciclos'} · ${p.tipo === 'puntos' ? `desde ${p.minimo_puntos ?? 0} pts` : `posiciones ${p.posicion_desde}–${p.posicion_hasta}`}${p.activo ? '' : ' · inactivo'}`
  return (
    <section id="premios" className="flex scroll-mt-6 flex-col gap-3">
      <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
        <Gift className="h-4 w-4 text-primary" /> Premios del ciclo
      </h2>
      {premios.map((p) =>
        esAdmin ? (
          <Elemento key={p.id} titulo={`${p.titulo ?? 'Premio'}: ${p.descripcion}`} detalle={detalle(p)}>
            <FormPremio p={p} periodos={periodos} />
            <form action={eliminarPremio} className="mt-3">
              <input type="hidden" name="id" value={p.id} />
              <BotonConfirmar mensaje="¿Eliminar este premio?" className="rounded-lg px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10">
                Eliminar
              </BotonConfirmar>
            </form>
          </Elemento>
        ) : (
          <p key={p.id} className="text-sm text-foreground">
            {p.titulo ?? 'Premio'}: {p.descripcion} · {detalle(p)}
          </p>
        ),
      )}
      {esAdmin && (
        <Elemento titulo="+ Nuevo premio" detalle="">
          <FormPremio periodos={periodos} />
        </Elemento>
      )}
    </section>
  )
}
