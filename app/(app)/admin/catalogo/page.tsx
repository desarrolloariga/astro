import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, ExternalLink, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { cn } from '@/lib/utils'
import { BotonConfirmar } from '@/components/app/boton-confirmar'
import {
  AUDIENCIAS,
  CTA_TIPOS,
  ICONOS_CONFIG,
  leerBanda,
  leerBeneficios,
  leerGeneral,
  leerOferta,
  leerPie,
  leerPromos,
} from '@/lib/catalogo-web/config'
import { leerConfigEntrega } from '@/lib/entrega'
import { eliminarContenido, guardarBloques, guardarContenido, guardarEstiloCategoria } from './acciones'

export const metadata = { title: 'Configuración del catálogo — ASTRO' }

const campo =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none'
const etiqueta = 'flex flex-col gap-1 text-xs font-semibold text-foreground'
const botonPrimario =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90'
const botonPeligro = 'rounded-lg px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10'

const PESTANAS = [
  { id: 'banners', titulo: 'Banners', detalle: 'Carrusel principal del inicio' },
  { id: 'novedades', titulo: 'Novedades', detalle: 'Popup y campana de novedades' },
  { id: 'anuncios', titulo: 'Barra de anuncios', detalle: 'Mensajes que rotan arriba' },
  { id: 'bloques', titulo: 'Bloques del inicio', detalle: 'Promos, beneficios, ofertas, link y pie' },
  { id: 'categorias', titulo: 'Categorías', detalle: 'Imagen y color de cada tarjeta' },
  { id: 'entrega', titulo: 'Entrega', detalle: 'Hora de corte, CEDI, franjas y días' },
] as const
type Pestana = (typeof PESTANAS)[number]['id']

type Fila = Record<string, unknown> & { id: number }

const s = (v: unknown) => (v == null ? '' : String(v))

function Tarjeta({ titulo, children, className }: { titulo?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-4 rounded-xl border border-border bg-card p-5', className)}>
      {titulo && <h2 className="text-sm font-bold text-foreground">{titulo}</h2>}
      {children}
    </section>
  )
}

function Opciones({ lista }: { lista: readonly { valor: string; etiqueta: string }[] }) {
  return (
    <>
      {lista.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.etiqueta}
        </option>
      ))}
    </>
  )
}

function CamposVigencia({ fila }: { fila?: Fila }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <label className={etiqueta}>
        Para
        <select name="audiencia" defaultValue={s(fila?.audiencia) || 'todos'} className={campo}>
          <Opciones lista={AUDIENCIAS} />
        </select>
      </label>
      <label className={etiqueta}>
        Orden
        <input name="orden" type="number" defaultValue={s(fila?.orden ?? 0)} className={campo} />
      </label>
      <label className={etiqueta}>
        Desde (opcional)
        <input name="fecha_inicio" type="date" defaultValue={s(fila?.fecha_inicio)} className={campo} />
      </label>
      <label className={etiqueta}>
        Hasta (opcional)
        <input name="fecha_fin" type="date" defaultValue={s(fila?.fecha_fin)} className={campo} />
      </label>
      <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold text-foreground">
        <input name="activo" type="checkbox" defaultChecked={fila ? Boolean(fila.activo) : true} className="h-4 w-4 accent-[var(--primary)]" />
        Activo
      </label>
    </div>
  )
}

function CampoImagen({ nombre = 'imagen', actual, recomendado }: { nombre?: string; actual: string | null; recomendado: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-foreground">Imagen ({recomendado})</span>
      <div className="flex flex-wrap items-center gap-3">
        {actual && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={actual} alt="" className="h-16 w-28 rounded-md border border-border object-cover" />
        )}
        <input
          name={nombre}
          type="file"
          accept="image/*"
          className="flex-1 rounded-lg border border-dashed border-input bg-background px-3 py-2 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:font-semibold file:text-primary-foreground"
        />
        {actual && (
          <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <input type="checkbox" name={`${nombre}_quitar`} className="h-4 w-4" /> Quitar imagen
          </label>
        )}
      </div>
      <input type="hidden" name={`${nombre}_actual`} value={actual ?? ''} />
      <span className="text-xs text-muted-foreground">Sin imagen se muestra un fondo decorativo con el color elegido. Máximo 5 MB.</span>
    </div>
  )
}

function CamposCta({ fila, categorias, prefijo = '' }: { fila?: Record<string, unknown>; categorias: string[]; prefijo?: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <label className={etiqueta}>
        Texto del botón
        <input name={`${prefijo}cta_texto`} defaultValue={s(fila?.cta_texto)} placeholder="Ej. Ver ofertas" className={campo} />
      </label>
      <label className={etiqueta}>
        Al hacer clic lleva a
        <select name={`${prefijo}cta_tipo`} defaultValue={s(fila?.cta_tipo) || 'todo'} className={campo}>
          <Opciones lista={CTA_TIPOS} />
        </select>
      </label>
      <label className={etiqueta}>
        Categoría o URL (si aplica)
        <input name={`${prefijo}cta_valor`} defaultValue={s(fila?.cta_valor)} list="lista-categorias" placeholder="Ej. Anillos" className={campo} />
      </label>
      <datalist id="lista-categorias">
        {categorias.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </div>
  )
}

function Vista({ fila, banner }: { fila: Fila; banner: boolean }) {
  return (
    <div
      className="relative flex h-24 w-44 shrink-0 flex-col justify-end overflow-hidden rounded-lg p-2.5 text-white"
      style={{ background: s(fila.color_fondo) || '#0F2A5C' }}
    >
      {s(fila.imagen_url) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s(fila.imagen_url)} alt="" className="absolute inset-y-0 right-0 h-full w-1/2 object-cover" />
      )}
      {s(fila.etiqueta) && (
        <span
          className="relative mb-1 w-fit rounded-full px-1.5 py-0.5 text-[8px] font-extrabold uppercase"
          style={{ background: banner ? s(fila.color_etiqueta) || '#F2D58A' : '#F6E9C4', color: '#0A1E44' }}
        >
          {s(fila.etiqueta)}
        </span>
      )}
      <span className="relative line-clamp-2 max-w-[60%] text-[11px] font-extrabold leading-tight">{s(fila.titulo)}</span>
    </div>
  )
}

function FormularioPieza({ seccion, fila, categorias }: { seccion: 'banners' | 'novedades'; fila?: Fila; categorias: string[] }) {
  const banner = seccion === 'banners'
  return (
    <form action={guardarContenido} className="flex flex-col gap-4">
      <input type="hidden" name="seccion" value={seccion} />
      {fila && <input type="hidden" name="id" value={fila.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr]">
        <label className={etiqueta}>
          Etiqueta (opcional)
          <input name="etiqueta" defaultValue={s(fila?.etiqueta)} placeholder={banner ? 'Ej. Nueva temporada' : 'Ej. Nuevo en el catálogo'} className={campo} />
        </label>
        <label className={etiqueta}>
          Título
          <input name="titulo" required defaultValue={s(fila?.titulo)} className={campo} />
        </label>
      </div>
      <label className={etiqueta}>
        Texto
        <textarea name="texto" rows={2} defaultValue={s(fila?.texto)} className={campo} />
      </label>
      <CamposCta fila={fila} categorias={categorias} />
      <CampoImagen actual={s(fila?.imagen_url) || null} recomendado={banner ? 'recomendado 1600×560 px' : 'recomendado 900×900 px'} />
      <div className="flex flex-wrap gap-4">
        <label className={cn(etiqueta, 'flex-row items-center gap-2')}>
          <input name="color_fondo" type="color" defaultValue={s(fila?.color_fondo) || '#0F2A5C'} className="h-9 w-12 cursor-pointer rounded border border-input" />
          Color de fondo
        </label>
        {banner && (
          <label className={cn(etiqueta, 'flex-row items-center gap-2')}>
            <input name="color_etiqueta" type="color" defaultValue={s(fila?.color_etiqueta) || '#F2D58A'} className="h-9 w-12 cursor-pointer rounded border border-input" />
            Color de la etiqueta
          </label>
        )}
      </div>
      <CamposVigencia fila={fila} />
      <div className="flex justify-end">
        <button type="submit" className={botonPrimario}>
          {fila ? 'Guardar cambios' : <><Plus className="h-4 w-4" /> Agregar</>}
        </button>
      </div>
    </form>
  )
}

function Eliminar({ seccion, id, que }: { seccion: string; id: number; que: string }) {
  return (
    <form action={eliminarContenido}>
      <input type="hidden" name="seccion" value={seccion} />
      <input type="hidden" name="id" value={id} />
      <BotonConfirmar mensaje={`¿Eliminar ${que}? No se puede deshacer.`} className={botonPeligro}>
        Eliminar
      </BotonConfirmar>
    </form>
  )
}

function EstadoChip({ fila }: { fila: Fila }) {
  const aud = AUDIENCIAS.find((a) => a.valor === fila.audiencia)?.etiqueta ?? 'Todos'
  return (
    <span className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
      <span className={cn('rounded-full px-2 py-0.5', fila.activo ? 'bg-emerald-600/10 text-emerald-700' : 'bg-muted text-muted-foreground')}>
        {fila.activo ? 'Activo' : 'Inactivo'}
      </span>
      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{aud}</span>
      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Orden {s(fila.orden)}</span>
      {Boolean(fila.fecha_inicio || fila.fecha_fin) && (
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-800">
          {s(fila.fecha_inicio) || '…'} → {s(fila.fecha_fin) || '…'}
        </span>
      )}
    </span>
  )
}

function SeccionPiezas({ seccion, filas, categorias }: { seccion: 'banners' | 'novedades'; filas: Fila[]; categorias: string[] }) {
  const banner = seccion === 'banners'
  return (
    <div className="flex flex-col gap-4">
      <Tarjeta titulo={banner ? 'Nuevo banner' : 'Nueva novedad'}>
        <FormularioPieza seccion={seccion} categorias={categorias} />
      </Tarjeta>
      {filas.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay {banner ? 'banners' : 'novedades'}.</p>}
      {filas.map((f) => (
        <details key={f.id} className="group rounded-xl border border-border bg-card">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-4 p-4">
            <Vista fila={f} banner={banner} />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="truncate text-sm font-bold text-foreground">{s(f.titulo)}</span>
              <EstadoChip fila={f} />
            </div>
            <span className="text-xs font-semibold text-primary group-open:hidden">Editar</span>
          </summary>
          <div className="flex flex-col gap-3 border-t border-border p-4">
            <FormularioPieza seccion={seccion} fila={f} categorias={categorias} />
            <div className="flex justify-start">
              <Eliminar seccion={seccion} id={f.id} que={banner ? 'este banner' : 'esta novedad'} />
            </div>
          </div>
        </details>
      ))}
    </div>
  )
}

function SeccionAnuncios({ filas }: { filas: Fila[] }) {
  const Formulario = ({ fila }: { fila?: Fila }) => (
    <form action={guardarContenido} className="flex flex-col gap-3">
      <input type="hidden" name="seccion" value="anuncios" />
      {fila && <input type="hidden" name="id" value={fila.id} />}
      <label className={etiqueta}>
        Texto del anuncio
        <input name="texto" required maxLength={140} defaultValue={s(fila?.texto)} placeholder="Ej. Envíos gratis desde Q 500" className={campo} />
      </label>
      <CamposVigencia fila={fila} />
      <div className="flex items-center justify-end gap-2">
        <button type="submit" className={botonPrimario}>
          {fila ? 'Guardar' : <><Plus className="h-4 w-4" /> Agregar</>}
        </button>
      </div>
    </form>
  )
  return (
    <div className="flex flex-col gap-4">
      <Tarjeta titulo="Nuevo anuncio">
        <Formulario />
      </Tarjeta>
      {filas.map((f) => (
        <Tarjeta key={f.id} titulo={<span className="flex flex-wrap items-center gap-2">{s(f.texto)} <EstadoChip fila={f} /></span>}>
          <Formulario fila={f} />
          <Eliminar seccion="anuncios" id={f.id} que="este anuncio" />
        </Tarjeta>
      ))}
    </div>
  )
}

function SeccionBloques({ config, categorias }: { config: Map<string, unknown>; categorias: string[] }) {
  const general = leerGeneral(config.get('general'))
  const promos = leerPromos(config.get('promos_laterales'))
  const beneficios = leerBeneficios(config.get('beneficios'))
  const oferta = leerOferta(config.get('oferta_relampago'))
  const banda = leerBanda(config.get('banda_link'))
  const pie = leerPie(config.get('pie'))
  // La fecha fin se edita en hora de Guatemala.
  const finLocal = oferta.fecha_fin
    ? new Date(new Date(oferta.fecha_fin).getTime() - 6 * 3600_000).toISOString().slice(0, 16)
    : ''
  const Guardar = () => (
    <div className="flex justify-end">
      <button type="submit" className={botonPrimario}>
        Guardar
      </button>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta titulo="General">
        <form action={guardarBloques} className="flex flex-col gap-3">
          <input type="hidden" name="bloque" value="general" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className={etiqueta}>
              Marca (encabezado y pie)
              <input name="marca" defaultValue={general.marca} className={campo} />
            </label>
            <label className={etiqueta}>
              Subtítulo bajo la marca
              <input name="subtitulo" defaultValue={general.subtitulo} className={campo} />
            </label>
            <label className={etiqueta}>
              Días que una pieza se marca &quot;Nuevo&quot;
              <input name="dias_nuevo" type="number" min={0} defaultValue={general.dias_nuevo} className={campo} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <input name="popup_novedades" type="checkbox" defaultChecked={general.popup_novedades} className="h-4 w-4" />
            Abrir el popup de novedades al entrar al inicio
          </label>
          <Guardar />
        </form>
      </Tarjeta>

      <Tarjeta titulo="Promociones al lado del carrusel (se muestran las 2 primeras que apliquen a cada catálogo)">
        <form action={guardarBloques} className="flex flex-col gap-5">
          <input type="hidden" name="bloque" value="promos" />
          {[0, 1, 2].map((i) => {
            const p = promos[i]
            return (
              <fieldset key={i} className="flex flex-col gap-3 rounded-lg border border-border p-4">
                <legend className="px-1 text-xs font-bold text-muted-foreground">Promoción {i + 1} (vacía = no se muestra)</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr_160px]">
                  <label className={etiqueta}>
                    Etiqueta
                    <input name={`p${i}_etiqueta`} defaultValue={p?.etiqueta} className={campo} />
                  </label>
                  <label className={etiqueta}>
                    Título
                    <input name={`p${i}_titulo`} defaultValue={p?.titulo} className={campo} />
                  </label>
                  <label className={etiqueta}>
                    Para
                    <select name={`p${i}_audiencia`} defaultValue={p?.audiencia ?? 'todos'} className={campo}>
                      <Opciones lista={AUDIENCIAS} />
                    </select>
                  </label>
                </div>
                <CamposCta fila={p} categorias={categorias} prefijo={`p${i}_`} />
                <div className="flex flex-wrap items-end gap-4">
                  <label className={cn(etiqueta, 'flex-row items-center gap-2')}>
                    <input name={`p${i}_color_fondo`} type="color" defaultValue={p?.color_fondo ?? '#DCE6FA'} className="h-9 w-12 rounded border border-input" />
                    Fondo
                  </label>
                  <label className={cn(etiqueta, 'flex-row items-center gap-2')}>
                    <input name={`p${i}_color_boton`} type="color" defaultValue={p?.color_boton ?? '#1E4FD8'} className="h-9 w-12 rounded border border-input" />
                    Botón
                  </label>
                  <label className={etiqueta}>
                    Ícono (si no hay imagen)
                    <select name={`p${i}_icono`} defaultValue={p?.icono ?? 'gift'} className={campo}>
                      <Opciones lista={ICONOS_CONFIG} />
                    </select>
                  </label>
                </div>
                <CampoImagen nombre={`p${i}_imagen`} actual={p?.imagen_url ?? null} recomendado="recomendado 600×420 px" />
              </fieldset>
            )
          })}
          <Guardar />
        </form>
      </Tarjeta>

      <Tarjeta titulo="Beneficios (franja bajo el carrusel)">
        <form action={guardarBloques} className="flex flex-col gap-3">
          <input type="hidden" name="bloque" value="beneficios" />
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const b = beneficios[i]
            return (
              <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr_1.4fr_170px]">
                <select name={`b${i}_icono`} defaultValue={b?.icono ?? 'sparkle'} aria-label="Ícono" className={campo}>
                  <Opciones lista={ICONOS_CONFIG} />
                </select>
                <input name={`b${i}_titulo`} defaultValue={b?.titulo} placeholder="Título (vacío = no se muestra)" className={campo} />
                <input name={`b${i}_texto`} defaultValue={b?.texto} placeholder="Texto" className={campo} />
                <select name={`b${i}_audiencia`} defaultValue={b?.audiencia ?? 'todos'} aria-label="Para" className={campo}>
                  <Opciones lista={AUDIENCIAS} />
                </select>
              </div>
            )
          })}
          <Guardar />
        </form>
      </Tarjeta>

      <Tarjeta titulo="Ofertas relámpago">
        <form action={guardarBloques} className="flex flex-col gap-3">
          <input type="hidden" name="bloque" value="oferta" />
          <p className="text-xs text-muted-foreground">
            Muestra las piezas que tienen precio de descuento, con cuenta regresiva hasta la fecha final. Al llegar la fecha la sección se oculta sola.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr_220px]">
            <label className={etiqueta}>
              Título
              <input name="titulo" defaultValue={oferta.titulo} className={campo} />
            </label>
            <label className={etiqueta}>
              Subtítulo
              <input name="subtitulo" defaultValue={oferta.subtitulo} className={campo} />
            </label>
            <label className={etiqueta}>
              Terminan (hora de Guatemala)
              <input name="fecha_fin" type="datetime-local" defaultValue={finLocal} className={campo} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <input name="activa" type="checkbox" defaultChecked={oferta.activa} className="h-4 w-4" />
            Mostrar la sección de ofertas relámpago
          </label>
          <Guardar />
        </form>
      </Tarjeta>

      <Tarjeta titulo='Banda "Tus clientes compran desde tu link" (solo backoffice)'>
        <form action={guardarBloques} className="flex flex-col gap-3">
          <input type="hidden" name="bloque" value="banda" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_220px]">
            <label className={etiqueta}>
              Título
              <input name="titulo" defaultValue={banda.titulo} className={campo} />
            </label>
            <label className={etiqueta}>
              Texto del botón
              <input name="cta_texto" defaultValue={banda.cta_texto} className={campo} />
            </label>
          </div>
          <label className={etiqueta}>
            Texto
            <textarea name="texto" rows={2} defaultValue={banda.texto} className={campo} />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <input name="activa" type="checkbox" defaultChecked={banda.activa} className="h-4 w-4" />
            Mostrar la banda
          </label>
          <Guardar />
        </form>
      </Tarjeta>

      <Tarjeta titulo="Pie de página">
        <form action={guardarBloques} className="flex flex-col gap-3">
          <input type="hidden" name="bloque" value="pie" />
          <label className={etiqueta}>
            Descripción
            <input name="descripcion" defaultValue={pie.descripcion} className={campo} />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className={etiqueta}>
              Teléfono
              <input name="telefono" defaultValue={pie.telefono} className={campo} />
            </label>
            <label className={etiqueta}>
              Correo
              <input name="correo" defaultValue={pie.correo} className={campo} />
            </label>
            <label className={etiqueta}>
              Dirección
              <input name="direccion" defaultValue={pie.direccion} className={campo} />
            </label>
          </div>
          <label className={etiqueta}>
            Columnas extra (una por línea: &quot;Título: elemento, elemento&quot;)
            <textarea
              name="columnas"
              rows={3}
              defaultValue={pie.columnas.map((c) => `${c.titulo}: ${c.enlaces.join(', ')}`).join('\n')}
              className={campo}
            />
          </label>
          <Guardar />
        </form>
      </Tarjeta>
    </div>
  )
}

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

function SeccionEntrega({ valor }: { valor: unknown }) {
  const c = leerConfigEntrega(valor)
  return (
    <Tarjeta titulo="Entrega (ficha de producto y checkout)">
      <form action={guardarBloques} className="flex flex-col gap-4">
        <input type="hidden" name="bloque" value="entrega" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_160px_1fr]">
          <label className={etiqueta}>
            Hora de corte (entrega inmediata)
            <input name="hora_corte" type="time" defaultValue={c.hora_corte.padStart(5, '0')} className={campo} />
          </label>
          <label className={etiqueta}>
            Días a ofrecer (programada)
            <input name="dias_programada" type="number" min={1} max={14} defaultValue={c.dias_programada} className={campo} />
          </label>
          <label className={etiqueta}>
            Horario de atención del CEDI
            <input name="cedi_horario" defaultValue={c.cedi_horario} placeholder="lunes a viernes de 8:00 a 17:00" className={campo} />
          </label>
        </div>
        <label className={etiqueta}>
          Dirección del CEDI (para recoger)
          <input name="cedi_direccion" defaultValue={c.cedi_direccion} placeholder="Ej. 5a avenida 10-20, zona 9, Ciudad de Guatemala" className={campo} />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-semibold text-foreground">Días con entregas</legend>
          <div className="flex flex-wrap gap-3">
            {DIAS_SEMANA.map((d, i) => (
              <label key={d} className="flex items-center gap-1.5 text-sm text-foreground">
                <input type="checkbox" name="dias_laborables" value={i} defaultChecked={c.dias_laborables.includes(i)} className="h-4 w-4" /> {d}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={etiqueta}>
            Franjas horarias (una por línea: Etiqueta | inicio | fin)
            <textarea
              name="franjas"
              rows={3}
              defaultValue={c.franjas.map((f) => `${f.etiqueta} | ${f.inicio} | ${f.fin}`).join('\n')}
              className={campo}
            />
          </label>
          <label className={etiqueta}>
            Días sin entregas / feriados (AAAA-MM-DD, separados por coma)
            <textarea name="dias_no_laborables" rows={3} defaultValue={c.dias_no_laborables.join(', ')} className={campo} />
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={etiqueta}>
            Garantía (se muestra en la ficha)
            <input name="garantia" defaultValue={c.garantia} placeholder="Ej. Garantía de 6 meses" className={campo} />
          </label>
          <label className={etiqueta}>
            Política de cambios
            <input name="cambios" defaultValue={c.cambios} placeholder="Ej. Cambios dentro de 8 días con la pieza sin uso." className={campo} />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          El costo del domicilio sale de la política de envío (Sistema → Precios). Recoger en CEDI no tiene costo.
        </p>
        <div className="flex justify-end">
          <button type="submit" className={botonPrimario}>
            Guardar
          </button>
        </div>
      </form>
    </Tarjeta>
  )
}

type CategoriaFila = { id: number; nombre: string; imagen_catalogo: string | null; color_catalogo: string | null }

function SeccionCategorias({ categorias }: { categorias: CategoriaFila[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {categorias.map((c) => (
        <Tarjeta key={c.id}>
          <form action={guardarEstiloCategoria} className="flex flex-col gap-3">
            <input type="hidden" name="categoria_id" value={c.id} />
            <div className="flex items-center gap-3">
              <span
                className="relative flex h-16 w-16 shrink-0 items-end overflow-hidden rounded-lg"
                style={{ background: c.color_catalogo || '#DCE6FA' }}
              >
                {c.imagen_catalogo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imagen_catalogo} alt="" className="absolute inset-0 h-full w-full object-cover" />
                )}
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-foreground">{c.nombre}</span>
                <span className="text-xs text-muted-foreground">Sin imagen se usa la foto de una pieza de la categoría.</span>
              </div>
            </div>
            <CampoImagen actual={c.imagen_catalogo} recomendado="recomendado 600×600 px" />
            <div className="flex flex-wrap items-center gap-4">
              <label className={cn(etiqueta, 'flex-row items-center gap-2')}>
                <input name="color" type="color" defaultValue={c.color_catalogo || '#DCE6FA'} className="h-9 w-12 rounded border border-input" />
                Color de fondo
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <input name="sin_color" type="checkbox" defaultChecked={!c.color_catalogo} className="h-4 w-4" /> Color automático
              </label>
              <button type="submit" className={cn(botonPrimario, 'ml-auto')}>
                Guardar
              </button>
            </div>
          </form>
        </Tarjeta>
      ))}
    </div>
  )
}

export default async function ConfiguracionCatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; ok?: string; error?: string }>
}) {
  if (!(await tienePermiso('catalogo', 'configurar'))) redirect('/inicio')
  const { tab, ok, error } = await searchParams
  const pestana: Pestana = PESTANAS.some((p) => p.id === tab) ? (tab as Pestana) : 'banners'
  const supabase = await createClient()

  const orden = { ascending: true }
  const [banners, novedades, anuncios, config, categorias] = await Promise.all([
    supabase.from('catalogo_banners').select('*').order('orden', orden).order('id', orden),
    supabase.from('catalogo_novedades').select('*').order('orden', orden).order('id', orden),
    supabase.from('catalogo_anuncios').select('*').order('orden', orden).order('id', orden),
    supabase.from('catalogo_config').select('clave, valor'),
    supabase.rpc('fn_categorias_catalogo'),
  ])
  const listaCategorias = ((categorias.data ?? []) as (CategoriaFila & { orden: number })[]).sort(
    (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'),
  )
  const nombresCategorias = listaCategorias.map((c) => c.nombre)
  const mapaConfig = new Map(((config.data ?? []) as { clave: string; valor: unknown }[]).map((c) => [c.clave, c.valor]))
  const faltaMigracion = banners.error?.message?.includes('catalogo_banners')

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Configuración del catálogo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Banners, novedades, anuncios y bloques del inicio del catálogo. Lo que guardes aquí se ve de inmediato en el catálogo del
            backoffice y en los links públicos (según el &quot;Para&quot; de cada elemento).
          </p>
        </div>
        <Link href="/catalogo" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
          <ExternalLink className="h-4 w-4" /> Ver catálogo
        </Link>
      </div>

      {faltaMigracion && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Falta correr la migración 20261021100015_configuracion_catalogo.sql en Supabase.</span>
        </div>
      )}
      {ok && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-sm text-primary">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{ok}</span>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Secciones">
        {PESTANAS.map((p) => (
          <Link
            key={p.id}
            href={`/admin/catalogo?tab=${p.id}`}
            aria-current={pestana === p.id ? 'page' : undefined}
            className={cn(
              'flex flex-col rounded-xl border px-3 py-2.5 transition-colors',
              pestana === p.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card hover:border-primary/50',
            )}
          >
            <span className="text-sm font-semibold text-foreground">{p.titulo}</span>
            <span className="text-[11px] text-muted-foreground">{p.detalle}</span>
          </Link>
        ))}
      </nav>

      {pestana === 'banners' && <SeccionPiezas seccion="banners" filas={(banners.data ?? []) as Fila[]} categorias={nombresCategorias} />}
      {pestana === 'novedades' && <SeccionPiezas seccion="novedades" filas={(novedades.data ?? []) as Fila[]} categorias={nombresCategorias} />}
      {pestana === 'anuncios' && <SeccionAnuncios filas={(anuncios.data ?? []) as Fila[]} />}
      {pestana === 'bloques' && <SeccionBloques config={mapaConfig} categorias={nombresCategorias} />}
      {pestana === 'categorias' && <SeccionCategorias categorias={listaCategorias} />}
      {pestana === 'entrega' && <SeccionEntrega valor={mapaConfig.get('entrega')} />}
    </main>
  )
}
