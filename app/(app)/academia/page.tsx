import { redirect } from 'next/navigation'
import Link from 'next/link'
import { GraduationCap, CheckCircle2, PlayCircle, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'

export const metadata = { title: 'Academia — ASTRO' }

type Curso = {
  id: number
  titulo: string
  descripcion: string | null
  portada_url: string | null
  otorga_puntos: boolean
  curso_contenidos: { id: number }[]
}
type Progreso = { curso_id: number; estado: string; contenidos_vistos: number[] }

export default async function AcademiaPage() {
  const usuario = await obtenerUsuarioActual()
  if (usuario.rol === 'produccion' || usuario.rol === 'contabilidad') redirect('/inicio')

  const supabase = await createClient()

  const [{ data: cursos }, { data: progreso }] = await Promise.all([
    supabase
      .from('cursos')
      .select('id, titulo, descripcion, portada_url, otorga_puntos, curso_contenidos ( id )')
      .eq('activo', true)
      .order('fecha_creacion', { ascending: false }),
    supabase.from('progreso_cursos').select('curso_id, estado, contenidos_vistos').eq('usuario_id', usuario.id),
  ])

  const listaCursos = (cursos ?? []) as unknown as Curso[]
  const listaProgreso = (progreso ?? []) as Progreso[]
  const progresoPorCurso = new Map(listaProgreso.map((p) => [p.curso_id, p.estado]))
  const vistosPorCurso = new Map(listaProgreso.map((p) => [p.curso_id, p.contenidos_vistos?.length ?? 0]))

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Academia Virtual</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cursos y certificaciones sobre técnicas de venta, cierre, redes sociales y la plataforma.
        </p>
      </div>

      {listaCursos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <GraduationCap className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-sm font-semibold text-foreground">Aún no hay cursos publicados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listaCursos.map((c) => {
            const estado = progresoPorCurso.get(c.id)
            const vistos = vistosPorCurso.get(c.id) ?? 0
            return (
              <Link
                key={c.id}
                href={`/academia/${c.id}`}
                className="flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
              >
                <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-secondary">
                  {c.portada_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.portada_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <GraduationCap className="h-10 w-10 text-muted-foreground" strokeWidth={1.2} />
                  )}
                  {estado === 'completado' && (
                    <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                      <CheckCircle2 className="h-3 w-3" /> Completado
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-4">
                  <h3 className="text-sm font-semibold text-foreground">{c.titulo}</h3>
                  {c.descripcion && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{c.descripcion}</p>
                  )}
                  <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <PlayCircle className="h-3.5 w-3.5" />
                      {estado === 'en_curso' && vistos > 0
                        ? `${vistos}/${c.curso_contenidos.length} contenidos vistos`
                        : `${c.curso_contenidos.length} contenidos`}
                    </span>
                    {c.otorga_puntos && (
                      <span className="flex items-center gap-1 text-primary">
                        <Sparkles className="h-3.5 w-3.5" /> Otorga puntos
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}
