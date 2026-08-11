import { redirect } from 'next/navigation'
import { AlertCircle, CheckCircle2, GraduationCap, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { tienePermiso } from '@/lib/permisos'
import { formatearFecha } from '@/lib/formato'
import {
  crearCurso,
  alternarCurso,
  crearContenido,
  crearEvaluacion,
  crearPregunta,
} from './acciones'

export const metadata = { title: 'Academia — Administración — ASTRO' }

type Pregunta = { id: number; texto: string; opciones: string[]; respuesta_correcta: number; orden: number }
type Evaluacion = { id: number; puntaje_aprobacion: number; intentos_maximos: number; evaluacion_preguntas: Pregunta[] }
type Contenido = { id: number; tipo: string; titulo: string; orden: number }
type Curso = {
  id: number
  titulo: string
  descripcion: string | null
  otorga_puntos: boolean
  activo: boolean
  curso_contenidos: Contenido[]
  evaluaciones: Evaluacion[]
}
type Progreso = {
  curso_id: number
  estado: string
  fecha_inicio: string
  fecha_completado: string | null
  usuarios: { nombre: string } | null
}
type Certificacion = { curso_id: number; puntaje: number; fecha: string; usuarios: { nombre: string } | null }
type IntentoEvaluacion = {
  curso_id: number
  puntaje: number
  aprobado: boolean
  fecha_creacion: string
  usuarios: { nombre: string } | null
}

export default async function AdminAcademiaPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>
}) {
  if (!(await tienePermiso('academia', 'editar'))) redirect('/inicio')

  const { ok, error } = await searchParams
  const supabase = await createClient()

  const [{ data: cursos }, { data: progresoData }, { data: certificacionesData }, { data: intentosData }] =
    await Promise.all([
      supabase
        .from('cursos')
        .select(
          `id, titulo, descripcion, otorga_puntos, activo,
           curso_contenidos ( id, tipo, titulo, orden ),
           evaluaciones ( id, puntaje_aprobacion, intentos_maximos, evaluacion_preguntas ( id, texto, opciones, respuesta_correcta, orden ) )`,
        )
        .order('fecha_creacion', { ascending: false }),
      // Nunca se mostraba en ningún lado quién tomó/completó cada curso,
      // pese a que RLS ya lo permite para admin.
      supabase
        .from('progreso_cursos')
        .select('curso_id, estado, fecha_inicio, fecha_completado, usuarios ( nombre )')
        .order('fecha_inicio', { ascending: false }),
      supabase
        .from('certificaciones')
        .select('curso_id, puntaje, fecha, usuarios ( nombre )')
        .order('fecha', { ascending: false }),
      supabase
        .from('intentos_evaluacion')
        .select('curso_id, puntaje, aprobado, fecha_creacion, usuarios ( nombre )')
        .order('fecha_creacion', { ascending: false }),
    ])

  const listaCursos = (cursos ?? []) as unknown as Curso[]

  const progresoPorCurso = new Map<number, Progreso[]>()
  for (const p of (progresoData ?? []) as unknown as Progreso[]) {
    const lista = progresoPorCurso.get(p.curso_id) ?? []
    lista.push(p)
    progresoPorCurso.set(p.curso_id, lista)
  }
  const certificacionesPorCurso = new Map<number, Certificacion[]>()
  for (const c of (certificacionesData ?? []) as unknown as Certificacion[]) {
    const lista = certificacionesPorCurso.get(c.curso_id) ?? []
    lista.push(c)
    certificacionesPorCurso.set(c.curso_id, lista)
  }
  const intentosPorCurso = new Map<number, IntentoEvaluacion[]>()
  for (const i of (intentosData ?? []) as unknown as IntentoEvaluacion[]) {
    const lista = intentosPorCurso.get(i.curso_id) ?? []
    lista.push(i)
    intentosPorCurso.set(i.curso_id, lista)
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Academia — Administración</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cursos, contenidos y evaluaciones de la Academia Virtual.
        </p>
      </div>

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

      <details className="rounded-xl border border-border bg-card">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">
          + Nuevo curso
        </summary>
        <form action={crearCurso} className="flex flex-col gap-3 px-4 pb-4">
          <input name="titulo" required placeholder="Título" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
          <input name="descripcion" placeholder="Descripción" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
          <input name="portada_url" placeholder="URL de portada (opcional)" className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" name="otorga_puntos" className="h-4 w-4 accent-primary" />
            Otorga puntos al completarse (regla tipo &quot;curso_completado&quot; en Incentivos)
          </label>
          <button type="submit" className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
            Crear curso
          </button>
        </form>
      </details>

      {listaCursos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <GraduationCap className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Aún no hay cursos</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {listaCursos.map((c) => {
            const evaluacion = c.evaluaciones[0]
            return (
              <div key={c.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{c.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.curso_contenidos.length} contenidos
                      {evaluacion && ` · evaluación (${evaluacion.evaluacion_preguntas.length} preguntas)`}
                      {c.otorga_puntos && ' · otorga puntos'}
                    </p>
                  </div>
                  <form action={alternarCurso}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="activo" value={c.activo ? '1' : '0'} />
                    <button
                      type="submit"
                      className={
                        c.activo
                          ? 'rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary'
                          : 'rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground'
                      }
                    >
                      {c.activo ? 'Activo' : 'Inactivo'}
                    </button>
                  </form>
                </div>

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-primary">+ Agregar contenido</summary>
                  <form action={crearContenido} className="mt-2 flex flex-col gap-2">
                    <input type="hidden" name="curso_id" value={c.id} />
                    <div className="flex flex-wrap gap-2">
                      <select name="tipo" required defaultValue="video" className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none">
                        <option value="video">Video</option>
                        <option value="documento">Documento</option>
                        <option value="texto">Texto</option>
                      </select>
                      <input name="titulo" required placeholder="Título del contenido" className="flex-1 min-w-40 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
                      <input name="orden" type="number" placeholder="Orden" defaultValue={c.curso_contenidos.length} className="w-20 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
                    </div>
                    <input name="url" placeholder="URL (video/documento)" className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
                    <textarea name="contenido" rows={2} placeholder="Texto (si el tipo es texto)" className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
                    <button type="submit" className="w-fit rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90">
                      Agregar contenido
                    </button>
                  </form>
                </details>

                {!evaluacion ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-primary">+ Crear evaluación final</summary>
                    <form action={crearEvaluacion} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="curso_id" value={c.id} />
                      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        % aprobación
                        <input name="puntaje_aprobacion" type="number" defaultValue={70} className="w-24 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none" />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        Intentos máx.
                        <input name="intentos_maximos" type="number" defaultValue={3} className="w-24 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none" />
                      </label>
                      <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90">
                        Crear evaluación
                      </button>
                    </form>
                  </details>
                ) : (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-primary">
                      + Agregar pregunta ({evaluacion.evaluacion_preguntas.length} actuales)
                    </summary>
                    <ul className="mt-2 flex flex-col gap-1">
                      {evaluacion.evaluacion_preguntas.map((p) => (
                        <li key={p.id} className="text-xs text-muted-foreground">
                          {p.texto} — correcta: {p.opciones[p.respuesta_correcta]}
                        </li>
                      ))}
                    </ul>
                    <form action={crearPregunta} className="mt-2 flex flex-col gap-2">
                      <input type="hidden" name="evaluacion_id" value={evaluacion.id} />
                      <input name="texto" required placeholder="Texto de la pregunta" className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
                      <textarea name="opciones" rows={3} required placeholder={'Una opción por línea'} className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none" />
                      <div className="flex items-center gap-2">
                        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                          Índice de la opción correcta (0 = primera)
                          <input name="respuesta_correcta" type="number" defaultValue={0} min={0} className="w-24 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none" />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                          Orden
                          <input name="orden" type="number" defaultValue={evaluacion.evaluacion_preguntas.length} className="w-20 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none" />
                        </label>
                      </div>
                      <button type="submit" className="w-fit rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90">
                        Agregar pregunta
                      </button>
                    </form>
                  </details>
                )}

                {(() => {
                  const progreso = progresoPorCurso.get(c.id) ?? []
                  const certificaciones = certificacionesPorCurso.get(c.id) ?? []
                  const intentos = intentosPorCurso.get(c.id) ?? []
                  const completados = progreso.filter((p) => p.estado === 'completado').length
                  if (progreso.length === 0 && certificaciones.length === 0 && intentos.length === 0) return null
                  return (
                    <details className="mt-3">
                      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-primary">
                        <Users className="h-3.5 w-3.5" />
                        Ver progreso ({completados}/{progreso.length} completado{progreso.length !== 1 ? 's' : ''}
                        {certificaciones.length > 0 && ` · ${certificaciones.length} certificación${certificaciones.length !== 1 ? 'es' : ''}`}
                        )
                      </summary>
                      <div className="mt-2 flex flex-col gap-3">
                        {progreso.length > 0 && (
                          <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Progreso por usuario
                            </p>
                            <ul className="flex flex-col gap-1">
                              {progreso.map((p, i) => (
                                <li key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span className="text-foreground">{p.usuarios?.nombre ?? '—'}</span>
                                  <span>
                                    {p.estado === 'completado'
                                      ? `Completado ${p.fecha_completado ? formatearFecha(p.fecha_completado) : ''}`
                                      : `En curso desde ${formatearFecha(p.fecha_inicio)}`}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {certificaciones.length > 0 && (
                          <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Certificaciones emitidas
                            </p>
                            <ul className="flex flex-col gap-1">
                              {certificaciones.map((cert, i) => (
                                <li key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span className="text-foreground">{cert.usuarios?.nombre ?? '—'}</span>
                                  <span>
                                    {cert.puntaje}% · {formatearFecha(cert.fecha)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {intentos.length > 0 && (
                          <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Intentos de evaluación
                            </p>
                            <ul className="flex flex-col gap-1">
                              {intentos.map((it, i) => (
                                <li key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span className="text-foreground">{it.usuarios?.nombre ?? '—'}</span>
                                  <span>
                                    {it.puntaje}% · {it.aprobado ? 'Aprobado' : 'No aprobado'} ·{' '}
                                    {formatearFecha(it.fecha_creacion)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </details>
                  )
                })()}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
