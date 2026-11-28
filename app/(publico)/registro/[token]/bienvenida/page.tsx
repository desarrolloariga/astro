import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { MENSAJES_EXPECTATIVA, MENSAJE_BIENVENIDA, TITULO_BIENVENIDA, type EnlaceRegistro } from '@/lib/registro-embajadores'
import { LogoAstro } from '@/components/marca/logo-astro'
import { Orbitas } from '@/components/marca/orbitas'
import { CuentaRegresiva } from '@/components/registro/cuenta-regresiva'

export const metadata = { title: '¡Bienvenido a ASTRO!', robots: { index: false, follow: false } }

/** Resalta en naranja la última palabra del título (regla de titulares del manual de marca). */
function Titulo({ texto }: { texto: string }) {
  const i = texto.trimEnd().lastIndexOf(' ')
  if (i < 0) return <>{texto}</>
  return (
    <>
      {texto.slice(0, i + 1)}
      <span className="text-[#F6A637]">{texto.slice(i + 1)}</span>
    </>
  )
}

export default async function BienvenidaEmbajadorPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ n?: string; vista?: string }>
}) {
  const [{ token }, sp] = await Promise.all([params, searchParams])
  if (!/^[a-f0-9]{32}$/.test(token)) notFound()
  const { data } = await createAdminClient()
    .from('enlaces_registro')
    .select('titulo_bienvenida, mensaje_bienvenida, mensajes_expectativa, fecha_lanzamiento, permitir_ingreso')
    .eq('token', token)
    .maybeSingle()
  if (!data) notFound()
  const e = data as Pick<EnlaceRegistro, 'titulo_bienvenida' | 'mensaje_bienvenida' | 'mensajes_expectativa' | 'fecha_lanzamiento' | 'permitir_ingreso'>
  const nombre = (sp.n ?? '').slice(0, 40) || (sp.vista === 'previa' ? 'Ana' : '')
  const mensajes = e.mensajes_expectativa?.length ? e.mensajes_expectativa : MENSAJES_EXPECTATIVA
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' })
  const lanzamientoFuturo = e.fecha_lanzamiento && e.fecha_lanzamiento > hoy

  return (
    <main className="relative min-h-svh overflow-hidden bg-black text-white">
      <div className="h-1.5 bg-[#F6A637]" />
      <Orbitas className="absolute -right-56 top-10 opacity-70" tamano={640} />
      <Orbitas className="absolute -bottom-72 -left-72 opacity-40" tamano={560} />
      <div className="relative mx-auto flex min-h-[calc(100svh-6px)] w-full max-w-3xl flex-col gap-10 px-6 py-10 md:py-16">
        <LogoAstro version="naranja" ancho={140} prioridad />
        {sp.vista === 'previa' && (
          <p className="self-start rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">Vista previa · así lo verá cada embajador al registrarse</p>
        )}

        <section className="flex flex-col gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/astro/icons/estrella-naranja.png" alt="" width={56} height={56} />
          {nombre && <p className="text-lg font-bold text-white/80">{nombre},</p>}
          <h1 className="text-4xl font-black leading-[1.05] md:text-6xl">
            <Titulo texto={e.titulo_bienvenida || TITULO_BIENVENIDA} />
          </h1>
          <p className="max-w-xl text-lg text-white/80">{e.mensaje_bienvenida ?? MENSAJE_BIENVENIDA}</p>
        </section>

        {lanzamientoFuturo && <CuentaRegresiva fecha={e.fecha_lanzamiento as string} />}

        <section className="flex flex-col gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#F6A637]">Lo que viene</p>
          <ul className="flex flex-col gap-3">
            {mensajes.map((m) => (
              <li key={m} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/astro/icons/estrella-naranja.png" alt="" width={20} height={20} className="mt-0.5 shrink-0" />
                <span>{m}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center">
          {e.permitir_ingreso && (
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full bg-[#F6A637] px-7 py-4 text-sm font-black uppercase tracking-wider text-black transition-colors hover:bg-white"
            >
              Entrar a mi cuenta
            </Link>
          )}
          <p className="text-sm text-white/60">Guarda tu correo y contraseña: con ellos entrarás al Universo ASTRO.</p>
        </div>
      </div>
    </main>
  )
}
