import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, AlertCircle, CheckCircle2, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { cn } from '@/lib/utils'
import { enviarEvaluacion } from './acciones'

export const metadata = { title: 'Evaluación — ASTRO' }

type Pregunta = { id: number; texto: string; opciones: string[]; orden: number }

export default async function EvaluacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; resultado?: string; puntaje?: string; aprobado?: string; restantes?: string }>
}) {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol === 'produccion' || usuario.rol === 'contabilidad') redirect('/inicio')

  const { id } = await params
  const sp = await searchParams
  const supabase = await createClient()

  const { data: curso } = await supabase.from('cursos').select('id, titulo').eq('id', id).maybeSingle()
  const { data: evaluacion } = await supabase
    .from('evaluaciones')
    .select('id, puntaje_aprobacion')
    .eq('curso_id', id)
    .maybeSingle()

  if (!curso || !evaluacion) redirect(`/academia/${id}`)

  if (sp.resultado) {
    const aprobado = sp.aprobado === '1'
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 px-4 py-16 text-center">
        <span
          className={cn(
            'flex h-14 w-14 items-center justify-center rounded-full',
            aprobado ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive',
          )}
        >
          {aprobado ? <CheckCircle2 className="h-7 w-7" /> : <XCircle className="h-7 w-7" />}
        </span>
        <h1 className="text-xl font-bold text-foreground">
          {aprobado ? '¡Evaluación aprobada!' : 'No alcanzaste el puntaje mínimo'}
        </h1>
        <p className="text-sm text-muted-foreground">Obtuviste {sp.puntaje}%.</p>
        {!aprobado && Number(sp.restantes) > 0 && (
          <p className="text-sm text-muted-foreground">Te quedan {sp.restantes} intento(s).</p>
        )}
        <div className="flex gap-3">
          <Link href={`/academia/${id}`} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
            Volver al curso
          </Link>
          {!aprobado && Number(sp.restantes) > 0 && (
            <Link href={`/academia/${id}/evaluacion`} className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary">
              Reintentar
            </Link>
          )}
        </div>
      </main>
    )
  }

  const { data: preguntas } = await supabase
    .from('vw_evaluacion_preguntas')
    .select('id, texto, opciones, orden')
    .eq('evaluacion_id', evaluacion.id)
    .order('orden')

  const listaPreguntas = (preguntas ?? []) as Pregunta[]

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
      <Link href={`/academia/${id}`} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Volver al curso
      </Link>

      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Evaluación — {curso.titulo}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Necesitas {evaluacion.puntaje_aprobacion}% para aprobar.
        </p>
      </div>

      {sp.error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{sp.error}</span>
        </div>
      )}

      {listaPreguntas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Esta evaluación aún no tiene preguntas.</p>
      ) : (
        <form action={enviarEvaluacion} className="flex flex-col gap-5">
          <input type="hidden" name="curso_id" value={id} />
          <input type="hidden" name="evaluacion_id" value={evaluacion.id} />
          <input type="hidden" name="pregunta_ids" value={listaPreguntas.map((p) => p.id).join(',')} />

          {listaPreguntas.map((p, i) => (
            <fieldset key={p.id} className="rounded-xl border border-border bg-card p-4">
              <legend className="px-1 text-sm font-semibold text-foreground">
                {i + 1}. {p.texto}
              </legend>
              <div className="mt-2 flex flex-col gap-2">
                {p.opciones.map((opcion, indice) => (
                  <label key={indice} className="flex items-center gap-2 text-sm text-foreground">
                    <input type="radio" name={`pregunta_${p.id}`} value={indice} required className="h-4 w-4 accent-primary" />
                    {opcion}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <button type="submit" className="w-fit rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90">
            Enviar evaluación
          </button>
        </form>
      )}
    </main>
  )
}
