import Link from 'next/link'
import { Gem, ArrowRight, Megaphone } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { obtenerUsuarioActual } from '@/lib/usuario'
import { seccionesParaRol, nombresRol } from '@/lib/navegacion'
import { obtenerPermisosExtra } from '@/lib/permisos'

export const metadata = { title: 'Inicio — ASTRO' }

type Anuncio = {
  id: number
  titulo: string
  cuerpo: string | null
  imagen_url: string | null
  url_destino: string | null
}

export default async function InicioPage() {
  const usuario = await obtenerUsuarioActual()
  const { concedidos, revocados } = await obtenerPermisosExtra()
  const seccionesVisibles = seccionesParaRol(usuario.rol, concedidos, revocados)

  const supabase = await createClient()
  const { data: anunciosData } = await supabase
    .from('vw_publicidad_vigente')
    .select('id, titulo, cuerpo, imagen_url, url_destino')
    .order('id', { ascending: false })
  const anuncios = (anunciosData ?? []) as Anuncio[]

  const fechaHoy = new Intl.DateTimeFormat('es-GT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())
  const fechaCapitalizada = fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1)

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 md:px-6">
      {/* Hero de bienvenida */}
      <section className="relative overflow-hidden rounded-2xl bg-brand-deeper text-brand-deeper-foreground">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-deep-muted/20 via-transparent to-transparent" />
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand-deep-foreground/5" />
        <div className="pointer-events-none absolute -bottom-20 right-24 h-48 w-48 rounded-full bg-brand-deep-foreground/5" />

        <div className="relative flex flex-col gap-4 px-6 py-10 md:px-10 md:py-12">
          <span className="flex w-fit items-center gap-2 rounded-full bg-brand-deep-foreground/10 px-3 py-1 text-xs font-semibold text-brand-deep-foreground/85">
            <Gem className="h-3.5 w-3.5" />
            {fechaCapitalizada}
          </span>
          <h1 className="text-balance text-3xl font-bold leading-tight tracking-tight md:text-4xl">
            Hola, {usuario.nombre.split(' ')[0]}
          </h1>
          <p className="max-w-xl text-pretty text-sm leading-relaxed text-brand-deep-foreground/80 md:text-base">
            Bienvenido al ecosistema comercial de ASTRO Joyería. Este es tu panel de{' '}
            {nombresRol[usuario.rol].toLowerCase()}: desde aquí controlas cada pieza, desde
            producción hasta la venta.
          </p>
        </div>
      </section>

      {/* Publicidad interna vigente para mi rol */}
      {anuncios.length > 0 && (
        <section className="flex flex-col gap-3">
          {anuncios.map((a) => {
            const Contenido = (
              <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                {a.imagen_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.imagen_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Megaphone className="h-6 w-6" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{a.titulo}</p>
                  {a.cuerpo && <p className="mt-0.5 text-xs text-muted-foreground">{a.cuerpo}</p>}
                </div>
              </div>
            )
            return a.url_destino ? (
              <Link key={a.id} href={a.url_destino} className="transition-opacity hover:opacity-90">
                {Contenido}
              </Link>
            ) : (
              <div key={a.id}>{Contenido}</div>
            )
          })}
        </section>
      )}

      {/* Accesos por sección */}
      {seccionesVisibles.map((seccion) => (
        <section key={seccion.slug} id={seccion.slug} className="scroll-mt-20">
          <h2 className="mb-4 text-lg font-bold tracking-tight text-foreground">{seccion.titulo}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {seccion.items
              .filter((item) => item.href !== '/inicio')
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-md"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <item.icono className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{item.etiqueta}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.descripcion}</p>
                  </div>
                  <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
          </div>
        </section>
      ))}
    </main>
  )
}
