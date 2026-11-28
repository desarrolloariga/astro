import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { estadoEnlace, type EnlaceRegistro } from '@/lib/registro-embajadores'
import { LogoAstro } from '@/components/marca/logo-astro'
import { Orbitas } from '@/components/marca/orbitas'
import { FormularioRegistro } from '@/components/registro/formulario-registro'

export const metadata = {
  title: 'Únete como embajador — ASTRO',
  description: 'Crea tu cuenta de embajador y entra al Universo de Compras ASTRO.',
  robots: { index: false, follow: false },
}

const BENEFICIOS = [
  { icono: 'estrella', texto: 'Acceso anticipado a marcas, lanzamientos y ofertas.' },
  { icono: 'joyeria', texto: 'Tu propio catálogo para compartir con tus clientes.' },
  { icono: 'cuenta', texto: 'Ganancias por cada venta de tu red.' },
]

export default async function RegistroEmbajadorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const valido = /^[a-f0-9]{32}$/.test(token)
  const { data } = valido
    ? await createAdminClient().from('enlaces_registro').select('activo, vence, cupo, usos').eq('token', token).maybeSingle()
    : { data: null }
  const enlace = data as Pick<EnlaceRegistro, 'activo' | 'vence' | 'cupo' | 'usos'> | null
  const disponible = enlace ? estadoEnlace(enlace).disponible : false

  return (
    <main className="min-h-svh bg-white text-black">
      <div className="h-1.5 bg-[#F6A637]" />
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-0 px-0 md:min-h-[calc(100svh-6px)] md:grid-cols-2 md:px-6 md:py-10">
        {/* Panel de marca */}
        <section className="relative flex flex-col justify-between gap-10 overflow-hidden bg-black px-6 py-10 text-white md:rounded-3xl md:px-10">
          <Orbitas className="absolute -right-48 -top-40 opacity-80" tamano={560} />
          <div className="relative">
            <LogoAstro version="naranja" ancho={150} prioridad />
          </div>
          <div className="relative flex flex-col gap-5">
            <h1 className="text-4xl font-black leading-[1.05] md:text-5xl">
              Únete al Universo de Compras <span className="text-[#F6A637]">ASTRO</span>
            </h1>
            <p className="max-w-md text-base text-white/80">
              Crea tu cuenta de embajador y sé de los primeros en entrar. Muy pronto abrimos las puertas.
            </p>
            <ul className="flex flex-col gap-3">
              {BENEFICIOS.map((b) => (
                <li key={b.texto} className="flex items-center gap-3 text-sm">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#F6A637]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/astro/icons/${b.icono}-negro.png`} alt="" width={22} height={22} />
                  </span>
                  {b.texto}
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-xs text-white/50">ASTRO · Universo de Compras</p>
        </section>

        {/* Formulario */}
        <section className="flex flex-col justify-center gap-6 px-6 py-10 md:px-12">
          {disponible ? (
            <>
              <div className="flex flex-col gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-black/60">Registro de embajadores</p>
                <h2 className="text-3xl font-black leading-tight">Crea tu cuenta</h2>
                <p className="text-sm text-black/70">Te toma un minuto. Con tu correo y contraseña entras a tu cuenta.</p>
              </div>
              <FormularioRegistro token={token} />
              <p className="text-center text-sm">
                ¿Ya tienes cuenta?{' '}
                <Link href="/login" className="font-bold underline decoration-[#F6A637] decoration-2 underline-offset-4">
                  Entra aquí
                </Link>
              </p>
            </>
          ) : (
            <div className="flex flex-col items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/astro/icons/estrella-naranja.png" alt="" width={48} height={48} />
              <h2 className="text-3xl font-black leading-tight">Este enlace ya no está disponible</h2>
              <p className="text-sm text-black/70">
                Puede haber vencido o completado su cupo. Pide a la persona que te invitó un nuevo enlace de registro.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
