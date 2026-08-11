import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Circle, FileText, PlayCircle, Type, AlertCircle, Award, ClipboardList } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { marcarVisto } from '../acciones'

export const metadata = { title: 'Curso — ASTRO' }

type Contenido = { id: number; tipo: string; titulo: string; url: string | null; contenido: string | null; orden: number }
type Evaluacion = { id: number; puntaje_aprobacion: number; intentos_maximos: number }
type Progreso = { estado: string; contenidos_vistos: number[] }

const iconosPorTipo = { video: PlayCircle, documento: FileText, texto: Type }

export default async function CursoDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol === 'produccion' || usuario.rol === 'contabilidad') redirect('/inicio')

  const { id } = await params
  const { error } = await searchParams
  const supabase = await createClient()

  const [{ data: curso }, { data: contenidos }, { data: evaluacion }, { data: progreso }, { data: certificacion }, { data: intentos }] =
    await Promise.all([
      supabase.from('cursos').select('id, titulo, descripcion').eq('id', id).maybeSingle(),
      supabase.from('curso_contenidos').select('id, tipo, titulo, url, contenido, orden').eq('curso_id', id).order('orden'),
      supabase.from('evaluaciones').select('id, puntaje_aprobacion, intentos_maximos').eq('curso_id', id).maybeSingle(),
      supabase.from('progreso_cursos').select('estado, contenidos_vistos').eq('curso_id', id).eq('usuario_id', usuario.id).maybeSingle(),
      supabase.from('certificaciones').select('puntaje, fecha').eq('curso_id', id).eq('usuario_id', usuario.id).maybeSingle(),
      supabase.from('intentos_evaluacion').select('id').eq('curso_id', id).eq('usuario_id', usuario.id),
    ])

  if (!curso) redirect('/academia')

  const listaContenidos = (contenidos ?? []) as Contenido[]
  const evaluacionCurso = evaluacion as Evaluacion | null
  const vistos = new Set(((progreso as Progreso | null)?.contenidos_vistos ?? []) as number[])
  const completado = progreso?.estado === 'completado'
  const intentosUsados = (intentos ?? []).length

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6">
      <Link href="/academia" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Volver a Academia
      </Link>

      <div>
        <div className="mb-1 flex items-center gap-2">
          {completado && (
            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
              <CheckCircle2 className="h-3 w-3" /> Completado
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">{curso.titulo}</h1>
        {curso.descripcion && <p className="mt-1 text-sm text-muted-foreground">{curso.descripcion}</p>}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {certificacion && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
          <Award className="h-6 w-6 text-primary" />
          <div>
            <p className="text-sm font-semibold text-primary">Certificado obtenido</p>
            <p className="text-xs text-primary/80">Puntaje: {certificacion.puntaje}%</p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {listaContenidos.map((c) => {
          const Icono = iconosPorTipo[c.tipo as keyof typeof iconosPorTipo] ?? FileText
          const visto = vistos.has(c.id)
          return (
            <div key={c.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                <Icono className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{c.titulo}</p>
                {c.tipo === 'texto' ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{c.contenido}</p>
                ) : (
                  c.url && (
                    <a href={c.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-primary hover:underline">
                      Abrir {c.tipo === 'video' ? 'video' : 'documento'}
                    </a>
                  )
                )}
              </div>
              {visto ? (
                <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
                  <CheckCircle2 className="h-4 w-4" /> Visto
                </span>
              ) : (
                <form action={marcarVisto}>
                  <input type="hidden" name="curso_id" value={curso.id} />
                  <input type="hidden" name="contenido_id" value={c.id} />
                  <button type="submit" className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
                    <Circle className="h-4 w-4" /> Marcar visto
                  </button>
                </form>
              )}
            </div>
          )
        })}
      </div>

      {evaluacionCurso && (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ClipboardList className="h-4 w-4 text-primary" /> Evaluación final
          </p>
          <p className="text-xs text-muted-foreground">
            Puntaje mínimo para aprobar: {evaluacionCurso.puntaje_aprobacion}% · Intentos usados:{' '}
            {intentosUsados}/{evaluacionCurso.intentos_maximos}
          </p>
          {intentosUsados >= evaluacionCurso.intentos_maximos && !certificacion ? (
            <p className="text-xs font-semibold text-destructive">Agotaste tus intentos disponibles</p>
          ) : (
            <Link
              href={`/academia/${curso.id}/evaluacion`}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
            >
              {certificacion ? 'Repetir evaluación' : 'Iniciar evaluación'}
            </Link>
          )}
        </div>
      )}
    </main>
  )
}
