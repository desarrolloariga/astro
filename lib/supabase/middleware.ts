import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** Rutas accesibles sin sesión */
const RUTAS_PUBLICAS = ['/login', '/recuperar', '/c/']

function esRutaPublica(pathname: string) {
  return RUTAS_PUBLICAS.some(
    (ruta) => pathname === ruta || pathname.startsWith(ruta),
  )
}

/**
 * Refresca la sesión de Supabase en cada request y protege las rutas
 * privadas: sin sesión → redirección a /login.
 */
export async function actualizarSesion(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'public' },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANTE: no ejecutar lógica entre createServerClient y getUser() —
  // puede provocar cierres de sesión aleatorios.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && !esRutaPublica(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('destino', pathname)
    return NextResponse.redirect(url)
  }

  if (user && (pathname === '/login' || pathname === '/recuperar')) {
    // Tener sesión de Auth válida no significa tener acceso a ASTRO.
    // Solo saltamos el login si el usuario ya está vinculado en
    // public.usuarios (evita el bucle
    // login → inicio → login cuando aún no existe esa fila, p. ej. antes
    // de aplicar las migraciones o el script de asignación de rol).
    const { data: perfil } = await supabase
      .from('usuarios')
      .select('id')
      .eq('auth_uid', user.id)
      .eq('activo', true)
      .maybeSingle()

    if (perfil) {
      const url = request.nextUrl.clone()
      url.pathname = '/inicio'
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
